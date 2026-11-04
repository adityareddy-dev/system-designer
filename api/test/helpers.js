// Test helpers: the app on an ephemeral 127.0.0.1 port with an in-memory database, and a small cookie-keeping client.
import http from 'node:http';
import { loadConfig } from '../config.js';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { createLimiter } from '../ratelimit.js';
import { createReplayer } from '../replay.js';
import { loadGame } from '../replay-core.js';
import { createGoogleVerifier } from '../google.js';
import { createGithub } from '../github.js';

export const SITE = 'https://systemdesigner.io';
export const NOW = Date.UTC(2026, 10, 3, 15, 0, 0);

export async function startApp({ env = {}, github, google, now, replayer } = {}) {
  const { config, errors } = loadConfig({ NODE_ENV: 'test', DEV: '1', AUTH_FAKE: '1', SESSION_SECRET: 's'.repeat(48), DB_PATH: ':memory:', ...env });
  if (errors.length) throw new Error(errors.join(' '));
  const db = openDb(':memory:');
  const game = await loadGame();
  const clock = { t: NOW };
  const rp = replayer || createReplayer({ timeoutMs: 20_000 });
  const app = createApp({
    config, db, game, limiter: createLimiter({ now: () => (now ? now() : clock.t) }), replayer: rp,
    google: google || createGoogleVerifier({ clientId: config.google.clientId, fetchImpl: async () => { throw new Error('no network in tests'); } }),
    github: github || createGithub({ ...config.github, fetchImpl: async () => { throw new Error('no network in tests'); } }),
    now: now || (() => clock.t),
  });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, db, game, config, clock,
    async close() { await new Promise((r) => server.close(r)); if (!replayer) await rp.close(); db.close(); },
  };
}

// One browser-like client: keeps cookies, sends Origin, never follows redirects. Each client gets its own address unless one is given.
let nextIp = 0;
export function client(base, { origin = SITE, ip = `192.0.2.${(nextIp++ % 254) + 1}` } = {}) {
  const jar = new Map();
  async function req(method, path, { body, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (ip) h['X-Forwarded-For'] = ip;
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      const gone = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (gone || !v) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, headers: res.headers, setCookies };
  }
  return { req, jar };
}

// A design a player could make for any problem (not the editorial): the starter's users into a load balancer, a container
// cluster, a cache and a key-value store. weak: the users straight into one small VM fleet.
export function ownDesign(problem, { weak = false } = {}) {
  const nodes = problem.starter.nodes.map((n) => ({ id: n.ref, type: n.type, x: n.x, y: n.y, units: 1, zones: 1, knobs: {}, locked: true, ...(n.region ? { region: n.region } : {}) }));
  const edges = [];
  const add = (id, type, units, zones = 1, x = 0) => nodes.push({ id, type, x, y: 0, units, zones, knobs: {} });
  if (weak) {
    add('o-app', 'vm-fleet', 1);
    for (const n of problem.starter.nodes) edges.push([n.ref, 'o-app']);
  } else {
    add('o-lb', 'regional-lb', 1, 2, -100); add('o-app', 'container-cluster', 8, 2, 60); add('o-db', 'kv-store', 2, 1, 240); add('o-hot', 'cache', 2, 1, 240);
    for (const n of problem.starter.nodes) edges.push([n.ref, 'o-lb']);
    edges.push(['o-lb', 'o-app'], ['o-app', 'o-hot'], ['o-app', 'o-db']);
  }
  return { nodes, edges: edges.map(([from, to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' })) };
}

// The problem's first editorial design as the engine takes it.
export function editorialGraph(problem, i = 0) {
  const g = problem.editorial.designs[i].graph;
  return {
    nodes: g.nodes.map((n) => ({ id: n.ref, type: n.type, x: n.x, y: n.y, units: n.units ?? 1, zones: n.zones ?? 1, knobs: structuredClone(n.knobs || {}), ...(n.locked ? { locked: true } : {}), ...(n.region ? { region: n.region } : {}), ...(n.tier ? { tier: n.tier } : {}) })),
    edges: g.edges.map(([from, to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' })),
  };
}

// A share payload for a design, scored on this machine by the same engine (what the browser sends).
export async function payloadFor(game, { problemId, seed, graph, mode = 'practice', claim }) {
  const { encodeShare, scoreOf } = await import('../../compete/share.js');
  const sc = (await import('../replay-core.js')).scenarioFor(game, problemId, seed);
  const sim = game.createSim({ catalog: game.catalog, problem: sc.problem, seed, mode: sc.mode });
  sim.loadGraph(graph);
  sim.start();
  sim.advance(86400000);
  const r = sim.result();
  const score = scoreOf(r);
  if (claim != null) score.total = claim;
  const payload = await encodeShare({ mode, problemId, seed, graph: r.graph, score, name: 'ignored' }, game.catalog);
  return { payload, localScore: Math.round(r.score.total), result: r };
}
