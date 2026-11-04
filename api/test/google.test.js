// Google ID token checks against a locally generated RSA key and JWKS: valid, wrong aud, wrong iss, expired, bad signature,
// alg none, the one-time nonce, key rotation, stale keys and back-off, and the nonce cookie on POST /auth/google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createGoogleVerifier, TokenError } from '../google.js';

const CLIENT = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
const NOW = Date.UTC(2026, 10, 3, 15, 0, 0);
const t = Math.floor(NOW / 1000);
const NONCE = 'nonce-for-tests-0123456789';

function keypair(kid) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}
const K1 = keypair('k1');
const K2 = keypair('k2');
const OTHER = keypair('k1'); // same kid, different key

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims = {}, { key = K1, header = {} } = {}) {
  const h = b64({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const p = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1100223344556677', email_verified: true, name: 'Ada Lovelace', given_name: 'Ada', picture: 'https://lh3.googleusercontent.com/a/x', iat: t - 10, exp: t + 3600, nonce: NONCE, ...claims });
  const s = sign('RSA-SHA256', Buffer.from(h + '.' + p), key.privateKey).toString('base64url');
  return `${h}.${p}.${s}`;
}

function jwksFetch(sets) {
  let calls = 0;
  const fn = async () => {
    const keys = sets[Math.min(calls, sets.length - 1)];
    calls++;
    return { ok: true, headers: new Headers({ 'cache-control': 'public, max-age=3600' }), json: async () => ({ keys }) };
  };
  fn.calls = () => calls;
  return fn;
}

// The verifier, checking tokens against NONCE unless a test says otherwise.
function verifier(opts = {}) {
  let now = NOW;
  const fetchImpl = opts.fetchImpl || jwksFetch([[K1.jwk]]);
  const real = createGoogleVerifier({ clientId: CLIENT, fetchImpl, now: () => now, ...opts });
  const v = { verify: (tok, o = { nonce: NONCE }) => real.verify(tok, o) };
  return { v, fetchImpl, advance: (ms) => { now += ms; } };
}

async function rejects(p, code) {
  await assert.rejects(p, (e) => e instanceof TokenError && e.code === code, `expected ${code}`);
}

test('a valid token gives the subject, name and picture', async () => {
  const { v } = verifier();
  const r = await v.verify(token());
  assert.equal(r.sub, '1100223344556677');
  assert.equal(r.givenName, 'Ada');
  assert.equal(r.picture, 'https://lh3.googleusercontent.com/a/x');
});

test('the issuer without https is also accepted', async () => {
  const { v } = verifier();
  assert.equal((await v.verify(token({ iss: 'accounts.google.com' }))).sub, '1100223344556677');
});

test('wrong audience is refused', async () => {
  const { v } = verifier();
  await rejects(v.verify(token({ aud: '999-other.apps.googleusercontent.com' })), 'bad-audience');
  await rejects(v.verify(token({ aud: [CLIENT] })), 'bad-audience');
});

test('wrong issuer is refused', async () => {
  const { v } = verifier();
  await rejects(v.verify(token({ iss: 'https://evil.example.com' })), 'bad-issuer');
  await rejects(v.verify(token({ iss: undefined })), 'bad-issuer');
});

test('an expired token is refused', async () => {
  const { v } = verifier();
  await rejects(v.verify(token({ exp: t - 3600, iat: t - 7200 })), 'expired');
  await rejects(v.verify(token({ exp: undefined })), 'expired');
});

test('a token from the future is refused', async () => {
  const { v } = verifier();
  await rejects(v.verify(token({ iat: t + 3600, exp: t + 7200 })), 'not-yet-valid');
});

test('a bad signature is refused', async () => {
  const { v } = verifier();
  const good = token();
  const [h, , s] = good.split('.');
  const forged = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: 'attacker', email_verified: true, exp: t + 3600 });
  await rejects(v.verify(`${h}.${forged}.${s}`), 'bad-signature');
  await rejects(v.verify(token({}, { key: OTHER })), 'bad-signature');
});

test('alg none and other algorithms are refused', async () => {
  const { v } = verifier();
  const p = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1', email_verified: true, exp: t + 3600 });
  await rejects(v.verify(`${b64({ alg: 'none', kid: 'k1' })}.${p}.`), 'bad-alg');
  await rejects(v.verify(`${b64({ alg: 'HS256', kid: 'k1' })}.${p}.c2ln`), 'bad-alg');
  await rejects(v.verify(`${b64({ kid: 'k1' })}.${p}.c2ln`), 'bad-alg');
});

test('an unverified email is refused', async () => {
  const { v } = verifier();
  await rejects(v.verify(token({ email_verified: false })), 'email-not-verified');
  await rejects(v.verify(token({ email_verified: undefined })), 'email-not-verified');
});

test('malformed input is refused without fetching keys', async () => {
  const fetchImpl = jwksFetch([[K1.jwk]]);
  const { v } = verifier({ fetchImpl });
  for (const bad of [undefined, 42, '', 'a.b', 'a.b.c.d', '!!.??.**', 'x'.repeat(5000)]) await rejects(v.verify(bad), 'malformed');
  assert.equal(fetchImpl.calls(), 0);
});

test('keys are cached by kid and fetched again for an unknown kid (rotation)', async () => {
  const fetchImpl = jwksFetch([[K1.jwk], [K1.jwk, K2.jwk]]);
  const { v, advance } = verifier({ fetchImpl });
  await v.verify(token());
  await v.verify(token());
  assert.equal(fetchImpl.calls(), 1, 'second check uses the cache');
  advance(61_000);
  assert.equal((await v.verify(token({}, { key: K2 }))).sub, '1100223344556677');
  assert.equal(fetchImpl.calls(), 2, 'unknown kid triggers one refetch');
});

