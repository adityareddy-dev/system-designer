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
import { DatabaseSync } from 'node:sqlite';
import { CONSENT_VERSION, CONSENT_TEXT } from '../../core/feedback-contract.js';
import { countries, countryCodes } from '../../core/countries.js';
import { createObservation, FEEDBACK_BODY_LIMIT } from '../observation.js';
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
  assert.deepEqual(row, { ...body, helped: '', use: '', country: '', role: '', day: new Date(a.clock.t).toISOString().slice(0, 10) });
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
  a.db.raw.exec("INSERT INTO visitor_counts VALUES ('2025-10-02', 1), ('2025-10-03', 2); INSERT INTO feedback (rating,comment,page,version,day) VALUES (3, '', 'general', '1', '2024-11-02'), (4, '', 'general', '1', '2024-11-03'); INSERT INTO event_counts VALUES ('2025-10-02','app_opened','','phone','','','','',1)");
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
    db.raw.exec("INSERT INTO visitor_counts VALUES ('2000-01-01', 99); INSERT INTO feedback (rating,comment,page,version,day) VALUES (1, 'expired-sensitive-feedback-marker', 'general', '1', '2000-01-01')");
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

const response = { rating: 5, comment: '  Helped — “yes”!\r\nNext line.\tEnd.  ', page: 'general', version: '2026.11.11' };
const about = { helped: 'a-bit', use: 'work', country: 'IN', role: 'engineer' };
const quote = { consent: true, consentVersion: CONSENT_VERSION, name: ' Test Person ', title: ' Backend engineer ', email: ' PERSON@EXAMPLE.ORG ' };
const storedQuote = { ...quote, name: quote.name.trim(), title: quote.title.trim(), email: quote.email.trim().toLowerCase(), consentText: CONSENT_TEXT };

test('full consent stays separate, preserves exact comments, ignores country headers and account identity', async t => {
  const a = await startApp(); t.after(() => a.close()); const c = client(a.base);
  await c.req('POST', '/auth/fake', { body: { id: 'quote-player' } });
  const r = await c.req('POST', '/feedback', { body: { ...response, about, quote } });
  assert.equal(r.status, 202); assert.deepEqual(r.setCookies, []);
  const day = new Date(a.clock.t).toISOString().slice(0, 10);
  assert.deepEqual({ ...a.db.raw.prepare('SELECT * FROM feedback').get() }, { ...response, day, ...about });
  assert.deepEqual({ ...a.db.raw.prepare('SELECT * FROM quotes').get() }, {
    id: 1, day, ...response, ...about, name: 'Test Person', title: 'Backend engineer', email: 'person@example.org', consent_version: CONSENT_VERSION, consent_text: CONSENT_TEXT,
  });
  assert.equal((await c.req('POST', '/feedback', { body: response, headers: { 'CF-IPCountry': 'US', 'Accept-Language': 'en-US' } })).status, 202);
  assert.equal(a.db.raw.prepare('SELECT country FROM feedback ORDER BY rowid DESC').get().country, '');
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 1);
  const noEmail = { ...quote }; delete noEmail.email;
  assert.equal((await c.req('POST', '/feedback', { body: { ...response, quote: noEmail } })).status, 202);
  assert.equal(a.db.raw.prepare('SELECT email FROM quotes ORDER BY id DESC').get().email, '');
  assert.deepEqual(a.db.raw.prepare('PRAGMA table_info(feedback)').all().map(r => r.name), ['rating','comment','page','version','day','helped','use','country','role']);
  assert.ok(a.db.raw.prepare('PRAGMA table_info(quotes)').all().every(r => !/user|account|session|address|timestamp/.test(r.name)));
  // Account removal cannot identify this independently submitted permission.
  a.db.raw.exec('DELETE FROM users');
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 2);
});

