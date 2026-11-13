// The service end to end on 127.0.0.1: config, CORS, sessions, account, progress sync, replayed results, leaderboards and rate limits.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, payloadFor, ownDesign, editorialGraph, SITE, NOW } from './helpers.js';
import { loadConfig } from '../config.js';
import { dailyOpen } from '../app.js';
import { openDb } from '../db.js';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

let app;
before(async () => { app = await startApp(); });
after(() => app.close());

const today = new Date(NOW).toISOString().slice(0, 10);
const signIn = async (c, id, name) => {
  const r = await c.req('POST', '/auth/fake', { body: { id, name } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r;
};

test('config refuses the fake provider off 127.0.0.1 or in production, and needs a session secret', () => {
  assert.ok(loadConfig({ NODE_ENV: 'test', AUTH_FAKE: '1', HOST: '0.0.0.0', SESSION_SECRET: 's'.repeat(40) }).errors.length);
  // DEV and the test provider need NODE_ENV to be exactly development or test: a typo or nothing at all counts as production
  for (const NODE_ENV of [undefined, '', 'prod', 'Production', 'production ', 'PRODUCTION', 'staging', 'test ', 'Development']) {
    const fake = loadConfig({ NODE_ENV, AUTH_FAKE: '1', SESSION_SECRET: 's'.repeat(40) });
    assert.ok(fake.errors.length, `AUTH_FAKE with NODE_ENV=${JSON.stringify(NODE_ENV)}`);
    const dev = loadConfig({ NODE_ENV, DEV: '1', SESSION_SECRET: 's'.repeat(40) });
    assert.ok(dev.errors.length, `DEV with NODE_ENV=${JSON.stringify(NODE_ENV)}`);
  }
  for (const NODE_ENV of ['development', 'test']) {
    const ok = loadConfig({ NODE_ENV, DEV: '1', AUTH_FAKE: '1', SESSION_SECRET: 's'.repeat(40) });
    assert.deepEqual(ok.errors, [], NODE_ENV);
    assert.equal(ok.config.fake, true);
  }
  assert.ok(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40), REPLAY_WORKERS: '0' }).errors.length);
  assert.ok(loadConfig({ AUTH_FAKE: '1', NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40) }).errors.length);
  assert.ok(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short' }).errors.length);
  assert.ok(loadConfig({ NODE_ENV: 'production', DEV: '1', SESSION_SECRET: 's'.repeat(40) }).errors.length);
  assert.ok(loadConfig({ GOOGLE_CLIENT_ID: 'not-a-client-id', SESSION_SECRET: 's'.repeat(40) }).errors.length);
  const ok = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40), PORT: '8791' });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config.sites, [SITE], 'only the real site in production');
  assert.equal(ok.config.fake, false);
});

test('/auth/config names only configured providers and never a secret', async () => {
  const c = client(app.base);
  const r = await c.req('GET', '/auth/config');
  assert.deepEqual(r.json, { google: null, github: false, fake: true });
  const g = await startApp({ env: { GOOGLE_CLIENT_ID: '123456789012-abcdefghijklmnop.apps.googleusercontent.com', GITHUB_CLIENT_ID: 'Ov23liTestClient01', GITHUB_CLIENT_SECRET: 'ghsecret0123456789abcdefghij', AUTH_FAKE: '0' } });
  try {
    const r2 = await client(g.base).req('GET', '/auth/config');
    assert.deepEqual(r2.json, { google: { clientId: '123456789012-abcdefghijklmnop.apps.googleusercontent.com' }, github: true, fake: false });
    assert.ok(!JSON.stringify(r2.json).includes('ghsecret'));
    assert.equal((await client(g.base).req('POST', '/auth/fake', { body: { id: 'x' } })).status, 404, 'fake provider off');
  } finally { await g.close(); }
});

