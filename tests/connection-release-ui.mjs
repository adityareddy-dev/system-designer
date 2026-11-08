// Connections follow the release position even when the final move is coalesced.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const pointerType of ['mouse', 'touch']) for (const release of ['without preview', 'different part', 'empty space']) {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: pointerType === 'touch' ? 390 : 1366, height: 844 });
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
    });
    await page.goto(site.base + '#/sandbox');
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__game?.getState().view?.diagram);
    const targets = await page.evaluate(() => [__game.placeComponent('cache', 520, 260), __game.placeComponent('cache', 780, 260)]);
    await page.$eval('.pl-tool--fit', button => button.click());
    await page.waitForFunction(async () => {
      const key = () => JSON.stringify(__game.getState().view.screen);
      const before = key();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return before === key();
    });
    await page.evaluate(({ pointerType, release, targets }) => {
      const canvas = document.querySelector('.pl-stage canvas');
      const rect = canvas.getBoundingClientRect();
      const view = __game.getState().view;
      const point = id => {
        const node = view.screen.find(node => node.id === id);
        return { x: rect.left + node.x, y: rect.top + node.y };
      };
      const source = point('app');
      const port = { x: source.x + 36 * view.zoom, y: source.y };
      const send = (type, point) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 42, pointerType, isPrimary: true, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y,
      }));
      send('pointerdown', port);
      if (release !== 'without preview') send('pointermove', point(targets[0]));
      const end = release === 'empty space' ? { x: rect.left - 1000, y: rect.top - 1000 } : point(targets[release === 'different part' ? 1 : 0]);
      send('pointerup', end);
    }, { pointerType, release, targets });
    const connected = await page.evaluate(targets => __game.getState().edges.filter(edge => edge.from === 'app' && targets.includes(edge.to)).map(edge => edge.to), targets);
    const expected = release === 'empty space' ? [] : [targets[release === 'different part' ? 1 : 0]];
    assert.deepEqual(connected, expected, `${pointerType}: ${release} uses the release location`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Mouse and touch connections follow release positions without a preview, over another part and over empty space.');
} finally {
  await browser.close();
  await site.close();
}
