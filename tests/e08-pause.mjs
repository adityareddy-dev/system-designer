// Pausing real URL shortener traffic must freeze the entire canvas, including wire dashes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

await test('paused URL shortener canvas stays identical between frames and resumes motion', async () => {
  const site = await serveGame();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.warmups', JSON.stringify({ 'url-shortener': true }));
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'full' }));
    });
    const play = await readFile(new URL('../ui/play/play.js', import.meta.url), 'utf8');
    await page.setRequestInterception(true);
    page.on('request', r => new URL(r.url()).pathname === '/ui/play/play.js'
      ? r.respond({ contentType: 'text/javascript', body: play.replace('  return controller;',
        '  window.pauseTest = { scene, loadDesign }; return controller;') }) : r.continue());
    await page.goto(site.base + '#/practice/url-shortener');
    await page.waitForFunction(() => !!window.pauseTest && !!window.__game?.getState().problemId);
    await page.evaluate(async () => {
      await document.fonts.ready;
      const { problemById } = await import('./content/problems/index.js');
      window.pauseTest.loadDesign(problemById.get('url-shortener').editorial.designs[0]);
      window.pauseTest.scene.setQuality('high');
      window.__game.startTraffic(); window.__game.pause(); window.__game.step(14 * 3600000);
      window.__game.setSpeed(.25);
    });
    await new Promise(r => setTimeout(r, 900));
    await page.evaluate(() => window.__game.pause());
    // Let camera, label and node springs settle before comparing rendered frames.
    await new Promise(r => setTimeout(r, 3000));
    // Read the WebGL buffer immediately after rendering, before the browser clears it.
    const pixels = () => page.evaluate(() => {
      window.pauseTest.scene.renderNow(0);
      return document.querySelector('.pl-stage canvas').toDataURL();
    });
    const before = await pixels();
    const clock = await page.evaluate(() => window.__game.getState().clock);
    await new Promise(r => setTimeout(r, 375));
    const after = await pixels();
    assert.deepEqual(await page.evaluate(() => window.__game.getState().clock), clock);
    assert.equal(before === after, true, 'paused canvas pixels must stay identical');
    await page.evaluate(() => window.__game.setSpeed(.25));
    await new Promise(r => setTimeout(r, 375));
    assert.equal(after === await pixels(), false, 'traffic motion resumes');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); }
});
