import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { serveGame } from './browser-server.js';
import { startApp, NOW } from '../api/test/helpers.js';

const site = await serveGame(null);
const app = await startApp();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
fs.mkdirSync('.task-tmp', { recursive: true });
try {
  for (const [country, checked, mobile] of [['US', true, false], ['DE', false, false], ['CA', false, true], ['XX', false, false]]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
    context.setDefaultTimeout(5000);
    let fail = false, captures = 0;
    await context.route('https://systemdesigner.io/**', async route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<script type="module" src="/assets/email-capture.js"></script>' });
      const response = await fetch(site.base + u.pathname.slice(1));
      await route.fulfill({ status: response.status, headers: { 'content-type': response.headers.get('content-type') }, body: Buffer.from(await response.arrayBuffer()) });
    });
    await context.route('https://api.systemdesigner.io/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      if (req.method() === 'POST' && pathname === '/email-capture') {
        captures++;
        if (fail) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      }
      const response = await fetch(app.base + pathname, { method: req.method(), headers: { Origin: 'https://systemdesigner.io', 'CF-IPCountry': country, 'content-type': 'application/json', 'X-Forwarded-For': '192.0.2.' + (['US','DE','CA','XX'].indexOf(country) + 1) }, ...(req.postData() ? { body: req.postData() } : {}) });
      await route.fulfill({ status: response.status, headers: { 'content-type': response.headers.get('content-type') }, body: Buffer.from(await response.arrayBuffer()) });
    });
    await context.route(/https:\/\/(?:www\.)?(?:googletagmanager|google-analytics)\.com\//, route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://systemdesigner.io/?utm_source=linkedin');
    await page.waitForFunction(() => sessionStorage.getItem('sd.reading.source.v1') === 'linkedin');
    await page.goto('https://systemdesigner.io/guides/notification-service-walkthrough/');
    const form = page.locator('[data-email-capture]');
    await form.locator('fieldset:not([disabled])').waitFor();
    assert.equal(await form.getByRole('checkbox').isChecked(), false, `${country} guide box starts unticked`);
    assert.equal(await page.locator('.sd-gated').isVisible(), false);
    const decline = page.getByRole('button', { name: 'Decline', exact: true });
    if (await decline.isVisible()) await decline.click();
    await page.screenshot({ path: `.task-tmp/email-gate-${country}.png`, fullPage: true });
    await form.getByRole('checkbox').uncheck();
    await form.getByRole('textbox', { name: 'Email address' }).fill(`reader-${country.toLowerCase()}@example.com`);
    fail = true;
    await form.getByRole('button', { name: 'Read the rest', exact: true }).click();
    await form.getByRole('status').getByText(/could not save/i).waitFor();
    assert.equal(await page.locator('.sd-gated').isVisible(), false, 'failure never unlocks');
    fail = false;
    await form.getByRole('button', { name: 'Read the rest', exact: true }).click();
    await page.locator('.sd-gated:not([hidden])').waitFor();
    assert.equal(app.db.marketingJobs(NOW, true).length, 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)).then(x => x.includes('@example.com')), false);
    await page.goto('https://systemdesigner.io/learn/caching/');
    await page.locator('.sd-gated:not([hidden])').waitFor();
    await page.goto('https://systemdesigner.io/p/news-site/');
    await page.locator('[data-email-capture] fieldset:not([disabled])').waitFor();
    assert.equal(await page.getByRole('checkbox').isChecked(), checked, `${country} weekly box default`);
    await page.getByRole('textbox', { name: 'Email address' }).fill(`weekly-${country.toLowerCase()}@example.com`);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Save my email choice' }).click();
    await page.getByRole('status').getByText(/saved/i).waitFor();
    const job = app.db.marketingJobs(NOW, true).find(j => j.email === `weekly-${country.toLowerCase()}@example.com`);
    assert.equal(job.subscribed, 1);
    assert.equal(job.source, 'linkedin');
    app.db.raw.exec('DELETE FROM marketing_queue');
    assert.equal(captures, 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    await page.screenshot({ path: `.task-tmp/email-capture-${country}.png`, fullPage: false });
    assert.deepEqual(errors, []);
    await context.close();
  }
  const fork = await browser.newPage();
  await fork.goto(site.base + 'learn/caching/');
  await fork.locator('.sd-gated:not([hidden])').waitFor();
  assert.equal(await fork.locator('[data-email-capture]').isVisible(), false);
  await fork.close();
  console.log('Real capture service: US/DE/CA/unknown weekly defaults, unticked guide consent, errors, unlock persistence, attribution, mobile and forks passed.');
} finally { await browser.close(); await app.close(); await site.close(); }
