// Browser regressions for drill rounds, phone lesson controls, telemetry and restored graph positions.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { commitLessonPrediction } from './lesson-prediction.js';

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
        const prediction = document.querySelector('.sh-drill textarea'); prediction.value = 'I predict the net rate determines the outcome.'; prediction.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('button')].find(b => b.textContent === 'Commit prediction and see choices').click();
        document.querySelector('.sh-choice').click();
        document.querySelector('.sh-lp-nav .sh-btn--primary').click();
      }
    });
    assert.equal(await page.$eval('.sh-drill h1', el => el.textContent), 'Round done');
  }
  assert.match(await page.$eval('.sh-drill', el => el.textContent), /Finish today's review/);

  for (const completed of [['intro'], ['intro', 'caching']]) {
    await page.evaluate(ids => {
      localStorage.setItem('hotpath.v1.lessons', JSON.stringify(Object.fromEntries(ids.map(id => [id, Date.now()]))));
      localStorage.removeItem('hotpath.v1.drill');
    }, completed);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.sh-drill-q');
    for (let round = 0; round < 2; round++) {
      if (round) await page.evaluate(() => [...document.querySelectorAll('.sh-drill button')].find(b => b.textContent === 'Another round').click());
      const counter = await page.$eval('.sh-drill .sh-progress-num', el => el.textContent);
      assert.match(counter, /^1\/[1-9]\d*$/, 'daily and repeat rounds both contain questions');
      if (completed.length > 1) assert.equal(counter, '1/1', 'one studied mechanism is never padded with repeated templates or advanced material');
      assert.match(await page.$eval('.sh-lp-card .sh-eyebrow', el => el.textContent), /^From the lesson:/);
      await page.evaluate(() => {
        for (let i = 0; i < 10 && document.querySelector('.sh-drill-q'); i++) {
          const prediction = document.querySelector('.sh-drill textarea'); prediction.value = 'I predict the net rate determines the outcome.'; prediction.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('button')].find(b => b.textContent === 'Commit prediction and see choices').click();
        document.querySelector('.sh-choice').click();
          document.querySelector('.sh-lp-nav .sh-btn--primary').click();
        }
      });
      assert.equal(await page.$eval('.sh-drill h1', el => el.textContent), 'Round done');
    }
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.drill')).rounds), 2);
  }
  await page.evaluate(() => localStorage.removeItem('hotpath.v1.lessons'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.sh-drill-q');

  for (const reduced of [false, true]) {
    await page.evaluate(reduce => {
      document.documentElement.dataset.motion = reduce ? 'reduce' : 'full';
      location.hash = '#/learn/caching?step=1';
    }, reduced);
    await commitLessonPrediction(page);
    await page.waitForSelector('.sh-demo-stage .pl-tb-grab');
    const starter = await page.evaluate(() => window.__game.getState().nodes);
    assert.equal(new Set(starter.map(n => n.y)).size, 1, 'fresh phone starters share a request band');
    const xOf = type => starter.find(n => n.type === type).x;
    assert(xOf('mobile-app') < xOf('vm-fleet') && xOf('vm-fleet') < xOf('sql-primary'), 'fresh phone starters flow from clients to stores, left to right');
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

  for (const width of [320, 390]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    for (const motion of ['full', 'reduce']) {
      await page.evaluate(async motion => {
        document.documentElement.dataset.motion = motion;
        await window.__game.loadLesson('queues-backpressure');
      }, motion);
      await commitLessonPrediction(page);
      await page.evaluate(() => {
        const game = window.__game;
        const state = game.getState();
        const app = state.nodes.find(n => n.type === 'vm-fleet');
        const db = state.nodes.find(n => n.type === 'sql-primary');
        const edge = state.edges.find(e => e.from === app.id && e.to === db.id);
        const queue = game.placeComponent('queue', 0, 100, edge.id);
        const downstream = game.getState().edges.find(e => e.from === queue && e.to === db.id);
        const worker = game.placeComponent('worker-pool', 0, 200, downstream.id);
        game.setKnob(worker, 'units', 1);
        game.startTraffic();
        game.step(600000);
        game.pause();
      });
      await page.waitForFunction(() => document.querySelector('.pl-hud--queues'));
      await page.waitForFunction(() => !document.querySelector('.sh-lp-card').getAnimations().some(a => a.playState === 'running'));
      await page.$eval('.pl-measurements-toggle', el => el.scrollIntoView({ block: 'center' }));
      await page.tap('.pl-measurements-toggle');
      assert.equal(await page.$eval('.pl-measurements-toggle', el => el.getAttribute('aria-expanded')), 'true');
      for (const key of ['avail', 'lag', 'safe']) {
        const meter = await page.$(`[data-meter="${key}"]`);
        await meter.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
        const readout = await meter.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const value = el.querySelector('.pl-m-v');
          const sub = el.querySelector('.pl-m-sub');
          return {
            label: el.querySelector('.pl-m-l').textContent,
            value: value.textContent, sub: sub.textContent,
            visible: [el, value, sub].every(node => node.checkVisibility()),
            reachable: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
          };
        });
        assert(readout.visible && readout.reachable, `${key} can be read on a ${width}px phone with ${motion} motion`);
        assert.notEqual(readout.value, '–');
        if (key === 'avail') {
          assert.equal(readout.label, 'Accepted now');
          assert.match(readout.sub, /jobs waiting/);
        } else if (key === 'lag') {
          assert.equal(readout.label, 'Completion lag');
          assert.match(readout.value, /oldest/);
          assert.match(readout.sub, /completed drain/);
        } else {
          assert.equal(readout.label, 'Expiry risk');
          assert.match(readout.sub, /Job deadline/);
        }
      }
      await page.$eval('#pl-live-measurements', el => el.focus());
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval('.pl-measurements-toggle', el => el.getAttribute('aria-expanded')), 'false');
      assert.equal(await page.$eval('#pl-live-measurements', el => el.checkVisibility()), false);
      await page.evaluate(() => { location.hash = '#/learn'; });
      await page.waitForFunction(() => !document.querySelector('.sh-demo-stage'));
    }
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

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
