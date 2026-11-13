import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveGame } from './browser-server.js';

const site = await serveGame(null);
const policy = (await import('node:fs')).readFileSync('_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ timezoneId: 'America/Chicago' });
  let user = null;
  let failSave = true;
  let saved = 0;
  await context.route('https://systemdesigner.io/**', async route => {
    const url = new URL(route.request().url());
    const response = await fetch(site.base + url.pathname.slice(1));
    await route.fulfill({ status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: { 'content-type': response.headers.get('content-type'), 'Content-Security-Policy': policy } });
  });
  await context.route('https://www.googletagmanager.com/**', route => route.fulfill({ body: '' }));
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(config) { this.config = config; },
      renderButton(host) { const button = document.createElement('button'); button.textContent = 'Use test Google account'; button.onclick = () => this.config.callback({ credential: 'test' }); host.append(button); }
    } } };
  ` }));
  await context.route('https://api.systemdesigner.io/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/probe') return route.fulfill({ contentType: 'text/html', body: `<script>parent.postMessage({sd:'systemdesigner-api',config:{google:{clientId:'test-client'},github:false,fake:false}},'https://systemdesigner.io')</script>` });
    let json = {};
    let status = 200;
    if (path === '/auth/config') json = { google: { clientId: 'test-client' }, github: false, fake: false };
    else if (path === '/auth/google/nonce') json = { nonce: 'test-nonce' };
    else if (path === '/auth/google') {
      user = { name: 'New player', avatar: null, providers: ['google'], email: 'new@example.com', marketingOptIn: true, marketingOptInAt: null, marketingCountry: 'US', marketingPromptPending: true };
      json = { user };
    } else if (path === '/me' && route.request().method() === 'PATCH') {
      if (failSave) { status = 503; json = { message: 'Please try again.' }; }
      else { saved++; user = { ...user, ...route.request().postDataJSON(), marketingPromptPending: false }; json = { user }; }
    } else if (path === '/me') json = { user, consent: { country: 'US', marketingDefault: true, analyticsDefault: true } };
    else if (path === '/progress') { await new Promise(resolve => setTimeout(resolve, 300)); json = { progress: {} }; }
    await route.fulfill({ status, json, headers: { 'Access-Control-Allow-Origin': 'https://systemdesigner.io', 'Access-Control-Allow-Credentials': 'true' } });
  });
  const page = await context.newPage();
  await page.goto('https://systemdesigner.io/#/settings');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click({ timeout: 45000 });
  await page.getByRole('button', { name: 'Use test Google account' }).click();
  const prompt = page.getByRole('dialog', { name: 'Email updates' });
  await prompt.waitFor();
  await page.waitForTimeout(650);
  assert.equal(await prompt.isVisible(), true, 'progress sync completion keeps the choice open');
  assert.equal(await prompt.getByRole('checkbox').isChecked(), true, 'US default is ticked');
  await prompt.getByRole('button', { name: 'Save choice' }).click();
  await prompt.getByText('Could not save that. Try again.').waitFor();
  assert.equal(await prompt.getByRole('checkbox').isChecked(), true);
  failSave = false;
  await prompt.getByRole('checkbox').uncheck();
  await prompt.getByRole('button', { name: 'Save choice' }).click();
  await prompt.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.ac-me-btn').evaluate(button => button === document.activeElement), true, 'saving the choice returns focus to the account button');
  assert.equal(saved, 1);
  assert.equal(user.marketingOptIn, false);
  await page.reload();
  await page.locator('#sh-email-card').waitFor();
  assert.equal(await prompt.count(), 0);
  assert.equal(await page.locator('#sh-email-card input').isChecked(), false);
  await page.evaluate(() => document.fonts.ready);
  await context.close();
  console.log('Google first-sign-in choice survives slow sync, handles save failures and stays saved.');
} finally { await browser.close(); await site.close(); }
