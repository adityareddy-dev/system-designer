// Lesson and drill choices share a prediction commitment and native keyboard focus order.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { lessonById } from '../content/lessons/index.js';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const base = process.argv[2] || 'http://localhost:8765/';
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { localStorage.setItem('hotpath.v1.seenIntro','true'); localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true})); });
  const lesson = lessonById.get('caching');
  for (const width of [1366,390]) for (const theme of ['light','dark']) {
    await page.setViewport({width,height:844});
    for (const route of [`learn/caching?step=${lesson.steps.findIndex(s => s.kind === 'quiz')}`, `learn/caching?step=${lesson.steps.length}`, 'drill']) {
      await page.goto(base + '?pattern=' + Math.random() + '#/' + route);
      await page.waitForSelector('.sh-lp-card');
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      assert(await page.$('.sh-prediction-form'), route + ' has the shared prediction form');
      assert(await page.$eval('.sh-choices', e => e.hidden));
      assert(await page.$eval('.sh-choices', e => !e.checkVisibility()), 'choices are visually hidden before commitment');
      await page.keyboard.press('1');
      assert.equal(await page.$eval('.sh-quiz-result',e => e.textContent),'');
      await page.focus('.sh-prediction-form textarea');
      await page.keyboard.type('80');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Commit prediction and see choices');
      await page.keyboard.press('Enter');
      assert(await page.$eval('.sh-choice', e => e === document.activeElement));
      assert(await page.$eval('.sh-prediction-form textarea', e => e.readOnly));
      assert(await page.$eval('.sh-prediction-form button', e => !e.checkVisibility()), 'commit control leaves the focus order after reveal');
      assert(await page.$eval('.sh-prediction-receipt', e => e.textContent.includes('80')));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  console.log('Lesson quiz, transfer and drill predictions share wording, reveal, keyboard and focus on both sizes and themes.');
} finally { await browser.close(); }
