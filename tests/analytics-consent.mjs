import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { serveGame } from './browser-server.js';

const site = await serveGame(null);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const policy = fs.readFileSync('_headers', 'utf8').match(/Content-Security-Policy: (.+)/)?.[1];
try {
  assert.ok(policy, 'static site has a content security policy');
  for (const [zone, defaults, expected] of [
    ['Europe/Berlin', null, false], ['America/Toronto', null, false], ['America/Manaus', null, false],
    ['America/Chicago', null, true], ['Asia/Kolkata', null, true],
    ['America/Chicago', { country: 'DE', analyticsDefault: false }, false],
    ['Europe/London', { country: 'US', analyticsDefault: true }, true],
  ]) {
    const context = await browser.newContext({ timezoneId: zone });
    await context.addInitScript(value => { if (value) window.sdConsentDefaults = value; }, defaults);
    const page = await context.newPage();
    const violations = [];
    await page.addInitScript(() => { window.violations = []; document.addEventListener('securitypolicyviolation', e => window.violations.push(e.blockedURI)); });
    await page.route(site.base + '**', async route => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': policy } });
    });
    await page.goto(site.base + 'privacy.html?preview=hosted');
    await page.waitForFunction(() => !!window.sdAnalytics);
    const states = () => page.evaluate(() => window.dataLayer.filter(a => a[0] === 'consent').map(a => ({ type: a[1], ...a[2] })));
    assert.equal((await states())[0].analytics_storage, expected ? 'granted' : 'denied', zone);
    assert.equal(await page.locator('#sd-cookie-banner').count(), expected ? 0 : 1, zone);
    // A later API answer must override the time zone, while an explicit choice always wins.
    await page.evaluate(() => dispatchEvent(new CustomEvent('sd:consent-defaults', { detail: { analyticsDefault: false } })));
    await page.locator('#sd-cookie-banner').waitFor();
    assert.equal((await states()).at(-1).analytics_storage, 'denied');
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await page.evaluate(() => dispatchEvent(new CustomEvent('sd:consent-defaults', { detail: { analyticsDefault: false } })));
    assert.equal((await states()).at(-1).analytics_storage, 'granted');
    await page.reload();
    await page.waitForFunction(() => !!window.sdAnalytics);
    assert.equal((await states())[0].analytics_storage, 'granted');
    await page.getByRole('button', { name: 'Cookie choices', exact: true }).click();
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => !!window.sdAnalytics);
    assert.equal((await states())[0].analytics_storage, 'denied');
    assert.equal(await page.locator('#sd-cookie-banner').count(), 0);
    for (const state of await states()) for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(state[key], 'denied');
    violations.push(...await page.evaluate(() => window.violations));
    assert.deepEqual(violations, [], 'privacy page works under the static content security policy');
    await context.close();
  }
  const local = await browser.newContext({ timezoneId: 'UTC' });
  const localPage = await local.newPage();
  await localPage.goto(site.base + 'privacy.html');
  await localPage.waitForFunction(() => !!window.sdAnalytics);
  assert.equal(await localPage.locator('#sd-cookie-banner').count(), 0, 'local copies send no analytics and need no automatic banner');
  assert.equal(await localPage.locator('script[src*="googletagmanager.com"]').count(), 0);
  await local.close();
  const context = await browser.newContext({ timezoneId: 'America/Chicago' });
  await context.route('https://systemdesigner.io/**', async route => {
    const url = new URL(route.request().url());
    const response = await fetch(site.base + url.pathname.slice(1));
    await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: { 'content-type': response.headers.get('content-type'), 'Content-Security-Policy': policy } });
  });
  await context.route('https://api.systemdesigner.io/**', route => route.fulfill({ json: { google: null, github: false, fake: false } }));
  let tags = 0;
  await context.route('https://www.googletagmanager.com/**', route => { tags++; return route.fulfill({ contentType: 'text/javascript', body: '' }); });
  const page = await context.newPage();
  await page.goto('https://systemdesigner.io/privacy.html');
  await page.waitForFunction(() => !!window.sdAnalytics);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(tags, 1, 'the hosted site loads the GA4 tag');
  assert.equal(await page.evaluate(() => window.dataLayer.find(a => a[0] === 'config')[1]), 'G-RYGVNBBY85');
  await context.close();
  const canvasContext = await browser.newContext();
  const canvasPage = await canvasContext.newPage();
  const canvasErrors = [];
  canvasPage.on('pageerror', error => canvasErrors.push(error.message));
  await canvasPage.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.blockedURI));
  });
  await canvasPage.route(site.base + '**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': policy } });
  });
  await canvasPage.goto(site.base + '#/sandbox');
  await canvasPage.waitForFunction(() => document.querySelector('.pl-stage canvas, [role="alert"]'), null, { timeout: 45000 });
  assert.deepEqual(await canvasPage.evaluate(() => window.policyViolations), [], 'the game drawing library works under the static policy');
  assert.equal(await canvasPage.locator('.pl-stage canvas').count(), 1, 'the sandbox canvas starts');
  assert.equal(await canvasPage.locator('[role="alert"]').count(), 0);
  assert.deepEqual(canvasErrors, []);
  await canvasContext.close();
  console.log('Consent defaults, API overrides, remembered choices, advertising denial and static content security policy passed.');
} finally { await browser.close(); await site.close(); }