test('/probe is a framable page for the site only, posting the public settings', async () => {
  const r = await client(app.base).req('GET', '/probe');
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-type').startsWith('text/html'));
  assert.equal(r.headers.get('x-frame-options'), null);
  // A proxy in front of the service must not add scripts to this page: its policy allows only the one pinned script.
  assert.equal(r.headers.get('cache-control'), 'no-store, no-transform');
  const csp = r.headers.get('content-security-policy');
  assert.ok(csp.endsWith('frame-ancestors https://systemdesigner.io http://localhost:8765 http://127.0.0.1:8765'), csp);
  const html = (await fetch(app.base + '/probe').then((x) => x.text()));
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  const { createHash } = await import('node:crypto');
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`), 'script pinned by hash');
  assert.ok(script.includes('"sd":"systemdesigner-api"') && script.includes('"fake":true'));
  assert.equal((await client(app.base).req('GET', '/auth/config')).headers.get('x-frame-options'), 'DENY', 'everything else refuses framing');
});

test('CORS: only the site (and local copies in DEV), with credentials', async () => {
  const good = await client(app.base).req('OPTIONS', '/progress', { headers: { 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('access-control-allow-origin'), SITE);
  assert.equal(good.headers.get('access-control-allow-credentials'), 'true');
  const local = await client(app.base, { origin: 'http://127.0.0.1:8765' }).req('GET', '/auth/config');
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8765');
  const evil = client(app.base, { origin: 'https://evil.example' });
  assert.equal((await evil.req('OPTIONS', '/progress')).status, 403);
  const g = await evil.req('GET', '/auth/config');
  assert.equal(g.headers.get('access-control-allow-origin'), null);
  assert.equal((await evil.req('POST', '/auth/fake', { body: { id: 'evil' } })).status, 403, 'foreign origin cannot sign in or change anything');
});

test('a session is an httpOnly, Secure, SameSite=Lax cookie for 30 days, stored only as a hash', async () => {
  const c = client(app.base);
  const r = await signIn(c, 'cookie-check', 'Cookie Check');
  const line = r.setCookies.find((x) => x.startsWith('sd_session='));
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) assert.ok(line.includes(attr), attr);
  const token = c.jar.get('sd_session');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const rows = app.db.raw.prepare('SELECT hash FROM sessions').all();
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((x) => x.hash !== token && /^[0-9a-f]{64}$/.test(x.hash)), 'token itself is never stored');
  assert.equal((await c.req('GET', '/me')).json.user.name, 'Cookie Check');
});

test('signed out: /me says null; sign-out ends the session', async () => {
  const c = client(app.base);
  assert.deepEqual((await c.req('GET', '/me')).json, { user: null, consent: { country: 'XX', marketingDefault: false, analyticsDefault: false } });
  assert.equal((await c.req('GET', '/progress')).status, 401);
  await signIn(c, 'leaver', 'Leaver');
  const token = c.jar.get('sd_session');
  assert.equal((await c.req('POST', '/auth/signout', { body: {} })).status, 200);
  assert.equal(c.jar.has('sd_session'), false);
  const stale = client(app.base);
  stale.jar.set('sd_session', token);
  assert.equal((await stale.req('GET', '/me')).json.user, null, 'old token is dead');
});

test('names are cleaned, and renaming works', async () => {
  const c = client(app.base);
  await signIn(c, 'namer', '  <b>Bobby</b>\u0000  Tables\u202e the third and more  ');
  const me = (await c.req('GET', '/me')).json.user;
  assert.ok(!/[<>\u0000\u202e]/.test(me.name));
  assert.ok(me.name.length <= 24);
  assert.equal((await c.req('PATCH', '/me', { body: { name: '   ' } })).status, 400);
  // anything that is not a string is refused as a name, never a server error
  for (const name of [{ toString: 1 }, { toString: 'x' }, ['Ada'], 42, true, null, { valueOf: 1 }]) {
    assert.equal((await c.req('PATCH', '/me', { body: { name } })).status, 400, JSON.stringify(name));
  }
  const odd = client(app.base);
  assert.equal((await odd.req('POST', '/auth/fake', { body: { id: { toString: 1 } } })).status, 400, 'object id');
  const r = await odd.req('POST', '/auth/fake', { body: { id: 'odd-name', name: { toString: 1 } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.name, 'Test player odd-name');
  assert.equal((await c.req('PATCH', '/me', { body: { name: 'Grace' } })).json.user.name, 'Grace');
});

test('display names are unique, ignoring case', async () => {
  const a = client(app.base);
  const b = client(app.base);
  await signIn(a, 'dup-a', 'Margaret');
  const other = await signIn(b, 'dup-b', 'MARGARET');
  assert.notEqual(other.json.user.name.toLowerCase(), 'margaret');
  assert.match(other.json.user.name, /^MARGARET #\d{4}$/);
  const r = await b.req('PATCH', '/me', { body: { name: 'margaret' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'name-taken');
  assert.equal((await a.req('PATCH', '/me', { body: { name: 'MARGARET' } })).status, 200);
});

test('progress: local and server progress merge across two devices', async () => {
  const laptop = client(app.base);
  await signIn(laptop, 'syncer', 'Syncer');
  const a = await laptop.req('PUT', '/progress', { body: { progress: {
    problems: { 'url-shortener': { attempts: 2, bestScore: 900, stars: 2, hintsUsed: 0, solvedAt: NOW, lastResultAt: NOW } },
    lessons: { caching: NOW },
    bests: { best: {}, days: { '2026-11-02': { plays: 1, best: 900, challenge: true } }, history: [] },
  } } });
  assert.equal(a.status, 200);
  const phone = client(app.base);
  await signIn(phone, 'syncer', 'ignored on second sign-in');
  const b = await phone.req('PUT', '/progress', { body: { progress: {
    problems: { 'url-shortener': { attempts: 1, bestScore: 950, stars: 3, hintsUsed: 2, solvedAt: NOW + 5000, lastResultAt: NOW + 5000 }, 'bank-ledger': { attempts: 1, bestScore: 930, stars: 3, solvedAt: NOW, lastResultAt: NOW } },
    lessons: { sharding: NOW, 'no-such-lesson': NOW },
    bests: { best: {}, days: { '2026-11-03': { plays: 1, best: 950, challenge: true } }, history: [] },
  } } });
  const p = b.json.progress;
  assert.deepEqual(Object.keys(p.problems).sort(), ['bank-ledger', 'url-shortener']);
  assert.equal(p.problems['url-shortener'].bestScore, 950);
  assert.equal(p.problems['url-shortener'].solvedAt, NOW);
  assert.deepEqual(Object.keys(p.lessons).sort(), ['caching', 'sharding'], 'unknown lesson dropped');
  assert.deepEqual(Object.keys(p.bests.days), ['2026-11-02', '2026-11-03']);
  assert.deepEqual((await laptop.req('GET', '/progress')).json.progress, p, 'the laptop reads the same merged progress');
  assert.equal((await phone.req('GET', '/me')).json.user.name, 'Syncer', 'name kept from first sign-in');
});

test('progress bodies over the size cap are refused', async () => {
  const c = client(app.base);
  await signIn(c, 'bigbody', 'Big');
  const r = await c.req('PUT', '/progress', { raw: JSON.stringify({ progress: { pad: 'x'.repeat(300 * 1024) } }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 413);
  assert.equal((await c.req('PUT', '/progress', { raw: 'progress=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await c.req('PUT', '/progress', { raw: '{bad', headers: { 'Content-Type': 'application/json' } })).status, 400);
});

test('results are replayed on the server: the stored score is the server score', async () => {
  const daily = app.game.dailyFor(today, app.game.problems);
  const prob = app.game.problemById.get(daily.problemId);
  const design = ownDesign(prob);
  const { payload, localScore } = await payloadFor(app.game, { problemId: prob.id, seed: daily.seed, graph: design, mode: 'challenge' });

  const ada = client(app.base);
  await signIn(ada, 'ada', 'Ada');
  const r = await ada.req('POST', '/results', { body: { payload } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.board, 'd:' + today);
  assert.equal(r.json.score, localScore, 'server replay equals the browser engine');
  assert.equal(r.json.listed, true);
  assert.equal(r.json.replayed, true);
  assert.equal('verified' in r.json, false, 'a replay is called a replay');
  assert.equal(r.json.rank, 1);

  // a link that claims 1000 for a weak design is stored at its real score
  const bob = client(app.base);
  await signIn(bob, 'bob', 'Bob');
  const fake = await payloadFor(app.game, { problemId: prob.id, seed: daily.seed, graph: ownDesign(prob, { weak: true }), mode: 'challenge', claim: 1000 });
  const rb = await bob.req('POST', '/results', { body: { payload: fake.payload } });
  assert.equal(rb.status, 200);
  assert.equal(rb.json.clientScore, 1000);
  assert.equal(rb.json.score, fake.localScore);
  assert.ok(rb.json.score < 100);
  // the bare starter is nothing built: not listed
  const bare = await payloadFor(app.game, { problemId: prob.id, seed: daily.seed, graph: prob.starter, mode: 'challenge', claim: 1000 });
  const rbare = await client(app.base).req('POST', '/results', { body: { payload: bare.payload } });
  assert.equal(rbare.status, 401);
  const dee = client(app.base);
  await signIn(dee, 'dee', 'Dee');
  const rd = await dee.req('POST', '/results', { body: { payload: bare.payload } });
  assert.deepEqual([rd.status, rd.json.listed, rd.json.reason], [200, false, 'starter-design']);

  // the same design later ties on score and ranks after the first one
  app.clock.t += 60_000;
  const cy = client(app.base);
  await signIn(cy, 'cy', 'Cy');
  await cy.req('POST', '/results', { body: { payload } });

  const lb = await ada.req('GET', '/leaderboard?daily=' + today);
  assert.equal(lb.status, 200);
  assert.equal(lb.json.problemId, prob.id);
  assert.equal(lb.json.total, 3);
  assert.deepEqual(lb.json.top.map((x) => [x.rank, x.name, x.you]), [[1, 'Ada', true], [2, 'Cy', false], [3, 'Bob', false]]);
  assert.ok(lb.json.top.every((x) => x.replayed === true && !('verified' in x) && !('userId' in x)));
  assert.equal(lb.json.you.rank, 1);
  const anon = await client(app.base).req('GET', '/leaderboard?daily=' + today);
  assert.equal(anon.json.you, null);
  assert.ok(anon.json.top.every((x) => x.you === false));

  // a worse retry keeps the best
  const worse = await bob.req('POST', '/results', { body: { payload: fake.payload } });
  assert.equal(worse.json.improved, false);
});

test('the shipped editorial designs and near copies of them are not listed', async () => {
  const c = client(app.base);
  await signIn(c, 'copier', 'Copier');
  const tomorrow = new Date(NOW + 86400000).toISOString().slice(0, 10);
  const cases = [];
  for (const [date, seed] of [[null, 'practice'], [today, 'daily-' + today], [tomorrow, 'daily-' + tomorrow]]) {
    const pid = date ? app.game.dailyFor(date, app.game.problems).problemId : 'url-shortener';
    const p = app.game.problemById.get(pid);
    const mode = date ? 'challenge' : 'practice';
    for (let i = 0; i < p.editorial.designs.length; i++) cases.push([`${pid} editorial ${i}`, pid, seed, mode, editorialGraph(p, i)]);
    const g = editorialGraph(p);
    const tweaked = structuredClone(g);
    const big = tweaked.nodes.find((n) => !n.locked && n.units > 1) || tweaked.nodes.find((n) => !n.locked);
    big.units += 1;
    cases.push([`${pid} one size nudged`, pid, seed, mode, tweaked]);
    const padded = structuredClone(g);
    for (let k = 0; k < 6; k++) padded.nodes.push({ id: 'pad' + k, type: 'vm-fleet', x: 0, y: 0, units: 1, zones: 1, knobs: {} });
    cases.push([`${pid} unconnected padding`, pid, seed, mode, padded]);
    const swapped = structuredClone(g);
    const SWAP = { 'vm-fleet': 'container-cluster', 'container-cluster': 'vm-fleet', 'distributed-cache': 'cache', cache: 'distributed-cache' };
    for (const n of swapped.nodes) if (!n.locked && SWAP[n.type]) n.type = SWAP[n.type];
    cases.push([`${pid} same-job parts swapped`, pid, seed, mode, swapped]);
    const trimmed = structuredClone(g);
    const ops = new Set(['metrics', 'alerting', 'pager', 'logs', 'traces', 'dashboards']);
    const gone = new Set(trimmed.nodes.filter((n) => ops.has(n.type)).map((n) => n.id));
    trimmed.nodes = trimmed.nodes.filter((n) => !gone.has(n.id));
    trimmed.edges = trimmed.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
    cases.push([`${pid} monitoring taken out`, pid, seed, mode, trimmed]);
  }
  for (const [label, problemId, seed, mode, graph] of cases) {
    const { payload } = await payloadFor(app.game, { problemId, seed, graph, mode });
    const r = await c.req('POST', '/results', { body: { payload } });
    assert.equal(r.status, 200, label);
    assert.equal(r.json.listed, false, label);
    assert.equal(r.json.reason, 'editorial-design', label);
    assert.equal(r.json.score, undefined, label);
  }
  assert.equal(app.db.raw.prepare("SELECT COUNT(*) AS n FROM scores s JOIN identities i ON i.user_id = s.user_id WHERE i.subject = 'copier'").get().n, 0, 'nothing stored');
});

test('daily boards are open only while their date is today somewhere on Earth', async () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(dailyOpen('2026-11-04', at('2026-11-03T09:59:59Z')), false, 'before UTC+14 reaches it');
  assert.equal(dailyOpen('2026-11-04', at('2026-11-03T10:00:00Z')), true, 'UTC+14 is on it');
  assert.equal(dailyOpen('2026-11-04', at('2026-11-05T11:59:59Z')), true, 'UTC-12 is still on it');
  assert.equal(dailyOpen('2026-11-04', at('2026-11-05T12:59:59Z')), true, 'an hour for a day finished just after midnight');
  assert.equal(dailyOpen('2026-11-04', at('2026-11-05T13:00:00Z')), false, 'over everywhere');
  assert.equal(dailyOpen('nope', at('2026-11-05T13:00:00Z')), false);

  // at 15:00 UTC on the 3rd: the 4th has started in the far east, the 5th has not started anywhere, the 2nd is over
  const c = client(app.base);
  await signIn(c, 'early-bird', 'Early');
  const post = async (date) => {
    const d = app.game.dailyFor(date, app.game.problems);
    const { payload } = await payloadFor(app.game, { problemId: d.problemId, seed: d.seed, graph: ownDesign(app.game.problemById.get(d.problemId)), mode: 'challenge' });
    return c.req('POST', '/results', { body: { payload } });
  };
  assert.equal((await post('2026-11-05')).json.error, 'closed', 'the day after tomorrow');
  assert.equal((await post('2026-11-02')).json.error, 'closed', 'yesterday, over everywhere');
  const tomorrow = await post('2026-11-04');
  assert.equal(tomorrow.status, 200, 'tomorrow is already today in UTC+14');
  assert.equal(tomorrow.json.listed, true);
});

test('practice results go on the problem board; wrong days, seeds and changed starters are refused', async () => {
  const p = app.game.problemById.get('url-shortener');
  const { payload, localScore } = await payloadFor(app.game, { problemId: p.id, seed: 'practice', graph: ownDesign(p) });
  const c = client(app.base);
  await signIn(c, 'pat', 'Pat');
  const r = await c.req('POST', '/results', { body: { payload } });
  assert.equal(r.json.board, 'p:url-shortener');
  assert.equal(r.json.score, localScore);
  const lb = await c.req('GET', '/leaderboard?problem=url-shortener');
  assert.equal(lb.json.top[0].name, 'Pat');
  assert.equal(lb.json.top[0].score, localScore);

  const old = '2026-10-20';
  const d = app.game.dailyFor(old, app.game.problems);
  const op = app.game.problemById.get(d.problemId);
  const late = await payloadFor(app.game, { problemId: op.id, seed: d.seed, graph: ownDesign(op), mode: 'challenge' });
  const rl = await c.req('POST', '/results', { body: { payload: late.payload } });
  assert.equal(rl.status, 422);
  assert.equal(rl.json.error, 'closed');

  const other = app.game.problems.find((x) => x.id !== app.game.dailyFor(today, app.game.problems).problemId);
  const { encodeShare } = await import('../../compete/share.js');
  const wrongDay = await encodeShare({ mode: 'challenge', problemId: other.id, seed: 'daily-' + today, graph: { nodes: [], edges: [] }, score: { total: 1 }, name: '' }, app.game.catalog);
  assert.equal((await c.req('POST', '/results', { body: { payload: wrongDay } })).json.error, 'not-daily');
  const weirdSeed = await encodeShare({ mode: 'practice', problemId: 'url-shortener', seed: 'lucky-seed', graph: { nodes: [], edges: [] }, score: { total: 1 }, name: '' }, app.game.catalog);
  assert.equal((await c.req('POST', '/results', { body: { payload: weirdSeed } })).json.error, 'bad-seed');
  const noUsers = await encodeShare({ mode: 'practice', problemId: 'url-shortener', seed: 'practice', graph: { nodes: [{ id: 'n1', type: 'cdn', x: 0, y: 0 }], edges: [] }, score: { total: 1 }, name: '' }, app.game.catalog);
  assert.equal((await c.req('POST', '/results', { body: { payload: noUsers } })).json.error, 'starter-changed');
  // more parts or connections than any problem needs are refused before they reach the scorer
  const huge = ownDesign(p);
  for (let k = 0; k < 70; k++) { huge.nodes.push({ id: 'x' + k, type: 'vm-fleet', x: 0, y: 0, units: 1, zones: 1, knobs: {} }); huge.edges.push({ id: `o-lb>x${k}`, from: 'o-lb', to: 'x' + k, kind: 'flow' }); }
  const hugeLink = await encodeShare({ mode: 'practice', problemId: p.id, seed: 'practice', graph: huge, score: { total: 1 }, name: '' }, app.game.catalog);
  assert.equal((await c.req('POST', '/results', { body: { payload: hugeLink } })).json.error, 'too-big');
  const wide = ownDesign(p);
  wide.nodes.find((n) => n.id === 'o-app').knobs = { autoscale: { on: true, min: 1, max: 1000, targetUtil: 0.6 } };
  for (const id of ['o-db', 'o-hot']) wide.nodes.find((n) => n.id === id).units = 1000;
  wide.nodes.find((n) => n.id === 'o-lb').units = 1000;
  const wideLink = await encodeShare({ mode: 'practice', problemId: p.id, seed: 'practice', graph: wide, score: { total: 1 }, name: '' }, app.game.catalog);
  assert.equal((await c.req('POST', '/results', { body: { payload: wideLink } })).json.error, 'too-big', 'units, with autoscale at its maximum');
  for (const bad of [undefined, '', 'x', 'zzzz', 'j' + 'A'.repeat(30000), { a: 1 }]) {
    const rr = await c.req('POST', '/results', { body: { payload: bad } });
    assert.ok(rr.status === 422 || rr.status === 413, `bad payload ${String(bad).slice(0, 10)} -> ${rr.status}`);
  }
  assert.equal((await client(app.base).req('POST', '/results', { body: { payload } })).status, 401, 'signed out cannot post');
  assert.equal((await c.req('GET', '/leaderboard?problem=nope')).status, 404);
  assert.equal((await c.req('GET', '/leaderboard?daily=2026-02-30')).status, 400);
  assert.equal((await c.req('GET', '/leaderboard')).status, 400);
});

test('leaderboard shows the top 50 plus your own rank', async () => {
  const board = 'p:leaderboards';
  for (let i = 0; i < 60; i++) {
    const { userId } = app.db.signIn({ provider: 'fake', subject: 'bulk-' + i, name: 'Bulk ' + i }, NOW);
    app.db.recordScore({ board, userId, score: 1000 - i, stars: 3, passed: true, verified: true }, NOW + i);
  }
  const c = client(app.base);
  await signIn(c, 'bulk-57', 'whoever');
  const lb = await c.req('GET', '/leaderboard?problem=leaderboards');
  assert.equal(lb.json.top.length, 50);
  assert.equal(lb.json.total, 60);
  assert.equal(lb.json.top[0].score, 1000);
  assert.deepEqual(lb.json.you, { rank: 58, score: 943, stars: 3, passed: true, replayed: true });
});

test('deleting the account removes the user, sessions, progress and scores', async () => {
  const c = client(app.base);
  await signIn(c, 'deleteme', 'Delete Me');
  await c.req('PUT', '/progress', { body: { progress: { lessons: { caching: NOW } } } });
  const { userId } = app.db.signIn({ provider: 'fake', subject: 'deleteme', name: 'x' }, NOW);
  app.db.recordScore({ board: 'p:chat-app', userId, score: 999, stars: 3, passed: true, verified: true }, NOW);
  const r = await c.req('DELETE', '/me');
  assert.equal(r.status, 200);
  assert.equal(c.jar.has('sd_session'), false);
  for (const t of ['users', 'identities', 'sessions', 'progress', 'scores']) {
    const col = t === 'users' ? 'id' : 'user_id';
    assert.equal(app.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = ?`).get(userId).n, 0, t);
  }
  assert.equal((await client(app.base).req('GET', '/leaderboard?problem=chat-app')).json.total, 0);
});

