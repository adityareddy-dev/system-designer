// Camera translation reuses routes, themes repaint caption grounds, and queue facts fit their lanes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();

const base = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme: 'light', soundMuted: true }));
    window.__captionViews = new Map(); window.__routeBuilds = 0;
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const file = new URL(request.url()).pathname;
    if (file.endsWith('/render/nodes.js')) {
      const source = fs.readFileSync(new URL('../render/nodes.js', import.meta.url), 'utf8')
        .replace('views.set(n.id, v);', 'views.set(n.id, v); window.__captionViews.set(n.id, v);');
      request.respond({ contentType: 'text/javascript', body: source });
    } else if (file.endsWith('/render/routing.js')) {
      const source = fs.readFileSync(new URL('../render/routing.js', import.meta.url), 'utf8')
        .replace('export function routedLut(lut, points) {', 'export function routedLut(lut, points) { window.__routeBuilds++;');
      request.respond({ contentType: 'text/javascript', body: source });
    } else request.continue();
  });
  await page.goto(base + '#/sandbox');
  await page.waitForFunction(() => window.__game?.getState().nodes.length > 0);
  await new Promise(resolve => setTimeout(resolve, 500));
  const grounds = () => page.evaluate(() => [...window.__captionViews.values()].map(v =>
    v.labelBg.context.instructions.filter(i => i.action === 'fill').map(i => i.data.style.color)));
  const light = await grounds();
  await page.click('#sh-theme-btn');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.waitForFunction(() => [...window.__captionViews.values()].every(v =>
    v.labelBg.context.instructions.filter(i => i.action === 'fill').every(i => i.data.style.color !== 0xffffff)));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const dark = await grounds();
  assert.notDeepEqual(dark, light, 'stationary captions repaint on a header theme change');
  const canvas = await page.evaluate(async () => {
    const { resolvePalette } = await import('./render/theme.js');
    const { getPalette } = await import('./assets/palette.js');
    return resolvePalette(getPalette('dark'), 'dark').canvas;
  });
  assert(dark.flat().every(color => color === canvas), 'every caption ground uses the dark canvas color');

  const measurements = await page.evaluate(async () => {
    const { createScene } = await import('./render/scene.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const catalog = await loadCatalog(), results = [];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1366px;height:800px'; document.body.append(host);
    const scene = await createScene(host, { catalog, reducedMotion: true });
    try {
      for (const count of [40,80]) {
        const graph = { nodes: Array.from({ length: count }, (_,i) => ({ id: 'pan' + i, type: 'vm-fleet', x: i%8*200+(Math.floor(i/8)%5)*20, y: Math.floor(i/8)*180+(i%8)*20 })),
          edges: Array.from({ length: count-1 }, (_,i) => ({ id: 'wire' + i, from: 'pan' + i, to: 'pan' + (i+1), kind: 'flow' })) };
        scene.sync(graph); scene.fit(40, false, { minZ: 1, maxZ: 1 });
        for (let i=0;i<5;i++) scene.renderNow();
        const before = window.__routeBuilds, times = [];
        for (let i=0;i<30;i++) {
          scene.panBy(i%2 ? -3 : 3, 2); scene.renderNow(); times.push(scene.stats().renderMsLast);
        }
        results.push({ count, builds: window.__routeBuilds-before, meanMs: times.reduce((a,b)=>a+b,0)/times.length });
      }
    } finally { scene.destroy(); host.remove(); }
    return results;
  });
  for (const result of measurements) {
    assert.equal(result.builds, 0, `${result.count} parts pan without rebuilding any route`);
    assert(result.meanMs < 16.7, `${result.count} parts pan within a frame, measured ${result.meanMs.toFixed(2)} ms`);
    console.log(`${result.count}-part pan: ${result.meanMs.toFixed(2)} ms, ${result.builds} route rebuilds.`);
  }

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    const graph = { nodes: ['web-browser','queue','worker-pool','sql-primary'].map((type,i) => ({ id:'q'+i, type, x:i*260, y:0 })), edges:[['q0','q1'],['q1','q2'],['q2','q3']] };
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph, traffic:{ rps:{write:200000}, curve:'flat', regions:{us:1} } }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.getState().nodes.some(n=>n.id==='q1'));
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); window.__game.step(60000); });
  await new Promise(resolve => setTimeout(resolve, 300));
  const diagram = await page.evaluate(() => window.__game.getState().view.diagram);
  assert(diagram.labels.some(l => l.kind === 'failure' && l.id === 'q1' && l.text.includes('Deadline')), 'queue fixture renders wrapped pressure readings');
  assert.equal(diagram.labelPartOverlaps, 0, 'wrapped queue facts and heading clear every face');
  assert.equal(diagram.wireLabelCrossings, 0, 'wires clear the full queue caption lane');
  assert.deepEqual(errors, []);
} finally { await browser.close(); await site.close(); }
