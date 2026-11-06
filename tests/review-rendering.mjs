// Browser regressions for idle state reads, fleet contrast and palette-aware scene art.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage();
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
        .replace("v.poolT = makeText('', 7.5, P.text2, true);", "v.poolT = makeText('', 7.5, P.text2, true); window.__reviewPools.push({ id: n.id, text: v.poolT });");
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
  await page.click('#sh-theme-btn');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const dark = await page.evaluate(() => window.__reviewPools.find(p => p.id === 'app').text.style.fill);
  assert.notEqual(light, dark, 'fleet availability text changes color with the theme');
  const expected = await page.evaluate(async () => (await import('./assets/palette.js')).getPalette('dark').hex.text2);
  assert.equal(dark, expected, 'fleet availability uses the current secondary text color');

  for (const [route, selector] of [['learn', '.sh-chapter-art'], ['practice', '.sh-industry-art']]) {
    await page.goto(base + '#/' + route);
    await page.waitForSelector(selector + ' svg');
    for (let i = 0; i < 3; i++) {
      if (await page.$eval('#sh-theme-btn', b => b.getAttribute('aria-label').startsWith('Theme: light.'))) break;
      await page.click('#sh-theme-btn');
    }
    const backgrounds = () => page.$$eval(selector, elements => elements.map(el => {
      const svg = el.querySelector('svg');
      const bg = svg?.querySelector('rect[fill="var(--bg)"]');
      return bg && getComputedStyle(bg).fill;
    }));
    const before = await backgrounds();
    assert(before.length > 1 && before.every(Boolean), `${route} artwork uses palette-aware scene markup`);
    await page.click('#sh-theme-btn');
    const after = await backgrounds();
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) assert.notEqual(after[i], before[i], `${route} scene ${i + 1} follows a live theme change`);
  }
  console.log('Idle Draw state reads, HUD cadence, fleet contrast and chapter/industry scene themes passed.');
} finally { await browser.close(); }