test('rate limits per address and per user answer 429 with Retry-After', async () => {
  const c = client(app.base, { ip: '203.0.113.9' });
  let last;
  for (let i = 0; i < 21; i++) last = await c.req('POST', '/auth/fake', { body: { id: 'limited' } });
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  // another address is unaffected
  assert.equal((await client(app.base, { ip: '203.0.113.10' }).req('POST', '/auth/fake', { body: { id: 'limited' } })).status, 200);
  // per user: the same account from many addresses still hits its own cap
  const u = client(app.base, { ip: '198.51.100.1' });
  await signIn(u, 'renamer', 'R');
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const v = client(app.base, { ip: '198.51.100.' + (i + 2) });
    v.jar.set('sd_session', u.jar.get('sd_session'));
    codes.push((await v.req('PATCH', '/me', { body: { name: 'R' + i } })).status);
  }
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
  assert.equal(codes[10], 429);
  // the window passes
  app.clock.t += 61_000;
  assert.equal((await c.req('POST', '/auth/fake', { body: { id: 'limited' } })).status, 200);
});

test('one result per player in the scorer at a time', async () => {
  const p = app.game.problemById.get('url-shortener');
  const c = client(app.base);
  await signIn(c, 'eager', 'Eager');
  const a = await payloadFor(app.game, { problemId: p.id, seed: 'practice', graph: ownDesign(p) });
  const b = await payloadFor(app.game, { problemId: p.id, seed: 'practice', graph: ownDesign(p, { weak: true }) });
  const [ra, rb] = await Promise.all([c.req('POST', '/results', { body: { payload: a.payload } }), c.req('POST', '/results', { body: { payload: b.payload } })]);
  assert.deepEqual([ra.status, rb.status].sort(), [200, 429]);
  const later = [ra, rb].find((x) => x.status === 429);
  assert.equal(later.json.error, 'scoring');
  assert.ok(Number(later.headers.get('retry-after')) > 0);
});

