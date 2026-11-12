// GitHub sign-in: the state bound to a signed short-lived cookie, the fixed redirect allowlist, and the callback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, checkState, createGithub } from '../github.js';
import { startApp, client, SITE, NOW } from './helpers.js';

const SECRET = 'q'.repeat(48);

test('state cookie: genuine, matching and unexpired passes', () => {
  const { state, cookieValue } = makeState(SECRET, { ret: '#/challenge', origin: SITE }, NOW);
  assert.deepEqual(checkState(SECRET, cookieValue, state, NOW + 1000), { ret: '#/challenge', origin: SITE, survey: null });
});

test('state cookie: wrong state, tampering, expiry or another secret fail', () => {
  const { state, cookieValue } = makeState(SECRET, { ret: '#/', origin: SITE }, NOW);
  const other = makeState(SECRET, { ret: '#/', origin: SITE }, NOW);
  assert.equal(checkState(SECRET, cookieValue, other.state, NOW), null, 'state from another flow');
  assert.equal(checkState(SECRET, other.cookieValue, state, NOW), null, 'cookie from another flow');
  const [body, sig] = cookieValue.split('.');
  const forged = Buffer.from(JSON.stringify({ s: state, e: NOW + 9e9, r: '#/', o: 'https://evil.example' })).toString('base64url');
  assert.equal(checkState(SECRET, `${forged}.${sig}`, state, NOW), null, 'edited body');
  // Always change a character; a fixed suffix can match the random signature.
  const editedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(checkState(SECRET, `${body}.${editedSig}`, state, NOW), null, 'edited signature');
  assert.equal(checkState(SECRET, cookieValue, state, NOW + 601_000), null, 'expired after 10 minutes');
  assert.equal(checkState('z'.repeat(48), cookieValue, state, NOW), null, 'other secret');
  assert.equal(checkState(SECRET, undefined, state, NOW), null, 'no cookie');
  assert.equal(checkState(SECRET, cookieValue, '', NOW), null, 'no state');
});

let app;
let profileCalls = [];
let emailsReply = () => ({ ok: true, json: async () => [
  { email: 'Old@Example.com', primary: false, verified: true },
  { email: ' Octo@Example.COM ', primary: true, verified: true },
  { email: 'unverified@example.com', primary: false, verified: false },
] });
before(async () => {
  const fetchImpl = async (url, init) => {
    profileCalls.push(String(url));
    if (String(url).startsWith('https://github.com/login/oauth/access_token')) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('client_secret'), 'ghsecret0123456789abcdefghij');
      assert.equal(form.get('redirect_uri'), 'https://api.systemdesigner.io/auth/github/callback');
      return { ok: form.get('code') === 'good-code', json: async () => ({ access_token: 'gho_test', token_type: 'bearer', scope: '' }) };
    }
    if (String(url) === 'https://api.github.com/user') {
      assert.equal(init.headers.Authorization, 'Bearer gho_test');
      return { ok: true, json: async () => ({ id: 583231, login: 'octo-player', name: 'Octo Player', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' }) };
    }
    if (String(url) === 'https://api.github.com/user/emails') {
      assert.equal(init.headers.Authorization, 'Bearer gho_test');
      return emailsReply();
    }
    throw new Error('unexpected ' + url);
  };
  const env = { GITHUB_CLIENT_ID: 'Ov23liTestClient01', GITHUB_CLIENT_SECRET: 'ghsecret0123456789abcdefghij' };
  const { loadConfig } = await import('../config.js');
  const { config } = loadConfig({ DEV: '1', SESSION_SECRET: 's'.repeat(48), ...env });
  app = await startApp({ env, github: createGithub({ ...config.github, fetchImpl }) });
});
after(() => app.close());

test('start redirects to GitHub with the email scope, the fixed callback and a state cookie', async () => {
  const c = client(app.base, { ip: '10.0.0.1' });
  const r = await c.req('GET', '/auth/github/start?return=%23%2Fchallenge');
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('client_id'), 'Ov23liTestClient01');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://api.systemdesigner.io/auth/github/callback');
  assert.equal(loc.searchParams.get('scope'), 'user:email');
  assert.match(loc.searchParams.get('state'), /^[A-Za-z0-9_-]{32}$/);
  const sc = r.setCookies.find((x) => x.startsWith('sd_gh_state='));
  assert.ok(sc, 'state cookie set');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/auth/github', 'Max-Age=600']) assert.ok(sc.includes(attr), attr);
});

