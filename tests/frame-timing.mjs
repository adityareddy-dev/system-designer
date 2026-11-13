// A delayed browser frame finishes camera transitions while reporting real elapsed time.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  // Leave room for the failure label alongside the workbench controls.
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.seenIntro', 'true'));
  await page.goto((process.argv[2] || 'http://localhost:8765/') + '#/settings');
  await page.waitForFunction(() => !!window.__game);
  const measured = await page.evaluate(async () => {
    const { createScene } = await import('./render/scene.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const { loadPixi } = await import('./ui/shell/playhost.js');
    await loadPixi();
    const catalog = await loadCatalog(), original = requestAnimationFrame;
    let frame, scene;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:800px;height:600px'; document.body.append(host);
    globalThis.requestAnimationFrame = callback => callback.name === 'frame' ? (frame = callback, -1) : original(callback);
    try {
      scene = await createScene(host, { catalog });
      scene.sync({ nodes: [{ id: 'app', type: 'vm-fleet', x: 0, y: 0 }], edges: [] });
      scene.fit(40, false, { maxZ: .25 });
      const labelPx = scene.stats().labelPx;
      const expected = scene.worldToScreen(0, 0);
      scene.panBy(200, 100); scene.fit(40, true, { maxZ: .25 });
      let elapsed = 0; scene.onFrame(dt => elapsed = dt);
      frame(performance.now() + 500);
      return { expected, actual: scene.worldToScreen(0, 0), elapsed, labelPx };
    } finally { scene?.destroy(); host.remove(); globalThis.requestAnimationFrame = original; }
  });
  assert(measured.elapsed >= 500, 'frame listeners receive elapsed wall time');
  assert(measured.labelPx >= 12.99, 'an immediate fit keeps names readable before the next frame');
  assert(Math.hypot(measured.actual.x - measured.expected.x, measured.actual.y - measured.expected.y) < 1e-6, 'a delayed frame finishes the camera fit');
  await page.evaluate(() => {
    const graph = { nodes: [
      { id: 'users', type: 'web-browser', x: 0, y: 0 },
      { id: 'app', type: 'vm-fleet', x: 260, y: 0, units: 1 },
      { id: 'db', type: 'sql-primary', x: 520, y: 0 },
    ], edges: [['users', 'app'], ['app', 'db']] };
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph, traffic: { rps: { read: 100000 }, curve: 'flat', regions: { us: 1 } } }));
    return window.__game.loadSandbox();
  });
  const fit = await page.evaluate(() => {
    const original = setTimeout;
    let release;
    globalThis.setTimeout = (fn, ms, ...args) => ms === 40 ? (release = () => fn(...args), -1) : original(fn, ms, ...args);
    try {
      document.querySelector('.pl-tool--fit').click();
      const pending = window.__game.getState().view.moving;
      release?.();
      return { pending, started: window.__game.getState().view.moving };
    } finally { globalThis.setTimeout = original; }
  });
  assert(fit.pending, 'a queued fit is moving before its delayed animation starts');
  assert(fit.started, 'the fit remains moving while its animation runs');
  const stepped = await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); return window.__game.step(60000); });
  assert(stepped.view.diagram.labels.some(label => label.kind === 'failure' && label.text.startsWith('First limit')), 'step renders the measured failure before returning');
  console.log('Delayed browser frames finish fits and report elapsed wall time.');
} finally { await browser.close(); }