test('invalid optional fields and quote permissions are all bad-input, without writes', async t => {
  const a = await startApp(); t.after(() => a.close());
  const invalid = [
    ...[{ rating: '5' }, { rating: null }, { rating: 2.5 }, { rating: 6 }, { comment: null }, { comment: [] }, { page: 1 }, { page: [] }, { version: 1 }, { comment: 'a\u0000b' }, { name: 'Name' }, { title: 'Role' }],
    { about: null }, { about: [] }, { about: true }, { about: 'yes' }, { about: { unknown: 'yes' } },
    ...['helped', 'use', 'country', 'role'].flatMap(key => [null, [], {}, 1, true, '', 'unknown'].map(value => ({ about: { [key]: value } }))),
    { about: { country: 'us' } }, { about: { country: 'ZZ' } }, { about: { country: 'XK' } }, { about: { email: 'a@b.c' } }, { email: 'a@b.c' },
    ...[null, [], true, 'yes', {}].map(quote => ({ quote })),
    ...[{ unknown: true }, { consent: false }, { consent: 'true' }, { consentVersion: 'future' }, { consentVersion: null },
      { name: '' }, { name: '  ' }, { name: 1 }, { name: 'x'.repeat(61) }, { name: 'a\nb' }, { name: 'a\u007fb' }, { name: 'a\u0085b' },
      { title: '' }, { title: '  ' }, { title: null }, { title: 'x'.repeat(81) }, { title: 'a\tb' },
      { email: null }, { email: '' }, { email: 'a b@c.d' }, { email: 'a@@b.c' }, { email: 'a@b' }, { email: 'a'.repeat(251) + '@b.c' },
    ].map(part => ({ quote: { ...quote, ...part } })),
    ...['consent','consentVersion','name','title'].map(key => ({ quote: Object.fromEntries(Object.entries(quote).filter(([k]) => k !== key)) })),
    { quote, comment: '' }, { quote, comment: ' \n\t ' },
  ];
  for (const body of invalid) {
    const r = await client(a.base).req('POST', '/feedback', { body: { ...response, ...body } });
    assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.json.error, 'bad-input');
  }
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM feedback').get().n, 0);
  assert.equal(a.db.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 0);
});

test('shared ISO choices are sorted, complete and accepted without inferring answers', async t => {
  const a = await startApp(); t.after(() => a.close());
  assert.equal(countries.length, 249); assert.equal(countryCodes.size, 249);
  assert.deepEqual(countries, [...countries].sort((a,b) => a[1].localeCompare(b[1], 'en')));
  for (const [country] of countries) {
    const obs = createObservation({ db: a.db, game: a.game, now: () => a.clock.t });
    const req = Readable.from([Buffer.from(JSON.stringify({ ...response, about: { country } }))]);
    req.headers = { 'content-type': 'application/json' }; await obs.feedback(req);
  }
  assert.equal(a.db.raw.prepare('SELECT count(DISTINCT country) AS n FROM feedback').get().n, 249);
});

test('feedback body cap includes worst-case UTF-8 and JSON-escaped full requests', async t => {
  const a = await startApp(); t.after(() => a.close());
  const page = ['general', ...[...a.game.problemIds].map(id => 'problem:' + id), ...[...a.game.lessonIds].map(id => 'lesson:' + id)].sort((a,b) => b.length-a.length)[0];
  const full = { rating: 5, comment: '\uffff'.repeat(500), page, version: Array(8).fill('9999').join('.'),
    about: { helped: 'a-bit', use: 'curiosity', country: 'US', role: 'educator' },
    quote: { consent: true, consentVersion: CONSENT_VERSION, name: '\uffff'.repeat(60), title: '\uffff'.repeat(80), email: '\uffff'.repeat(250) + '@a.b' } };
  const utf8 = JSON.stringify(full);
  const escaped = utf8.replace(/"([^"\\]*)"/g, (_, s) => '"' + [...s].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '"');
  assert.equal(Buffer.byteLength(utf8), 2958);
  assert.equal(Buffer.byteLength(escaped), FEEDBACK_BODY_LIMIT);
  for (const raw of [utf8, escaped]) assert.equal((await client(a.base).req('POST', '/feedback', { raw, headers: { 'Content-Type': 'application/json' } })).status, 202);
  assert.equal((await client(a.base).req('POST', '/feedback', { raw: escaped + ' ', headers: { 'Content-Type': 'application/json' } })).status, 413);
  // Also exercise chunk accounting without Content-Length.
  const obs = createObservation({ db: a.db, game: a.game, now: () => a.clock.t });
  const req = Readable.from([Buffer.from(escaped), Buffer.from(' ')]); req.headers = { 'content-type': 'application/json' };
  await assert.rejects(obs.feedback(req), e => e.status === 413);
});

