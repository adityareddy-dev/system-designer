// Theme migration and first-paint coverage across the game and readable pages.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createSettings } from '../ui/shell/settings.js';
import { serveGame } from './browser-server.js';

function settingsFor(saved) {
  let value = saved;
  const settings = createSettings({ get: () => value, set: (_, next) => { value = next; } }, { emit() {} });
  return { settings, saved: () => value };
}
for (const [saved, expected] of [[null, 'dark'], ['invalid', 'dark'], [42, 'dark'], [{}, 'dark'], [{ theme: 'system' }, 'dark'], [{ theme: 'system', themeExplicit: true }, 'system'], [{ theme: 'light' }, 'light'], [{ theme: 'dark' }, 'dark']]) {
  const s = settingsFor(saved);
  assert.equal(s.settings.get('theme'), expected);
  s.settings.set('soundMuted', true);
  assert.equal(settingsFor(s.saved()).settings.get('theme'), expected);
  s.settings.set('theme', 'system');
  assert.equal(s.saved().themeExplicit, true);
  assert.equal(settingsFor(s.saved()).settings.get('theme'), 'system');
}
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const pg = await browser.newPage();
  // Stop game boot so its eventual theme update cannot hide a wrong initial paint.
  await pg.setRequestInterception(true);
  pg.on('request', req => req.url().includes('/main.js') ? req.abort() : req.continue());
  const routes = ['', 'p/url-shortener/', 'problems/', 'learn/consistent-hashing/', 'guides/two-week-system-design-plan/', 'privacy.html', '404.html'];
  for (const device of ['light', 'dark']) {
    await pg.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: device }]);
    for (const [saved, expected] of [[null, 'dark'], ['{broken', 'dark'], [JSON.stringify({ theme: 'system' }), 'dark'], [JSON.stringify({ theme: 'system', themeExplicit: true }), device], [JSON.stringify({ theme: 'light' }), 'light'], [JSON.stringify({ theme: 'dark' }), 'dark']]) {
      await pg.goto(site.base + 'privacy.html');
      await pg.evaluate(value => value === null ? localStorage.removeItem('hotpath.v1.settings') : localStorage.setItem('hotpath.v1.settings', value), saved);
      for (const route of routes) {
        await pg.goto(site.base + route, { waitUntil: 'load' });
        assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), expected, device + ' ' + route + ' ' + saved);
        assert.equal(await pg.evaluate(() => getComputedStyle(document.documentElement).colorScheme), expected);
      }
    }
  }
  await pg.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  for (const route of routes) {
    await pg.goto(site.base + route);
    assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), 'dark', 'blocked storage ' + route);
  }
  console.log('PASS theme choices, legacy migration, blocked storage and pre-boot themes');
} finally { await browser.close(); await site.close(); }
