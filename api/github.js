// GitHub OAuth web flow (scope user:email): authorize URL, a state bound to a signed short-lived cookie, code exchange, public profile and primary verified email.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanEmail } from './google.js';

const AUTHORIZE = 'https://github.com/login/oauth/authorize';
const TOKEN = 'https://github.com/login/oauth/access_token';
const USER = 'https://api.github.com/user';
const EMAILS = 'https://api.github.com/user/emails';
export const STATE_COOKIE = 'sd_gh_state';
export const STATE_TTL_SEC = 600;

const mac = (secret, text) => createHmac('sha256', secret).update('gh-state\n' + text).digest('base64url');

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Cookie value: base64url(JSON {s, e, r, o}).hmac: state, expiry (ms), return hash, site origin.
export function makeState(secret, { ret, origin }, now = Date.now()) {
  const state = randomBytes(24).toString('base64url');
  const body = Buffer.from(JSON.stringify({ s: state, e: now + STATE_TTL_SEC * 1000, r: ret, o: origin })).toString('base64url');
  return { state, cookieValue: body + '.' + mac(secret, body) };
}

// Returns { ret, origin } when the cookie is genuine, unexpired and carries the same state as the query; else null.
export function checkState(secret, cookieValue, queryState, now = Date.now()) {
  if (typeof cookieValue !== 'string' || typeof queryState !== 'string' || cookieValue.length > 2048 || !/^[A-Za-z0-9_-]{20,64}$/.test(queryState)) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const body = cookieValue.slice(0, dot);
  if (!same(cookieValue.slice(dot + 1), mac(secret, body))) return null;
  let v;
  try { v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!v || typeof v.s !== 'string' || typeof v.e !== 'number' || v.e <= now) return null;
  if (!same(v.s, queryState)) return null;
  return { ret: typeof v.r === 'string' ? v.r : '#/', origin: typeof v.o === 'string' ? v.o : '' };
}

export function createGithub({ clientId, clientSecret, redirectUri, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  function authorizeUrl(state) {
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'user:email', state, allow_signup: 'true' });
    return `${AUTHORIZE}?${q}`;
  }

  const headers = (token) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'system-designer-api', 'X-GitHub-Api-Version': '2022-11-28' });

  // The primary address GitHub has verified, or '' when there is none or the call fails. Sign-in never depends on it.
  async function primaryEmail(token) {
    try {
      const r = await fetchImpl(EMAILS, { signal: AbortSignal.timeout(timeoutMs), headers: headers(token) });
      if (!r.ok) return '';
      const list = await r.json();
      if (!Array.isArray(list)) return '';
      const hit = list.find((x) => x && x.primary === true && x.verified === true && typeof x.email === 'string');
      return hit ? cleanEmail(hit.email) : '';
    } catch { return ''; }
  }

  // Exchanges the one-time code, reads the profile and primary verified email, and forgets the token.
  async function profile(code) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(code)) throw new Error('bad-code');
    const tr = await fetchImpl(TOKEN, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'system-designer-api' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString(),
    });
    if (!tr.ok) throw new Error('token-failed');
    const tok = await tr.json();
    if (!tok || typeof tok.access_token !== 'string' || !tok.access_token) throw new Error('token-failed');
    const ur = await fetchImpl(USER, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: headers(tok.access_token),
    });
    if (!ur.ok) throw new Error('user-failed');
    const u = await ur.json();
    if (!u || !Number.isSafeInteger(u.id) || u.id <= 0) throw new Error('user-failed');
    const email = await primaryEmail(tok.access_token);
    return {
      id: String(u.id),
      login: typeof u.login === 'string' ? u.login : '',
      name: typeof u.name === 'string' ? u.name : '',
      avatar: typeof u.avatar_url === 'string' ? u.avatar_url : '',
      email,
    };
  }

  return { authorizeUrl, profile };
}
