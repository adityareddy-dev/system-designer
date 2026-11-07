// Menu anchoring, shrinking selected pools, clock writes and earned score presentation.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ reducedMotion: 'full', soundMuted: true }));
  });
  for (const [phone, lesson] of [[false, false], [true, false], [false, true], [true, true]]) {
    await page.setViewport({ width: phone ? 390 : 1366, height: phone ? 844 : 800, isMobile: phone, hasTouch: phone });
    await page.goto(base + (lesson ? '#/learn/load-balancing?step=1' : '#/sandbox'));
    await page.waitForFunction(() => window.__game?.getState().nodes.some(n => n.id === 'app'));
    await sleep(700);
    if (lesson) {
      await page.$eval('.pl-stage', e => e.scrollIntoView({ block: 'end', behavior: 'instant' }));
      await sleep(200);
    }
    const pos = await page.evaluate(() => {
      const n = window.__game.getState().view.screen.find(n => n.id === 'app');
      const r = document.querySelector('.pl-stage').getBoundingClientRect();
      return { x: n.x + r.left, y: n.y + r.top, scroll: scrollY, mainScroll: document.querySelector('.sh-main').scrollTop };
    });
    if (phone) {
      const cdp = await page.createCDPSession();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pos.x, y: pos.y }] });
      await sleep(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else await page.mouse.click(pos.x, pos.y, { button: 'right' });
    await page.waitForSelector('.pl-menu:not([hidden])');
    for (const delay of [30, 300]) {
      await sleep(delay);
      const menu = await page.$eval('.pl-menu', e => {
        const r = e.getBoundingClientRect(), stage = document.querySelector('.pl-stage').getBoundingClientRect();
        return { x: r.x, y: r.y, stageX: stage.x, stageY: stage.y, w: stage.width, h: stage.height, scroll: scrollY, mainScroll: document.querySelector('.sh-main').scrollTop, focused: e.contains(document.activeElement) };
      });
      const x = Math.min(menu.w - 190, Math.max(8, pos.x - menu.stageX)) + menu.stageX;
      const y = Math.min(menu.h - 150, Math.max(8, pos.y - menu.stageY)) + menu.stageY;
      assert(Math.abs(menu.x - x) < 2 && Math.abs(menu.y - y) < 2, 'menu stays beside its part during and after full motion');
      assert.equal(menu.scroll, pos.scroll, 'menu focus never scrolls the page');
      assert.equal(menu.mainScroll, pos.mainScroll, 'menu focus preserves the scrolled lesson position');
      if (!phone) assert(menu.focused, 'desktop menu remains keyboard ready');
    }
    await page.keyboard.press('Escape');
  }
  const pool = await page.evaluate(async () => {
    const { createInspector } = await import('./ui/play/inspector.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const catalog = await loadCatalog();
    const host = document.body.appendChild(document.createElement('div'));
    const sim = createSim({ catalog, mode: 'sandbox', problem: { requirements: { peakRps: 100, mix: { read: 1 } }, traffic: { curve: 'flat' } } });
    sim.loadGraph({ nodes: [
      { id: 'u', type: 'web-browser', x: 0, y: 0 },
      { id: 'pool', type: 'vm-fleet', x: 200, y: 0, units: 12, knobs: { autoscale: { on: true, min: 1, max: 12 } } },
      { id: 'db', type: 'sql-primary', x: 400, y: 0 },
    ], edges: [['u', 'pool'], ['pool', 'db']] });
    const inspector = createInspector(host, { catalog, getNode: id => sim.getGraph().nodes.find(n => n.id === id), getHome: () => 'us', onKnob() {} });
    inspector.show('pool'); sim.start();
    const snapshots = [];
    for (let i = 0; i < 24; i++) {
      sim.advance(120000);
      const state = sim.state().nodes.find(n => n.id === 'pool');
      inspector.update(state);
      snapshots.push({ units: state.units, incomingRps: state.incomingRps, selected: inspector.current(), count: host.querySelectorAll('.pl-replica-cell').length, summary: host.querySelector('.pl-replica-summary').textContent });
    }
    host.remove(); return snapshots;
  });
  assert(pool.every(s => s.selected === 'pool'), 'shrinking keeps the pool selected');
  assert(pool.some(s => s.units > 1), 'the running autoscaler starts with multiple units');
  assert.equal(pool.at(-1).units, 1, 'the running autoscaler shrinks to one');
  assert.equal(pool.at(-1).count, 1);
  assert.match(pool.at(-1).summary, /1\/1 units available/);
  assert(pool.at(-1).summary.includes(`${Math.round(pool.at(-1).incomingRps)} requests/s`), 'the selected pool shows the current request rate');

  await page.goto(base + '#/practice/bank-ledger?interview=1');
  await page.waitForSelector('.pl-interview-clock');
  const writes = await page.$eval('.pl-interview-clock', e => new Promise(resolve => {
    let writes = 0;
    const observer = new MutationObserver(records => writes += records.length);
    observer.observe(e, { childList: true });
    setTimeout(() => { observer.disconnect(); resolve(writes); }, 1600);
  }));
  assert(writes >= 1 && writes <= 2, `clock writes once per shown second, observed ${writes}`);

  for (const reduced of [false, true]) {
    const shown = await page.evaluate(async reduced => {
      const { showVictory } = await import('./ui/play/victory.js');
      const { loadCatalog } = await import('./sim/catalog.js');
      const host = document.body.appendChild(document.createElement('div'));
      host.innerHTML = '<section class="pl-verdict-sec"><div class="pl-score-row"><span class="pl-dial-n">999</span><svg><circle class="pl-dial-arc"/></svg></div></section>';
      const result = { passed: true, stars: 3, score: { total: 999 }, efficiency: [{}], graph: { nodes: [{ id: 'app', type: 'vm-fleet', x: 0, y: 0 }], edges: [] }, slo: { availability: { actual: .9999, target: .999 }, safety: {} } };
      const catalog = await loadCatalog();
      showVictory(host, { result, catalog, reduced });
      await new Promise(r => setTimeout(r, reduced ? 0 : 1450));
      const shown = { sweep: !!host.querySelector('.pl-victory--sweep'), score: host.querySelector('.pl-dial-n').textContent, metric: host.querySelector('.pl-victory-numbers strong').textContent };
      host.querySelector('.pl-victory').remove();
      showVictory(host, { result: { ...result, passed: false }, catalog, reduced });
      shown.failedWin = !!host.querySelector('.pl-victory'); host.remove(); return shown;
    }, reduced);
    assert.deepEqual(shown, { sweep: false, score: '999', metric: '99.99%', failedWin: false });
  }
  console.log('Full-motion menus, selected shrinking pools, Interview clock writes and score presentation passed.');
} finally { await browser.close(); }
