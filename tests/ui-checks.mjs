// Headless browser checks for the play screen: building during the intro and lessons, event-gated lesson goals,
// honest build status, synchronous step(), keyboard placement and connection, the phone layout, the debrief dial
// and the sound levels. Run from the harness folder: node ui-checks.mjs [baseUrl]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== '' ? '  (' + detail + ')' : ''}`); };
const errors = [];

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
async function openPage(view) {
  const page = await browser.newPage();
  await page.setViewport(view);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 30000 });
  await sleep(800);
  return page;
}

// ---- desktop
const page = await openPage({ width: 1366, height: 820, deviceScaleFactor: 1 });
const ev = (fn, ...a) => page.evaluate(fn, ...a);

console.log('\nIntro and lessons accept parts while the day runs');
await ev(() => { location.hash = '#/intro'; });
await page.waitForFunction(() => window.__game.getState().mode === 'intro', { timeout: 15000 });
await sleep(600);
{
  const r = await ev(() => {
    const before = window.__game.getState();
    let id = null, err = '';
    try { id = window.__game.placeComponent('regional-lb', -390, 0); } catch (e) { err = e.message; }
    const after = window.__game.getState();
    const toast = [...document.querySelectorAll('.sh-toast')].map((t) => t.innerText).join(' | ');
    return { phase: before.phase, before: before.nodes.length, after: after.nodes.length, id, err, toast };
  });
  check('intro: the load balancer can be placed during the running day', r.phase === 'running' && r.after === r.before + 1 && !/only be added/.test(r.toast), JSON.stringify(r));
}
{
  await ev(() => window.__game.loadLesson('load-balancing'));
  await sleep(400);
  const r = await ev(() => {
    const st = window.__game.getState();
    const id = window.__game.placeComponent('regional-lb', -390, 0);
    const after = window.__game.getState();
    return { phase: st.phase, after: after.phase, id, n0: st.nodes.length, n1: after.nodes.length };
  });
  // the lesson clock is held until the first edit, so the day starts with the placement
  check('load-balancing lesson: the clock waits for the first edit, then placing a part starts the day', r.phase === 'build' && r.after === 'running' && r.n1 === r.n0 + 1, JSON.stringify(r));
}

console.log('\nLesson goals wait for their event');
for (const id of ['idempotency-retries', 'queues-backpressure', 'rate-limiting', 'security-compliance', 'hot-keys']) {
  await ev((l) => window.__game.loadLesson(l), id);
  await sleep(300);
  const r = await ev(() => {
    const st0 = window.__game.getState();
    window.__game.step(110000);
    const chip = document.querySelector('.pl-goal')?.innerText || '';
    return { clock: st0.clock.label, chip };
  });
  check(`${id}: no "goal reached" before the event has run`, !/Goal reached/.test(r.chip), `${r.clock} → ${r.chip.slice(0, 70)}`);
}
{
  await ev(() => window.__game.loadLesson('idempotency-retries'));
  await sleep(300);
  const r = await ev(() => { window.__game.step(400000); return { chip: document.querySelector('.pl-goal')?.innerText || '', dup: window.__game.getState().slo.safety.duplicates }; });
  check('idempotency demo: duplicates really happen without the fix', r.dup > 0 && !/Goal reached/.test(r.chip), JSON.stringify(r));
}

console.log('\nQueues lesson: every queue needs workers wired after it');
for (const wired of [false, true]) {
  await ev(() => window.__game.loadLesson('queues-backpressure'));
  await sleep(300);
  const r = await ev((w) => {
    const g = window.__game;
    const st = g.getState();
    const db = st.nodes.find((n) => n.type === 'sql-primary');
    const q = g.placeComponent('queue', db.x - 140, db.y, st.edges.find((e) => e.to === db.id).id);
    // the workers go onto the queue-to-database line, or are dropped beside it with nothing connected
    const line = g.getState().edges.find((e) => e.from === q && e.to === db.id);
    const wk = w ? g.placeComponent('worker-pool', db.x - 70, db.y, line.id) : g.placeComponent('worker-pool', db.x - 70, db.y + 180);
    g.setKnob(wk, 'units', 12);
    g.step(16 * 3600000);
    const chip = document.querySelector('.pl-goal');
    return { chip: chip?.innerText || '', why: chip?.title || '' };
  }, wired);
  if (wired) check('queues lesson: queue, workers, database reaches the goal', /Goal reached/.test(r.chip), r.chip.slice(0, 80));
  else check('queues lesson: no "goal reached" while the workers are not connected', !/Goal reached/.test(r.chip) && /no workers/.test(r.why), `${r.chip.slice(0, 50)} | ${r.why.slice(0, 70)}`);
}

