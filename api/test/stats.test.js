// Owner reports read real SQLite data and rotated Caddy JSON logs without exposing queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CONSENT_VERSION, CONSENT_TEXT } from '../../core/feedback-contract.js';
import { openDb } from '../db.js';

test('stats prints visitors, daily events, funnel, content, referrers, errors and feedback', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-stats-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'test.db'), db = openDb(file), day = new Date().toISOString().slice(0, 10);
  db.countEvents(day, [{ name: 'app_opened', screen: 'phone', referrer: 'example.org' }, { name: 'first_problem_started', id: 'url-shortener', screen: 'phone' }, { name: 'first_problem_passed', id: 'url-shortener', screen: 'phone' }, { name: 'lesson_finished', id: 'caching', screen: 'phone' }, { name: 'error', screen: 'phone', errorName: 'TypeError', message: 'Value is unavailable', file: 'play.js' }], true);
  db.countEvents(day, [{ name: 'problem_passed', id: 'url-shortener', screen: 'phone' }], false);
  db.addFeedback({ rating: 4, comment: 'Works well', page: 'general', version: '1' }, day); db.close();
  const script = fileURLToPath(new URL('../stats.js', import.meta.url));
  const run = args => spawnSync(process.execPath, [script, ...args], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  const counts = run(['2']); assert.equal(counts.status, 0, counts.stderr);
  for (const text of [day, 'Visitors', 'app_opened', 'Funnel', 'first_problem_passed', 'url-shortener', 'caching', 'example.org', 'TypeError', 'play.js']) assert.ok(counts.stdout.includes(text), text);
  const feedback = run(['feedback', '2']); assert.equal(feedback.status, 0, feedback.stderr); assert.match(feedback.stdout, /4\/5.*general.*v1.*Works well/);
  const log = path.join(dir, 'web.log');
  const row = { ts: Date.now() / 1000, status: 200, request: { method: 'GET', uri: '/learn/caching.html?secret=never-print', headers: {} }, referrer: 'example.org' };
  fs.writeFileSync(log, JSON.stringify(row) + '\n{broken\n' + JSON.stringify({ ...row, request: { method: 'GET', uri: '/main.js' } }) + '\n');
  fs.writeFileSync(log + '.1.gz', gzipSync(JSON.stringify(row) + '\n'));
  const web = spawnSync(process.execPath, [script, 'web', '2'], { env: { ...process.env, WEB_LOG_PATH: log }, encoding: 'utf8' });
  assert.equal(web.status, 0, web.stderr); assert.match(web.stdout, /2.*\/learn\/caching.html/); assert.match(web.stdout, /example.org/); assert.doesNotMatch(web.stdout, /never-print|main.js/);
  assert.notEqual(run(['wat']).status, 0);
});

test('quotes export exact JSONL in UTC day/id order, optional feedback answers and owner removal arguments', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-quote-stats-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'test.db'), db = openDb(file), today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const comment = '  “Useful” — backend!\r\nLine two.\tSlashes \\ and "quotes".\n  ';
  const about = { helped: 'yes', use: 'interview', country: 'US', role: 'engineer' };
  const permission = { consent: true, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT, name: 'Test "Person"', title: 'Backend engineer', email: 'test@example.org' };
  for (const day of [today, yesterday, today]) db.addFeedback({ rating: 5, page: 'general', version: '2026.11.11', comment, about, quote: permission }, day);
  const stored = db.raw.prepare('SELECT id,day,rating,page,version,comment,helped,"use",country,role,name,title,email,consent_version,consent_text FROM quotes ORDER BY day,id').all().map(r => ({ ...r })); db.close();
  const run = (script, args) => spawnSync(process.execPath, [fileURLToPath(new URL('../' + script, import.meta.url)), ...args], { env: { ...process.env, DB_PATH: file }, encoding: 'utf8' });
  const report = run('stats.js', ['quotes', '2']); assert.equal(report.status, 0, report.stderr);
  const rows = report.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(rows, stored); assert.deepEqual(rows.map(r => r.id), [2,1,3]);
  for (const row of rows) { assert.equal(row.comment, comment); assert.equal(row.consent_text, CONSENT_TEXT); assert.equal(row.consent_version, CONSENT_VERSION); }
  const feedback = run('stats.js', ['feedback', '2']); assert.equal(feedback.status, 0, feedback.stderr);
  for (const value of ['helped=yes', 'use=interview', 'country=US', 'role=engineer']) assert.ok(feedback.stdout.includes(value));
  assert.doesNotMatch(feedback.stdout, /Test "Person"|test@example.org|consent_version/);
  for (const args of [['quotes','0'], ['quotes','732'], ['quotes','1.5'], ['quotes','x'], ['quotes','1','extra']]) assert.equal(run('stats.js', args).status, 1);
  for (const days of ['1','731']) assert.equal(run('stats.js', ['quotes',days]).status, 0);
  for (const args of [[], ['remove'], ['remove','0'], ['remove','-1'], ['remove','1.5'], ['remove','abc'], ['remove','1','extra'], ['remove','9007199254740992'], ['list','1']]) assert.equal(run('quotes.js', args).status, 1);
  const removed = run('quotes.js', ['remove','1']); assert.equal(removed.status, 0, removed.stderr); assert.match(removed.stdout, /Removed quote 1/);
  assert.equal(run('quotes.js', ['remove','1']).status, 1);
  const remaining = run('stats.js', ['quotes','2']).stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(remaining.map(r => r.id), [2,3]);
  assert.equal(run('stats.js', ['feedback','2']).stdout.split('5/5').length - 1, 3);
});
