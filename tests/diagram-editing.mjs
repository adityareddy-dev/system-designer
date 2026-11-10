// Browser checks for anchored insertion, transient labels, and the complete phone diagram.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
import { commitLessonPrediction } from './lesson-prediction.js';
const site = await serveGame();
const base = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('hotpath.v1.seenIntro', 'true'); localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true })); });
  await page.goto(base + '#/learn/load-balancing?step=1');
  await commitLessonPrediction(page);
  await page.waitForFunction(() => window.__game?.getState().nodes.length > 0);
  await sleep(900);
  const before = await page.evaluate(() => window.__game.getState());
  await page.evaluate(() => {
    const g = window.__game, state = g.getState();
    document.querySelector('.pl-dragchip').hidden = false;
    g.placeComponent('regional-lb', 0, 0, state.edges[0].id);
  });
  await sleep(1000);
  const after = await page.evaluate(() => window.__game.getState());
  const displacement = before.nodes.map(n => { const a = after.nodes.find(p => p.id === n.id); return [n.id, Math.hypot(a.x - n.x, a.y - n.y)]; });
  assert.equal(displacement.find(([id]) => id === 'users')[1], 0);
  assert.equal(displacement.find(([id]) => id === 'db')[1], 0);
  assert(displacement.find(([id]) => id === 'app')[1] <= 60, 'only minimum local insertion space is reserved');
  assert.equal(after.view.zoom, before.view.zoom, 'editing does not refit the camera');
  const a = before.view.screen.find(n => n.id === 'users'), b = after.view.screen.find(n => n.id === 'users');
  assert(Math.hypot(a.x - b.x, a.y - b.y) < 1, 'the source stays anchored on screen');
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.pl-dragchip')).display === 'none'));
  console.log('Measured existing-part displacement:', JSON.stringify(displacement));

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.reload();
  await commitLessonPrediction(page);
  await page.waitForFunction(() => window.__game?.getState().nodes.length === 3);
  await sleep(900);
  const phoneBefore = await page.evaluate(() => window.__game.getState().view);
  await page.evaluate(() => { const game = window.__game; game.placeComponent('regional-lb', 0, 0, game.getState().edges[0].id); });
  await sleep(900);
  const phoneAfter = await page.evaluate(() => window.__game.getState().view);
  assert.equal(phoneAfter.zoom, phoneBefore.zoom, 'phone insertion keeps the opening camera');
  for (const n of phoneAfter.screen) assert(n.y + 48 * phoneAfter.zoom + 26 < phoneAfter.free.h - phoneAfter.free.b, 'the reserved insertion row keeps every part and caption above the dock');

  await page.evaluate(() => {
    const types = ['dns', 'cdn', 'waf', 'api-gateway', 'regional-lb', 'web-browser', 'mobile-app', 'vm-fleet', 'cache', 'queue', 'worker-pool', 'object-storage', 'sql-primary', 'metrics', 'email-provider'];
    const graph = { nodes: types.map((type, i) => ({ id: 'n' + i, type, x: i % 5 * 200, y: Math.floor(i / 5) * 180, units: type === 'vm-fleet' ? 3 : 1 })), edges: [[5,7],[6,7],[7,8],[8,12],[0,1],[1,2],[2,3],[3,4],[4,7],[7,9],[9,10],[10,14],[7,11],[7,13]].map(([a,b]) => ({ id: `n${a}>n${b}`, from: 'n' + a, to: 'n' + b, kind: 'flow' })) };
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph }));
  });
  await page.goto(base + '#/sandbox');
  await page.waitForFunction(() => window.__game.getState().nodes.length === 15);
  await sleep(900);
  const entry = await page.evaluate(() => window.__game.getState().view);
  for (const id of ['n5', 'n7', 'n8', 'n12']) {
    const n = entry.screen.find(n => n.id === id);
    assert(n.x >= 24 && n.x <= 366, `${id} is on the entry request path`);
  }
  await page.$eval('.pl-overview button:last-child', b => b.click());
  await sleep(500);
  const view = await page.evaluate(() => window.__game.getState().view);
  for (const n of view.screen) {
    assert(n.x >= 24 && n.x <= 366, `${n.id} fits horizontally`);
    assert(n.y > view.free.t && n.y < view.free.h - view.free.b, `${n.id} fits between the panels`);
  }
  const position = await page.evaluate(() => { const s = window.__game.getState(), n = s.view.screen.find(n => n.id === 'n7'), r = document.querySelector('.pl-stage').getBoundingClientRect(); return { x: r.left + n.x, y: r.top + n.y }; });
  await page.touchscreen.tap(position.x, position.y);
  await page.waitForSelector('.pl-focus-map');
  assert.equal(await page.$eval('.pl-inspector', e => e.textContent.includes('App servers')), true);
  await page.$eval('.pl-focus-map .pl-btn', b => b.click());
  await sleep(500);
  const enlarged = await page.evaluate(() => window.__game.getState().view);
  assert(enlarged.zoom > view.zoom, 'selection can be enlarged with an explicit control');
  assert(await page.$('.pl-map-drawing svg'), 'the whole drawing remains available');
  assert.equal(await page.$eval('.pl-dragchip', e => e.hidden), true);
  console.log('The 15-part phone diagram fits; the selected-part view keeps an overview.');

  for (const [width, height] of [[320, 844], [390, 844], [320, 568], [568, 320], [667, 375]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await page.goto(base + '#/learn/load-balancing?step=1');
    await page.reload();
    await commitLessonPrediction(page);
    await page.waitForFunction(() => window.__game.getState().nodes.some(n => n.id === 'app'));
    await sleep(900);
    await page.$eval('.pl-stage', e => e.scrollIntoView({ block: 'end' }));
    await sleep(150);
    const position = await page.evaluate(() => {
      const s = window.__game.getState(), n = s.view.screen.find(n => n.id === 'app');
      const r = document.querySelector('.pl-stage').getBoundingClientRect();
      return { x: r.left + n.x, y: r.top + n.y };
    });
    await page.touchscreen.tap(position.x, position.y);
    await page.waitForSelector('.pl-focus-map');
    await sleep(350);
    const bounds = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { map: box('.pl-focus-map'), goal: box('.pl-goal'), inspector: box('.pl-inspector'), button: box('.pl-focus-map .pl-btn'),
        compact: document.querySelector('.pl-focus-map').classList.contains('is-compact'),
        scrollHeight: document.querySelector('.pl-insp-scroll').clientHeight, width: innerWidth, height: innerHeight };
    });
    if (!bounds.compact) assert(bounds.map.top >= bounds.goal.bottom + 8, `${width}px overview clears the lesson goal`);
    assert(bounds.button.bottom <= bounds.inspector.top, `${width}px full overview and Enlarge control clear the inspector`);
    assert(bounds.map.left >= 0 && bounds.map.right <= bounds.width && bounds.map.bottom <= bounds.height, `${width}px overview fits on screen`);
    assert(bounds.inspector.bottom - bounds.inspector.top >= 148, `${width}x${height} keeps a usable inspector`);
    assert(bounds.scrollHeight >= 44, `${width}x${height} keeps a touch-height scroll area`);
    const unitsBefore = await page.evaluate(() => window.__game.getState().nodes.find(n => n.id === 'app').units);
    const control = '.pl-inspector [data-knob="units"] button:last-child';
    await page.$eval(control, e => e.scrollIntoView({ block: 'nearest' }));
    await sleep(150);
    const target = await page.$eval(control, e => {
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return { x, y, reachable: e.contains(document.elementFromPoint(x, y)) };
    });
    assert(target.reachable, `${width}x${height} exposes the server-count control for touch`);
    await page.touchscreen.tap(target.x, target.y);
    assert((await page.evaluate(() => window.__game.getState().nodes.find(n => n.id === 'app').units)) > unitsBefore,
      `${width}x${height} lets the player adjust the required server count`);
    console.log(`Server controls work at ${width}x${height}.`);
  }
  console.log('Lesson overview and server controls remain usable in tall, short portrait and landscape phone viewports.');
} finally { await browser.close(); await site.close(); }