test('an IPv6 /64 counts as one address, and sign-ins have a shared cap per minute', async () => {
  const fresh = await startApp();
  try {
    const net = (i) => client(fresh.base, { ip: `2001:db8:77:1::${(i + 1).toString(16)}` });
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await net(i).req('GET', '/auth/github/start')).status);
    assert.deepEqual(codes.slice(0, 20), Array(20).fill(302));
    assert.equal(codes[20], 429, 'rotating addresses inside one /64 does not reset the limit');
    assert.equal((await client(fresh.base, { ip: '2001:db8:77:2::1' }).req('GET', '/auth/github/start')).status, 302, 'the next /64 is separate');
    // 600 sign-in starts a minute from everyone together, counted only for requests within their own limits
    let allowed = 21;
    for (let k = 1; k < 31; k++) for (let i = 0; i < 20; i++) allowed += (await client(fresh.base, { ip: `198.18.${k}.1` }).req('GET', '/auth/github/start')).status === 302 ? 1 : 0;
    assert.equal(allowed, 600, 'everyone together gets 600 a minute');
    assert.equal((await client(fresh.base, { ip: '198.19.0.1' }).req('GET', '/auth/github/start')).status, 429, 'shared cap reached');
    fresh.clock.t += 61_000;
    assert.equal((await client(fresh.base, { ip: '198.19.0.1' }).req('GET', '/auth/github/start')).status, 302);
  } finally { await fresh.close(); }
});

