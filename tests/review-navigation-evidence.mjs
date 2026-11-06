// Delayed navigation cannot replace a retained view, and report cards show actual workload evidence.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { problemById } from '../content/problems/index.js';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const base = process.argv[2] || 'http://localhost:8765/';
try {
  for (const motion of ['reduce', 'full']) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(motion => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: motion }));
    }, motion);
    await page.setRequestInterception(true);
    let release, sawLearn;
    const requested = new Promise(resolve => { sawLearn = resolve; });
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('/ui/shell/learn.js')) {
        release = () => request.continue(); sawLearn();
      } else request.continue();
    });
    await page.goto(base + '#/practice?d=Hard');
    await page.waitForSelector('.sh-practice-page');
    await page.evaluate(() => { document.querySelector('.sh-practice-page').dataset.retained = 'true'; });
    await page.click('a[data-tab="learn"]');
    await requested;
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#/practice?d=Hard');
    assert.equal(await page.$eval('#sh-main', el => el.hasAttribute('aria-busy')), false, 'retaining Practice clears the pending load state');
    await release();
    await page.evaluate(async () => { await import('./ui/shell/learn.js'); await new Promise(resolve => setTimeout(resolve, 200)); });
    assert.equal(await page.$eval('.sh-practice-page', el => el.dataset.retained), 'true', 'the stale module never replaces the retained Practice view');
    assert.equal(await page.title(), 'Practice | System Designer');
    assert.equal(await page.$eval('[aria-current="page"]', el => el.dataset.tab), 'practice');

    const benefits = problemById.get('benefits-portal');
    await page.evaluate(graph => {
      localStorage.setItem('hotpath.v1.draft.practice.benefits-portal', JSON.stringify({ graph }));
      location.hash = '#/practice/benefits-portal';
    }, benefits.editorial.designs[0].graph);
    await page.waitForFunction(() => window.__game?.getState().problemId === 'benefits-portal' && window.__game.getState().nodes.some(n => n.type === 'sql-primary'));
    await page.evaluate(() => {
      const g = window.__game;
      g.setKnob(g.getState().nodes.find(n => n.type === 'sql-primary').id, 'retentionDays', 5);
      g.startTraffic(); g.step(86400000);
    });
    await page.waitForSelector('.pl-run-evidence');
    const copy = await page.$eval('.pl-run-evidence', el => el.textContent);
    assert.match(copy, /The requirement that missed/);
    assert.match(copy, /keeps data for 5 days/);
    assert.doesNotMatch(copy, /reached its limit|failed requests|busy/);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Returning during delayed navigation retains the view; safety cards show failed promises in both motion modes.');
} finally { await browser.close(); }
