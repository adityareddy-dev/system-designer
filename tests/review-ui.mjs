// Browser regressions for drill rounds, phone lesson controls and restored graph positions.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('hotpath.v1.seenIntro', 'true');
  localStorage.setItem('hotpath.v1.settings', JSON.stringify({ reducedMotion: 'full', soundMuted: true }));
});
try {
  await page.goto(BASE + '#/drill', { waitUntil: 'load' });
  await page.waitForSelector('.sh-drill-q');
  for (let round = 0; round < 2; round++) {
    if (round) await page.evaluate(() => [...document.querySelectorAll('.sh-drill button')].find(b => b.textContent === 'Another round').click());
    await page.evaluate(() => {
      for (let i = 0; i < 10 && document.querySelector('.sh-drill-q'); i++) {
        document.querySelector('.sh-choice').click();
        document.querySelector('.sh-lp-nav .sh-btn--primary').click();
      }
    });
    assert.equal(await page.$eval('.sh-drill h1', el => el.textContent), 'Round done');
  }
  assert.match(await page.$eval('.sh-drill', el => el.textContent), /Finish today's review/);

  for (const reduced of [false, true]) {
    await page.evaluate(reduce => {
      document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
      location.hash = '#/learn/caching?step=1';
    }, reduced);
    await page.waitForSelector('.sh-demo-stage .pl-tb-grab');
    const starter = await page.evaluate(() => window.__game.getState().nodes);
    assert.equal(new Set(starter.map(n => n.x)).size, 1, 'fresh phone starters flow top to bottom');
    await page.waitForFunction(() => !document.querySelector('.sh-lp-card').getAnimations().some(a => a.playState === 'running'));
    const bounds = await page.evaluate(() => {
      const add = document.querySelector('.pl-tb-grab').getBoundingClientRect();
      const nav = document.querySelector('.sh-lp-nav').getBoundingClientRect();
      const stage = document.querySelector('.sh-demo-stage').getBoundingClientRect();
      return { hit: !!document.elementFromPoint(add.x + add.width / 2, add.y + add.height / 2)?.closest('.pl-tb-grab'), navTop: nav.top, stageBottom: stage.bottom };
    });
    assert(bounds.navTop >= bounds.stageBottom, 'lesson navigation stays below the workbench');
    assert(bounds.hit, 'Add component receives taps');
    await page.tap('.pl-tb-grab');
    await page.waitForSelector('.pl-toolbar--open');
    await page.evaluate(() => { location.hash = '#/learn'; });
    await page.waitForFunction(() => !document.querySelector('.sh-demo-stage'));
  }

  await page.evaluate(() => window.__game.loadProblem('url-shortener'));
  await page.tap('.pl-diagram-options summary');
  await page.evaluate(() => [...document.querySelectorAll('.pl-diagram-options button')].find(b => b.textContent === 'Hints').scrollIntoView({ block: 'nearest' }));
  const hints = await page.$('.pl-diagram-options button');
  await hints.tap();
  await page.waitForSelector('.pl-hints:not([hidden])');
  assert.equal(await page.$eval('.pl-diagram-options', el => el.open), false);
  await page.tap('[aria-label="Close hints"]');
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); });
  await page.tap('.pl-diagram-options summary');
  await page.tap('.pl-diagram-options button');
  await page.waitForSelector('.pl-hints:not([hidden])');
  await page.tap('[aria-label="Close hints"]');

  const graph = { nodes: [
    { id: 'users', type: 'web-browser', x: -480, y: 60, locked: true },
    { id: 'app', type: 'vm-fleet', x: -240, y: 60, units: 2 },
    { id: 'db', type: 'sql-primary', x: 0, y: 60 },
  ], edges: [['users', 'app'], ['app', 'db']] };
  const positions = nodes => nodes.map(({ type, x, y }) => ({ type, x, y }));
  await page.evaluate(() => window.__game.loadSandbox());
  await page.evaluate(g => {
    localStorage.setItem('hotpath.v1.draft.practice.url-shortener', JSON.stringify({ graph: g }));
  }, graph);
  await page.evaluate(() => window.__game.loadProblem('url-shortener'));
  assert.deepEqual(positions(await page.evaluate(() => window.__game.getState().nodes)), positions(graph.nodes));
  await page.evaluate(() => window.__game.setKnob('app', 'units', 3));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hotpath.v1.draft.practice.url-shortener')).graph.nodes.find(n => n.id === 'app').units === 3);
  assert.deepEqual(positions(await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.draft.practice.url-shortener')).graph.nodes)), positions(graph.nodes));

  await page.evaluate(g => {
    localStorage.setItem('hotpath.v1.sandbox.slots', JSON.stringify([{ name: 'Saved layout', graph: g }]));
    location.hash = '#/sandbox/1';
  }, graph);
  await page.waitForFunction(() => window.__game.getState().mode === 'sandbox' && window.__game.getState().nodes.some(n => n.id === 'app'));
  assert.deepEqual(positions(await page.evaluate(() => window.__game.getState().nodes)), positions(graph.nodes));
  const sharedGraph = { nodes: graph.nodes.map(n => ({ ...n, x: n.x + 40 })), edges: graph.edges.map(([from, to]) => ({ from, to })) };
  await page.evaluate(async g => {
    const { encodeShare } = await import('./compete/share.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const payload = await encodeShare({ mode: 'sandbox', problemId: 'sandbox', seed: 'sandbox', graph: g }, await loadCatalog());
    location.hash = '#/sandbox?d=' + payload;
  }, sharedGraph);
  await page.waitForFunction(() => window.__game.getState().nodes.some(n => n.id === 'users' && n.x === -440));
  assert.deepEqual(positions(await page.evaluate(() => window.__game.getState().nodes)), positions(sharedGraph.nodes));
  assert.deepEqual(errors, []);
  console.log('Review browser regressions passed.');
} finally {
  await browser.close();
}
