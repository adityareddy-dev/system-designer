// Short numeric predictions unlock drill choices and remain visible beside the outcome.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(site.base);
  const result = await page.evaluate(async () => {
    const { renderDrill } = await import('./ui/shell/drill.js');
    const host = document.createElement('div'); document.body.append(host);
    const drill = renderDrill(host, {
      content: { lessons: [{ id: 'load-balancing', title: 'Spreading load' }] },
      progress: { isLessonDone: () => true },
      store: { get: (_, fallback) => fallback, set() {} }
    });
    const input = host.querySelector('textarea'), choices = host.querySelector('.sh-choices');
    const commit = [...host.querySelectorAll('button')].find(b => b.textContent === 'Commit prediction and see choices');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    const hiddenBefore = choices.hidden && !host.querySelector('.sh-quiz-result').textContent;
    const cases = ['', '  ', '1', '80', ' 0 ', 'The remaining servers get busier.'].map(value => {
      input.value = value; input.dispatchEvent(new Event('input'));
      return { value, enabled: !commit.disabled };
    });
    input.value = '80'; input.dispatchEvent(new Event('input')); commit.click();
    host.querySelector('.sh-choice').click();
    const outcome = host.querySelector('.sh-quiz-result').textContent;
    const visibleAfter = !choices.hidden && input.readOnly;
    drill.destroy(); host.remove();
    return { hiddenBefore, cases, visibleAfter, outcome };
  });
  assert(result.hiddenBefore, 'keyboard answers cannot bypass committing a prediction');
  for (const test of result.cases) assert.equal(test.enabled, !!test.value.trim(), JSON.stringify(test.value));
  assert(result.visibleAfter);
  assert.match(result.outcome, /Your prediction \(not graded\): 80\./);
  console.log('Blank predictions stay gated; one- and two-digit answers unlock choices and are preserved with the outcome.');
} finally { await browser.close(); await site.close(); }
