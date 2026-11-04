// Headless browser QA: boots the game, loads every problem and lesson through window.__game, plays three problems
// to the debrief, checks the challenge and share links, reads window.__perf and takes screenshots.
// Run from the harness folder: node browser-qa.mjs [baseUrl] [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/root/work/sdgame-harness/qa';
fs.mkdirSync(OUT, { recursive: true });
const report = { consoleErrors: [], pageErrors: [], failedRequests: [], problems: [], lessons: [], played: [], checks: {}, perf: null, shots: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 820, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
page.on('pageerror', (e) => report.pageErrors.push(String(e.message || e)));
page.on('requestfailed', (r) => report.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) report.failedRequests.push(`${r.url()} HTTP ${r.status()}`); });

async function shot(name) { const p = `${OUT}/${name}.png`; await page.screenshot({ path: p }); report.shots.push(p); }
const ev = (fn, ...a) => page.evaluate(fn, ...a);

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 30000 });
await sleep(1500);
report.checks.firstRoute = await ev(() => location.hash);
await shot('01-intro');

// Home, lists, settings in both themes
for (const [hash, name] of [['#/', '02-home'], ['#/learn', '03-learn'], ['#/practice', '04-practice'], ['#/challenge', '05-challenge'], ['#/settings', '06-settings']]) {
  await ev((h) => { location.hash = h; }, hash);
  await sleep(700);
  await shot(name);
}
await ev(() => { location.hash = '#/practice'; });
await sleep(300);
report.checks.practiceCards = await ev(() => document.querySelectorAll('.sh-card, .sh-prob, [class*="sh-problem-card"], a[href^="#/practice/"]').length);

// Every problem through __game
const ids = await ev(async () => (await import('./content/problems/index.js')).problems.map((p) => p.id));
for (const id of ids) {
  const t0 = Date.now();
  try {
    const st = await ev((pid) => window.__game.loadProblem(pid), id);
    const errs = (st.errors || []).filter((e) => e.code === 'runtime' || e.code === 'render');
    report.problems.push({ id, ok: st.problemId === id && st.step === 'draw' && st.phase === 'build', nodes: st.nodes.length, runtimeErrors: errs.length, ms: Date.now() - t0 });
  } catch (e) { report.problems.push({ id, ok: false, error: String(e.message || e) }); }
}

// Every lesson through __game
const lessonIds = await ev(async () => (await import('./content/lessons/index.js')).lessons.map((l) => l.id));
for (const id of lessonIds) {
  try {
    const st = await ev((lid) => window.__game.loadLesson(lid), id);
    await sleep(150);
    const st2 = await ev(() => window.__game.getState());
    report.lessons.push({ id, ok: !!st && (st.mode === 'lesson' || st.mode === 'intro'), mode: st.mode, phase: st2.phase, nodes: st.nodes.length, runtimeErrors: (st2.errors || []).filter((e) => e.code === 'runtime' || e.code === 'render').length });
  } catch (e) { report.lessons.push({ id, ok: false, error: String(e.message || e) }); }
}
await ev(() => window.__game.loadLesson('caching'));
await sleep(2500);
await shot('07-lesson-demo');

