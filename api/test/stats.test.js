// Owner reports read real SQLite data and rotated Caddy JSON logs without exposing queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
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
