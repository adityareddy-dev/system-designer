// Launch actions and long reading stay clear of navigation in both themes and screen sizes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:8765/';
const shots = process.env.LAUNCH_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const failures = [];
try {
  for (const width of [1366, 390]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument(theme => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, soundMuted: true, reducedMotion: 'reduce' }));
    }, theme);
    const snap = async name => { if (shots) await page.screenshot({ path: `${shots}/${width}-${theme}-${name}.png` }); };
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(base + '#/challenge');
      await page.waitForSelector('.sh-challenge-page');
      const action = await page.evaluate(() => [...document.querySelectorAll('.sh-quickplay,.sh-playmain')].find(e => e.checkVisibility())?.getAttribute('href'));
      await snap(`challenge-${attempt}`);
      if (!action) { failures.push(`${width} ${theme}: Challenge hides all launch actions`); break; }
      if (attempt && !/Try again/.test(await page.$eval('.sh-challenge-page', e => e.textContent))) failures.push(`${width} ${theme}: a zero-score attempt has no retry label`);
      await page.click(await page.$eval('.sh-quickplay', e => e.checkVisibility()) ? '.sh-quickplay' : '.sh-playmain');
      await page.waitForSelector('.pl-root');
      await page.waitForFunction(() => window.__game?.getState().mode === 'challenge');
      await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
      await page.waitForSelector('.pl-debrief');
      await snap(`daily-result-${attempt}`);
      const clearance = await page.evaluate(() => {
        const overlay = document.querySelector('.pl-overlay--debrief'), top = document.querySelector('.pl-top');
        const heading = overlay.querySelector('h2,h3');
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
        return { scrollTop: overlay.getBoundingClientRect().top, barsEnd: top.getBoundingClientRect().bottom, headingTop: heading.getBoundingClientRect().top };
      });
      if (clearance.scrollTop < clearance.barsEnd || clearance.headingTop < clearance.barsEnd) failures.push(`${width} ${theme}: report scrolls behind steps ${JSON.stringify(clearance)}`);
      await snap(`report-scrolled-${attempt}`);
    }
    await page.goto(base + '#/learn/requests-and-latency?step=7');
    await page.waitForSelector('.sh-lp-card');
    const margin = await page.evaluate(() => {
      const heading = document.querySelector('.sh-lp-card h2');
      heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      return { gap: heading.getBoundingClientRect().top - document.querySelector('.sh-topbar').getBoundingClientRect().bottom, margin: parseFloat(getComputedStyle(heading).scrollMarginTop) };
    });
    if (margin.gap < 8 || margin.margin < 8) failures.push(`${width} ${theme}: lesson heading lacks scroll clearance ${JSON.stringify(margin)}`);
    await snap('lesson-heading');
    assert.deepEqual(errors, []);
    await page.close();
  }
  assert.deepEqual(failures, []);
  console.log('Challenge plays twice, before and after saved scores; reports and lesson headings clear navigation at both sizes and themes.');
} finally { await browser.close(); }
