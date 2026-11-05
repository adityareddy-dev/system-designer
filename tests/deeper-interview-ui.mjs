// Each advanced workload supports preparation, per-source preflight, a passing day and a saved defense.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { problemById } from '../content/problems/index.js';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
  });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text && el.checkVisibility());
    if (!button) throw Error('Missing button: ' + text);
    button.click();
  }, text);
  for (const [index, id] of ['logs-platform', 'tracing-platform', 'tenant-metrics', 'device-notes', 'wearable-health'].entries()) {
    const problem = problemById.get(id);
    await page.setViewport({ width: index % 2 ? 390 : 1366, height: 900, isMobile: index % 2 === 1, hasTouch: index % 2 === 1 });
    await page.goto(base + '#/practice/' + id + '?interview=1');
    await page.waitForSelector('.pl-defense-field textarea');
    await page.type('.pl-defense-field textarea', 'Which sources send each request? What scale, retention and failure guarantees do we need?');
    await click('Commit questions'); await click('Write requirements');
    await page.type('.pl-defense-field textarea', 'Keep source routes separate, retain accepted writes durably, and measure capacity during failures.');
    await click('Commit requirements'); await click('Estimate the workload');
    await page.$$eval('.pl-panel input[type=number]', (els, values) => els.forEach((el, i) => { el.value = values[i]; el.dispatchEvent(new Event('input')); }), problem.numbers.map(n => n.value));
    await click('Commit estimates'); await click('Start drawing');
    assert.equal(await page.$('.pl-tool--hint'), null);
    const missing = await page.evaluate(graph => {
      const game = window.__game, ids = new Map(game.getState().nodes.map(n => [n.id, n.id]));
      for (const node of graph.nodes) {
        let id = ids.get(node.ref);
        if (!id) { id = game.placeComponent(node.type, node.x, node.y); ids.set(node.ref, id); }
        if (!id) throw Error('Cannot place ' + node.ref);
        for (const key of ['units', 'zones', 'tier', 'region']) if (node[key] != null) game.setKnob(id, key, node[key]);
        for (const [key, value] of Object.entries(node.knobs || {})) game.setKnob(id, key, value);
      }
      const source = graph.nodes.find(n => n.locked).ref;
      const omitted = graph.edges.find(([from]) => from === source);
      for (const edge of graph.edges) if (edge !== omitted) game.connect(ids.get(edge[0]), ids.get(edge[1]));
      return omitted.map(ref => ids.get(ref));
    }, problem.editorial.designs[0].graph);
    await click('Start day');
    await page.waitForSelector('.pl-modal:not([hidden])');
    assert.match(await page.$eval('.pl-modal-card', el => el.textContent), /no usable route/);
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'build');
    await click('Keep drawing');
    await page.evaluate(([from, to]) => window.__game.connect(from, to), missing);
    assert.deepEqual(await page.evaluate(() => window.__game.getState().errors), []);
    await click('Start day');
    const result = await page.evaluate(() => window.__game.step(86400000));
    assert.equal(result.phase, 'done'); assert(result.score.passed, id + ' interview reference passes');
    await page.waitForSelector('.pl-defense-card');
    assert.equal(await page.$eval('.hp-defense-answer', answer => getComputedStyle(answer).fontSize), '16px', 'phone writing stays readable');
    assert.equal(await page.$eval('.hp-defense-model h3', heading => getComputedStyle(heading).fontSize), '20px', 'shared model heading');
    await page.$$eval('.pl-defense-card', cards => cards.forEach(card => {
      const answer = card.querySelector('textarea');
      answer.value = 'Use the measured peak and surviving units. Test durable recovery and bound retries before increasing traffic.';
      answer.dispatchEvent(new Event('input'));
      card.querySelector('form').requestSubmit();
      card.querySelector('input[type=checkbox]').click();
    }));
    await click('Save interview report');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], id);
    assert.equal(saved.attempts, 0, 'interview leaves ordinary progress alone');
    assert.equal(saved.interview.attempts, 1);
    assert.equal(saved.interview.latest.passed, true);
    assert(await page.$$eval('.pl-defense-card input', inputs => inputs.every(input => input.disabled)));
    assert(await page.$eval('.pl-interview-report button', button => button.disabled));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.QA_SHOTS) {
      fs.mkdirSync(process.env.QA_SHOTS, { recursive: true });
      await page.screenshot({ path: process.env.QA_SHOTS + '/' + id + '-interview.png', fullPage: true });
    }
    console.log('INTERVIEW', id, result.score.total);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
