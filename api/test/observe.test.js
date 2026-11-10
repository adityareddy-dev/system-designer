// Anonymous collection contracts, storage privacy, limits and daily expiry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openDb } from '../db.js';
import { cutoff } from '../observation-store.js';
import { createObservation } from '../observation.js';
import { Readable } from 'node:stream';

const opened = { name: 'app_opened', screen: 'phone', referrer: 'example.org' };
test('production refuses anonymous event collection without storing counts', async t => {
  const a = await startApp({ env: { NODE_ENV: 'production', DEV: '0', AUTH_FAKE: '0' } });
  t.after(() => a.close());
  assert.equal((await client(a.base).req('POST', '/e', { body: { events: [opened] } })).status, 404);
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM event_counts').get().n, 0);
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM visitor_counts').get().n, 0);
});

test('daily referrer storage stays bounded across batches and service restarts', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-referrers-'));
  let db = openDb(path.join(dir, 'counts.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const day = '2026-11-08';
  for (let i = 0; i < 200; i++) {
    if (i === 100) { db.close(); db = openDb(path.join(dir, 'counts.db')); }
    db.countEvents(day, [{ ...opened, referrer: `site${i}.example` }], false);
  }
  assert(db.raw.prepare('SELECT count(DISTINCT referrer) AS n FROM event_counts WHERE day = ?').get(day).n <= 101);
  assert.equal(db.raw.prepare('SELECT sum(count) AS n FROM event_counts').get().n, 200);
  assert.equal(db.raw.prepare("SELECT count FROM event_counts WHERE referrer = 'other'").get().count, 100);
  db.countEvents('2026-11-09', [opened], false);
  assert.equal(db.raw.prepare('SELECT referrer FROM event_counts WHERE day = ?').get('2026-11-09').referrer, 'example.org');
});

test('events accept only known names, ids and fields, with atomic batches and body caps', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base);
  assert.equal((await c.req('POST', '/e', { body: { events: [opened, { name: 'problem_passed', id: 'url-shortener', screen: 'desktop' }] } })).status, 202);
  for (const event of [{ ...opened, name: 'anything' }, { name: 'problem_passed', id: 'missing', screen: 'phone' }, { ...opened, uid: 'secret' }, { ...opened, referrer: 'https://example.org/private?q=secret' }]) {
    assert.equal((await c.req('POST', '/e', { body: { events: [opened, event] } })).status, 400);
  }
  assert.equal((await c.req('POST', '/e', { body: { events: [], extra: 'id' } })).status, 400);
  assert.equal((await c.req('POST', '/e', { body: { events: [opened], padding: 'x'.repeat(9000) } })).status, 413);
  assert.equal(a.db.raw.prepare('SELECT sum(count) AS n FROM event_counts').get().n, 2);
});

test('daily visitors are counts only, rotate at midnight, and never join accounts', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base, { ip: '192.0.2.42' });
  await c.req('POST', '/auth/fake', { body: { id: 'signed-in' } });
  for (let i = 0; i < 2; i++) assert.equal((await c.req('POST', '/e', { body: { events: [opened] } })).status, 202);
  assert.equal(a.db.raw.prepare('SELECT count FROM visitor_counts').get().count, 1);
  a.clock.t += 86400000;
  await c.req('POST', '/e', { body: { events: [opened] } });
  assert.deepEqual(a.db.raw.prepare('SELECT count FROM visitor_counts ORDER BY day').all().map(r => r.count), [1, 1]);
  const tables = ['event_counts', 'visitor_counts', 'feedback'];
  for (const table of tables) {
    const columns = a.db.raw.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
    assert.ok(columns.every(k => !/ip|user|hash|salt|agent|session/i.test(k)), columns.join(','));
    assert.ok(!JSON.stringify(a.db.raw.prepare(`SELECT * FROM ${table}`).all()).includes('192.0.2.42'));
  }
});

test('visitor salt is newly random each UTC day and repeat visits share only that day', async t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  let time = Date.UTC(2026, 10, 7, 23, 59, 59), salts = 0;
  const observation = createObservation({ db, game: { problemIds: new Set(), lessonIds: new Set() }, now: () => time, random: size => { salts++; return Buffer.alloc(size, salts); } });
  const visit = async () => {
    const req = Readable.from([Buffer.from(JSON.stringify({ events: [opened] }))]);
    req.headers = { 'content-type': 'application/json', 'user-agent': 'one-browser' };
    await observation.events(req, '192.0.2.42');
  };
  await visit(); await visit(); assert.equal(salts, 1);
  time += 1000; await visit(); assert.equal(salts, 2);
  assert.deepEqual(db.raw.prepare('SELECT count FROM visitor_counts ORDER BY day').all().map(r => r.count), [1,1]);
});