console.log('\nBuild status and empty designs');
{
  await ev(() => window.__game.loadProblem('url-shortener'));
  await sleep(300);
  const chip = await ev(() => document.querySelector('.pl-buildnote')?.innerText || '');
  check('an empty design is not told it holds', !/Everything holds/.test(chip) && /Nothing to test yet/.test(chip), chip);
  const r = await ev(() => { window.__game.startTraffic(); const s = window.__game.step(86400000); return s.score; });
  check('an empty design scores almost nothing', r && r.total <= 60 && !r.passed, JSON.stringify(r));
  await sleep(500);
  const txt = await ev(() => document.querySelector('.pl-overlay--debrief')?.innerText || '');
  const bad = (txt.match(/[^.\n]*\b0 minutes[^.\n]*/) || [''])[0];
  check('its debrief does not praise speed or cost', /Nothing was served/.test(txt) && !bad && /nothing served/.test(txt), bad || txt.slice(0, 80));
}

console.log('\nstep() keeps a paused day paused');
{
  await ev(() => window.__game.loadProblem('url-shortener'));
  const r1 = await ev(() => { window.__game.startTraffic(); window.__game.setSpeed(0); return window.__game.step(10000).clock.simMs; });
  await sleep(1000);
  const r2 = await ev(() => window.__game.getState());
  check('the clock does not move after step() while paused', r2.clock.simMs === r1 && r2.phase === 'paused', `${r1} → ${r2.clock.simMs} ${r2.phase}`);
}

