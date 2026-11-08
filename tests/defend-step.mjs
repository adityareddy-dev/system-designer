import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();

const base = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  for (const width of [1280, 320]) for (const theme of ['light', 'dark']) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(async theme => {
      const { drawDefend } = await import('./ui/shell/defend.js');
      document.documentElement.dataset.theme = theme;
      document.body.replaceChildren();
      const card = document.createElement('section'); card.className = 'sh-card sh-lp-card';
      document.body.append(card);
      const nav = document.createElement('div'); nav.innerHTML = '<button class="sh-btn sh-btn--primary">Continue</button>';
      window.draft = {};
      window.redrawDefense = () => {
        card.replaceChildren();
        drawDefend(card, { q: 'What happens when the leader pauses?', model: 'The store rejects old fencing tokens.', checklist: ['Fence old owners', 'Keep a durable token'] }, window.draft, nav);
      };
      window.redrawDefense();
    }, theme);
    assert(await page.$eval('button[type=submit]', b => b.disabled));
    assert.equal(await page.$eval('.sh-defend-comparison', el => el.hidden), true);
    await page.focus('textarea'); await page.keyboard.type('   ');
    assert(await page.$eval('button[type=submit]', b => b.disabled), 'whitespace cannot reveal');
    await page.keyboard.type('Use a durable increasing fencing token.');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    assert.equal(await page.$eval('.sh-defend-comparison', el => el.hidden), false);
    assert.equal(await page.$eval('textarea', el => el.readOnly), true);
    assert.equal(await page.$eval('.sh-btn--primary', el => el.disabled), false, 'self review allows zero ticks');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sh-defend-model');
    await page.keyboard.press('Tab'); await page.keyboard.press('Space');
    assert.equal(await page.$eval('input[type=checkbox]', el => el.checked), true);
    await page.evaluate(() => window.redrawDefense());
    assert.equal(await page.$eval('input[type=checkbox]', el => el.checked), true);
    assert.match(await page.$eval('textarea', el => el.value), /fencing token/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    const sizes = await page.$$eval('.sh-defend-point', es => es.map(e => e.getBoundingClientRect().height));
    assert(sizes.every(h => h >= 44), 'touch targets');
  }
  console.log('Defend: nonblank gate, keyboard reveal and review, retained draft, phone and both themes passed.');
} finally { await browser.close(); await site.close(); }
