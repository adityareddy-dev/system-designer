import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, NOW } from './helpers.js';

test('public guide access records an email without creating an account or subscribing', async () => {
  const app = await startApp();
  try {
    const c = client(app.base);
    const result = await c.req('POST', '/email-capture', { headers: { 'CF-IPCountry': 'CA' }, body: {
      email: ' Reader@Example.com ', marketingOptIn: false, purpose: 'guide', page: '/guides/two-week-system-design-plan/', source: 'linkedin',
    } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { ok: true });
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    assert.equal(app.db.marketingJobs(NOW, true).length, 0);
    const row = app.db.raw.prepare('SELECT * FROM reading_contacts').get();
    assert.equal(row.email, 'reader@example.com');
    assert.equal(row.country, 'CA');
    assert.equal(row.marketing_optin_at, null);
    assert.equal(row.source, 'linkedin');
  } finally { await app.close(); }
});

test('only a submitted updates choice queues subscription and a guide-only repeat leaves it alone', async () => {
  const app = await startApp();
  try {
    const c = client(app.base);
    const body = { email: 'updates@example.com', marketingOptIn: true, purpose: 'updates', page: '/p/url-shortener/', source: 'newsletter' };
    assert.equal((await c.req('POST', '/email-capture', { headers: { 'CF-IPCountry': 'US' }, body })).status, 200);
    const first = app.db.marketingJobs(NOW, true)[0];
    assert.equal(first.subscribed, 1);
    assert.equal(first.source, 'newsletter');
    assert.equal(app.db.raw.prepare('SELECT marketing_optin_at FROM reading_contacts').get().marketing_optin_at, NOW);
    await c.req('POST', '/email-capture', { body: { ...body, purpose: 'guide', marketingOptIn: false } });
    assert.deepEqual(app.db.marketingJobs(NOW, true)[0], first);
    const { userId } = app.db.signIn({ provider: 'fake', subject: 'optout', name: 'Optout', email: body.email }, NOW);
    app.db.setMarketingOptIn(userId, false, NOW + 1, 'CA');
    assert.equal(app.db.marketingJobs(NOW, true)[0].subscribed, 0);
    await c.req('POST', '/email-capture', { body: { ...body, purpose: 'guide', marketingOptIn: false } });
    assert.equal(app.db.marketingJobs(NOW, true)[0].subscribed, 0);
    app.db.deleteUser(userId);
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM reading_contacts').get().n, 0);
  } finally { await app.close(); }
});

test('public capture validates input and origin and has its own rate limit', async () => {
  const app = await startApp();
  try {
    const body = { email: 'valid@example.com', marketingOptIn: true, purpose: 'updates', page: '/p/news-site/', source: '' };
    const bad = [ { email: 'broken' }, { email: '<x>@example.com' }, { marketingOptIn: 'true' }, { marketingOptIn: false },
      { purpose: 'account' }, { page: 'https://outside.test/' }, { source: 'x'.repeat(101) }, { country: 'US' }, { unknown: true } ];
    for (const change of bad) assert.equal((await client(app.base).req('POST', '/email-capture', { body: { ...body, ...change } })).status, 400, JSON.stringify(change));
    assert.equal((await client(app.base, { origin: 'https://outside.test' }).req('POST', '/email-capture', { body })).status, 403);
    const c = client(app.base);
    for (let i = 0; i < 5; i++) assert.equal((await c.req('POST', '/email-capture', { body })).status, 200);
    const limited = await c.req('POST', '/email-capture', { body });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
  } finally { await app.close(); }
});