console.log('\nKeyboard');
{
  await ev(() => window.__game.loadProblem('url-shortener'));
  await sleep(300);
  const n0 = await ev(() => window.__game.getState().nodes.length);
  await ev(() => document.querySelector('.pl-item')?.focus());
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(200);
  const n1 = await ev(() => window.__game.getState().nodes.length);
  check('Enter on a component places it on the canvas', n1 === n0 + 1, `${n0} → ${n1}`);
  const stops = await ev(() => [...document.querySelectorAll('.pl-item')].filter((b) => b.tabIndex === 0).length);
  check('the component list is one tab stop', stops === 1, String(stops));
  // place a load balancer from the search box, then connect the web browser to it with the keyboard
  await ev(() => document.querySelector('.pl-tb-head input')?.focus());
  await page.keyboard.type('load balancer');
  await page.keyboard.press('Enter');
  await sleep(200);
  const e0 = await ev(() => window.__game.getState().edges.length);
  await ev(() => document.querySelector('.pl-kb')?.focus());
  for (let k = 0; k < 4; k++) {
    const sel = await ev(() => document.querySelector('.pl-insp-title')?.innerText || '');
    if (/Web browser/.test(sel)) break;
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('c');
  for (let k = 0; k < 4; k++) {
    const live = await ev(() => document.querySelector('.pl-sr')?.textContent || '');
    if (/Load balancer/i.test(live)) break;
    await page.keyboard.press('ArrowRight');
    await sleep(60);
  }
  await page.keyboard.press('Enter');
  await sleep(200);
  const e1 = await ev(() => window.__game.getState().edges.length);
  check('C, an arrow and Enter connect two parts', e1 === e0 + 1, `${e0} → ${e1}`);
  const skip = await ev(() => !!document.querySelector('.pl-skip'));
  check('a skip-to-diagram control exists', skip);
}

console.log('\nDebrief dial');
{
  const r = await ev(async () => {
    const { problemById } = await import('./content/problems/index.js');
    const p = problemById.get('url-shortener');
    const d = p.editorial.designs[0];
    const st = await window.__game.loadProblem('url-shortener');
    const have = new Set(st.nodes.map((n) => n.id));
    const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
    for (const n of d.graph.nodes) {
      if (have.has(n.ref)) continue;
      const nid = window.__game.placeComponent(n.type, n.x, n.y);
      idOf.set(n.ref, nid);
      for (const k of ['units', 'zones', 'region', 'tier']) if (n[k] != null) window.__game.setKnob(nid, k, n[k]);
      for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(nid, k, v);
    }
    for (const e of d.graph.edges) { const [a, b] = Array.isArray(e) ? e : String(e).split('>'); window.__game.connect(idOf.get(a), idOf.get(b)); }
    window.__game.startTraffic();
    const s = window.__game.step(86400000);
    await new Promise((res) => setTimeout(res, 1400));
    const num = document.querySelector('.pl-dial-n');
    return { total: s.score?.total, numW: num?.getBoundingClientRect().width || 0, text: num?.textContent, inspector: !!document.querySelector('.pl-inspector:not([hidden])') };
  });
  check('the score fits inside the ring', r.numW > 0 && r.numW <= 96, JSON.stringify(r));
}

// ---- sound levels (offline render, each sound alone at master 0.6)
console.log('\nSound levels');
{
  const r = await ev(async () => {
    const { createAudio, SOUND_NAMES } = await import('./assets/sound.js');
    const out = {};
    const Real = globalThis.AudioContext;
    for (const name of SOUND_NAMES) {
      let off;
      globalThis.AudioContext = class extends OfflineAudioContext { constructor() { super(2, 44100 * 3, 44100); off = this; this.resume = async () => {}; Object.defineProperty(this, 'state', { get: () => 'running' }); } };
      const a = createAudio(); a.unlock(); a.setMaster?.(0.6);
      try { a.play(name, {}); } catch { continue; }
      const buf = await off.startRendering();
      const d = buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      out[name] = Math.round(20 * Math.log10(pk || 1e-6) * 10) / 10;
    }
    globalThis.AudioContext = Real;
    return out;
  });
  const loudest = Math.max(...Object.values(r));
  check('the overload warning is about as loud as good news', r.overload >= -27 && r.overload >= (r.recover ?? -99) - 4, `overload ${r.overload}, recover ${r.recover}`);
  check('quiet sounds stay audible', r['ui.tap'] >= -34 && r['request.ok'] >= -36 && r.count >= -36, `tap ${r['ui.tap']}, ok ${r['request.ok']}, count ${r.count}`);
  check('warnings are at least as loud as the good news', Math.max(r.overload, r['fail.burst']) >= Math.max(r.pass, r['level.clear'], r.streak), JSON.stringify(r));
  check('the loudest cue peaks near -10 dBFS and never clips', loudest <= -8 && loudest >= -14, JSON.stringify(r));
}
await page.close();

// ---- phone
console.log('\nPhone (390 x 844, touch, 2x)');
const phone = await openPage({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pev = (fn, ...a) => phone.evaluate(fn, ...a);
await pev(() => window.__game.loadProblem('url-shortener'));
await sleep(900);
{
  const r = await pev(() => {
    const g = document.querySelector('.pl-tb-grab');
    const b = g.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const cv = document.querySelector('.pl-stage canvas');
    return { onTop: g.contains(hit), hit: hit?.className || '', res: cv ? cv.width / cv.clientWidth : 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check('"Add component" is not covered by the brief', r.onTop, r.hit);
  check('the canvas renders at the screen’s full resolution', r.res >= 1.9, String(r.res));
  check('no sideways scrolling', !r.overflow);
  const n0 = await pev(() => window.__game.getState().nodes.length);
  await phone.tap('.pl-tb-grab');
  await sleep(450);
  await phone.tap('.pl-item');
  await sleep(500);
  const r2 = await pev(() => ({ n: window.__game.getState().nodes.length, open: !!document.querySelector('.pl-toolbar--open') }));
  check('tapping a component places it and closes the drawer', r2.n === n0 + 1 && !r2.open, JSON.stringify(r2));
  const small = await pev(() => [...document.querySelectorAll('.pl-root button, .pl-root [role="button"]')].filter((b) => b.offsetParent && !b.closest('.pl-items') && !b.closest('.pl-speed')).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') || b.innerText.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w < 44 || h < 40));
  check('play controls are touch sized', small.length === 0, JSON.stringify(small.slice(0, 6)));
}
{
  await pev(async () => {
    const { problemById } = await import('./content/problems/index.js');
    const p = problemById.get('payments-checkout');
    const d = p.editorial.designs[0];
    const st = await window.__game.loadProblem('payments-checkout');
    const have = new Set(st.nodes.map((n) => n.id));
    const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
    for (const n of d.graph.nodes) { if (have.has(n.ref)) continue; const nid = window.__game.placeComponent(n.type, n.x, n.y); idOf.set(n.ref, nid); for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(nid, k, v); }
    for (const e of d.graph.edges) { const [a, b] = Array.isArray(e) ? e : String(e).split('>'); window.__game.connect(idOf.get(a), idOf.get(b)); }
    window.__game.startTraffic();
    window.__game.step(13 * 3600000);
  });
  await sleep(600);
  const r = await pev(() => {
    const stage = document.querySelector('.pl-stage').getBoundingClientRect();
    const hud = document.querySelector('.pl-hud').getBoundingClientRect();
    const insp = document.querySelector('.pl-inspector');
    const inspOpen = !!insp && !insp.closest('[hidden]') && insp.offsetParent !== null && insp.getBoundingClientRect().height > 0;
    const free = (stage.bottom - Math.max(stage.top, hud.bottom)) / stage.height;
    return { free: Math.round(free * 100) / 100, inspOpen };
  });
  check('while the day runs the canvas keeps over half the screen', r.free >= 0.55, String(r.free));
  check('no inspector pops open when the day starts', !r.inspOpen);
}
await phone.close();
await browser.close();

console.log(`\nconsole errors: ${errors.length}${errors.length ? '\n  ' + errors.slice(0, 8).join('\n  ') : ''}`);
check('zero console errors', errors.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
