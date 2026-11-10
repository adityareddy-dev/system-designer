// A full Hard interview preserves negative predictions and keeps long defenses below the steps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const base = process.argv[2] || 'http://localhost:8765/';
const shots = process.env.LAUNCH_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const width of [1366, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument(theme => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, soundMuted: true, reducedMotion: 'reduce' }));
    }, theme);
    const click = text => page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text && el.checkVisibility());
      if (!button) throw Error('Missing action: ' + text);
      button.click();
    }, text);
    const write = text => page.$eval('.pl-defense-field textarea', (el, text) => { el.value = text; el.dispatchEvent(new Event('input')); }, text);
    const snap = async name => { if (shots) await page.screenshot({ path: `${shots}/${width}-${theme}-${name}.png` }); };
    await page.goto(base + '#/practice/bank-ledger?interview=1');
    await page.waitForSelector('.pl-defense-field textarea');
    await write('Can postings be changed, or only reversed? What acknowledged data may we lose? Where are customers? What proof does the regulator need?');
    await click('Commit questions'); await click('Write requirements');
    await write('Retain an append-only ledger. Preserve acknowledged postings across a regional failure, with audit, access, keys and backups. Measure surviving capacity before claiming that a smaller fleet is safe.');
    await click('Commit requirements'); await click('Estimate the workload');
    await page.$$eval('.pl-panel input[type=number]', inputs => inputs.forEach((el, i) => { el.value = [1800, 3000, 93312000][i]; el.dispatchEvent(new Event('input')); }));
    await click('Commit estimates'); await click('Start drawing');
    await page.evaluate(() => {
      const g = window.__game, app = g.placeComponent('vm-fleet', -180, 0), ledger = g.placeComponent('ledger-db', 40, 0);
      g.setKnob(app, 'units', 20); g.setKnob(app, 'zones', 3);
      for (const id of ['web', 'mobile', 'partner']) g.connect(id, app);
      g.connect(app, ledger); g.startTraffic(); g.step(86400000);
    });
    await page.waitForSelector('.pl-defense-card');
    await page.$$eval('.pl-defense-card', cards => cards.forEach(card => {
      const answer = card.querySelector('textarea');
      answer.value = 'I predict the proposed change would fail. Measure the surviving capacity and the durability boundary first. Reject the cost cut if it removes the recovery reserve or cannot change the minimum fleet.';
      answer.dispatchEvent(new Event('input')); card.querySelector('form').requestSubmit();
      const select = card.querySelector('.hp-defense-claims select');
      select.value = 'fail'; select.dispatchEvent(new Event('change'));
      card.querySelector('.hp-defense-claims input').click();
    }));
    await page.$eval('.pl-defense-card:nth-of-type(3)', card => { card.open = true; card.querySelector('.pl-claim-trace').scrollIntoView({ block: 'start', behavior: 'instant' }); });
    const clearance = await page.evaluate(() => {
      const overlay = document.querySelector('.pl-overlay--debrief');
      return overlay.getBoundingClientRect().top - document.querySelector('.pl-top').getBoundingClientRect().bottom;
    });
    assert(clearance >= 8, 'the actual long interview scrollport remains below the step strip');
    await snap('hard-defense');
    await click('Save interview report');
    await page.$eval('.pl-interview-report', el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await snap('hard-saved-report');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.progress'))['bank-ledger'].interview.latest);
    assert.equal(saved.coverageKind, 'computed-predictions');
    assert(saved.defense.every(d => Object.values(d.claims).every(c => c.position === 'fail')));
    assert(saved.untested > 0, 'a single-unit ledger cannot test the keyed capacity experiment');
    assert.equal(saved.total + saved.untested, saved.defense.flatMap(d => Object.values(d.claims)).length);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Hard bank interview played and saved in both sizes and themes; negative positions, untested counts and long-report clearance verified.');
} finally { await browser.close(); }
