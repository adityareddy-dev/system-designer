// A quick browser return restores a committed lesson even when hashchange delivery is delayed.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site = await serveGame();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(() => {
    const listen = window.addEventListener;
    window.addEventListener = function(name, callback, options) {
      const deferred = name === 'hashchange' ? event => setTimeout(() => callback.call(this, event), 1000) : callback;
      return listen.call(this, name, deferred, options);
    };
  });
  await page.goto(site.base + '#/learn/load-balancing?step=1', { waitUntil: 'networkidle0' });
  await page.type('.sh-estimate-form textarea', 'The server pool should reach its limit first.');
  await page.click('.sh-estimate-form button[type=submit]');
  await page.waitForSelector('.sh-play-host canvas');
  await page.click('.sh-lp-nav button:first-child');
  await page.waitForSelector('.sh-lp-card:not(.sh-lp-card--demo)');
  assert.equal(await page.evaluate(() => window.__game.getState().route), '/learn/load-balancing');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => location.hash === '#/learn/load-balancing?step=1');
  await page.waitForSelector('.sh-play-host canvas');
  assert(await page.$eval('.sh-estimate-form', form => form.hidden), 'the committed prediction survives the return');
  assert.match(await page.$eval('.sh-estimate-receipt', receipt => receipt.innerText), /server pool/);
  console.log('Quick browser return preserves the lesson and its committed prediction.');
} finally {
  await browser.close();
  await site.close();
}
