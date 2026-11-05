// Candidate-led preparation requires commitment, locks the run and persists an honest defense report.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { questionCoverage, defenseQuestions } from '../ui/play/interview.js';
import { createProgress } from '../ui/shell/progress.js';
assert.deepEqual(questionCoverage('How many users? How long do we keep data?', [{ q: 'How many users are there?' }, { q: 'How long do we keep data?' }]), [true,true]);
const data = { progress: { legacy: { attempts: 2, bestScore: 800, stars: 1 } } };
const progress = createProgress({ get: (k, f) => data[k] || f, set: (k,v) => data[k] = v }, { emit() {} });
progress.recordInterview('legacy', { covered: 3, total: 10, score: 600 });
progress.recordInterview('legacy', { covered: 8, total: 10, score: 500 });
assert.equal(progress.get('legacy').bestScore, 800);
assert.equal(progress.get('legacy').interview.bestDay.score, 600);
assert.equal(progress.get('legacy').interview.bestCoverage.covered, 8);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
const base = process.argv[2] || 'http://localhost:8765/';
const click = text => page.evaluate(text => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && b.checkVisibility()); assertButton(el); function assertButton(el) { if (!el) throw new Error('Missing visible button: ' + text); el.click(); } }, text);
try {
  for (const width of [1366,390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 800 });
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('hotpath.v1.progress', JSON.stringify({ 'observability-platform': { attempts: 3, bestScore: 100, stars: 0 } })));
    await page.goto(base + '?interview-check=' + width + '#/practice/observability-platform?interview=1');
    await page.waitForSelector('.pl-defense-field textarea');
    assert.equal(await page.$('.pl-qlist'), null);
    await click('Commit questions');
    assert.match(await page.$eval('.pl-panel', e => e.textContent), /Write your questions first/);
    await page.type('.pl-defense-field textarea', 'How many measurements arrive? How long do we keep data? What data may we lose?');
    await click('Commit questions'); await click('Write requirements');
    await page.type('.pl-defense-field textarea', 'Ingest and query separately. Aim for 99.95 percent served with no payment processing.');
    await click('Commit requirements'); await click('Estimate the workload');
    assert.equal(await page.$('.pl-panel input[type=range]'), null);
    assert.doesNotMatch(await page.$eval('.pl-panel', e => e.textContent), /11,200|11k|1\.1 M/);
    await page.$$eval('.pl-panel input[type=number]', els => els.forEach((el,i) => { el.value = [11200,4,6.4][i]; el.dispatchEvent(new Event('input')); }));
    await click('Commit estimates'); await click('Start drawing');
    assert.equal(await page.$eval('.pl-root', e => e.dataset.step), 'draw');
    assert.equal(await page.$('.pl-tool--hint'), null); assert.equal(await page.$('.pl-tool--editorial'), null);
    await page.evaluate(() => {
      const g = window.__game; const app = g.placeComponent('vm-fleet',0,0); g.setKnob(app,'units',6);
      const db = g.placeComponent('sql-primary',180,0); g.connect('agents',app); g.connect('oncall',app); g.connect(app,db);
      g.startTraffic(); g.pause();
    });
    const before = await page.evaluate(() => window.__game.getState().nodes);
    await page.evaluate(() => { const g = window.__game, n = g.getState().nodes.find(n => n.type === 'vm-fleet'); g.setKnob(n.id,'units',100); g.placeComponent('cache',0,200); });
    assert.deepEqual(await page.evaluate(() => window.__game.getState().nodes), before);
    await page.evaluate(() => window.__game.step(86400000));
    await page.waitForSelector('.pl-defense-card');
    await page.evaluate(() => window.__game.reset());
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'done');
    await page.$$eval('.pl-defense-card', cards => cards.forEach(card => {
      const input = card.querySelector('textarea'); input.value = 'The failed path must be measured before choosing capacity or routing changes.'; input.dispatchEvent(new Event('input'));
      card.querySelector('button').click(); card.querySelectorAll('input[type=checkbox]').forEach(box => box.click());
    }));
    assert.equal(await page.$$eval('.pl-defense-card', els => els.length >= 3 && els.length <= 5), true);
    await click('Save interview report');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.progress'))['observability-platform'].interview);
    assert(saved.latest.covered > 0); assert(saved.bestDay); assert(saved.bestCoverage);
  }
  assert.deepEqual(errors, []);
  console.log('Interview preparation, typed estimates, one locked run, graph-specific defense and legacy progress passed at both sizes.');
} finally { await browser.close(); }
