import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../db.js';
import { startApp, client, NOW } from './helpers.js';

// Removing the country default or accepting a client-supplied country must fail these checks.
test('country defaults reach signed-out pages and new accounts, then choices survive sign-in', async () => {
  const app = await startApp();
  try {
    for (const [country, on] of [['US', true], ['IN', true], ['DE', false], ['NO', false], ['GB', false], ['CH', false], ['CA', false], ['BR', false], ['AX', false], ['RE', false], ['XX', false], ['', false]]) {
      const c = client(app.base);
      const headers = country ? { 'CF-IPCountry': country } : {};
      const defaults = (await c.req('GET', '/me', { headers })).json.consent;
      assert.equal(defaults?.marketingDefault, on, country);
      assert.equal(defaults?.analyticsDefault, on, country);
      const r = await c.req('POST', '/auth/fake', { headers, body: { id: 'geo-' + (country || 'missing').toLowerCase(), email: 'geo@example.com' } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.user.marketingOptIn, on);
      assert.equal(r.json.user.marketingPromptPending, true);
      assert.equal(r.json.user.marketingOptInAt, null);
      assert.equal(r.json.user.marketingCountry, country || 'XX');
      assert.equal(app.db.marketingJobs(NOW, true).length, 0, 'no subscription before the player sees the choice');
      const saved = await c.req('PATCH', '/me', { headers, body: { marketingOptIn: !on, country: 'US' } });
      assert.equal(saved.status, 200);
      assert.equal(saved.json.user.marketingCountry, country || 'XX');
      assert.equal(saved.json.user.marketingPromptPending, false);
      assert.equal(saved.json.user.marketingOptInAt, NOW);
      const again = await c.req('POST', '/auth/fake', { headers: { 'CF-IPCountry': 'US' }, body: { id: 'geo-' + (country || 'missing').toLowerCase() } });
      assert.equal(again.json.user.marketingOptIn, !on);
      assert.equal(again.json.user.marketingCountry, country || 'XX');
      app.db.raw.exec('DELETE FROM marketing_queue');
    }
    const c = client(app.base);
    await c.req('POST', '/auth/fake', { body: { id: 'validation' } });
    for (const bad of ['true', 1, null, [], {}]) assert.equal((await c.req('PATCH', '/me', { body: { marketingOptIn: bad } })).status, 400);
    assert.equal((await c.req('PATCH', '/me', { body: { surveyOptIn: true } })).status, 400);
    assert.equal(app.db.user(1).surveyOptIn, false, 'legacy columns are no longer written');
  } finally { await app.close(); }
});

test('migration copies old choices once and leaves the legacy columns readable', () => {
  const file = path.resolve('.task-tmp/marketing-migration.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(file, { force: true });
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, created_at INTEGER NOT NULL, email TEXT, survey_optin INTEGER, survey_optin_at INTEGER);
    INSERT INTO users VALUES (1, 'Yes', NULL, 10, 'yes@example.com', 1, 20), (2, 'No', NULL, 11, 'no@example.com', 0, NULL);`);
  old.close();
  let db = openDb(file);
  try {
    assert.equal(db.user(1).marketingOptIn, true);
    assert.equal(db.user(1).marketingOptInAt, 20);
    assert.equal(db.user(1).marketingPromptPending, false);
    assert.equal(db.user(2).marketingOptIn, false);
    assert.equal(db.marketingJobs(NOW, true).length, 1);
    db.setMarketingOptIn(1, false, 30, 'CA');
    assert.equal(db.user(1).surveyOptIn, true);
    db.close(); db = openDb(file);
    assert.equal(db.user(1).marketingOptIn, false, 'reopening does not restore old consent');
  } finally { db.close(); for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true }); }
});

test('subscription changes persist across restarts, email changes and account deletion', () => {
  const dir = fs.mkdtempSync(path.resolve('.task-tmp/marketing-queue-'));
  const file = path.join(dir, 'users.db');
  let db = openDb(file);
  try {
    const profile = { provider: 'google', subject: 'saved', name: 'Saved', email: 'old@example.com', country: 'US' };
    const { userId } = db.signIn(profile, NOW);
    db.setMarketingOptIn(userId, true, NOW, 'US');
    db.close();
    db = openDb(file);
    assert.equal(db.marketingJobs(NOW, true)[0].subscribed, 1);
    assert.equal(db.user(userId).marketingPromptPending, false);
    db.signIn({ ...profile, email: 'new@example.com', country: 'DE' }, NOW + 1);
    const jobs = Object.fromEntries(db.marketingJobs(NOW, true).map(job => [job.email, job.subscribed]));
    assert.deepEqual(jobs, { 'new@example.com': 1, 'old@example.com': 0 });
    assert.equal(db.user(userId).marketingCountry, 'US');
    db.deleteUser(userId);
    assert.equal(db.user(userId), null);
    assert.ok(db.marketingJobs(NOW, true).every(job => job.subscribed === 0));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