test('unknown routes and methods', async () => {
  const c = client(app.base);
  assert.equal((await c.req('GET', '/nope')).status, 404);
  assert.equal((await c.req('POST', '/me', { body: {} })).status, 405);
  assert.equal((await c.req('GET', '/health')).json.ok, true);
});

test('reserved and rude display names are refused, and a signed-in player can report a board row', async () => {
  const { nameProblem } = await import('../names.js');
  for (const n of ['System Designer', 'system_designer', 'Aditya Reddy (admin)', 'Adm1n', 'Moderator Max', 'sh1t', 'f u c k', 'N.i.g.g.a']) assert.ok(nameProblem(n), n);
  for (const n of ['Grape', 'Dickens', 'Aditya K', 'Systemic', 'Scunthorpe', 'Cumberland', 'Ada Lovelace', 'Rooted']) assert.equal(nameProblem(n), null, n);
  const c = client(app.base); await signIn(c, 'mod-1', 'Moderated');
  assert.equal((await c.req('PATCH', '/me', { body: { name: 'System Designer' } })).status, 400);
  assert.equal((await c.req('PATCH', '/me', { body: { name: 'sh1thead' } })).status, 400);
  assert.equal((await c.req('PATCH', '/me', { body: { name: 'Nice Name' } })).status, 200);
  const d = client(app.base); const r = await signIn(d, 'mod-2', 'Aditya Reddy (admin)');
  assert.equal((await d.req('GET', '/me')).json.user.name, 'Test player mod-2');
  assert.equal((await client(app.base).req('POST', '/report', { body: { uid: 1 } })).status, 401);
  assert.equal((await c.req('POST', '/report', { body: { uid: 999999 } })).status, 404);
  assert.equal((await c.req('POST', '/report', { body: { uid: Number(app.db.raw.prepare("SELECT id FROM users WHERE name = 'Test player mod-2'").get().id), reason: 'name' } })).status, 200);
});