// Play three problems to the debrief, building the editorial design through the public hooks.
async function playDesign(pid, designIndex = 0) {
  return ev(async (id, di) => {
    const { problemById } = await import('./content/problems/index.js');
    const p = problemById.get(id);
    const d = p.editorial.designs[di];
    let st = await window.__game.loadProblem(id);
    const have = new Set(st.nodes.map((n) => n.id));
    const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
    for (const n of d.graph.nodes) {
      if (have.has(n.ref)) continue;
      const nid = window.__game.placeComponent(n.type, n.x, n.y);
      if (!nid) throw new Error('could not place ' + n.type);
      idOf.set(n.ref, nid);
      for (const k of ['units', 'zones', 'region', 'tier']) if (n[k] != null) window.__game.setKnob(nid, k, n[k]);
      for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(nid, k, v);
    }
    let refused = 0;
    for (const e of d.graph.edges) {
      const [a, b] = Array.isArray(e) ? e : String(e).split('>');
      if (!window.__game.connect(idOf.get(a), idOf.get(b))) refused++;
    }
    window.__game.startTraffic();
    window.__game.setSpeed(8);
    st = window.__game.step(86400000);
    await new Promise((r) => setTimeout(r, 600));
    const dbg = document.querySelector('.pl-overlay--debrief');
    return { id, design: d.name, phase: st.phase, step: st.step, score: st.score, cost: Math.round(st.cost?.perMonth || 0), refused, debriefShown: !!dbg && !dbg.hidden, debriefText: dbg ? dbg.innerText.slice(0, 160) : '' };
  }, pid, designIndex);
}
const passing = await ev(async () => {
  const { problems } = await import('./content/problems/index.js');
  return problems.map((p) => p.id);
});
for (const pid of ['url-shortener', 'payments-checkout', 'ride-hailing-dispatch'].filter((x) => passing.includes(x))) {
  try { report.played.push(await playDesign(pid, 0)); } catch (e) { report.played.push({ id: pid, error: String(e.message || e) }); }
  await shot('08-debrief-' + pid);
}

