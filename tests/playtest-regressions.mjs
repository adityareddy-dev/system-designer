// Browser regressions for empty lesson measurements, headroom, freshness, hints and theme synchronization.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  await page.setViewport({ width: 1366, height: 800 });
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.evaluate(() => window.__game.loadLesson('requests-and-latency'));
  let state = await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); return { clock: window.__game.getState().clock.simMs, text: document.querySelector('.pl-goal').textContent, done: document.querySelector('.pl-goal').classList.contains('pl-goal--done') }; });
  assert.equal(state.clock, 0); assert.equal(state.done, false); assert.doesNotMatch(state.text, /Check passed/);
  state = await page.evaluate(() => { window.__game.setKnob('app', 'region', 'eu'); window.__game.step(120000); return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), p99: window.__game.getState().slo.latency.p99Ms }; });
  assert.equal(state.done, false, 'moving only the app leaves the data trip');
  state = await page.evaluate(() => { window.__game.setKnob('db', 'region', 'eu'); window.__game.step(120000); return document.querySelector('.pl-goal').classList.contains('pl-goal--done'); });
  assert.equal(state, true);
  await page.evaluate(() => window.__game.loadLesson('back-of-envelope'));
  state = await page.evaluate(() => { window.__game.setKnob('app', 'units', 9); window.__game.step(120000); return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent }; });
  assert.equal(state.done, false); assert.match(state.text, /spare/);
  state = await page.evaluate(() => { window.__game.setKnob('app', 'units', 12); window.__game.step(120000); return document.querySelector('.pl-goal').classList.contains('pl-goal--done'); });
  assert.equal(state, true);
  await page.evaluate(() => window.__game.loadLesson('caching'));
  state = await page.evaluate(() => {
    const g = window.__game, st = g.getState(), e = st.edges.find(e => e.from === 'app' && e.to === 'db');
    const cache = g.placeComponent('cache', -200, 0, e.id); g.setKnob(cache, 'ttlSec', 300); g.step(120000);
    return { cache, done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent };
  });
  assert.equal(state.done, false); assert.match(state.text, /60 seconds old/);
  const fresh = await page.evaluate(id => { window.__game.setKnob(id, 'ttlSec', 60); window.__game.step(120000); return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent }; }, state.cache);
  assert.equal(fresh.done, true, fresh.text);
  await page.evaluate(() => window.__game.loadProblem('url-shortener'));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  await delay(1000);
  const hint = await page.$('.pl-overlay--debrief .pl-actions button:nth-child(2)');
  await hint.click();
  const visibleHint = await page.evaluate(() => { const el = document.querySelector('.pl-hints'); const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + 30, r.y + 30)); });
  assert.equal(visibleHint, true, 'requested help is above the result');
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForSelector('[role="radiogroup"][aria-label="Theme"]');
  await page.click('#sh-theme-btn');
  const theme = await page.evaluate(() => ({ active: document.querySelector('[aria-label="Theme"] [aria-checked="true"]').dataset.value, header: document.querySelector('#sh-theme-btn').title }));
  assert.equal(theme.header, `Theme: ${theme.active}`);
  assert.deepEqual(errors, []);
  console.log('Measured lesson goals, headroom, TTL, visible hints and synchronized theme passed.');
} finally { await browser.close(); }