test('/me has the documented shape, with email null until one is known', async () => {
  const c = client(app.base);
  await signIn(c, 'shape', 'Shape');
  const u = (await c.req('GET', '/me')).json.user;
  assert.deepEqual(Object.keys(u).sort(), ['avatar', 'email', 'marketingCountry', 'marketingOptIn', 'marketingOptInAt', 'marketingPromptPending', 'name', 'providers', 'since']);
  assert.equal(u.email, null);
  assert.equal(u.marketingOptIn, false, 'unknown country starts unticked');
  assert.equal(u.marketingPromptPending, true);
  const withMail = client(app.base);
  const r = await withMail.req('POST', '/auth/fake', { body: { id: 'shape2', name: 'Shape Two', email: 'Shape@Example.com', surveyOptIn: false } });
  assert.equal(r.json.user.email, 'shape@example.com');
  assert.equal(r.json.user.marketingOptIn, false, 'the old field is ignored');
  const junk = client(app.base);
  assert.equal((await junk.req('POST', '/auth/fake', { body: { id: 'shape3', email: 'nope' } })).json.user.email, null);
});

test('PATCH /me saves the marketing choice and decision time and checks its input', async () => {
  const c = client(app.base);
  await signIn(c, 'optin', 'Opt In');
  const at = () => app.db.raw.prepare("SELECT u.marketing_optin AS s, u.marketing_optin_at AS at FROM users u JOIN identities i ON i.user_id = u.id WHERE i.subject = 'optin'").get();
  assert.deepEqual({ ...at() }, { s: 0, at: null });
  app.clock.t = NOW + 5000;
  const off = await c.req('PATCH', '/me', { body: { marketingOptIn: false } });
  assert.equal(off.status, 200);
  assert.equal(off.json.user.marketingOptIn, false);
  assert.equal(off.json.user.name, 'Opt In');
  assert.deepEqual({ ...at() }, { s: 0, at: NOW + 5000 });
  const on = await c.req('PATCH', '/me', { body: { marketingOptIn: true } });
  assert.equal(on.json.user.marketingOptIn, true);
  assert.deepEqual({ ...at() }, { s: 1, at: NOW + 5000 });
  app.clock.t += 3600_000;
  for (const bad of ['true', 1, 0, null, {}, []]) assert.equal((await c.req('PATCH', '/me', { body: { marketingOptIn: bad } })).status, 400, JSON.stringify(bad));
  assert.equal((await c.req('PATCH', '/me', { body: {} })).json.error, 'bad-input');
  const both = await c.req('PATCH', '/me', { body: { name: 'Opt Two', marketingOptIn: true } });
  assert.deepEqual([both.json.user.name, both.json.user.marketingOptIn], ['Opt Two', true]);
  assert.equal((await c.req('PATCH', '/me', { body: { name: 'Opt Two', marketingOptIn: 'x' } })).status, 400);
  app.clock.t = NOW;
});