// Share link round trip and verify from the beat landing
report.checks.share = await ev(async () => {
  const st = window.__game.getState();
  const g = await import('./compete/share.js');
  return { phase: st.phase, hasScore: !!st.score };
});
const shareUrl = await ev(async () => {
  const { problemById } = await import('./content/problems/index.js');
  const { createCatalog } = await import('./sim/catalog.js');
  const { createSim } = await import('./sim/engine.js');
  const { encodeShare, shareUrl, scoreOf } = await import('./compete/share.js');
  const J = async (f) => (await fetch('./catalog/' + f + '.json')).json();
  const catalog = createCatalog({ elements: await J('elements'), requests: await J('requests'), events: await J('events'), world: await J('world') });
  const p = problemById.get('ride-hailing-dispatch');
  const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
  sim.loadGraph(p.editorial.designs[0].graph);
  sim.start(); sim.advance(86400000);
  const r = sim.result();
  const payload = await encodeShare({ mode: 'practice', problemId: p.id, seed: 'practice', graph: r.graph, score: scoreOf(r), name: 'Tester' }, catalog);
  return shareUrl(payload);
});
report.checks.shareUrlLength = shareUrl.length;
await ev((u) => { location.hash = u.slice(u.indexOf('#')); }, shareUrl);
await page.waitForFunction(() => /Verified by replay|Score checked by replay|Replay scored|Could not verify/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
report.checks.beatLanding = await ev(() => (document.body.innerText.match(/Verified by replay|Score checked by replay|Replay scored \d+|Could not verify/) || ['none'])[0]);
await shot('09-beat-landing');

// Daily challenge: play today's scenario
const today = await ev(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
await ev((d) => { location.hash = `#/challenge/${d}?play=1`; }, today);
await page.waitForFunction(() => !!document.querySelector('.pl-root'), { timeout: 15000 }).catch(() => {});
await sleep(800);
report.checks.challenge = await ev(() => { const s = window.__game.getState(); return { mode: s.mode, problemId: s.problemId, events: (s.events || []).length }; });
await ev(() => { window.__game.startTraffic(); window.__game.step(86400000); });
await sleep(600);
report.checks.challengeDone = await ev(() => { const s = window.__game.getState(); return { phase: s.phase, score: s.score && s.score.total }; });
await shot('10-challenge-debrief');

// A sandbox design shared as a link opens in the sandbox
const sbUrl = await ev(async () => {
  const { createCatalog } = await import('./sim/catalog.js');
  const { encodeShare } = await import('./compete/share.js');
  const J = async (f) => (await fetch('./catalog/' + f + '.json')).json();
  const catalog = createCatalog({ elements: await J('elements'), requests: await J('requests'), events: await J('events'), world: await J('world') });
  const graph = { nodes: [{ id: 'u', type: 'web-browser', x: -300, y: 0 }, { id: 'lb', type: 'regional-lb', x: -100, y: 0 }, { id: 'app', type: 'vm-fleet', x: 100, y: 0, units: 3 }, { id: 'db', type: 'sql-primary', x: 300, y: 0 }],
    edges: [{ from: 'u', to: 'lb' }, { from: 'lb', to: 'app' }, { from: 'app', to: 'db' }] };
  const payload = await encodeShare({ mode: 'sandbox', problemId: 'sandbox', seed: 'sandbox', graph, score: null, name: 'Tester' }, catalog);
  return '#/sandbox?d=' + payload;
});
await ev((h) => { location.hash = h; }, sbUrl);
await page.waitForFunction(() => !!document.querySelector('.pl-root'), { timeout: 15000 }).catch(() => {});
await sleep(1200);
report.checks.sandboxShare = await ev(() => { const s = window.__game.getState(); return { mode: s.mode, nodes: s.nodes.length, edges: s.edges.length, title: document.querySelector('.sh-problem-h1')?.textContent }; });

// Sandbox and perf: run a heavy design at 8x for 20 wall seconds
await ev(() => window.__game.loadSandbox());
await sleep(800);
await shot('11-sandbox');
const heavy = await ev(async () => {
  const { problems } = await import('./content/problems/index.js');
  let best = null;
  for (const p of problems) for (const d of p.editorial.designs) if (!best || d.graph.nodes.length > best.n) best = { id: p.id, n: d.graph.nodes.length };
  return best;
});
report.checks.heavy = heavy;
await ev(async (id) => {
  const { problemById } = await import('./content/problems/index.js');
  const p = problemById.get(id);
  const d = p.editorial.designs[0];
  const st = await window.__game.loadProblem(id);
  const have = new Set(st.nodes.map((n) => n.id));
  const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
  for (const n of d.graph.nodes) {
    if (have.has(n.ref)) continue;
    const nid = window.__game.placeComponent(n.type, n.x, n.y);
    idOf.set(n.ref, nid);
    for (const k of ['units', 'zones', 'region']) if (n[k] != null) window.__game.setKnob(nid, k, n[k]);
    for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(nid, k, v);
  }
  for (const e of d.graph.edges) { const [a, b] = Array.isArray(e) ? e : String(e).split('>'); window.__game.connect(idOf.get(a), idOf.get(b)); }
  window.__game.startTraffic();
  window.__game.setSpeed(8);
}, heavy.id);
await sleep(4000);
await shot('12-traffic-day');
await sleep(16000);
report.perf = await ev(() => ({ ...window.__perf }));
report.checks.heavyState = await ev(() => { const s = window.__game.getState(); return { phase: s.phase, clock: s.clock.label, nodes: s.nodes.length }; });
await shot('13-traffic-day-late');

// Dark theme and a phone-sized view
await ev(() => { location.hash = '#/settings'; });
await sleep(300);
await ev(() => document.querySelector('[data-value="dark"]')?.click());
await ev(() => { location.hash = '#/practice/url-shortener'; });
await sleep(1500);
await shot('14-dark-problem');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ev(() => { location.hash = '#/'; });
await sleep(900);
report.checks.phoneOverflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await shot('15-phone-home');
await ev(() => { location.hash = '#/practice/url-shortener'; });
await sleep(1500);
report.checks.phoneOverflowPlay = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
await shot('16-phone-problem');

await browser.close();
const bad = report.problems.filter((p) => !p.ok || p.runtimeErrors);
const badL = report.lessons.filter((l) => !l.ok || l.runtimeErrors);
report.summary = {
  problemsLoaded: report.problems.length - bad.length, problemsTotal: report.problems.length, badProblems: bad,
  lessonsLoaded: report.lessons.length - badL.length, lessonsTotal: report.lessons.length, badLessons: badL,
  consoleErrors: report.consoleErrors.length, pageErrors: report.pageErrors.length, failedRequests: report.failedRequests.length,
};
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ summary: report.summary, played: report.played, checks: report.checks, perf: report.perf, consoleErrors: report.consoleErrors.slice(0, 15), pageErrors: report.pageErrors.slice(0, 15), failedRequests: report.failedRequests.slice(0, 10) }, null, 1));
