// HUD gates, configured history promises and target-based score explanations stay consistent.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();

const BASE = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.setViewport({ width: 1440, height: 1000 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('hotpath.v1.seenIntro', 'true');
  localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
});
try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async () => {
    const game = window.__game;
    await game.loadProblem('url-shortener');
    const app = game.placeComponent('vm-fleet', 0, 0);
    game.setKnob(app, 'units', 1);
    const db = game.placeComponent('sql-primary', 200, 0);
    game.setKnob(db, 'tier', 'XL');
    for (const n of game.getState().nodes.filter(n => ['web-browser', 'mobile-app'].includes(n.type))) game.connect(n.id, app);
    game.connect(app, db);
  });
  const buildCopy = () => page.$eval('.pl-buildnote', el => el.textContent);
  assert.match(await buildCopy(), /1 part above estimated capacity/);
  assert.doesNotMatch(await buildCopy(), /raise|autoscaling|about \d+ servers/i, 'a fresh first attempt gets facts before repair advice');
  await page.evaluate(() => {
    window.__game.startTraffic();
    window.__game.step(86400000);
  });
  await page.$eval('.pl-reset', el => el.click());
  await page.waitForFunction(() => window.__game.getState().phase === 'build');
  assert.match(await buildCopy(), /raise|autoscaling|about \d+ servers/i, 'repair advice opens after the attempt');

  await page.evaluate(async () => {
    await window.__game.loadSandbox();
    const { problemById } = await import('./content/problems/index.js');
    const graph = problemById.get('bank-ledger').editorial.designs[0].graph;
    localStorage.setItem('hotpath.v1.draft.practice.bank-ledger', JSON.stringify({ graph }));
    await window.__game.loadProblem('bank-ledger');
    window.__game.setKnob('ledger', 'retentionDays', 1);
  });
  const proofCopy = () => page.$eval('.pl-req', el => el.textContent);
  assert.doesNotMatch(await proofCopy(), /Example:|Add and connect/, 'first-attempt requirements withhold wiring help');
  const safety = () => page.$eval('[data-meter="safe"]', el => ({ value: el.querySelector('.pl-m-v').textContent, explanation: el.querySelector('.pl-m-sub').textContent }));
  assert((await page.evaluate(() => window.__game.getState().slo.safety.promiseFailures)).some(f => f.nodeId === 'ledger'));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(10000); window.__game.pause(); });
  assert.equal((await safety()).value, 'At risk');
  assert.match((await safety()).explanation, /keeps data for 1 days.*requires at least 2555 days/);
  const disclosureState = () => page.$eval('.pl-req', el => ({ expanded: el.querySelector('.pl-req-head').getAttribute('aria-expanded'),
    proofs: [...el.querySelectorAll('details')].map(d => d.open) }));
  await page.$$eval('.pl-req details', details => details.forEach((d, i) => { d.open = i % 2 === 0; }));
  const foldedState = await disclosureState();
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  assert.equal((await safety()).value, 'At risk');
  assert.match((await safety()).explanation, /requires at least 2555 days/);
  assert.match(await proofCopy(), /Example: users → app server → SQL database/, 'finishing unlocks requirements wiring help without reopening the problem');
  assert.match(await proofCopy(), /Backups → SQL database/);
  assert.deepEqual(await disclosureState(), foldedState, 'unlocking advice preserves the card and proof disclosure states');
  await page.$eval('.pl-reset', el => el.click());
  await page.waitForFunction(() => window.__game.getState().phase === 'build');
  assert.match(await proofCopy(), /Example: users → app server → SQL database/, 'retry keeps the newly unlocked wiring help');
  assert.deepEqual(await disclosureState(), foldedState, 'retry preserves requirements disclosures');

  const scoreCards = await page.evaluate(async () => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { problemById } = await import('./content/problems/index.js');
    const { renderDebrief } = await import('./ui/play/debrief.js');
    const catalog = await loadCatalog(), problem = problemById.get('file-sync');
    const sim = createSim({ catalog, problem, seed: 'practice' });
    sim.loadGraph(problem.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
    const result = sim.result();
    const cases = [result.slo.availability, { actual: 0.995, target: 0.995 },
      { actual: 0.9949, target: 0.995 }, { actual: 0.99995, target: 0.99999 }];
    return { score: result.score.total, cases: cases.map(availability => {
      const host = document.createElement('div');
      renderDebrief(host, { result: { ...result, slo: { ...result.slo, availability } }, problem, catalog, reduced: true });
      return { ...availability, cards: [...host.querySelectorAll('[data-slo]')].map(el => el.textContent),
        cost: host.querySelector('[data-slo="cost"]').textContent };
    }) };
  });
  assert.equal(scoreCards.score, 1000);
  assert(scoreCards.cases[0].actual < 0.999 && scoreCards.cases[0].actual >= scoreCards.cases[0].target);
  for (const { actual, target, cards, cost } of scoreCards.cases) {
    const scaled = actual < target;
    assert.equal(cards.filter(copy => copy.includes('Points count only for the share')).length, scaled ? 3 : 0,
      'served-share explanations follow the stated availability target');
    assert.equal(cost.includes('At or under budget: full points.'), !scaled,
      'cost copy follows the same reliability rule');
  }
  assert.deepEqual(errors, []);
  console.log('HUD prediction gate, retention safety and score explanation checks passed.');
} finally {
  await browser.close(); await site.close();
}
