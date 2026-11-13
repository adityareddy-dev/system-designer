// Verify that public reading and search remain usable in the browser.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
import { homeFaqs, readingLinks, interviewTopics } from '../content/site-reading.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const results = { layout: [], perf: [] };
try {
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  for (const width of [375, 768, 1440]) {
    await page.setViewport({ width, height: 900 });
    for (const [id] of interviewTopics) {
      const response = await page.goto(site.base + `interview/${id}/`);
      assert.equal(response.status(), 200);
      const state = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, text: document.querySelector('main').innerText, h1: document.querySelector('h1').innerText }));
      assert.ok(state.width <= width, `${id}: width ${state.width}`);
      assert.ok(state.text.split(/\s+/).length > 450, `${id}: substantial visible text`);
      results.layout.push({ id, width, words: state.text.split(/\s+/).length });
    }
  }
  await page.setJavaScriptEnabled(true);
  await page.goto(site.base + '?preview=hosted#/');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  for (const [href] of readingLinks) assert.ok(await page.$(`a[href="${href}"]`), `home links ${href}`);
  const text = await page.evaluate(() => document.body.innerText);
  for (const [question, answer] of homeFaqs) assert.ok(text.includes(question) && text.includes(answer), question);
  results.homeTitle = await page.title();
  await page.goto(site.base + '#/practice?q=chat');
  await page.waitForSelector('input[type=search]');
  assert.equal(await page.$eval('input[type=search]', input => input.value), 'chat');
  results.search = 'search action target opens the chat filter';
  await page.close();
  assert.equal(results.homeTitle, 'System design practice game | System Designer');
  console.log('PASS: 18 no-script landing layouts, visible text, home title, public links, FAQs and search action');
} finally {
  await browser.close();
  await site.close();
}