test('an unknown kid does not refetch more than once a minute', async () => {
  const fetchImpl = jwksFetch([[K1.jwk]]);
  const { v } = verifier({ fetchImpl });
  await v.verify(token());
  await rejects(v.verify(token({}, { key: K2 })), 'unknown-key');
  await rejects(v.verify(token({}, { key: K2 })), 'unknown-key');
  assert.equal(fetchImpl.calls(), 1);
});

test('the token must carry the nonce this service handed out', async () => {
  const { v } = verifier();
  await rejects(v.verify(token(), {}), 'bad-nonce');
  await rejects(v.verify(token(), { nonce: 'another-nonce-0123456789' }), 'bad-nonce');
  await rejects(v.verify(token({ nonce: undefined })), 'bad-nonce');
  await rejects(v.verify(token({ nonce: 'another-nonce-0123456789' })), 'bad-nonce');
  await rejects(v.verify(token({ nonce: 42 })), 'bad-nonce');
  assert.equal((await v.verify(token())).sub, '1100223344556677');
});

test('cached keys are not used forever while Google is unreachable, and failed fetches back off', async () => {
  let calls = 0;
  let up = true;
  const fetchImpl = async () => {
    calls++;
    if (!up) throw new Error('down');
    return { ok: true, headers: new Headers({ 'cache-control': 'public, max-age=3600' }), json: async () => ({ keys: [K1.jwk] }) };
  };
  const { v, advance } = verifier({ fetchImpl });
  let spent = 0;
  const step = (ms) => { advance(ms); spent += ms; };
  const tok = () => { const s = Math.floor((NOW + spent) / 1000); return token({ iat: s - 10, exp: s + 3600 }); };
  await v.verify(tok());
  assert.equal(calls, 1);
  up = false;
  step(3600_000);  // the cache is due: one fetch fails, the old keys still work
  assert.equal((await v.verify(tok())).sub, '1100223344556677');
  assert.equal(calls, 2);
  for (let i = 0; i < 5; i++) await v.verify(tok());
  assert.equal(calls, 2, 'no new fetch on every sign-in while backing off');
  step(5_000);
  await v.verify(tok());
  assert.equal(calls, 3, 'tries again after the back-off');
  step(5_000);
  await v.verify(tok());
  assert.equal(calls, 3, 'the back-off doubles');
  step(6 * 3600_000);
  await rejects(v.verify(tok()), 'keys-unavailable');
  up = true;
  step(300_000);
  assert.equal((await v.verify(tok())).sub, '1100223344556677', 'fresh keys once Google answers again');
});

test('no client id means Google sign-in is off', async () => {
  const v = createGoogleVerifier({ clientId: '', fetchImpl: jwksFetch([[K1.jwk]]) });
  await rejects(v.verify(token()), 'not-configured');
});

test('POST /auth/google signs in with a valid token and refuses a bad one', async () => {
  const { startApp, client } = await import('./helpers.js');
  const app = await startApp({ env: { GOOGLE_CLIENT_ID: CLIENT, AUTH_FAKE: '0' }, google: createGoogleVerifier({ clientId: CLIENT, fetchImpl: jwksFetch([[K1.jwk]]), now: () => NOW }) });
  try {
    const c = client(app.base);
    // without the nonce cookie, even a valid token is refused
    assert.equal((await c.req('POST', '/auth/google', { body: { credential: token() } })).status, 401);
    const n = await c.req('POST', '/auth/google/nonce', { body: {} });
    assert.equal(n.status, 200);
    assert.match(n.json.nonce, /^[A-Za-z0-9_-]{32}$/);
    const line = n.setCookies.find((x) => x.startsWith('sd_g_nonce='));
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/auth/google', 'Max-Age=600']) assert.ok(line.includes(attr), attr);
    const stolen = token({ nonce: n.json.nonce });
    // someone else's browser holding a stolen token has no matching cookie
    const thief = client(app.base);
    assert.equal((await thief.req('POST', '/auth/google', { body: { credential: stolen } })).status, 401);
    await thief.req('POST', '/auth/google/nonce', { body: {} });
    assert.equal((await thief.req('POST', '/auth/google', { body: { credential: stolen } })).status, 401, 'a different nonce does not match');
    // a forged cookie is refused
    const forged = client(app.base);
    forged.jar.set('sd_g_nonce', `${n.json.nonce}.${NOW + 600_000}.AAAA`);
    assert.equal((await forged.req('POST', '/auth/google', { body: { credential: stolen } })).status, 401);
    const cookieValue = c.jar.get('sd_g_nonce');
    const ok = await c.req('POST', '/auth/google', { body: { credential: stolen } });
    assert.equal(ok.status, 200);
    assert.equal(c.jar.has('sd_g_nonce'), false, 'the nonce cookie is cleared once used');
    // the same token and cookie a second time: each nonce signs in once
    const again = client(app.base);
    again.jar.set('sd_g_nonce', cookieValue);
    assert.equal((await again.req('POST', '/auth/google', { body: { credential: stolen } })).status, 401);
    assert.deepEqual(ok.json.user.providers, ['google']);
    assert.equal(ok.json.user.name, 'Ada', 'first name only on leaderboards');
    assert.equal(ok.json.user.avatar, 'https://lh3.googleusercontent.com/a/x');
    assert.ok(c.jar.has('sd_session'));
    const other = client(app.base);
    const n2 = await other.req('POST', '/auth/google/nonce', { body: {} });
    const bad = await other.req('POST', '/auth/google', { body: { credential: token({ aud: 'someone-else', nonce: n2.json.nonce }) } });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error, 'bad-token');
    assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  } finally { await app.close(); }
});
