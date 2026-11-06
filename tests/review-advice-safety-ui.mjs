// First-attempt HUD facts stay gated and live safety includes configured history promises.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
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
  const safety = () => page.$eval('[data-meter="safe"]', el => ({ value: el.querySelector('.pl-m-v').textContent, explanation: el.querySelector('.pl-m-sub').textContent }));
  assert((await page.evaluate(() => window.__game.getState().slo.safety.promiseFailures)).some(f => f.nodeId === 'ledger'));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(10000); window.__game.pause(); });
  assert.equal((await safety()).value, 'At risk');
  assert.match((await safety()).explanation, /keeps data for 1 days.*requires at least 2555 days/);
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  assert.equal((await safety()).value, 'At risk');
  assert.match((await safety()).explanation, /requires at least 2555 days/);
  assert.deepEqual(errors, []);
  console.log('HUD prediction gate and retention safety checks passed.');
} finally {
  await browser.close();
}
