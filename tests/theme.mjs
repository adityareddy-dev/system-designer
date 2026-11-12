// The site has one theme, the cream workbench: every saved or device preference, old or new, gives the light theme on the game and on the readable pages.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createSettings } from '../ui/shell/settings.js';
import { serveGame } from './browser-server.js';

function settingsFor(saved) {
  let value = saved;
  const settings = createSettings({ get: () => value, set: (_, next) => { value = next; } }, { emit() {} });
  return { settings, saved: () => value };
}
// Older saved themes (dark, system) are read as the one theme.
for (const saved of [null, 'invalid', 42, {}, { theme: 'invalid' }, { theme: 'system' }, { theme: 'dark' }, { theme: 'light' }, { theme: 'system', themeExplicit: true }]) {
  const s = settingsFor(saved);
  assert.equal(s.settings.get('theme'), 'light', JSON.stringify(saved));
  assert.equal(s.settings.set('theme', 'dark'), false, 'dark is no longer a choice');
  s.settings.set('soundMuted', true);
  assert.equal(settingsFor(s.saved()).settings.get('theme'), 'light');
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
    for (const saved of [null, '{broken', JSON.stringify({ theme: 'dark' }), JSON.stringify({ theme: 'system', themeExplicit: true }), JSON.stringify({ theme: 'light' })]) {
      await pg.goto(site.base + 'privacy.html');
      await pg.evaluate(value => value === null ? localStorage.removeItem('hotpath.v1.settings') : localStorage.setItem('hotpath.v1.settings', value), saved);
      for (const route of routes) {
        await pg.goto(site.base + route, { waitUntil: 'load' });
        assert.equal(await pg.evaluate(() => document.documentElement.dataset.theme), 'light', device + ' ' + route + ' ' + saved);
        assert.equal(await pg.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
        if (!route) assert.equal(await pg.$eval('meta[name="theme-color"]', el => el.content), '#FFF4E0');
      }
    }
  }
  // The game has no theme switch and no theme setting.
  const ui = await browser.newPage();
  await ui.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await ui.goto(site.base + '#/settings');
  await ui.waitForSelector('.sh-settings-card');
  assert.equal(await ui.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await ui.$('[role="radiogroup"][aria-label="Theme"]'), null, 'no theme control in Settings');
  assert.equal(await ui.$('#sh-theme-btn'), null, 'no theme button in the top bar');
  console.log('PASS one theme everywhere');
} finally {
  await browser.close();
  await site.close?.();
}
