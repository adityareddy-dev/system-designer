import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveGame } from './browser-server.js';

const site = await serveGame(null);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 440, height: 956 } });
  await context.route('https://systemdesigner.io/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const response = await fetch(new URL(pathname.slice(1), site.base));
    await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') });
  });
  await context.route('https://api.systemdesigner.io/**', route => route.abort());
  await context.route(/https:\/\/(?:accounts\.google\.com|www\.googletagmanager\.com)\//, route => route.abort());

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const visit = async (route) => {
    await page.goto('https://systemdesigner.io/' + route);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  };
  await visit('');
  await page.getByRole('heading', { name: 'What breaks at 3× traffic?' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: /sign in/i }).count(), 0);
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByRole('rowheader', { name: 'Six servers' }).waitFor();
  for (const design of ['Twelve servers', 'Six + CDN']) {
    await page.getByRole('button', { name: design, exact: true }).click();
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByRole('rowheader', { name: design }).waitFor();
  }
  const rows = page.locator('.tl-results tbody tr');
  assert.equal(await rows.count(), 3);
  assert.equal(await rows.last().locator('td').first().innerText(), '0%');
  await page.getByRole('button', { name: /CDN Edge cache/ }).click();
  assert.match(await page.locator('.tl-inspector').innerText(), /CDN.*req\/s/s);
  assert.equal(await page.locator('.tl-hero').evaluate(el => el.scrollWidth <= el.clientWidth), true);

  for (const [url, heading] of [
    ['#/sandbox', 'Sandbox'], ['#/practice/url-shortener', 'URL shortener'],
    ['#/challenge', 'Daily challenge'],
  ]) {
    await visit(url);
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
    assert.equal(await page.getByRole('heading', { name: /Sign in to start playing/ }).count(), 0);
  }
  await visit('#/intro');
  await page.getByRole('link', { name: 'Skip intro' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Guest homepage, three comparison runs, mobile layout, sandbox, practice, challenge and intro passed with the account service unavailable.');
} finally {
  await browser.close();
  await site.close();
}