test('feedback keeps only rating, comment, page, version and date, even signed in', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base);
  await c.req('POST', '/auth/fake', { body: { id: 'feedback-player' } });
  const body = { rating: 4, comment: 'Helpful', page: 'problem:url-shortener', version: '1.1.1.1' };
  const r = await c.req('POST', '/feedback', { body });
  assert.equal(r.status, 202); assert.equal(r.setCookies.length, 0);
  const row = { ...a.db.raw.prepare('SELECT * FROM feedback').get() };
  assert.deepEqual(row, { ...body, day: new Date(a.clock.t).toISOString().slice(0, 10) });
  for (const bad of [{ rating: 0 }, { comment: 'x'.repeat(501) }, { page: 'secret' }, { uid: 'secret' }, { version: 'https://secret' }]) {
    assert.equal((await client(a.base).req('POST', '/feedback', { body: { ...body, ...bad } })).status, 400);
  }
  assert.equal((await client(a.base).req('POST', '/feedback', { body: { ...body, comment: 'x'.repeat(9000) } })).status, 413);
});

test('anonymous endpoints have separate per-address limits and respect privacy headers', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base);
  for (let i = 0; i < 30; i++) assert.equal((await c.req('POST', '/e', { body: { events: [opened] } })).status, 202);
  assert.equal((await c.req('POST', '/e', { body: { events: [opened] } })).status, 429);
  const body = { rating: 3, comment: '', page: 'general', version: '1' };
  for (let i = 0; i < 5; i++) assert.equal((await c.req('POST', '/feedback', { body })).status, 202);
  const limited = await c.req('POST', '/feedback', { body });
  assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }]) {
    assert.equal((await client(a.base).req('POST', '/e', { body: { events: [opened] }, headers })).status, 202);
  }
  assert.equal(a.db.raw.prepare('SELECT sum(count) AS n FROM event_counts').get().n, 30);
});

test('cleanup enforces 13 calendar months for counts and two years for feedback', async t => {
  const a = await startApp(); t.after(() => a.close());
  a.db.raw.exec("INSERT INTO visitor_counts VALUES ('2025-10-02', 1), ('2025-10-03', 2); INSERT INTO feedback VALUES (3, '', 'general', '1', '2024-11-02'), (4, '', 'general', '1', '2024-11-03'); INSERT INTO event_counts VALUES ('2025-10-02','app_opened','','phone','','','','',1)");
  a.db.cleanupObservation(a.clock.t);
  assert.deepEqual(a.db.raw.prepare('SELECT day FROM visitor_counts').all().map(r => r.day), ['2025-10-03']);
  assert.deepEqual(a.db.raw.prepare('SELECT day FROM feedback').all().map(r => r.day), ['2024-11-03']);
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM event_counts').get().n, 0);
});

test('all event milestones and scrubbed error reports are accepted without raw error text', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base);
  const names = ['first_problem_started', 'first_problem_passed', 'problem_passed', 'daily_challenge_played', 'interview_finished', 'result_shared', 'beat_link_opened'];
  const events = names.map(name => ({ name, id: 'url-shortener', screen: 'phone' }));
  events.push({ name: 'intro_finished', screen: 'desktop' }, { name: 'lesson_finished', id: 'caching', screen: 'desktop' }, { name: 'error', screen: 'phone', errorName: 'ModuleError', message: 'Module could not load', file: 'main.js' });
  assert.equal((await c.req('POST', '/e', { body: { events } })).status, 202);
  assert.equal((await c.req('POST', '/e', { body: { events: [{ name: 'error', screen: 'phone', errorName: 'Error', message: 'typed private words', file: 'main.js' }] } })).status, 400);
  assert.equal(a.db.raw.prepare('SELECT sum(count) AS n FROM event_counts').get().n, events.length);
});

test('calendar retention clamps month ends and backup cleanup scrubs retained copies', t => {
  assert.equal(cutoff(Date.UTC(2026, 2, 31), 13), '2025-02-28');
  assert.equal(cutoff(Date.UTC(2028, 1, 29), 24), '2026-02-28');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-retention-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'live.db'), backups = path.join(dir, 'backups'); fs.mkdirSync(backups);
  for (const target of [file, path.join(backups, 'systemdesigner-20261101T000000Z.db')]) {
    const db = openDb(target);
    db.raw.exec("INSERT INTO visitor_counts VALUES ('2000-01-01', 99); INSERT INTO feedback VALUES (1, 'expired-sensitive-feedback-marker', 'general', '1', '2000-01-01')");
    db.addFeedback({ rating: 5, comment: 'current', page: 'general', version: '1' }, new Date().toISOString().slice(0,10)); db.close();
  }
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../backup.js', import.meta.url))], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const target of [file, ...fs.readdirSync(backups).filter(f => f.endsWith('.db')).map(f => path.join(backups, f))]) {
    const db = openDb(target);
    assert.equal(db.raw.prepare('SELECT count(*) AS n FROM visitor_counts').get().n, 0);
    assert.deepEqual(db.raw.prepare('SELECT comment FROM feedback').all().map(r => r.comment), ['current']); db.close();
    assert.equal(fs.readFileSync(target).includes(Buffer.from('expired-sensitive-feedback-marker')), false, target);
  }
});