test('callback without the state cookie never exchanges the code', async () => {
  profileCalls = [];
  const c = client(app.base, { ip: '10.0.0.2' });
  const r = await c.req('GET', '/auth/github/callback?code=good-code&state=' + 'a'.repeat(32));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `${SITE}/?signin=failed#/`);
  assert.equal(profileCalls.length, 0);
  assert.equal(c.jar.has('sd_session'), false);
});

test('callback with a different state is refused', async () => {
  profileCalls = [];
  const c = client(app.base, { ip: '10.0.0.3' });
  await c.req('GET', '/auth/github/start');
  const r = await c.req('GET', '/auth/github/callback?code=good-code&state=' + 'b'.repeat(32));
  assert.equal(r.headers.get('location'), `${SITE}/?signin=failed#/`);
  assert.equal(profileCalls.length, 0);
});

test('callback with the right state signs in and returns only to the site', async () => {
  profileCalls = [];
  const c = client(app.base, { ip: '10.0.0.4' });
  const s = await c.req('GET', '/auth/github/start?return=%23%2Fchallenge');
  const state = new URL(s.headers.get('location')).searchParams.get('state');
  const r = await c.req('GET', `/auth/github/callback?code=good-code&state=${state}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `${SITE}/?signin=github#/challenge`);
  assert.equal(profileCalls.length, 3);
  assert.ok(c.jar.has('sd_session'));
  assert.equal(c.jar.has('sd_gh_state'), false, 'state cookie cleared');
  const me = await c.req('GET', '/me');
  assert.equal(me.json.user.name, 'Octo Player');
  assert.deepEqual(me.json.user.providers, ['github']);
  assert.equal(me.json.user.avatar, 'https://avatars.githubusercontent.com/u/583231?v=4');
  // the same state cannot be used twice: the cookie is gone
  const again = await c.req('GET', `/auth/github/callback?code=good-code&state=${state}`);
  assert.equal(again.headers.get('location'), `${SITE}/?signin=failed#/`);
});

test('return and origin outside the allowlist fall back to the site home', async () => {
  for (const [ret, origin] of [['//evil.example', ''], ['https://evil.example/', ''], ['#/x"><script>', ''], ['#/challenge', 'https://evil.example']]) {
    const c = client(app.base, { ip: '10.0.0.5' });
    const q = new URLSearchParams({ return: ret, ...(origin ? { origin } : {}) });
    const s = await c.req('GET', '/auth/github/start?' + q);
    const state = new URL(s.headers.get('location')).searchParams.get('state');
    const r = await c.req('GET', `/auth/github/callback?code=good-code&state=${state}`);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin, SITE, `origin for ${ret} ${origin}`);
    assert.ok(loc.hash === '#/' || loc.hash === '#/challenge', `hash ${loc.hash}`);
  }
});

test('in DEV the local copies are allowed back, and a denied consent says cancelled', async () => {
  const c = client(app.base, { ip: '10.0.0.6' });
  const s = await c.req('GET', '/auth/github/start?origin=' + encodeURIComponent('http://127.0.0.1:8765'));
  const state = new URL(s.headers.get('location')).searchParams.get('state');
  const r = await c.req('GET', `/auth/github/callback?error=access_denied&state=${state}`);
  assert.equal(r.headers.get('location'), 'http://127.0.0.1:8765/?signin=cancelled#/');
});

test('a failed code exchange signs nobody in', async () => {
  const c = client(app.base, { ip: '10.0.0.7' });
  const s = await c.req('GET', '/auth/github/start');
  const state = new URL(s.headers.get('location')).searchParams.get('state');
  const r = await c.req('GET', `/auth/github/callback?code=bad-code&state=${state}`);
  assert.equal(r.headers.get('location'), `${SITE}/?signin=failed#/`);
  assert.equal(c.jar.has('sd_session'), false);
});

test('without a client secret GitHub is reported off and start goes back to the site', async () => {
  const off = await startApp({ env: { GITHUB_CLIENT_ID: 'Ov23liTestClient01', GITHUB_CLIENT_SECRET: '' } });
  try {
    const c = client(off.base);
    assert.equal((await c.req('GET', '/auth/config')).json.github, false);
    const r = await c.req('GET', '/auth/github/start');
    assert.equal(r.headers.get('location'), `${SITE}/?signin=unavailable#/`);
  } finally { await off.close(); }
});

