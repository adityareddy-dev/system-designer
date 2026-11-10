// A callback may unmount a canvas; pending frame and resize work must leave it alone afterward.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/render/nodes.js')) {
      const source = fs.readFileSync(new URL('../render/nodes.js', import.meta.url), 'utf8')
        .replace('views.set(n.id, v);', "views.set(n.id, v); if (n.id === 'new') window.__springView = v;");
      request.respond({ contentType: 'text/javascript', body: source });
    } else request.continue();
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.seenIntro', 'true'));
  await page.goto(site.base);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.loadSandbox());
  const count = await page.evaluate(async () => {
    const { createScene } = await import('./render/scene.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const catalog = await loadCatalog(), Original = ResizeObserver;
    const callbacks = [];
    window.ResizeObserver = class extends Original { constructor(callback) { super(callback); callbacks.push(callback); } };
    let done = 0;
    try {
      for (let i = 0; i < 6; i++) {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:100px;width:400px;height:300px'; document.body.append(host);
        const scene = await createScene(host, { catalog, reducedMotion: true });
        scene.sync({ nodes: [{ id: 'pool', type: 'vm-fleet', x: 0, y: 0, units: 4 }], edges: [] });
        await new Promise(resolve => scene.onFrame(() => { scene.destroy(); host.remove(); done++; resolve(); }));
        // A resize delivery already queued before unmount can arrive afterward.
        callbacks.at(-1)([]);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } finally { window.ResizeObserver = Original; }
    return done;
  });
  assert.equal(count, 6); assert.deepEqual(errors, []);
  const idleAfterMotionChange = await page.evaluate(async () => {
    const { createScene } = await import('./render/scene.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:100px;width:400px;height:300px'; document.body.append(host);
    const scene = await createScene(host, { catalog: await loadCatalog(), reducedMotion: false });
    try {
      scene.sync({ nodes: [{ id: 'new', type: 'cache', x: 0, y: 0 }], edges: [] });
      await new Promise(resolve => {
        const off = scene.onFrame(() => {
          if (window.__springView?.vs) { scene.setReducedMotion(true); off(); resolve(); }
        });
      });
      return await new Promise(resolve => {
        const timeout = setTimeout(() => { off(); resolve(false); }, 8000);
        const off = scene.onFrame(() => {
          if (scene.stats().idle) { off(); clearTimeout(timeout); resolve(true); }
        });
      });
    } finally { scene.destroy(); host.remove(); }
  });
  assert(idleAfterMotionChange, 'switching reduced motion on during entry lets the still canvas become idle');
  console.log('Canvas unmount during a frame and queued resize delivery are safe across six lifecycles.');
} finally { await browser.close(); await site.close(); }
