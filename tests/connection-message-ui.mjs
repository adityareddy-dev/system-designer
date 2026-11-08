// Rejected connection advice stays readable and clear of the phone traffic controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const shots = process.env.LAUNCH_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
try {
  for (const width of [1366, 390]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument(theme => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, soundMuted: true, reducedMotion: 'reduce' }));
    }, theme);
    await page.goto((process.argv[2] || 'http://localhost:8765/') + '#/sandbox');
    await page.waitForFunction(() => window.__game?.getState().mode === 'sandbox');
    await page.evaluate(() => {
      const g = window.__game, object = g.placeComponent('object-storage', 100, 0), key = g.placeComponent('kms', 100, 180);
      g.connect(object, key);
    });
    await page.waitForSelector('.sh-toast[data-level=warn]');
    await new Promise(resolve => setTimeout(resolve, 500));
    const observed = await page.$eval('.sh-toast[data-level=warn]', el => {
      const rect = el.getBoundingClientRect(), text = el.querySelector('span:last-child').getBoundingClientRect();
      const traffic = document.querySelector('.pl-traffic').getBoundingClientRect();
      return { text: el.textContent, width: rect.width, radius: parseFloat(getComputedStyle(el).borderRadius), inside: text.top >= rect.top && text.bottom <= rect.bottom, bottom: rect.bottom, traffic: traffic.top };
    });
    if (shots) await page.screenshot({ path: `${shots}/${width}-${theme}-connection-message.png` });
    assert.match(observed.text, /Object storage → Key management/);
    assert.doesNotMatch(observed.text, /database/i);
    assert(observed.inside);
    if (width === 390) {
      assert(observed.width >= 340 && observed.radius <= 14, 'long advice uses the available width and a readable text box');
      assert(observed.bottom <= observed.traffic - 8, 'the warning clears the pinned traffic panel');
    }
    await page.close();
  }
  console.log('Actual rejected connection advice stays readable in both themes and sizes, clear of phone traffic controls.');
} finally { await browser.close(); }
