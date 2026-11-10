// Panel and viewport changes never write back into an active resize delivery.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 800, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
    window.panelErrors = [];
    window.addEventListener('error', event => window.panelErrors.push(event.message));
  });
  await page.goto(base + '#/challenge');
  await page.waitForSelector('.sh-challenge-page');
  await page.click(await page.$eval('.sh-quickplay', e => e.checkVisibility()) ? '.sh-quickplay' : '.sh-playmain');
  await page.waitForFunction(() => window.__game?.getState().mode === 'challenge');
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  await page.waitForSelector('.pl-debrief');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.deepEqual(await page.evaluate(() => window.panelErrors), [], 'finishing a day does not trigger resize delivery errors');
  await page.evaluate(() => window.__game.loadSandbox());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.deepEqual(await page.evaluate(() => window.panelErrors), [], 'desktop-to-phone panel changes do not trigger resize delivery errors');
  console.log('Traffic completion and viewport changes reconcile panel geometry without resize delivery errors.');
} finally { await browser.close(); }
