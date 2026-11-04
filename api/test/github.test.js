// GitHub sign-in: the state bound to a signed short-lived cookie, the fixed redirect allowlist, and the callback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, checkState, createGithub } from '../github.js';
import { startApp, client, SITE, NOW } from './helpers.js';

const SECRET = 'q'.repeat(48);

test('state cookie: genuine, matching and unexpired passes', () => {
  const { state, cookieValue } = makeState(SECRET, { ret: '#/challenge', origin: SITE }, NOW);
  assert.deepEqual(checkState(SECRET, cookieValue, state, NOW + 1000), { ret: '#/challenge', origin: SITE });
});

test('state cookie: wrong state, tampering, expiry or another secret fail', () => {
  const { state, cookieValue } = makeState(SECRET, { ret: '#/', origin: SITE }, NOW);
  const other = makeState(SECRET, { ret: '#/', origin: SITE }, NOW);
  assert.equal(checkState(SECRET, cookieValue, other.state, NOW), null, 'state from another flow');
  assert.equal(checkState(SECRET, other.cookieValue, state, NOW), null, 'cookie from another flow');
  const [body, sig] = cookieValue.split('.');
  const forged = Buffer.from(JSON.stringify({ s: state, e: NOW + 9e9, r: '#/', o: 'https://evil.example' })).toString('base64url');
  assert.equal(checkState(SECRET, `${forged}.${sig}`, state, NOW), null, 'edited body');
  assert.equal(checkState(SECRET, `${body}.${sig.slice(0, -2)}AA`, state, NOW), null, 'edited signature');
  assert.equal(checkState(SECRET, cookieValue, state, NOW + 601_000), null, 'expired after 10 minutes');
  assert.equal(checkState('z'.repeat(48), cookieValue, state, NOW), null, 'other secret');
  assert.equal(checkState(SECRET, undefined, state, NOW), null, 'no cookie');
  assert.equal(checkState(SECRET, cookieValue, '', NOW), null, 'no state');
});

let app;
let profileCalls = [];
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
    throw new Error('unexpected ' + url);
  };
  const env = { GITHUB_CLIENT_ID: 'Ov23liTestClient01', GITHUB_CLIENT_SECRET: 'ghsecret0123456789abcdefghij' };
  const { loadConfig } = await import('../config.js');
  const { config } = loadConfig({ DEV: '1', SESSION_SECRET: 's'.repeat(48), ...env });
  app = await startApp({ env, github: createGithub({ ...config.github, fetchImpl }) });
});
after(() => app.close());

test('start redirects to GitHub with no scope, the fixed callback and a state cookie', async () => {
  const c = client(app.base, { ip: '10.0.0.1' });
  const r = await c.req('GET', '/auth/github/start?return=%23%2Fchallenge');
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('client_id'), 'Ov23liTestClient01');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://api.systemdesigner.io/auth/github/callback');
  assert.equal(loc.searchParams.has('scope'), false);
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
  assert.equal(profileCalls.length, 2);
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
