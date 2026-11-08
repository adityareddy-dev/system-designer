// Browser checks for readable fits, live phone overviews, unobstructed wiring, inspector wrapping and truthful counters.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
import { problemById } from '../content/problems/index.js';
import { checkFor } from '../ui/play/design-check.js';
const site = await serveGame();
const base = site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = ['web-browser', 'dns', 'cdn', 'waf', 'api-gateway', 'mobile-app', 'regional-lb', 'vm-fleet', 'cache', 'sql-primary', 'metrics', 'object-storage', 'queue', 'worker-pool', 'third-party-api'];
const graph = { nodes: types.map((type, i) => ({ id: 'n' + i, type, x: i % 5 * 200, y: Math.floor(i / 5) * 180, units: type === 'worker-pool' ? 30 : 1 })),
  edges: [[0,1],[1,2],[2,3],[3,4],[4,6],[5,6],[6,7],[7,8],[8,9],[7,12],[12,13],[13,14]].map(([a,b]) => ({ id: `n${a}>n${b}`, from: 'n' + a, to: 'n' + b, kind: 'flow' })) };
const errors = [];
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: width === 390 ? 844 : 800, isMobile: width === 390, hasTouch: width === 390 });
    await page.evaluateOnNewDocument(graph => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true }));
      localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph }));
    }, graph);
    await page.goto(base + '#/sandbox');
    await page.waitForFunction(() => window.__game?.getState().nodes.length === 15);
    await sleep(800);
    if (width === 390) { await page.click('.pl-overview button'); await sleep(700); }
    const fitView = await page.evaluate(() => window.__game.getState().view);
    assert(fitView.labelPx >= 12.99, `${width}px fit measures at least 13 CSS pixels for names: ${fitView.labelPx}px at zoom ${fitView.zoom}`);
    await sleep(1700);
    const entryPx = await page.evaluate(() => {
      window.__game.placeComponent('cache', 950, 360);
      return window.__game.getState().view.labelPx;
    });
    assert(entryPx >= 12.99, 'names stay readable when a new part wakes an idle scene');
    const animatedPx = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(window.__game.getState().view.labelPx))));
    assert(animatedPx >= 12.99, 'part entry motion keeps names at least 13 CSS pixels tall');
    const p = await page.evaluate(() => {
      const point = window.__game.getState().view.screen.find(n => n.id === 'n7'), r = document.querySelector('.pl-stage').getBoundingClientRect();
      return { x: point.x + r.x, y: point.y + r.y };
    });
    await page.mouse.click(p.x, p.y); await sleep(300);
    if (width === 390) {
      await page.$eval('.pl-focus-map .pl-btn', button => button.click());
      const before = await page.$$eval('.pl-focus-map svg path', paths => paths.length);
      await page.evaluate(() => window.__game.connect('n13', 'n10'));
      assert.equal(await page.$$eval('.pl-focus-map svg path', paths => paths.length), before + 1, 'selected overview follows new graph connections');
      assert.equal(await page.$eval('.pl-focus-map .pl-btn', button => button.dataset.zoomed), 'true', 'overview refresh preserves Enlarge');
    }
    await page.$eval('.pl-insp-actions button', button => button.click());
    assert.equal(await page.$eval('.pl-right', el => getComputedStyle(el).visibility), 'hidden', 'all right panels leave connection targets accessible');
    await page.keyboard.press('Escape');
    const insertion = await page.evaluate(() => {
      const id = window.__game.placeComponent('idempotency-store', 700, 300, 'n13>n14');
      return { id, state: window.__game.getState() };
    });
    assert(insertion.state.edges.some(e => e.id === 'n13>n14'));
    assert(insertion.state.edges.some(e => e.from === 'n13' && e.to === insertion.id));
    assert(!insertion.state.edges.some(e => e.from === insertion.id && e.to === 'n14'));
    await page.close();
  }

  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
  await page.goto(base + '#/settings'); await page.waitForFunction(() => window.__game);
  const overflow = await page.evaluate(async () => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createInspector } = await import('./ui/play/inspector.js');
    const { capacityText } = await import('./ui/play/inspector-facts.js');
    const catalog = await loadCatalog(), root = document.createElement('div'); root.className = 'pl-root';
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: 100, background: 'var(--bg)' }); document.body.append(root);
    const right = document.createElement('div'); right.className = 'pl-right';
    Object.assign(right.style, { top: '0', bottom: '0', right: '0', width: '320px', maxHeight: 'none' }); root.append(right);
    let node; const inspector = createInspector(right, { catalog, getNode: () => node, getHome: () => 'us', getProblem: () => null });
    const failures = [];
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      for (const element of catalog.elements) {
        node = { id: element.id, type: element.id, units: Math.min(30, element.units?.max || 1), tier: 'M', region: 'us', zones: 1, knobs: {} };
        inspector.show(node.id); root.querySelectorAll('details').forEach(d => d.open = true);
        if (element.capacity) {
          const expected = capacityText(element, node, catalog.world.tiers);
          const actual = root.querySelector('.pl-facts dd').textContent.replaceAll('≈', '').trim();
          if (actual !== expected.replace(', ', ' ')) failures.push(`${theme}: ${element.id} lost capacity explanation: ${actual}`);
        }
        const sc = root.querySelector('.pl-insp-scroll');
        if (sc.scrollWidth > sc.clientWidth + 1) failures.push(`${theme}: ${element.id}`);
      }
    }
    return failures;
  });
  assert.deepEqual(overflow, [], 'all 99 inspectors wrap at the narrowest supported width in both themes');
  await page.close();

  const reference = problemById.get('shopping-cart').editorial.designs[0].graph;
  const win = { nodes: reference.nodes.map(n => ({ ...n, id: n.ref })), edges: reference.edges.map(([from, to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' })) };
  for (const motion of ['full', 'reduce', 'fallback']) {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1366, height: 800 });
    await page.evaluateOnNewDocument((graph, motion) => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: motion === 'reduce' ? 'reduce' : 'full' }));
      localStorage.setItem('hotpath.v1.draft.practice.shopping-cart', JSON.stringify({ graph }));
      if (motion === 'fallback') document.startViewTransition = undefined;
    }, win, motion);
    await page.goto(base + '#/practice/shopping-cart');
    await page.waitForFunction(() => window.__game?.getState().nodes.length === 9);
    await page.evaluate(() => window.__game.loadProblem('shopping-cart'));
    await page.$eval('.pl-play', button => button.click());
    await page.evaluate(test => {
      const form = document.querySelector('.pl-design-check');
      form.querySelectorAll('.sh-choice')[test.answer].click(); form.querySelector('input').value = test.value;
      form.querySelector('textarea').value = 'Check measured peak demand against surviving capacity and verify retry safety.'; form.requestSubmit();
    }, checkFor(problemById.get('shopping-cart')));
    await page.evaluate(choices => {
      const form = document.querySelector('.pl-checkpoint');
      form.querySelectorAll('select').forEach((e,i) => e.value = choices[i]);
      form.querySelector('input').value = 'Commit the operation and result atomically and test recovery against a completed durable copy.'; form.requestSubmit();
      window.__game.pause();
    }, problemById.get('shopping-cart').correctness.fields.map(f => f.correct));
    await page.evaluate(() => window.__game.step(86400000));
    await page.waitForSelector('.pl-victory-numbers b');
    const readings = await page.evaluate(async () => {
      const samples = [], start = performance.now();
      while ((performance.now() - start < 1300 || samples.length < 6) && performance.now() - start < 10000) {
        await new Promise(requestAnimationFrame);
        const target = document.querySelector('.pl-victory-numbers b'), score = document.querySelector('.pl-dial-n');
        if (target && score) samples.push([target.textContent, score.textContent]);
      }
      return samples;
    });
    assert(readings.length > 5, `${motion}: sampled ${readings.length} rendered result frames`);
    assert(readings.every(([target, score]) => target === '99.90%' && score === '1,000'), `${motion}: thresholds and saved score stay fixed throughout the result`);
    assert(await page.$('.pl-run-evidence'), `${motion}: the same measured evidence survives every motion setting`);
    await page.goto(base + '#/practice'); await page.waitForSelector('.sh-practice-page');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::view-transition').pointerEvents), 'none');
    if (motion === 'full') {
      const clickable = await page.evaluate(async () => {
        const { transitionScreen } = await import('./ui/shell/motion.js');
        await transitionScreen(() => document.querySelector('.sh-main').dataset.test = 'changed');
        const button = document.querySelector('#sh-theme-btn'), r = button.getBoundingClientRect();
        return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#sh-theme-btn');
      });
      assert(clickable, 'shared header controls receive input during the transition');
    }
    await page.evaluate(async () => {
      for (const route of ['settings', 'learn', 'practice']) {
        location.hash = '#/' + route;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    });
    await sleep(500);
    assert.deepEqual(await page.evaluate(() => window.__game.getState().errors), [], 'interrupting navigation produces no rejected transition promises');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Readable fits, live overviews, side calls, all inspector widths, transitions and fixed result facts passed.');
} finally { await browser.close(); await site.close(); }
