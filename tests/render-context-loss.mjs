// A lost WebGL context suspends GPU work while frame callbacks and recovery stay usable.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.seenIntro', 'true'));
  await page.goto(base + '#/learn');
  await page.waitForFunction(() => !!window.__game);
  const result = await page.evaluate(async () => {
    const [{ loadPixi }, { createScene }, { loadCatalog }, { getPalette }] = await Promise.all([
      import('./ui/shell/playhost.js'), import('./render/scene.js'), import('./sim/catalog.js'), import('./assets/palette.js'),
    ]);
    await loadPixi();
    const catalog = await loadCatalog();
    const host = document.createElement('div');
    host.style.cssText = 'width:800px;height:600px';
    document.body.append(host);
    const scene = await createScene(host, { catalog, palette: getPalette('light'), reducedMotion: true });
    const until = async (promise, label) => {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 5000); })]); }
      finally { clearTimeout(timer); }
    };
    try {
      scene.sync({ nodes: [{ id: 'app', type: 'vm-fleet', x: 0, y: 0 }], edges: [] }, 1);
      const canvas = host.querySelector('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const loss = gl.getExtension('WEBGL_lose_context');
      let frames = 0;
      scene.onFrame(() => frames++);
      const lost = new Promise(resolve => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
      loss.loseContext();
      // Lose the context before its first shader compilation, including an immediate test-hook draw.
      scene.renderNow();
      await until(lost, 'context loss event');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      scene.renderNow();
      const lostFrames = frames;
      let snapshotError;
      try { await scene.snapshot({ width: 180, height: 120 }); } catch (error) { snapshotError = error.message; }
      const restored = new Promise(resolve => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
      loss.restoreContext();
      await until(restored, 'first restoration');
      const lostAgain = new Promise(resolve => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
      const createShader = gl.createShader;
      let lostDuringRender = false;
      gl.createShader = function (...args) {
        gl.createShader = createShader;
        lostDuringRender = true;
        loss.loseContext();
        return createShader.apply(this, args);
      };
      scene.renderNow();
      await until(lostAgain, 'context loss during compilation');
      // Restoration is allowed after the browser finishes dispatching the canceled loss event.
      await new Promise(resolve => requestAnimationFrame(resolve));
      const restoredAgain = new Promise(resolve => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
      loss.restoreContext();
      await until(restoredAgain, 'second restoration');
      scene.renderNow();
      const snapshot = await scene.snapshot({ width: 180, height: 120 });
      return { lostFrames, snapshotError, lostDuringRender, recovered: !gl.isContextLost(), nodes: scene.stats().nodes, width: snapshot.width, height: snapshot.height };
    } finally {
      scene.destroy();
      host.remove();
    }
  });
  assert(result.lostFrames >= 2, 'frame callbacks continue while the GPU is unavailable');
  assert.match(result.snapshotError, /drawing surface is unavailable/);
  assert.equal(result.lostDuringRender, true, 'context loss during shader compilation is exercised');
  assert.equal(result.recovered, true);
  assert.equal(result.nodes, 1);
  assert.deepEqual([result.width, result.height], [180, 120]);
  assert.deepEqual(errors, []);
  console.log('Context loss skips GPU draws and restores the intact scene and snapshots.');
} finally {
  await browser.close();
}
