// A callback may unmount a canvas; pending frame and resize work must leave it alone afterward.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.seenIntro', 'true'));
  await page.goto(process.argv[2] || 'http://localhost:8765/');
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
  console.log('Canvas unmount during a frame and queued resize delivery are safe across six lifecycles.');
} finally { await browser.close(); }