test('old feedback migrates idempotently and a failed quote rolls back both writes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-migration-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'old.db'), old = new DatabaseSync(file);
  old.exec("CREATE TABLE feedback (rating INTEGER NOT NULL, comment TEXT NOT NULL, page TEXT NOT NULL, version TEXT NOT NULL, day TEXT NOT NULL); INSERT INTO feedback VALUES (4,'old','general','1','2026-11-01')"); old.close();
  for (let i = 0; i < 2; i++) {
    const db = openDb(file);
    assert.equal(db.raw.prepare('SELECT comment,helped,"use",country,role FROM feedback').get().comment, 'old');
    assert.deepEqual({ ...db.raw.prepare('SELECT helped,"use",country,role FROM feedback').get() }, { helped: '', use: '', country: '', role: '' });
    db.close();
  }
  const db = openDb(file); t.after(() => db.close());
  db.addFeedback({ ...response, about }, '2026-11-02');
  db.raw.exec("CREATE TRIGGER fail_quote BEFORE INSERT ON quotes BEGIN SELECT RAISE(ABORT, 'quote failed'); END");
  assert.throws(() => db.addFeedback({ ...response, quote: storedQuote }, '2026-11-03'), /quote failed/);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM feedback').get().n, 2);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 0);
});

test('calendar retention deletes quotes at 24 months and clears email at 12 months in live and retained backups', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-quote-retention-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'live.db'), backups = path.join(dir, 'backups'); fs.mkdirSync(backups);
  const now = Date.now(), before = day => new Date(Date.parse(day) - 86400000).toISOString().slice(0,10);
  const cutoff24 = cutoff(now, 24), cutoff12 = cutoff(now, 12);
  for (const target of [file, path.join(backups, 'systemdesigner-20261101T000000Z.db')]) {
    const db = openDb(target);
    for (const day of [before(cutoff24), cutoff24, before(cutoff12), cutoff12]) db.addFeedback({ ...response, quote: { ...storedQuote, name: day < cutoff24 ? 'expired-quote-marker' : 'Test', email: day < cutoff12 ? 'expired-email-marker@example.org' : 'new@example.org' } }, day);
    db.close();
  }
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../backup.js', import.meta.url))], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  for (const target of [file, ...fs.readdirSync(backups).filter(f => f.endsWith('.db')).map(f => path.join(backups, f))]) {
    const db = openDb(target);
    assert.deepEqual(db.raw.prepare('SELECT day,email FROM quotes ORDER BY day').all().map(r => [r.day,r.email]), [[cutoff24,''], [before(cutoff12),''], [cutoff12,'new@example.org']]);
    db.close();
    const data = fs.readFileSync(target);
    assert.equal(data.includes(Buffer.from('expired-quote-marker')), false);
    assert.equal(data.includes(Buffer.from('expired-email-marker')), false);
  }
});

test('removed quote disappears from every retained backup within seven nightly rotations', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-quote-removal-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'live.db'), db = openDb(file), today = Date.now();
  db.addFeedback({ ...response, quote: storedQuote }, new Date(today).toISOString().slice(0,10)); db.close();
  const run = (script, args = [], day = 0) => {
    const time = today + day * 86400000;
    const shim = `const RealDate=Date;globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[${time}]))}static now(){return ${time}}}`;
    return spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(shim), fileURLToPath(new URL('../' + script, import.meta.url)), ...args], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  };
  assert.equal(run('backup.js').status, 0);
  const remove = run('quotes.js', ['remove', '1']); assert.equal(remove.status, 0, remove.stderr); assert.match(remove.stdout, /Removed quote 1/);
  const first = fs.readdirSync(path.join(dir, 'backups')).find(f => f.endsWith('.db'));
  const copy = openDb(path.join(dir, 'backups', first)); assert.equal(copy.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 1); copy.close();
  for (let day = 1; day <= 7; day++) { const r = run('backup.js', [], day); assert.equal(r.status, 0, r.stderr); }
  const retained = fs.readdirSync(path.join(dir, 'backups')).filter(f => f.endsWith('.db')); assert.equal(retained.length, 7); assert.ok(!retained.includes(first));
  for (const f of retained) { const db = openDb(path.join(dir, 'backups', f)); assert.equal(db.raw.prepare('SELECT count(*) AS n FROM quotes').get().n, 0); db.close(); }
});
