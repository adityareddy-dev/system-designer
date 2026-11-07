// Reopening a route during its module load waits for the surviving workbench.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ reducedMotion: 'reduce', soundMuted: true }));
  });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    if (new URL(request.url()).pathname.endsWith('/ui/play/play.js')) await blocked;
    await request.continue();
  });
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  // Keep both outcomes observable even when a replaced host resolves to null.
  const first = page.evaluate(() => window.__game.loadSandbox().then(state => ({ mode: state.mode }), error => ({ error: error.message })));
  await page.waitForSelector('.sh-play-host');
  const oldHost = await page.$('.sh-play-host');
  const second = page.evaluate(() => window.__game.loadSandbox());
  await page.waitForFunction(host => !host.isConnected, {}, oldHost);
  release();
  assert.deepEqual(await first, { mode: 'sandbox' });
  assert.equal((await second).mode, 'sandbox');
  assert.equal(await page.$$eval('.pl-root', roots => roots.length), 1);
  assert.deepEqual(errors, []);
  console.log('Overlapping route loads resolve to the surviving sandbox workbench.');
} finally {
  await browser.close();
}
