// A finished Practice day opens the same design in Sandbox with the problem's traffic in the traffic panel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

await test('Try other traffic carries the design and traffic from Practice to Sandbox', async () => {
  const site = await serveGame();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.warmups', JSON.stringify({ 'url-shortener': true }));
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
    });
    await page.goto(site.base);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');

    // Play the URL shortener day to the end on its starting design.
    const before = await page.evaluate(async () => {
      await window.__game.loadProblem('url-shortener');
      window.__game.startTraffic();
      const st = window.__game.step(86400000);
      const { problemById } = await import('./content/problems/index.js');
      const { loadCatalog } = await import('./sim/catalog.js');
      const p = problemById.get('url-shortener'), catalog = await loadCatalog();
      const pos = r => (r <= 0 ? 0 : Math.min(70, Math.round(Math.log10(r) * 10) + 1));
      const sliders = Object.fromEntries(Object.entries(p.requirements.mix).filter(([id]) => id !== 'attack')
        .map(([id, share]) => [catalog.requests.find(r => r.id === id).name + ' requests per second', String(pos(Math.round(p.requirements.peakRps * share)))]));
      const regions = Object.fromEntries(Object.entries(p.requirements.userRegions || { us: 1 })
        .map(([id, share]) => [`Share of users in ${catalog.world.regions.find(r => r.id === id).name}`, String(Math.round(share * 100))]));
      return { phase: st.phase, nodes: st.nodes.map(n => n.type).sort(), edges: st.edges.map(e => `${e.from}>${e.to}`).sort(), sliders, regions, curve: p.traffic.curve };
    });
    assert.equal(before.phase, 'done');
    await page.waitForSelector('.pl-overlay--debrief:not([hidden]) [data-act=try-traffic]');
    const records = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => /bests|progress/.test(k)).map(k => [k, localStorage.getItem(k)])));
    await page.click('.pl-overlay--debrief [data-act=try-traffic]');

    await page.waitForFunction(() => window.__game?.getState().mode === 'sandbox' && document.querySelector('.pl-traffic'));
    const after = await page.evaluate(() => {
      const st = window.__game.getState();
      const panel = document.querySelector('.pl-traffic');
      return { route: st.route, phase: st.phase, nodes: st.nodes.map(n => n.type).sort(), edges: st.edges.map(e => `${e.from}>${e.to}`).sort(),
        title: document.querySelector('.sh-problem-h1')?.textContent, curve: panel.querySelector('select')?.value,
        sliders: [...panel.querySelectorAll('input[aria-label$="requests per second"]')].map(i => [i.getAttribute('aria-label'), i.value]),
        regions: [...panel.querySelectorAll('input[aria-label^="Share of users in"]')].map(i => [i.getAttribute('aria-label'), i.value]),
        handoff: localStorage.getItem('hotpath.v1.sandbox.handoff') };
    });
    assert.equal(after.route, '/sandbox');
    assert.equal(after.phase, 'build', 'Sandbox opens ready to run');
    assert.match(after.title, /URL shortener/i);
    assert.deepEqual(after.nodes, before.nodes, 'the same parts arrive in Sandbox');
    assert.deepEqual(after.edges, before.edges, 'the same connections arrive in Sandbox');
    assert.equal(after.curve, before.curve, 'the problem traffic curve is selected');
    const sliders = Object.fromEntries(after.sliders), regions = Object.fromEntries(after.regions);
    for (const [label, pos] of Object.entries(before.sliders)) assert.equal(sliders[label], pos, `${label} matches the problem`);
    for (const [label, pos] of Object.entries(sliders)) if (!(label in before.sliders)) assert.equal(pos, '0', `${label} stays off`);
    for (const [label, pct] of Object.entries(before.regions)) assert.equal(regions[label], pct, `${label} matches the problem`);
    assert.equal(after.handoff, null, 'the handoff is used once');

    // Practice records stay as they were: opening Sandbox saves and scores nothing.
    const now = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])), Object.keys(records));
    assert.deepEqual(now, records);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await site.close(); }
});
