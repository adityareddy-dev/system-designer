// A held served-traffic check keeps independent speed failures visible and explains them.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const shots = process.env.MEASUREMENT_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
try {
 for (const width of [1366, 390]) for (const theme of ['light', 'dark']) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
  await page.evaluateOnNewDocument(theme => { localStorage.setItem('hotpath.v1.seenIntro', 'true'); localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, soundMuted: true, reducedMotion: 'reduce' })); }, theme);
  const snap = async name => { if (shots) await page.screenshot({ path: `${shots}/${width}-${theme}-${name}.png` }); };
  await page.goto(base);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.loadLesson('load-balancing'));
  await page.waitForFunction(() => window.__game.getState().mode === 'lesson');
  await page.evaluate(() => {
    const g = window.__game, state = g.getState();
    g.placeComponent('regional-lb', 0, 0, state.edges.find(e => e.from === 'users').id);
    g.setKnob('app', 'units', 5);
    g.setKnob('app', 'region', 'apac');
    g.step(600000);
  });
  await page.waitForSelector('.pl-goal--done');
  await page.$eval('.sh-demo-stage', e => { e.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -60); });
  const result = await page.evaluate(() => ({ state: window.__game.getState(), goal: document.querySelector('.pl-goal').textContent, speed: document.querySelector('[data-meter="lat"]').dataset.status, served: document.querySelector('[data-meter="avail"]').dataset.status }));
  assert.equal(result.state.phase, 'paused');
  assert.equal(result.state.traffic.successRps, result.state.traffic.offeredRps);
  assert(result.state.slo.latency.p99Ms > result.state.slo.latency.targetMs);
  assert.match(result.goal, /Requests served 100%/);
  assert.match(result.goal, /Speed is a separate check.*misses/);
  assert.equal(result.speed, 'bad', 'passing the traffic check does not soften a missed speed target');
  assert.equal(result.served, 'ok');
  if (width === 390) {
    const goalBounds = await page.$eval('.pl-goal', e => {
      const box = e.getBoundingClientRect(), span = [...e.children].find(c => c.textContent.includes('Requests served'));
      const range = document.createRange(); range.selectNodeContents(span);
      const text = range.getBoundingClientRect();
      return { client: e.clientHeight, scroll: e.scrollHeight, top: box.top, bottom: box.bottom, textTop: text.top, textBottom: text.bottom };
    });
    assert(goalBounds.client >= goalBounds.scroll, `the phone goal contains its full explanation: ${JSON.stringify(goalBounds)}`);
    assert(goalBounds.textTop >= goalBounds.top && goalBounds.textBottom <= goalBounds.bottom, `the phone goal's text stays inside its border: ${JSON.stringify(goalBounds)}`);
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  await snap('served-check-explanation');
  if (width === 390) await page.$eval('.pl-measurements-toggle', b => b.click());
  await new Promise(resolve => setTimeout(resolve, 300));
  await snap('served-pass-speed-miss');
  if (width === 390) await page.$eval('.pl-measurements-toggle', b => b.click());
  const pool = await page.evaluate(async () => {
    const { createInspector } = await import('./ui/play/inspector.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const catalog = await loadCatalog();
    const host = document.createElement('div'); document.body.append(host);
    const node = { id: 'pool-test', type: 'vm-fleet', units: 12, region: 'us', tier: 'M', zones: 1, knobs: {} };
    const inspector = createInspector(host, { catalog, getNode: () => node, getHome: () => 'us' });
    inspector.show(node.id);
    inspector.update({ id: node.id, units: 12, availableUnits: 0, status: 'down', util: 0, incomingRps: 0 });
    const failed = host.querySelectorAll('[data-failed="true"]').length;
    const summary = host.querySelector('.pl-replica-summary').textContent;
    host.remove(); return { failed, summary };
  });
  assert.equal(pool.failed, 6, 'all groups are unavailable when the whole pool is down');
  assert.match(pool.summary, /0\/12 units available/);
  const point = await page.evaluate(() => { const s = window.__game.getState(), n = s.view.screen.find(n => n.id === 'app'), r = document.querySelector('.pl-stage').getBoundingClientRect(); return { x: r.left + n.x, y: r.top + n.y }; });
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('.pl-replica-summary');
  assert.match(await page.$eval('.pl-replica-summary', e => e.textContent), /5\/5 units available/);
  await page.$eval('.pl-replica-view', e => { const detail = e.closest('details'); if (detail) detail.open = true; e.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
  await new Promise(resolve => setTimeout(resolve, 300));
  await snap('pool-available');
  await page.evaluate(() => {
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph: {
      nodes: [{ id:'users',type:'mobile-app',x:-360,y:0 },{ id:'app',type:'vm-fleet',units:5,x:-120,y:0 },{ id:'objects',type:'object-storage',x:120,y:0 },{ id:'keys',type:'kms',x:120,y:180 }],
      edges: [{from:'users',to:'app'},{from:'app',to:'objects'},{from:'app',to:'keys'}]
    } }));
    return window.__game.loadSandbox();
  });
  await page.waitForFunction(() => window.__game.getState().mode === 'sandbox');
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.evaluate(() => window.__game.connect('objects', 'keys'));
  await page.waitForFunction(() => document.body.innerText.includes('Object storage → Key management is not supported.'));
  await new Promise(resolve => setTimeout(resolve, 500));
  await snap('connection-refused');
  console.log(JSON.stringify({ width, theme, goal: result.goal, latency: result.state.slo.latency, speedStatus: result.speed }));
  await context.close();
 }
} finally { await browser.close(); }