const ghFetch = (emails) => async (url, init) => {
  const u = String(url);
  if (u.includes('access_token')) return { ok: true, json: async () => ({ access_token: 'gho_x' }) };
  if (u === 'https://api.github.com/user') return { ok: true, json: async () => ({ id: 7, login: 'p', name: 'P', avatar_url: '' }) };
  return emails(init);
};
const gh = (emails) => createGithub({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb', fetchImpl: ghFetch(emails) });

test('GitHub profile picks the primary verified address, lowercased and trimmed', async () => {
  const p = await gh(async () => ({ ok: true, json: async () => [
    { email: 'a@example.com', primary: true, verified: false },
    { email: 'b@example.com', primary: false, verified: true },
    { email: ' C@Example.com ', primary: true, verified: true },
  ] })).profile('good-code');
  assert.deepEqual(p, { id: '7', login: 'p', name: 'P', avatar: '', email: 'c@example.com' });
});

test('GitHub profile without a verified primary address, a failed call or a non-array gives an empty email', async () => {
  for (const emails of [
    async () => ({ ok: true, json: async () => [{ email: 'a@example.com', primary: true, verified: false }, { email: 'b@example.com', primary: false, verified: true }] }),
    async () => ({ ok: false, json: async () => [] }),
    async () => { throw new Error('down'); },
    async () => ({ ok: true, json: async () => ({ message: 'nope' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
  ]) {
    const p = await gh(emails).profile('good-code');
    assert.equal(p.id, '7');
    assert.equal(p.email, '');
  }
});

test('GitHub sign-in works when the emails call fails, and keeps the stored email', async () => {
  const keep = emailsReply;
  emailsReply = () => ({ ok: false, json: async () => ({}) });
  try {
    const c = client(app.base, { ip: '10.0.1.1' });
    const s = await c.req('GET', '/auth/github/start');
    const state = new URL(s.headers.get('location')).searchParams.get('state');
    const r = await c.req('GET', `/auth/github/callback?code=good-code&state=${state}`);
    assert.equal(r.headers.get('location'), `${SITE}/?signin=github#/`);
    const me = (await c.req('GET', '/me')).json.user;
    assert.equal(me.email, 'octo@example.com', 'an empty address leaves the stored one alone');
  } finally { emailsReply = keep; }
});

test('survey choice rides in the signed state cookie and is applied in the callback', async () => {
  assert.deepEqual(checkState(SECRET, ...(() => { const m = makeState(SECRET, { ret: '#/', origin: SITE, survey: true }, NOW); return [m.cookieValue, m.state, NOW]; })()), { ret: '#/', origin: SITE, survey: true });
  assert.equal(checkState(SECRET, ...(() => { const m = makeState(SECRET, { ret: '#/', origin: SITE, survey: false }, NOW); return [m.cookieValue, m.state, NOW]; })()).survey, false);
  const run = async (ip, query) => {
    const c = client(app.base, { ip });
    const s = await c.req('GET', '/auth/github/start' + query);
    const state = new URL(s.headers.get('location')).searchParams.get('state');
    await c.req('GET', `/auth/github/callback?code=good-code&state=${state}`);
    return c;
  };
  const on = await run('10.0.2.1', '?survey=1');
  const me = (await on.req('GET', '/me')).json.user;
  assert.equal(me.surveyOptIn, true);
  assert.equal(me.email, 'octo@example.com');
  assert.equal(app.db.user(app.db.raw.prepare('SELECT user_id AS u FROM identities WHERE provider = ?').get('github').u).surveyOptInAt, NOW);
  // a later sign-in with no choice leaves it on, survey=0 turns it off
  const same = await run('10.0.2.2', '');
  assert.equal((await same.req('GET', '/me')).json.user.surveyOptIn, true, 'no choice leaves it alone');
  const off = await run('10.0.2.3', '?survey=0');
  assert.equal((await off.req('GET', '/me')).json.user.surveyOptIn, false);
  // anything else is no choice
  const odd = await run('10.0.2.4', '?survey=yes');
  assert.equal((await odd.req('GET', '/me')).json.user.surveyOptIn, false);
});
