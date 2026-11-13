import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';
import { createMarketingSync } from '../marketing.js';
import { startApp, client, NOW } from './helpers.js';

const keyFile = path.resolve('.task-tmp/klaviyo-test-key');
fs.mkdirSync(path.dirname(keyFile), { recursive: true });
fs.writeFileSync(keyFile, 'test-only-placeholder\n');
test.after(() => fs.rmSync(keyFile, { force: true }));

test('subscription jobs use the list, revision and file key, retry safely and keep the latest choice', async () => {
  const db = openDb(':memory:');
  const calls = [], logs = [];
  let fail = true;
  const sync = createMarketingSync({ db, keyFile, now: () => NOW, log: m => logs.push(m), fetchImpl: async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) });
    if (fail) throw new Error('test-only-placeholder');
    return { ok: true, status: 202 };
  } });
  try {
    const { userId } = db.signIn({ provider: 'fake', subject: 'one', name: 'One', email: 'one@example.com', country: 'US' }, NOW);
    db.setMarketingOptIn(userId, true, NOW, 'US');
    await sync.flush();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/profile-subscription-bulk-create-jobs\/$/);
    assert.equal(calls[0].headers.revision, '2026-10-15');
    assert.equal(calls[0].headers.Authorization, 'Klaviyo-API-Key test-only-placeholder');
    assert.equal(calls[0].body.data.relationships.list.data.id, 'TBaBvT');
    assert.equal(calls[0].body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consent, 'SUBSCRIBED');
    assert.equal(db.marketingJobs(NOW, true)[0].attempts, 1);
    assert.ok(logs.length > 0);
    assert.ok(logs.every(m => !m.includes('test-only-placeholder') && !m.includes('one@example.com')));
    await sync.flush();
    assert.equal(calls.length, 1, 'backoff avoids an immediate retry');
    fail = false;
    db.setMarketingOptIn(userId, false, NOW, 'CA');
    await sync.flush(true);
    assert.match(calls[1].url, /\/api\/profile-subscription-bulk-delete-jobs\/$/);
    assert.equal(calls[1].body.data.type, 'profile-subscription-bulk-delete-job');
    assert.equal(calls[1].body.data.attributes.profiles.data[0].attributes.email, 'one@example.com');
    assert.deepEqual(calls[1].body.data.attributes.profiles.data[0].attributes.subscriptions, { email: { marketing: { consent: 'UNSUBSCRIBED' } } });
    for (const call of calls) {
      assert.equal(call.headers['Content-Type'], 'application/vnd.api+json');
      assert.equal(call.headers.Accept, 'application/vnd.api+json');
    }
    assert.equal(db.marketingJobs(NOW, true).length, 0);
    db.setMarketingOptIn(userId, true, NOW, 'US');
    await createMarketingSync({ db, keyFile: '', fetchImpl: () => assert.fail('disabled means no network'), log: () => assert.fail('disabled is quiet') }).flush();
    assert.equal(db.marketingJobs(NOW, true).length, 1);
    await createMarketingSync({ db, keyFile: keyFile + '-missing', log: m => logs.push(m) }).flush(true);
    assert.equal(db.marketingJobs(NOW, true).length, 1, 'key read failures keep the job');
    await sync.flush(true);
    assert.equal(db.marketingJobs(NOW, true).length, 0);
  } finally { db.close(); }
});

test('an in-flight subscription cannot erase a newer unsubscribe', async () => {
  const db = openDb(':memory:');
  let finish;
  const sync = createMarketingSync({ db, keyFile, fetchImpl: () => new Promise(r => { finish = () => r({ ok: true, status: 202 }); }) });
  try {
    const { userId } = db.signIn({ provider: 'fake', subject: 'race', name: 'Race', email: 'race@example.com' }, NOW);
    db.setMarketingOptIn(userId, true, NOW, 'US');
    const running = sync.flush();
    while (!finish) await new Promise(r => setImmediate(r));
    db.setMarketingOptIn(userId, false, NOW + 1, 'US');
    finish(); await running;
    assert.equal(db.marketingJobs(NOW, true)[0].subscribed, 0);
  } finally { db.close(); }
});

test('settings and sign-in succeed while the delivery service fails', async () => {
  const app = await startApp({ env: { KLAVIYO_KEY_FILE: keyFile }, marketingFetch: async () => ({ ok: false, status: 503 }) });
  try {
    const c = client(app.base);
    assert.equal((await c.req('POST', '/auth/fake', { body: { id: 'failure', email: 'failure@example.com' } })).status, 200);
    assert.equal((await c.req('PATCH', '/me', { body: { marketingOptIn: true } })).status, 200);
    for (let i = 0; i < 200 && app.db.marketingJobs(NOW, true)[0]?.attempts === 0; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(app.db.marketingJobs(NOW, true)[0].attempts, 1);
    assert.equal((await c.req('GET', '/me')).json.user.marketingOptIn, true);
  } finally { await app.close(); }
});