test('a later sign-in updates the email, and an empty one leaves it alone', async () => {
  const c = client(app.base);
  await c.req('POST', '/auth/fake', { body: { id: 'mailer', name: 'Mailer', email: 'one@example.com' } });
  assert.equal((await c.req('GET', '/me')).json.user.email, 'one@example.com');
  const r2 = await c.req('POST', '/auth/fake', { body: { id: 'mailer', email: 'two@example.com' } });
  assert.equal(r2.json.user.email, 'two@example.com');
  const r3 = await c.req('POST', '/auth/fake', { body: { id: 'mailer' } });
  assert.equal(r3.json.user.email, 'two@example.com');
  assert.equal((await c.req('POST', '/auth/fake', { body: { id: 'mailer', email: '' } })).json.user.email, 'two@example.com');
});

test('deleting the account removes the row and the email', async () => {
  const c = client(app.base);
  await c.req('POST', '/auth/fake', { body: { id: 'gone-mail', name: 'Gone Mail', email: 'gone@example.com', surveyOptIn: true } });
  const row = () => app.db.raw.prepare('SELECT u.id FROM users u JOIN identities i ON i.user_id = u.id WHERE i.subject = ?').get('gone-mail');
  const id = row().id;
  assert.equal((await c.req('DELETE', '/me')).status, 200);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(id).n, 0);
  assert.equal(app.db.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'gone@example.com'").get().n, 0);
  assert.equal(app.db.user(id), null);
});

