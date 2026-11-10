// Browser regressions for empty lesson measurements, headroom, freshness, hints and theme synchronization.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  await page.setViewport({ width: 1366, height: 800 });
  await page.goto(site.base);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.evaluate(() => window.__game.loadLesson('requests-and-latency'));
  let state = await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); return { clock: window.__game.getState().clock.simMs, text: document.querySelector('.pl-goal').textContent, done: document.querySelector('.pl-goal').classList.contains('pl-goal--done') }; });
  assert.equal(state.clock, 0); assert.equal(state.done, false); assert.doesNotMatch(state.text, /Check passed/);
  state = await page.evaluate(() => { window.__game.setKnob('app', 'region', 'eu'); window.__game.step(120000); return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), p99: window.__game.getState().slo.latency.p99Ms }; });
  assert.equal(state.done, false, 'moving only the app leaves the data trip');
  state = await page.evaluate(() => { window.__game.setKnob('db', 'region', 'eu'); window.__game.step(120000); return document.querySelector('.pl-goal').classList.contains('pl-goal--done'); });
  assert.equal(state, true);
  await page.evaluate(() => window.__game.loadLesson('back-of-envelope'));
  for (const units of [9, 10, 11]) {
    state = await page.evaluate(units => {
      window.__game.setKnob('app', 'units', units); window.__game.step(120000);
      return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent,
        util: window.__game.getState().nodes.find(n => n.id === 'app').util };
    }, units);
    assert.equal(state.done, false, `${units} servers leave less than 25% spare capacity at peak`);
    assert.match(state.text, /spare/);
    if (units === 11) assert(state.util < .75, 'current off-peak utilization alone would pass');
  }
  state = await page.evaluate(() => { window.__game.setKnob('app', 'units', 12); window.__game.step(120000); return document.querySelector('.pl-goal').classList.contains('pl-goal--done'); });
  assert.equal(state, true);
  await page.evaluate(() => window.__game.loadLesson('caching'));
  state = await page.evaluate(() => {
    const g = window.__game, st = g.getState(), e = st.edges.find(e => e.from === 'app' && e.to === 'db');
    const cache = g.placeComponent('cache', -200, 0, e.id); g.setKnob(cache, 'ttlSec', 300); g.step(120000);
    return { cache, done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent };
  });
  assert.equal(state.done, false); assert.match(state.text, /60 seconds old/);
  const fresh = await page.evaluate(id => { const unused = window.__game.placeComponent('cache', 0, 400); window.__game.setKnob(unused, 'ttlSec', 86400); window.__game.setKnob(id, 'ttlSec', 60); window.__game.step(120000); return { done: document.querySelector('.pl-goal').classList.contains('pl-goal--done'), text: document.querySelector('.pl-goal').textContent }; }, state.cache);
  assert.equal(fresh.done, true, fresh.text);
  await page.evaluate(() => window.__game.loadProblem('url-shortener'));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(3600000); });
  assert.equal(await page.$eval('[data-meter=avail] .pl-m-l', el => el.textContent), 'Day served');
  await page.evaluate(() => window.__game.step(82800000));
  await delay(1000);
  const hint = await page.$('.pl-overlay--debrief .pl-actions button:nth-child(2)');
  await hint.click();
  const visibleHint = await page.evaluate(() => { const el = document.querySelector('.pl-hints'); const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + 30, r.y + 30)); });
  assert.equal(visibleHint, true, 'requested help is above the result');
  await page.click('[aria-label="Close hints"]');
  for (const width of [1366, 390]) {
    await page.setViewport({ width, height: 844 });
    if (width < 719) await page.select('.pl-step-picker', 'draw');
    else await page.click('.pl-step[data-step="draw"]');
    await page.waitForFunction(() => document.querySelector('.pl-root').dataset.step === 'draw');
    await delay(350);
    assert.equal(await page.$eval('.pl-reset', el => el.checkVisibility()), true, 'completed Draw exposes the reset control');
    await page.click('.pl-reset');
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'build');
    const added = await page.evaluate(() => window.__game.placeComponent('cache', 0, 200));
    assert(added, 'reset makes drawing editable');
    await page.click('[aria-label="Fit to screen (F)"]');
    await delay(500);
    assert(await page.evaluate(() => {
      const { view } = window.__game.getState(), f = view.free;
      return view.screen.every(n => n.x >= f.l && n.x <= f.w - f.r && n.y >= f.t && n.y <= f.h - f.b);
    }), 'explicit Fit includes every part while one is selected');
    await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
    await page.waitForFunction(() => document.querySelector('.pl-root').dataset.step === 'debrief');
    assert.equal(await page.$eval('.pl-hud', el => el.checkVisibility()), false, 'debrief keeps the HUD hidden');
  }
  await page.evaluate(async () => {
    await window.__game.loadSandbox();
    for (let i = 0; i < 12; i++) window.__game.placeComponent('vm-fleet', i * 200, 0);
  });
  await delay(500);
  for (const fit of ['button', 'keyboard', 'double tap']) {
    if (fit === 'button') await page.click('[aria-label="Fit to screen (F)"]');
    else if (fit === 'keyboard') { await page.focus('.pl-kb'); await page.keyboard.press('f'); }
    else {
      const blank = await page.evaluate(() => {
        const r = document.querySelector('.pl-stage canvas').getBoundingClientRect();
        const f = window.__game.getState().view.free;
        return { x: r.left + (f.l + f.w - f.r) / 2, y: r.top + f.t + 60 };
      });
      await page.mouse.click(blank.x, blank.y);
      await delay(60);
      await page.mouse.click(blank.x, blank.y);
    }
    await delay(500);
    const view = await page.evaluate(() => window.__game.getState().view);
    assert(view.zoom < 0.15, `${fit} Fit can shrink below the interactive minimum`);
    assert(view.screen.every(n => n.x >= view.free.l && n.x <= view.free.w - view.free.r && n.y >= view.free.t && n.y <= view.free.h - view.free.b), `${fit} Fit frames the complete wide phone diagram`);
  }
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForSelector('[role="radiogroup"][aria-label="Theme"]');
  await page.click('#sh-theme-btn');
  const theme = await page.evaluate(() => ({ active: document.querySelector('[aria-label="Theme"] [aria-checked="true"]').dataset.value, header: document.querySelector('#sh-theme-btn').title }));
  assert.equal(theme.header, `Theme: ${theme.active}`);
  assert.deepEqual(errors, []);
  console.log('Measured lesson goals, headroom, TTL, visible hints and synchronized theme passed.');
} finally { await browser.close(); await site.close(); }
