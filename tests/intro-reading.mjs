// Intro explanations wait for Next while the player reads or inspects a part.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [width, theme, motion] of [[1366, 'light', 'full'], [390, 'dark', 'reduce']]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument((theme, motion) => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, theme, reducedMotion: motion }));
    }, theme, motion);
    await page.goto(base + '#/intro');
    await page.waitForSelector('.pl-caption-acts button');
    await page.waitForFunction(() => window.__game?.getState().nodes.some(node => node.id === 'app'));
    const before = await page.$eval('.pl-caption-t', element => element.textContent);
    await new Promise(resolve => setTimeout(resolve, 500));
    const part = await page.evaluate(() => {
      const state = window.__game.getState(), point = state.view.screen.find(node => node.id === 'app');
      const stage = document.querySelector('.pl-stage').getBoundingClientRect();
      return { x: stage.left + point.x, y: stage.top + point.y };
    });
    await page.mouse.click(part.x, part.y);
    await page.waitForSelector('.pl-inspector:not([hidden])');
    await new Promise(resolve => setTimeout(resolve, 10000));
    assert.equal(await page.$eval('.pl-caption-t', element => element.textContent), before, `${width}: explanation stays until Next, beyond the former nine-second limit`);
    const next = await page.$eval('.pl-caption-acts button', button => {
      const bounds = button.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      return { x, y, reachable: button.contains(document.elementFromPoint(x, y)) };
    });
    assert(next.reachable, `${width}: Next remains reachable with the inspector open`);
    await page.mouse.click(next.x, next.y);
    await page.waitForFunction(before => document.querySelector('.pl-caption-t')?.textContent !== before, {}, before);
    assert.match(await page.$eval('.pl-caption-t', element => element.textContent), /early morning/, `${width}: Next advances to the following explanation`);
    await page.close();
  }
  console.log('Intro explanations wait for Next while inspecting on desktop and phone, with normal and reduced motion.');
} finally { await browser.close(); }