test('no route other than /me returns an email', async () => {
  const c = client(app.base);
  await c.req('POST', '/auth/fake', { body: { id: 'private-mail', name: 'Private Mail', email: 'private-mail@example.com' } });
  const { userId } = app.db.signIn({ provider: 'fake', subject: 'private-mail', name: 'x' }, NOW);
  app.db.recordScore({ board: 'p:chat-app', userId, score: 500, stars: 2, passed: true, verified: true }, NOW);
  const seen = [];
  for (const [m, p] of [['GET', '/leaderboard?problem=chat-app'], ['GET', '/progress'], ['GET', '/auth/config'], ['GET', '/health'], ['POST', '/auth/signout']]) {
    const r = await c.req(m, p, m === 'POST' ? { body: {} } : {});
    seen.push(JSON.stringify(r.json));
  }
  assert.ok(seen[0].includes('Private Mail'), 'the player is on the board');
  assert.ok(seen.every((x) => !/private-mail@|@example\.com|email/i.test(x)));
});

test('an old database gains the new user columns on start and keeps its rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-mig-'));
  const file = path.join(dir, 'old.db');
  try {
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, created_at INTEGER NOT NULL); INSERT INTO users (name, avatar, created_at) VALUES ('Veteran', NULL, 1234);");
    old.close();
    const db = openDb(file);
    try {
      const cols = db.raw.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
      for (const c of ['email', 'survey_optin', 'survey_optin_at']) assert.ok(cols.includes(c), c);
      assert.deepEqual(db.user(1), { id: 1, name: 'Veteran', avatar: null, createdAt: 1234, providers: [], email: null, surveyOptIn: false, surveyOptInAt: null, marketingOptIn: false, marketingOptInAt: null, marketingCountry: 'XX', marketingPromptPending: false });
      db.setEmail(1, 'v@example.com');
      db.setMarketingOptIn(1, true, 99, 'US');
      assert.equal(db.user(1).email, 'v@example.com');
      assert.equal(db.user(1).marketingOptInAt, 99);
    } finally { db.close(); }
    const again = openDb(file);   // a second start is harmless
    try { assert.equal(again.user(1).email, 'v@example.com'); } finally { again.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
