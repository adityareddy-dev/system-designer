// Google Identity Services ID tokens: RS256 signature against Google's published keys, then audience, issuer, expiry,
// a verified email, and the one-time nonce this service handed to the page (so a token taken from elsewhere is useless).
import { createPublicKey, verify as verifySig, timingSafeEqual } from 'node:crypto';

export const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const MAX_TOKEN = 4096;
const SKEW_SEC = 30;
const REFETCH_COOLDOWN_MS = 60_000;
// Keys past their cache time are still used while Google cannot be reached, but never longer than this.
const MAX_STALE_MS = 6 * 3600_000;
// After a failed fetch, wait before trying again: 5 s, doubling up to 5 minutes.
const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;

export class TokenError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function sameText(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function b64json(part) {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { throw new TokenError('malformed'); }
}

export function createGoogleVerifier({ clientId, jwksUrl = GOOGLE_JWKS, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 5000 }) {
  let keys = new Map();
  let expires = 0;        // when the cached keys should be fetched again
  let staleAfter = 0;     // when the cached keys may no longer be used at all
  let lastFetch = -Infinity;
  let retryAt = 0;        // no fetch before this after a failure
  let failures = 0;
  let inflight = null;

  async function fetchKeys() {
    if (inflight) return inflight;
    inflight = (async () => {
      lastFetch = now();
      try {
        const res = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new TokenError('keys-unavailable');
        const body = await res.json();
        const next = new Map();
        for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
          if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig')) continue;
          try { next.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' })); } catch { /* skip a broken key */ }
        }
        if (!next.size) throw new TokenError('keys-unavailable');
        const cc = /max-age=(\d+)/i.exec(res.headers?.get?.('cache-control') || '');
        const ttl = cc ? Math.min(Number(cc[1]), 86400) * 1000 : 3600_000;
        keys = next;
        expires = now() + ttl;
        staleAfter = expires + MAX_STALE_MS;
        failures = 0;
        retryAt = 0;
      } catch (e) {
        failures += 1;
        retryAt = now() + Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1));
        throw e instanceof TokenError ? e : new TokenError('keys-unavailable');
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }

  const canFetch = () => now() >= retryAt;

  async function keyFor(kid) {
    if (now() >= expires && canFetch()) {
      try { await fetchKeys(); } catch { /* fall back to the cached keys while they are not too old */ }
    }
    if (now() >= staleAfter) { keys = new Map(); throw new TokenError('keys-unavailable'); }
    if (keys.has(kid)) return keys.get(kid);
    // Google rotates keys: an unknown kid means fetch again, at most once a minute and never during a back-off.
    if (now() - lastFetch >= REFETCH_COOLDOWN_MS && canFetch()) {
      try { await fetchKeys(); } catch { /* fall through to unknown key */ }
      if (keys.has(kid)) return keys.get(kid);
    }
    throw new TokenError('unknown-key');
  }

  // nonce: the value this service gave the page for this sign-in. Returns { sub, name, givenName, picture } or throws TokenError.
  async function verify(credential, { nonce } = {}) {
    if (!clientId) throw new TokenError('not-configured');
    if (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 128) throw new TokenError('bad-nonce');
    if (typeof credential !== 'string' || credential.length > MAX_TOKEN) throw new TokenError('malformed');
    const parts = credential.split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p)) || !parts[0] || !parts[1]) throw new TokenError('malformed');
    const header = b64json(parts[0]);
    if (header?.alg !== 'RS256') throw new TokenError('bad-alg');
    if (typeof header.kid !== 'string' || !header.kid || header.kid.length > 128) throw new TokenError('malformed');
    const sig = Buffer.from(parts[2], 'base64url');
    if (sig.length < 128) throw new TokenError('bad-signature');
    const key = await keyFor(header.kid);
    const ok = verifySig('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, sig);
    if (!ok) throw new TokenError('bad-signature');

    const c = b64json(parts[1]);
    const t = Math.floor(now() / 1000);
    if (typeof c.aud !== 'string' || c.aud !== clientId) throw new TokenError('bad-audience');
    if (!ISSUERS.has(c.iss)) throw new TokenError('bad-issuer');
    if (typeof c.exp !== 'number' || c.exp + SKEW_SEC <= t) throw new TokenError('expired');
    if (typeof c.iat === 'number' && c.iat - SKEW_SEC > t) throw new TokenError('not-yet-valid');
    if (typeof c.nbf === 'number' && c.nbf - SKEW_SEC > t) throw new TokenError('not-yet-valid');
    if (!(c.email_verified === true || c.email_verified === 'true')) throw new TokenError('email-not-verified');
    if (typeof c.nonce !== 'string' || !sameText(c.nonce, nonce)) throw new TokenError('bad-nonce');
    if (typeof c.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(c.sub)) throw new TokenError('malformed');
    return {
      sub: c.sub,
      name: typeof c.name === 'string' ? c.name : '',
      givenName: typeof c.given_name === 'string' ? c.given_name : '',
      picture: typeof c.picture === 'string' ? c.picture : '',
    };
  }

  return { verify, _fetchKeys: fetchKeys };
}
