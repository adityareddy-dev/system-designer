// Browser regressions for idle state reads, fleet contrast and palette-aware scene art.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();

const base = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, theme: 'light' }));
    window.__reviewStateReads = 0;
    window.__reviewPools = [];
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const file = new URL(request.url()).pathname;
    if (file.endsWith('/sim/engine.js')) {
      const source = fs.readFileSync(new URL('../sim/engine.js', import.meta.url), 'utf8')
        .replace('function stateNow() {', 'function stateNow() { window.__reviewStateReads++;');
      request.respond({ contentType: 'text/javascript', body: source });
    } else if (file.endsWith('/render/nodes.js')) {
      const source = fs.readFileSync(new URL('../render/nodes.js', import.meta.url), 'utf8')
        .replace("v.poolT = makeText('', 10.5, P.text2, true);", "v.poolT = makeText('', 10.5, P.text2, true); window.__reviewPools.push({ id: n.id, text: v.poolT });");
      request.respond({ contentType: 'text/javascript', body: source });
    } else request.continue();
  });
  await page.goto(base + '#/sandbox');
  await page.waitForFunction(() => window.__game?.getState().nodes.length > 0);
  await sleep(1000);
  await page.evaluate(() => { window.__reviewStateReads = 0; });
  await sleep(1100);
  assert.equal(await page.evaluate(() => window.__reviewStateReads), 0, 'idle Draw frames do not rebuild simulation state');
  await page.evaluate(() => window.__game.startTraffic());
  await sleep(500);
  await page.evaluate(() => { window.__reviewStateReads = 0; });
  await sleep(1100);
  const reads = await page.evaluate(() => window.__reviewStateReads);
  assert(reads >= 3 && reads <= 5, `running state reads follow the HUD cadence, observed ${reads}`);
  await page.evaluate(() => window.__game.pause());
  const light = await page.evaluate(() => window.__reviewPools.find(p => p.id === 'app').text.style.fill);
  const expected = await page.evaluate(async () => (await import('./assets/palette.js')).getPalette('light').hex.text2);
  assert.equal(light, expected, 'fleet availability uses the current secondary text color');

  for (const [route, selector] of [['learn', '.sh-chapter-art'], ['practice', '.sh-industry-art']]) {
    await page.goto(base + '#/' + route);
    try { await page.waitForSelector(selector + ' svg'); }
    catch (error) {
      console.error({ errors, page: await page.$eval('#sh-main', el => el.textContent) });
      throw error;
    }
    const backgrounds = await page.$$eval(selector, elements => elements.map(el => el.querySelector('svg') ? 1 : 0));
    assert(backgrounds.length > 1 && backgrounds.every(Boolean), `${route} artwork is drawn`);
  }
  console.log('Idle Draw state reads, HUD cadence, fleet contrast and chapter/industry scenes passed.');
} finally { await browser.close(); await site.close(); }
