// Headless check of optional sign-in: the fake provider, progress sync across two devices, a daily result on the leaderboard,
// the account name on share links, sign-out and delete, and a game that works with the service reachable, unreachable or off.
// Run from the harness folder with the service on API_PORT (NODE_ENV=test AUTH_FAKE=1 DEV=1): node account-qa.mjs [base] [apiPort] [deadPort] [outDir] [githubPort]
// githubPort: optional second service with a dummy GitHub app set up (NODE_ENV=test DEV=1, no fake provider).
// Leaderboards do not list the editorial's designs, so signed-in days are played with a design of the player's own.
import puppeteer from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const API_PORT = Number(process.argv[3] || 8793);
const DEAD_PORT = Number(process.argv[4] || 8799);
const OUT = process.argv[5] || path.join(os.tmpdir(), 'system-designer-account-qa');
const GITHUB_PORT = Number(process.argv[6] || 0);
const API = new URL(BASE).origin.replace(/:\d+$/, ':' + API_PORT);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { checks: {}, runs: {}, failures: [] };
const check = (name, ok, detail) => { report.checks[name] = { ok: !!ok, detail }; if (!ok) report.failures.push(name + (detail !== undefined ? ': ' + JSON.stringify(detail).slice(0, 300) : '')); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

async function openPage(context, url, label) {
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 820, deviceScaleFactor: 1 });
  const log = { consoleErrors: [], pageErrors: [], failedRequests: [], requests: [] };
  report.runs[label] = log;
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text() + ' @ ' + (m.location()?.url || '')); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e.message || e)));
  page.on('requestfailed', (r) => log.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) log.failedRequests.push(`${r.url()} HTTP ${r.status()}`); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(new URL(BASE).origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.requests.push(u.split('?')[0]); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 30000 });
  return { page, log };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const api = (page, method, path, body) => page.evaluate(async (base, m, p, b) => {
  const r = await fetch(base + p, { method: m, credentials: 'include', headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, API, method, path, body);

// Builds a design (default: the problem's first editorial design) on whatever play screen is mounted, then plays the whole day.
const buildAndPlay = (page, problemId, design = null) => page.evaluate(async (pid, given) => {
  const { problemById } = await import('./content/problems/index.js');
  const graph = given || problemById.get(pid).editorial.designs[0].graph;
  let st = window.__game.getState();
  const have = new Set(st.nodes.map((n) => n.id));
  const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
  for (const n of graph.nodes) {
    if (have.has(n.ref)) continue;
    const nid = window.__game.placeComponent(n.type, n.x, n.y);
    idOf.set(n.ref, nid);
    for (const k of ['units', 'zones', 'region', 'tier']) if (n[k] != null) window.__game.setKnob(nid, k, n[k]);
    for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(nid, k, v);
  }
  for (const e of graph.edges) { const [a, b] = Array.isArray(e) ? e : String(e).split('>'); window.__game.connect(idOf.get(a), idOf.get(b)); }
  window.__game.startTraffic();
  st = window.__game.step(86400000);
  return { mode: st.mode, problemId: st.problemId, phase: st.phase, step: st.step, score: st.score?.total ?? null, passed: st.score?.passed ?? null };
}, problemId, design);

// A design of the player's own for a problem, checked with the service's own copy test (api/similar.js): the editorial with
// parts swapped for others that do the same job, monitoring left out or sizes changed, or else a small design from scratch.
// The first that is not a copy and passes the day (a few tries), else the first that is not a copy.
const ownDesign = (page, problemId, dailyDate = null) => page.evaluate(async (pid, date) => {
  const { problemById, problems } = await import('./content/problems/index.js');
  const { createCatalog } = await import('./sim/catalog.js');
  const { createSim } = await import('./sim/engine.js');
  const { dailyFor, applyVariant } = await import('./compete/daily.js');
  const { closestShipped } = await import('./api/similar.js');
  const J = async (f) => (await fetch('./catalog/' + f + '.json')).json();
  const catalog = createCatalog({ elements: await J('elements'), requests: await J('requests'), events: await J('events'), world: await J('world') });
  const base = problemById.get(pid);
  let problem = base, seed = 'practice', mode = 'practice';
  if (date) { const d = dailyFor(date, problems); problem = applyVariant(base, d.variant, catalog); seed = d.seed; mode = 'challenge'; }
  const RULES = {
    compute: { 'vm-fleet': 'container-cluster', 'container-cluster': 'vm-fleet' },
    cache: { 'distributed-cache': 'cache', cache: 'distributed-cache' },
    store: { 'kv-store': 'document-db', 'document-db': 'kv-store', 'sql-primary': 'distributed-sql', 'distributed-sql': 'sql-primary' },
    queue: { queue: 'pubsub', pubsub: 'queue' },
    edge: { 'regional-lb': 'api-gateway', 'api-gateway': 'regional-lb' },
  };
  const names = Object.keys(RULES);
  const cands = [];
  for (let mask = 1; mask < 1 << names.length; mask++) for (const ops of [false, true]) for (const scale of [1, 1.5, 2]) cands.push({ rules: names.filter((_, i) => mask & (1 << i)), ops, scale });
  cands.sort((a, b) => (a.rules.length + a.ops + (a.scale > 1)) - (b.rules.length + b.ops + (b.scale > 1)));
  const category = new Map(catalog.elements.map((e) => [e.id, e.category]));
  const ed = base.editorial.designs[0].graph;
  const variant = (c) => {
    let nodes = ed.nodes.map((n) => ({ ...n, knobs: { ...(n.knobs || {}) } }));
    let edges = ed.edges.map((e) => (Array.isArray(e) ? e.slice(0, 2) : String(e).split('>')));
    for (const n of nodes) {
      if (n.locked) continue;
      for (const r of c.rules) if (RULES[r][n.type]) { n.type = RULES[r][n.type]; break; }
      if (c.scale > 1 && (n.units ?? 1) > 1) n.units = Math.ceil(n.units * c.scale);
    }
    if (c.ops) {
      const gone = new Set(nodes.filter((n) => !n.locked && category.get(n.type) === 'ops').map((n) => n.ref));
      nodes = nodes.filter((n) => !gone.has(n.ref));
      edges = edges.filter(([a, b]) => !gone.has(a) && !gone.has(b));
    }
    return { nodes, edges };
  };
  const scratch = () => {
    const locked = base.starter.nodes.map((n) => ({ ...n }));
    const nodes = [...locked, { ref: 'o-lb', type: 'regional-lb', x: -200, y: 0, zones: 2 }, { ref: 'o-app', type: 'container-cluster', x: 0, y: 0, units: 8, zones: 2 },
      { ref: 'o-hot', type: 'cache', x: 200, y: -80, units: 2 }, { ref: 'o-db', type: 'kv-store', x: 200, y: 80, units: 2 }];
    return { nodes, edges: [...locked.map((n) => [n.ref, 'o-lb']), ['o-lb', 'o-app'], ['o-app', 'o-hot'], ['o-app', 'o-db']] };
  };
  const asSim = (g) => ({
    nodes: g.nodes.map((n) => ({ id: n.ref, type: n.type, x: n.x, y: n.y, units: n.units ?? 1, zones: n.zones ?? 1, knobs: n.knobs || {}, ...(n.locked ? { locked: true } : {}), ...(n.region ? { region: n.region } : {}), ...(n.tier ? { tier: n.tier } : {}) })),
    edges: g.edges.map(([a, b]) => ({ id: `${a}>${b}`, from: a, to: b, kind: 'flow' })),
  });
  let fallback = null, tries = 0;
  for (const g of [...cands.map(variant), scratch()]) {
    if (closestShipped(asSim(g), base, catalog).copy) continue;
    fallback = fallback || g;
    if (tries >= 60) break;
    tries++;
    try {
      const sim = createSim({ catalog, problem, seed, mode });
      sim.loadGraph(asSim(g)); sim.start(); sim.advance(86400000);
      const r = sim.result();
      if (r.passed && !closestShipped(r.graph, base, catalog).copy) return g;
    } catch { /* try the next one */ }
  }
  return fallback || scratch();
}, problemId, dailyDate);

// Starts the next build from the bare starter instead of the autosaved draft of the last one: leave the problem (which
// saves its draft), then forget that draft.
const clearDraft = async (page, mode, pid) => {
  await page.evaluate(() => { location.hash = '#/practice'; });
  await page.waitForFunction(() => window.__game.getState().problemId == null, { timeout: 10000 });
  await page.evaluate((k) => localStorage.removeItem(k), `hotpath.v1.draft.${mode}.${pid}`);
};

const today = (page) => page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const visible = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 0 && r.height > 0; }, sel);

try {
  // ---------------- A: service reachable, device 1
  const ctx1 = await browser.createBrowserContext();
  const { page: p1, log: log1 } = await openPage(ctx1, `${BASE}?api=${API_PORT}#/practice`, 'reachable-device1');
  await p1.waitForSelector('.ac-signin-btn', { visible: true, timeout: 10000 }).catch(() => {});
  check('sign-in button shows when the service is reachable', await visible(p1, '.ac-signin-btn'));
  check('reachable: the account service is probed once', log1.requests.filter((u) => u === API + '/probe').length === 1, log1.requests);
  await shot(p1, '01-signed-out-header');

  // play a practice problem while signed out: local progress, and the single nudge
  // the very first practice day is a warm-up (practice only, nothing saved); Try again plays the full day
  const warm1 = await (async () => { await p1.evaluate(() => window.__game.loadProblem('url-shortener')); return buildAndPlay(p1, 'url-shortener'); })();
  check('the first practice day is a warm-up that saves nothing', warm1.phase === 'done' && !(await visible(p1, '.ac-nudge')), warm1);
  await p1.evaluate(() => window.__game.reset());
  const day1 = await buildAndPlay(p1, 'url-shortener');
  check('practice day finishes signed out', day1.phase === 'done' && day1.passed === true, day1);
  // The nudge opens after six seconds, so leave time for the next browser frame.
  await p1.waitForSelector('.ac-nudge', { visible: true, timeout: 10000 }).catch(() => {});
  check('one gentle nudge after the first finished day', await visible(p1, '.ac-nudge'));
  await shot(p1, '02-nudge');
  await p1.evaluate(() => [...document.querySelectorAll('.ac-nudge button')].find((b) => /Not now/.test(b.textContent))?.click());
  await p1.evaluate(() => window.__game.loadProblem('url-shortener'));
  await buildAndPlay(p1, 'url-shortener');
  await sleep(2500);
  check('the nudge never comes twice', !(await visible(p1, '.ac-nudge')));

  // the panel lists only configured providers
  await p1.click('.ac-signin-btn');
  await p1.waitForSelector('.ac-pop', { visible: true, timeout: 4000 });
  const panel = await p1.evaluate(() => ({ text: document.querySelector('.ac-pop')?.innerText || '', gis: !!document.querySelector('.ac-gis'), github: [...document.querySelectorAll('.ac-provider')].some((a) => /GitHub/.test(a.textContent)), test: [...document.querySelectorAll('.ac-provider')].some((a) => /test player/.test(a.textContent)), privacy: !!document.querySelector('.ac-pop a[href="privacy.html"]') }));
  check('panel hides Google and GitHub when they are not set up, shows the test provider', !panel.gis && !panel.github && panel.test && panel.privacy, panel);
  await shot(p1, '03-sign-in-panel');
  // the panel has no survey box and no storage copy, only a short agreement line
  check('sign-in panel has no survey checkbox, no storage copy and one privacy line', (await p1.evaluate(() => !document.querySelector('.ac-pop .ac-check') && !document.querySelector('.ac-pop .ac-stored'))) && !/we store|never sold|nothing is sold|no ads|surveys/i.test(panel.text) && /By continuing you agree to the Privacy policy\./.test(panel.text), panel.text.slice(0, 300));
  await p1.evaluate(() => [...document.querySelectorAll('.ac-provider')].find((b) => /test player/.test(b.textContent)).click());
  await p1.waitForSelector('.ac-me-btn', { visible: true, timeout: 8000 }).catch(() => {});
  check('fake-provider sign-in shows the profile button', await visible(p1, '.ac-me-btn'));
  const me1 = await api(p1, 'GET', '/me');
  check('a new account is subscribed to surveys and product updates', me1.json?.user?.surveyOptIn === true, me1.json);
  // the account menu shows the email state and lets the player turn surveys off
  await p1.click('.ac-me-btn');
  await p1.waitForSelector('.ac-pop .ac-email .ac-check', { visible: true, timeout: 4000 }).catch(() => {});
  check('the account menu toggle is on and labelled plainly', await p1.evaluate(() => document.querySelector('.ac-pop .ac-email .ac-check').checked && /Email me surveys and product updates/.test(document.querySelector('.ac-pop .ac-email').innerText)));
  await p1.evaluate(() => document.querySelector('.ac-pop .ac-email .ac-check').click());
  await sleep(800);
  const meOff = await api(p1, 'GET', '/me');
  check('turning surveys off in the account menu is saved', meOff.json?.user?.surveyOptIn === false, meOff.json);
  await p1.keyboard.press('Escape');
  await sleep(1500);
  const srv1 = await api(p1, 'GET', '/progress');
  check('local progress uploaded on sign-in', srv1.status === 200 && srv1.json?.progress?.problems?.['url-shortener']?.solvedAt > 0, srv1.json?.progress?.problems);

  // days finished while signed out stay local; the next one signed in goes on the problem's board
  await clearDraft(p1, 'practice', 'url-shortener');
  await p1.evaluate(() => window.__game.loadProblem('url-shortener'));
  const own1 = await ownDesign(p1, 'url-shortener');
  const day1b = await buildAndPlay(p1, 'url-shortener', own1);
  let plb = null;
  for (let i = 0; i < 40; i++) { plb = await api(p1, 'GET', '/leaderboard?problem=url-shortener'); if (plb.json?.you) break; await sleep(250); }
  check('practice result signed in (own design) is on the problem leaderboard with the replayed score', plb.json?.you?.score === day1b.score && plb.json?.you?.replayed === true, { you: plb.json?.you, client: day1b.score, passed: day1b.passed });

  // the editorial's own design, played signed in, replays fine but stays off the board, with a plain note
  await clearDraft(p1, 'practice', 'url-shortener');
  await p1.evaluate(() => window.__game.loadProblem('url-shortener'));
  const dayEd = await buildAndPlay(p1, 'url-shortener');
  await p1.waitForFunction(() => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && /matches the editorial/.test(el.textContent || '')), { timeout: 6000 }).catch(() => {});
  const edNote = await p1.evaluate(() => [...document.querySelectorAll('*')].some((el) => el.children.length === 0 && /matches the editorial/.test(el.textContent || '')));
  const plb2 = await api(p1, 'GET', '/leaderboard?problem=url-shortener');
  check('the editorial played signed in is not listed, and the player is told why', dayEd.phase === 'done' && edNote && plb2.json?.total === 1 && plb2.json?.you?.score === day1b.score, { note: edNote, you: plb2.json?.you, total: plb2.json?.total, editorialScore: dayEd.score });
  await shot(p1, '03b-editorial-not-listed');

  // daily challenge result goes to the leaderboard with the server's score
  const date = await today(p1);
  await p1.evaluate((d) => { location.hash = `#/challenge/${d}?play=1`; }, date);
  await p1.waitForFunction(() => window.__game.getState().mode === 'challenge', { timeout: 15000 });
  const dailyId = await p1.evaluate(() => window.__game.getState().problemId);
  const own2 = await ownDesign(p1, dailyId, date);
  const day2 = await buildAndPlay(p1, dailyId, own2);
  check('daily challenge played to the debrief', day2.mode === 'challenge' && day2.phase === 'done' && day2.step === 'debrief', day2);
  let lb = null;
  for (let i = 0; i < 40; i++) { lb = await api(p1, 'GET', '/leaderboard?daily=' + date); if (lb.json?.you) break; await sleep(250); }
  check('daily result (own design) is on the leaderboard with the replayed score', lb.json?.you?.rank === 1 && lb.json?.top?.[0]?.name === 'Test player' && lb.json?.top?.[0]?.score === day2.score && lb.json?.top?.[0]?.replayed === true, { you: lb.json?.you, top: lb.json?.top?.slice(0, 3), client: day2.score, passed: day2.passed });
  await sleep(1200);
  await shot(p1, '04-daily-debrief-toast');

  // the account name goes on the "beat my design" link
  await p1.evaluate(() => (document.querySelector('.pl-overlay--debrief [data-act="challenge-friend"]') || [...document.querySelectorAll('.pl-overlay--debrief button')].find((b) => /Share/.test(b.textContent)))?.click());
  await sleep(300);
  await p1.waitForFunction(() => /#\/beat\//.test(document.querySelector('.cp-dialog input[aria-label="Design link"]')?.value || ''), { timeout: 8000 }).catch(() => {});
  const shareName = await p1.evaluate(async () => {
    const url = document.querySelector('.cp-dialog input[aria-label="Design link"]')?.value || '';
    const payload = url.split('#/beat/')[1];
    if (!payload) return null;
    const { createCatalog } = await import('./sim/catalog.js');
    const { decodeShare } = await import('./compete/share.js');
    const J = async (f) => (await fetch('./catalog/' + f + '.json')).json();
    const catalog = createCatalog({ elements: await J('elements'), requests: await J('requests'), events: await J('events'), world: await J('world') });
    return (await decodeShare(payload, catalog)).name;
  });
  check('share link carries the account display name', shareName === 'Test player', shareName);

  // the Challenge page shows the leaderboard, with you marked
  await p1.evaluate(() => { location.hash = '#/challenge'; });
  await p1.waitForSelector('.ac-board .ac-row.is-you', { visible: true, timeout: 8000 }).catch(() => {});
  const board = await p1.evaluate(() => ({ rows: document.querySelectorAll('.ac-board .ac-row').length, you: document.querySelector('.ac-board .ac-row.is-you')?.innerText.replace(/\s+/g, ' '), mark: document.querySelector('.ac-board .ac-row.is-you .ac-ver')?.getAttribute('aria-label'), fine: document.querySelector('.ac-board .ac-fine')?.textContent || '' }));
  check('Challenge leaderboard lists the player', board.rows >= 1 && /Test player/.test(board.you || ''), board);
  check('leaderboard says "replayed", not "verified", and that copied designs count', (board.mark === 'replayed on the server' || (board.mark == null && /missed targets/i.test(board.you || '') && lb.json?.top?.[0]?.replayed === true)) && /cannot tell who drew a design/.test(board.fine) && !/verified/i.test(board.fine), board);
  await shot(p1, '05-challenge-leaderboard');
  await p1.evaluate(() => [...document.querySelectorAll('.ac-tab')].find((b) => /problem/i.test(b.textContent))?.click());
  await p1.evaluate(() => { const s = document.querySelector('.ac-select'); s.value = 'url-shortener'; s.dispatchEvent(new Event('change')); });
  await p1.waitForSelector('.ac-board .ac-row.is-you', { visible: true, timeout: 8000 }).catch(() => {});
  const pboard = await p1.evaluate(() => document.querySelector('.ac-board .ac-row.is-you')?.innerText.replace(/\s+/g, ' ') || null);
  check('per-problem leaderboard has the practice result', !!pboard, pboard);
  await shot(p1, '06-problem-leaderboard');

  // profile menu
  await p1.click('.ac-me-btn');
  await p1.waitForSelector('.ac-menu', { visible: true, timeout: 4000 });
  const menu = await p1.evaluate(() => document.querySelector('.ac-menu').innerText);
  check('profile menu shows name, sync and actions', /Test player/.test(menu) && /synced|Syncing|syncs/i.test(menu) && /Sign out/.test(menu) && /Delete my account/.test(menu), menu.slice(0, 200));
  await shot(p1, '07-profile-menu');
  await p1.keyboard.press('Escape');

  // ---------------- B: device 2 with its own local progress, same account
  const ctx2 = await browser.createBrowserContext();
  const pre = await ctx2.newPage();
  await pre.goto(`${BASE}assets/favicon.svg`);
  await pre.evaluate(() => { localStorage.setItem('hotpath.v1.lessons', JSON.stringify({ sharding: Date.now() })); localStorage.setItem('hotpath.v1.seenIntro', 'true'); });
  await pre.close();
  const { page: p2, log: log2 } = await openPage(ctx2, `${BASE}?api=${API_PORT}#/learn`, 'reachable-device2');
  await p2.waitForSelector('.ac-signin-btn', { visible: true, timeout: 10000 });
  await p2.click('.ac-signin-btn');
  await p2.waitForSelector('.ac-pop', { visible: true });
  await p2.evaluate(() => [...document.querySelectorAll('.ac-provider')].find((b) => /test player/.test(b.textContent)).click());
  await p2.waitForSelector('.ac-me-btn', { visible: true, timeout: 8000 });
  await sleep(1500);
  const local2 = await p2.evaluate(() => ({ progress: JSON.parse(localStorage.getItem('hotpath.v1.progress') || '{}'), lessons: JSON.parse(localStorage.getItem('hotpath.v1.lessons') || '{}'), bests: JSON.parse(localStorage.getItem('hotpath.v1.bests') || '{}') }));
  check('device 2 receives device 1 progress (union)', !!local2.progress['url-shortener']?.solvedAt && !!local2.lessons.sharding && Object.keys(local2.bests.days || {}).length >= 1, { problems: Object.keys(local2.progress), lessons: Object.keys(local2.lessons), days: Object.keys(local2.bests.days || {}) });
  await p1.reload({ waitUntil: 'load' });
  await p1.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await sleep(2000);
  const local1 = await p1.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.lessons') || '{}'));
  check('device 1 receives device 2 lesson after reload', !!local1.sharding, Object.keys(local1));
  const streak = await p2.evaluate(() => { location.hash = '#/challenge'; return new Promise((r) => setTimeout(() => r(document.querySelector('.sh-streak-num')?.textContent), 800)); });
  check('streak follows the account to device 2', Number(streak) >= 1, streak);

  // sign out, then delete the account on device 2
  await p2.click('.ac-me-btn');
  await p2.waitForSelector('.ac-menu', { visible: true });
  await p2.evaluate(() => [...document.querySelectorAll('.ac-menu button')].find((b) => /Sign out/.test(b.textContent)).click());
  await p2.waitForSelector('.ac-signin-btn', { visible: true, timeout: 6000 }).catch(() => {});
  const me2 = await api(p2, 'GET', '/me');
  check('sign out ends the session', me2.json?.user === null && (await visible(p2, '.ac-signin-btn')), me2.json);
  await p2.click('.ac-signin-btn');
  await p2.waitForSelector('.ac-pop', { visible: true });
  await p2.evaluate(() => [...document.querySelectorAll('.ac-provider')].find((b) => /test player/.test(b.textContent)).click());
  await p2.waitForSelector('.ac-me-btn', { visible: true, timeout: 8000 });
  await p2.click('.ac-me-btn');
  await p2.waitForSelector('.ac-menu', { visible: true });
  await p2.evaluate(() => [...document.querySelectorAll('.ac-menu button')].find((b) => /Delete my account/.test(b.textContent)).click());
  await p2.waitForSelector('.sh-modal', { visible: true, timeout: 4000 });
  await shot(p2, '08-delete-confirm');
  await p2.evaluate(() => [...document.querySelectorAll('.sh-modal button')].find((b) => /Delete my account/.test(b.textContent)).click());
  await p2.waitForSelector('.ac-signin-btn', { visible: true, timeout: 6000 }).catch(() => {});
  const gone = await api(p2, 'GET', '/leaderboard?daily=' + date);
  check('deleting the account removes its scores', gone.json?.total === 0 && (await api(p2, 'GET', '/me')).json?.user === null, gone.json);
  const keptLocal = await p2.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hotpath.v1.progress') || '{}')));
  check('progress on the device stays after deleting', keptLocal.includes('url-shortener'), keptLocal);

  for (const [label, log] of [['reachable-device1', log1], ['reachable-device2', log2]]) {
    check(`${label}: zero console errors, page errors and failed requests`, !log.consoleErrors.length && !log.pageErrors.length && !log.failedRequests.length, log);
    check(`${label}: no Google script loaded when Google is not set up`, !log.requests.some((u) => u.includes('accounts.google.com')), log.requests);
  }
  await ctx1.close();
  await ctx2.close();

  // ---------------- C: service unreachable (opted in, nothing listening)
  const ctx3 = await browser.createBrowserContext();
  const { page: p3, log: log3 } = await openPage(ctx3, `${BASE}?api=${DEAD_PORT}#/practice`, 'unreachable');
  await sleep(1500);
  check('unreachable: no sign-in UI at all', !(await visible(p3, '.ac-signin-btn')) && !(await visible(p3, '.ac-me-btn')) && (await p3.evaluate(() => document.querySelector('.sh-account')?.hidden === true)));
  await p3.evaluate(() => window.__game.loadProblem('payments-checkout'));
  const day3 = await buildAndPlay(p3, 'payments-checkout');
  check('unreachable: a problem still plays to the debrief', day3.phase === 'done' && day3.step === 'debrief', day3);
  await p3.evaluate(() => { location.hash = '#/challenge'; });
  await sleep(800);
  check('unreachable: Challenge page has no leaderboard card', !(await visible(p3, '.ac-board')));
  await shot(p3, '09-unreachable-challenge');
  check('unreachable: zero console errors and page errors', !log3.consoleErrors.length && !log3.pageErrors.length, { consoleErrors: log3.consoleErrors, pageErrors: log3.pageErrors });
  check('unreachable: the only failed request is the one silent probe frame', log3.failedRequests.length === 1 && log3.failedRequests[0].includes(`:${DEAD_PORT}/probe`), log3.failedRequests);
  await ctx3.close();

  // ---------------- D: no service for this page (the default for local copies and the live site until go-live)
  const ctx4 = await browser.createBrowserContext();
  const { page: p4, log: log4 } = await openPage(ctx4, `${BASE}#/challenge`, 'off');
  await sleep(1500);
  check('off: no sign-in UI and no request to any account service', !(await visible(p4, '.ac-signin-btn')) && !log4.requests.some((u) => /:\d{4}\/(auth|me|progress|leaderboard|probe)/.test(u)), log4.requests);
  check('off: zero console errors, page errors and failed requests', !log4.consoleErrors.length && !log4.pageErrors.length && !log4.failedRequests.length, log4);
  await ctx4.close();

  // ---------------- E: phone width with the account button
  const ctx5 = await browser.createBrowserContext();
  const { page: p5 } = await openPage(ctx5, `${BASE}?api=${API_PORT}#/challenge`, 'phone');
  await p5.setViewport({ width: 360, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p5.waitForSelector('.ac-signin-btn', { visible: true, timeout: 8000 }).catch(() => {});
  await sleep(600);
  const overflow = await p5.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await p5.click('.ac-signin-btn');
  await sleep(400);
  const popBox = await p5.evaluate(() => { const r = document.querySelector('.ac-pop')?.getBoundingClientRect(); return r ? { left: Math.round(r.left), right: Math.round(r.right), width: innerWidth } : null; });
  check('phone: no horizontal scroll and the sign-in sheet fits the screen', !overflow && popBox && popBox.left >= 0 && popBox.right <= popBox.width, { overflow, popBox });
  await shot(p5, '10-phone-sign-in');
  await ctx5.close();

  // ---------------- F: a service with GitHub set up (dummy app, nothing is sent to GitHub): the button and its first hop
  if (GITHUB_PORT) {
    const ctx6 = await browser.createBrowserContext();
    const { page: p6, log: log6 } = await openPage(ctx6, `${BASE}?api=${GITHUB_PORT}#/challenge`, 'github-configured');
    await p6.waitForSelector('.ac-signin-btn', { visible: true, timeout: 8000 }).catch(() => {});
    await p6.click('.ac-signin-btn');
    await p6.waitForSelector('.ac-pop', { visible: true, timeout: 4000 });
    const gh = await p6.evaluate(() => ({ href: [...document.querySelectorAll('.ac-provider')].find((a) => /GitHub/.test(a.textContent))?.href || null, test: [...document.querySelectorAll('.ac-provider')].some((a) => /test player/.test(a.textContent)) }));
    const hop = gh.href ? await fetch(gh.href, { redirect: 'manual' }) : null;
    const loc = hop ? new URL(hop.headers.get('location')) : null;
    check('GitHub set up: the button starts the flow at the service with this page as the return', !!gh.href && gh.href.startsWith(`http://127.0.0.1:${GITHUB_PORT}/auth/github/start?`) && new URL(gh.href).searchParams.get('return') === '#/challenge' && !gh.test, gh);
    check('GitHub start redirects to GitHub with the email scope and the fixed callback', loc && loc.origin === 'https://github.com' && loc.searchParams.get('redirect_uri') === 'https://api.systemdesigner.io/auth/github/callback' && loc.searchParams.get('scope') === 'user:email', { status: hop?.status, location: loc?.href.replace(/state=[^&]+/, 'state=...') });
    await shot(p6, '11-github-button');
    check('github-configured: zero console errors and page errors', !log6.consoleErrors.length && !log6.pageErrors.length, log6);
    await ctx6.close();
  }
} catch (e) {
  report.failures.push('crash: ' + String(e?.stack || e).slice(0, 600));
} finally {
  await browser.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const summary = Object.fromEntries(Object.entries(report.checks).map(([k, v]) => [k, v.ok ? 'ok' : 'FAIL']));
console.log(JSON.stringify({ summary, failures: report.failures }, null, 1));
process.exitCode = report.failures.length ? 1 : 0;
