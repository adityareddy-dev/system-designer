// Merged reports keep loop diagnoses visible and lesson navigation cancels pending figures.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const base = site.base;
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'full' }));
  });
  await page.goto(base + '#/learn'); await page.waitForSelector('.sh-learn-page');
  await page.setRequestInterception(true);
  let releaseFigure, releasePractice, sawFigure, sawPractice;
  const requestedFigure = new Promise(resolve => sawFigure = resolve), requestedPractice = new Promise(resolve => sawPractice = resolve);
  page.on('request', request => {
    if (request.url().endsWith('/ui/figures/consistent-hashing.js')) { releaseFigure = () => request.continue(); sawFigure(); }
    else if (request.url().endsWith('/ui/shell/practice.js')) { releasePractice = () => request.continue(); sawPractice(); }
    else request.continue();
  });
  await page.evaluate(() => location.hash = '#/learn/consistent-hashing?step=1');
  await requestedFigure;
  await page.evaluate(() => location.hash = '#/practice'); await requestedPractice;
  await releaseFigure();
  await page.evaluate(async () => { await import('./ui/figures/consistent-hashing.js'); await new Promise(r => setTimeout(r, 100)); });
  assert.equal(await page.$('.fg-bench'), null, 'a figure cannot mount even while the next screen is still loading');
  await releasePractice(); await page.waitForSelector('.sh-practice-page');
  await page.evaluate(() => history.back()); await page.waitForSelector('.fg-bench');
  await page.$eval('[data-control=n]', e => { e.value = 4; e.dispatchEvent(new Event('input')); });
  const animations = await page.evaluateHandle(() => document.querySelector('.fg-bench').getAnimations({ subtree: true }));
  assert(await animations.evaluate(list => list.length > 0));
  await page.evaluate(() => { const spacer = document.createElement('div'); spacer.style.height = '3000px'; document.body.append(spacer); scrollTo(0, document.body.scrollHeight); });
  await page.waitForFunction(() => document.querySelector('.fg-bench').getAnimations({ subtree: true }).every(a => a.playState !== 'running'));
  await page.evaluate(() => location.hash = '#/practice'); await page.waitForSelector('.sh-practice-page');
  assert(await animations.evaluate(list => list.every(a => a.playState === 'idle')), 'leaving cancels figure motion');
  const rendered = await page.evaluate(async () => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { renderDebrief } = await import('./ui/play/debrief.js');
    const problem = await (await fetch('./content/data/p/rate-limiter-service.json')).json();
    const catalog = await loadCatalog(), failures = [];
    const host = document.createElement('div'); document.body.append(host);
    for (const difficulty of ['Easy', 'Medium', 'Hard']) for (const broken of [false, true]) {
      const p = { ...problem, difficulty }, sim = createSim({ catalog, problem: p, seed: 'practice' });
      sim.loadGraph(p.editorial.designs[0].graph); sim.connect('cache', 'svc');
      if (broken) { sim.setKnob('svc', 'autoscale', { on: false }); sim.setKnob('svc', 'units', 1); }
      sim.start(); sim.advance(86400000);
      renderDebrief(host, { result: sim.result(), problem: p, catalog, reduced: true });
      const warning = host.querySelector('.pl-loop-warning');
      if (!warning?.checkVisibility() || !warning.textContent.includes('Remove this closing link')) failures.push(`${difficulty} ${broken}: diagnosis hidden`);
      const experiment = host.querySelector('.pl-repair, .pl-try, [aria-label="Capacity tradeoff"]');
      if (experiment && !(warning.compareDocumentPosition(experiment) & Node.DOCUMENT_POSITION_FOLLOWING)) failures.push(`${difficulty} ${broken}: experiment precedes diagnosis`);
    }
    host.remove(); return failures;
  });
  assert.deepEqual(rendered, []);
  assert.deepEqual(errors, []);
  console.log('Delayed figure navigation cancels imports and motion; every report keeps loop removal ahead of experiments.');
} finally { await browser.close(); await site.close(); }
