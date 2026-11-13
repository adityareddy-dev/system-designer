// Intro explanations wait for Next while the player reads or inspects a part.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [width, theme, motion] of [[1366, 'light', 'full'], [390, 'dark', 'reduce']]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument((theme, motion) => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, theme, reducedMotion: motion }));
    }, theme, motion);
    await page.goto(base + '#/intro');
    await page.waitForSelector('.pl-caption-acts button');
    await page.waitForFunction(() => window.__game?.getState().nodes.some(node => node.id === 'app'));
    const before = await page.$eval('.pl-caption-t', element => element.textContent);
    const reading = await page.evaluate(() => window.__game.getState());
    assert.equal(reading.phase, 'paused', `${width}: the day pauses for an indefinite reading wait`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const part = await page.evaluate(() => {
      const state = window.__game.getState(), point = state.view.screen.find(node => node.id === 'app');
      const stage = document.querySelector('.pl-stage').getBoundingClientRect();
      return { x: stage.left + point.x, y: stage.top + point.y };
    });
    await page.mouse.click(part.x, part.y);
    await page.waitForSelector('.pl-inspector:not([hidden])');
    await page.evaluate(() => {
      const palette = document.querySelector('.pl-toolbar');
      palette.querySelector('.pl-tb-grab')?.click();
      const loadBalancer = palette.querySelector('[data-el="regional-lb"]');
      if (!loadBalancer) throw Error('Load balancer is missing from the palette');
      loadBalancer.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    assert.equal(await page.$eval('.pl-caption-t', element => element.textContent), before, `${width}: arming placement preserves the reading caption`);
    await page.evaluate(() => {
      const id = __game.placeComponent('regional-lb', -120, 160);
      __game.connect('users', id);
      __game.connect(id, 'app');
    });
    assert.equal(await page.$eval('.pl-caption-acts button', button => button.textContent), 'Next', `${width}: building preserves Next`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    assert.equal(await page.$eval('.pl-caption-t', element => element.textContent), before, `${width}: explanation stays until Next, beyond the former nine-second limit`);
    assert.equal(await page.evaluate(() => window.__game.getState().clock.simMs), reading.clock.simMs, `${width}: reading cannot exhaust the day`);
    const next = await page.$eval('.pl-caption-acts button', button => {
      const bounds = button.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      return { x, y, reachable: button.contains(document.elementFromPoint(x, y)) };
    });
    assert(next.reachable, `${width}: Next remains reachable with the inspector open`);
    await page.mouse.click(next.x, next.y);
    await page.waitForFunction(before => document.querySelector('.pl-caption-t')?.textContent !== before, {}, before);
    assert.match(await page.$eval('.pl-caption-t', element => element.textContent), /early morning/, `${width}: Next advances to the following explanation`);
    const clickCaption = async text => {
      await page.waitForFunction(text => [...document.querySelectorAll('.pl-caption-acts button')].some(b => b.textContent === text), {}, text);
      await page.evaluate(text => [...document.querySelectorAll('.pl-caption-acts button')].find(b => b.textContent === text).click(), text);
    };
    await clickCaption('Next');
    await page.waitForFunction(() => document.querySelector('.pl-caption-t')?.textContent.includes('3 servers'));
    await page.evaluate(() => window.__game.setKnob('app', 'units', 3));
    await clickCaption('Next');
    await clickCaption('Try again');
    await clickCaption('Next');
    await clickCaption('Try again');
    await page.waitForFunction(() => document.querySelector('.pl-caption-t')?.textContent.includes('switch on Autoscale'));
    if (width === 1366) {
      // Finish the event and day before the script has registered either trigger.
      await page.evaluate(() => { window.__game.setKnob('app', 'autoscale', { on: true }); window.__game.step(86400000); });
    } else {
      await page.evaluate(() => window.__game.setKnob('app', 'autoscale', { on: true }));
      await page.waitForFunction(() => window.__game.getState().phase === 'running');
      await page.evaluate(() => window.__game.step(9 * 3600000));
    }
    await page.waitForFunction(() => document.querySelector('.pl-caption-t')?.textContent.includes('Viral spike!'));
    await clickCaption('Next');
    if (width !== 1366) {
      await page.waitForFunction(() => window.__game.getState().phase === 'running');
      await page.evaluate(() => window.__game.step(86400000));
    }
    await page.waitForFunction(() => /percent of requests succeeded/.test(document.querySelector('.pl-caption-t')?.textContent || ''));
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'done', `${width}: elapsed triggers still complete the tutorial`);
    await page.close();
  }
  console.log('Intro explanations wait for Next while inspecting on desktop and phone, with normal and reduced motion.');
} finally { await browser.close(); }
