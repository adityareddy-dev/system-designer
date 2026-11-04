// The sign-in service's routes: providers, sessions, account, progress sync, replayed results and leaderboards (API.md has the list).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, readJson, parseCookies, cookie, clientIp, ipKey, sendJson, redirect } from './http.js';
import { LIMITS } from './ratelimit.js';
import { nameProblem } from './names.js';
import { TokenError } from './google.js';
import { makeState, checkState, STATE_COOKIE, STATE_TTL_SEC } from './github.js';
import { ReplayError, NOT_LISTED, prepare } from './replay-core.js';
import { sanitizeProgress, mergeProgress, emptyProgress } from '../account/merge.js';

export const SESSION_COOKIE = 'sd_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const NONCE_COOKIE = 'sd_g_nonce';
export const NONCE_TTL_MS = 10 * 60 * 1000;
const NONCE_RE = /^[A-Za-z0-9_-]{32}$/;
const HOUR = 3600 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RETURN_RE = /^#\/[A-Za-z0-9/_-]{0,100}$/;
const AVATAR_HOSTS = [/^lh[3-6]\.googleusercontent\.com$/, /^avatars\.githubusercontent\.com$/];
const BODY = { small: 8 * 1024, progress: 256 * 1024, results: 32 * 1024 };
const TOP_N = 50;

// Display names: printable, no markup characters, 1 to 24 characters. Anything that is not a string is no name at all.
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  const t = s.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>"'`\\]/g, '').replace(/[\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, 24).join('').trim();
}

// A name that is reserved or rude is no name at all when it comes from a sign-in provider.
const safeName = (n) => (n && !nameProblem(n) ? n : '');

// A provider's display name that lost characters to cleaning (markup, quotes, control marks) would read oddly, so it becomes "Player".
const STRIP_RE = /[\u0000-\u001f\u007f-\u009f<>"'`\\\u200b-\u200f\u2028-\u202e\u2066-\u2069]/;
export function providerName(raw) {
  if (typeof raw !== 'string') return 'Player';
  if (STRIP_RE.test(raw.normalize('NFKC'))) return 'Player';
  return safeName(cleanName(raw)) || 'Player';
}

export function cleanAvatar(url) {
  if (typeof url !== 'string' || url.length > 400) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && AVATAR_HOSTS.some((re) => re.test(u.hostname)) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);

// A daily board takes scores only while that date is "today" somewhere on Earth: from when the first time zone (UTC+14)
// reaches it until the last one (UTC-12) leaves it, plus an hour for a day finished just after midnight.
export function dailyOpen(date, t) {
  const start = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(start) && t >= start - 14 * HOUR && t < start + 24 * HOUR + 12 * HOUR + HOUR;
}

export function createApp({ config, db, google, github, replayer, game, limiter, now = Date.now, log = () => {} }) {
  // Secure even in DEV: browsers keep Secure cookies from http://localhost and http://127.0.0.1.
  const secure = true;
  const hashToken = (t) => createHmac('sha256', config.sessionSecret).update('session\n' + t).digest('hex');
  const nonceMac = (body) => createHmac('sha256', config.sessionSecret).update('g-nonce\n' + body).digest('base64url');
  const usedNonces = new Map();   // nonce -> expiry: each one signs in once
  const known = { problemIds: game.problemIds, lessonIds: game.lessonIds };

  const publicConfig = () => ({
    google: config.google.clientId ? { clientId: config.google.clientId } : null,
    github: config.github.enabled,
    fake: config.fake,
  });

  // A tiny page the site frames to learn whether the service answers. A frame that cannot load leaves no error in the
  // page's console (a failed fetch would), so the game stays silent when the service is down. It posts only public settings.
  const probeScript = `parent.postMessage(${JSON.stringify({ sd: 'systemdesigner-api', v: 1, config: publicConfig() }).replace(/</g, '\\u003c')}, '*');`;
  const probeHtml = `<!doctype html><html><head><meta charset="utf-8"><title>System Designer sign-in check</title><script>${probeScript}</script></head><body></body></html>`;
  const probeCsp = `default-src 'none'; script-src 'sha256-${createHash('sha256').update(probeScript).digest('base64')}'; frame-ancestors ${config.sites.join(' ')}`;

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && config.sites.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
  }

  function limit(group, ip, userId) {
    const g = LIMITS[group];
    let wait = Math.max(
      g.ip ? limiter.take(`${group}:ip:${ipKey(ip)}`, g.ip[0], g.ip[1]) : 0,
      g.user && userId ? limiter.take(`${group}:u:${userId}`, g.user[0], g.user[1]) : 0,
    );
    // the shared cap counts only requests that passed their own limits, so one address cannot use it up
    if (!wait && g.global) wait = limiter.take(`${group}:global`, g.global[0], g.global[1]);
    if (wait) throw new HttpError(429, 'slow-down', 'Too many requests. Try again shortly.', { 'Retry-After': String(wait) });
  }

  function sessionOf(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token || !TOKEN_RE.test(token)) return null;
    const hash = hashToken(token);
    const userId = db.sessionUser(hash, now());
    return userId ? { userId, hash } : null;
  }

  function publicUser(id) {
    const u = db.user(id);
    if (!u) return null;
    return { name: u.name, avatar: u.avatar, providers: u.providers, since: utcDate(u.createdAt) };
  }

  // Creates a session for the user (dropping the caller's old one) and returns its Set-Cookie line.
  function startSession(userId, old) {
    if (old) db.dropSession(old.hash);
    const token = randomBytes(32).toString('base64url');
    db.addSession(hashToken(token), userId, now(), SESSION_TTL_MS);
    return cookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS / 1000, secure });
  }
  const endSessionCookie = () => cookie(SESSION_COOKIE, '', { maxAge: 0, secure });

  // Google sign-in nonce: a random value the page puts in its token request, bound to this browser by a signed, httpOnly,
  // 10-minute cookie. The token must carry the same value, and each value works once.
  function newNonce() {
    const nonce = randomBytes(24).toString('base64url');
    const body = `${nonce}.${now() + NONCE_TTL_MS}`;
    return { nonce, cookieValue: `${body}.${nonceMac(body)}` };
  }
  function nonceFromCookie(value) {
    if (typeof value !== 'string' || value.length > 200) return null;
    const parts = value.split('.');
    if (parts.length !== 3 || !NONCE_RE.test(parts[0]) || !/^\d{1,16}$/.test(parts[1])) return null;
    const mac = Buffer.from(parts[2]);
    const want = Buffer.from(nonceMac(`${parts[0]}.${parts[1]}`));
    if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
    const exp = Number(parts[1]);
    if (exp <= now() || usedNonces.has(parts[0])) return null;
    return { nonce: parts[0], exp };
  }
  function spendNonce(n) {
    const t = now();
    if (usedNonces.size > 20000) for (const [k, exp] of usedNonces) if (exp <= t) usedNonces.delete(k);
    usedNonces.set(n.nonce, n.exp);
  }
  const nonceCookie = (v, maxAge) => cookie(NONCE_COOKIE, v, { maxAge, path: '/auth/google', secure });

  function signIn(provider, subject, profile, sess) {
    const { userId } = db.signIn({ provider, subject, name: providerName(profile.name), avatar: cleanAvatar(profile.avatar), currentUserId: sess?.userId ?? null }, now());
    return { userId, setCookie: startSession(userId, sess) };
  }

  const needUser = (sess) => { if (!sess) throw new HttpError(401, 'signed-out', 'Sign in first.'); return sess.userId; };

  // Where a GitHub sign-in may send the player back: the site (plus local copies in DEV) and a plain in-app route.
  function backTo(origin, ret, status) {
    const site = config.sites.includes(origin) ? origin : config.sites[0];
    const hash = RETURN_RE.test(ret || '') ? ret : '#/';
    return `${site}/?signin=${status}${hash}`;
  }

  const routes = {
    'GET /health': async () => [200, { ok: true }],

    'GET /auth/config': async () => [200, publicConfig()],

    'GET /probe': async ({ res }) => {
      res.removeHeader('X-Frame-Options');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': probeCsp, 'Content-Length': Buffer.byteLength(probeHtml) });
      res.end(probeHtml);
    },

    'POST /auth/google/nonce': async ({ req, ip }) => {
      limit('auth', ip);
      if (!config.google.clientId) throw new HttpError(404, 'not-configured', 'Google sign-in is not set up.');
      await readJson(req, BODY.small);
      const { nonce, cookieValue } = newNonce();
      return [200, { nonce }, { 'Set-Cookie': nonceCookie(cookieValue, NONCE_TTL_MS / 1000) }];
    },

    'POST /auth/google': async ({ req, ip, sess }) => {
      limit('auth', ip);
      if (!config.google.clientId) throw new HttpError(404, 'not-configured', 'Google sign-in is not set up.');
      const body = await readJson(req, BODY.small);
      const clear = nonceCookie('', 0);
      const n = nonceFromCookie(parseCookies(req.headers.cookie)[NONCE_COOKIE]);
      if (!n) throw new HttpError(401, 'bad-token', 'Google sign-in did not go through. Try again.', { 'Set-Cookie': clear });
      let p;
      try { p = await google.verify(body.credential, { nonce: n.nonce }); } catch (e) {
        if (e instanceof TokenError) throw new HttpError(e.code === 'keys-unavailable' ? 503 : 401, 'bad-token', 'Google sign-in did not go through. Try again.');
        throw e;
      }
      spendNonce(n);
      const { userId, setCookie } = signIn('google', p.sub, { name: p.givenName || p.name, avatar: p.picture }, sess);
      return [200, { user: publicUser(userId) }, { 'Set-Cookie': [clear, setCookie] }];
    },

    'GET /auth/github/start': async ({ res, url, ip }) => {
      limit('auth', ip);
      const origin = url.searchParams.get('origin') || config.sites[0];
      const ret = url.searchParams.get('return') || '#/';
      if (!config.github.enabled) return redirect(res, backTo(origin, ret, 'unavailable'));
      const { state, cookieValue } = makeState(config.sessionSecret, { ret: RETURN_RE.test(ret) ? ret : '#/', origin: config.sites.includes(origin) ? origin : config.sites[0] }, now());
      return redirect(res, github.authorizeUrl(state), {
        'Set-Cookie': cookie(STATE_COOKIE, cookieValue, { maxAge: STATE_TTL_SEC, path: '/auth/github', secure }),
        'Cache-Control': 'no-store',
      });
    },

    'GET /auth/github/callback': async ({ req, res, url, ip, sess }) => {
      limit('auth', ip);
      const clear = cookie(STATE_COOKIE, '', { maxAge: 0, path: '/auth/github', secure });
      const st = checkState(config.sessionSecret, parseCookies(req.headers.cookie)[STATE_COOKIE], url.searchParams.get('state'), now());
      if (!st) return redirect(res, backTo(config.sites[0], '#/', 'failed'), { 'Set-Cookie': clear });
      if (url.searchParams.get('error') || !url.searchParams.get('code')) return redirect(res, backTo(st.origin, st.ret, 'cancelled'), { 'Set-Cookie': clear });
      if (!config.github.enabled) return redirect(res, backTo(st.origin, st.ret, 'unavailable'), { 'Set-Cookie': clear });
      let p;
      try { p = await github.profile(url.searchParams.get('code')); } catch {
        return redirect(res, backTo(st.origin, st.ret, 'failed'), { 'Set-Cookie': clear });
      }
      const { setCookie } = signIn('github', p.id, { name: p.name || p.login, avatar: p.avatar }, sess);
      return redirect(res, backTo(st.origin, st.ret, 'github'), { 'Set-Cookie': [clear, setCookie] });
    },

    'POST /auth/fake': async ({ req, ip, sess }) => {
      if (!config.fake) throw new HttpError(404, 'not-found', 'Not found.');
      limit('auth', ip);
      const body = await readJson(req, BODY.small);
      const id = typeof body.id === 'string' ? body.id : '';
      if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new HttpError(400, 'bad-input', 'id must be 1 to 32 lowercase letters, digits or dashes.');
      const { userId, setCookie } = signIn('fake', id, { name: safeName(cleanName(body.name)) || 'Test player ' + id, avatar: null }, sess);
      return [200, { user: publicUser(userId) }, { 'Set-Cookie': setCookie }];
    },

    'POST /auth/signout': async ({ req, ip, sess }) => {
      limit('account', ip);
      await readJson(req, BODY.small);
      if (sess) db.dropSession(sess.hash);
      return [200, { ok: true }, { 'Set-Cookie': endSessionCookie() }];
    },

    'GET /me': async ({ sess }) => [200, { user: sess ? publicUser(sess.userId) : null }],

    'PATCH /me': async ({ req, ip, sess }) => {
      const userId = needUser(sess);
      limit('account', ip, userId);
      const body = await readJson(req, BODY.small);
      if (typeof body.name === 'string' && /[<>]/.test(body.name)) throw new HttpError(400, 'bad-name', 'Names cannot contain < or >.');
      const name = cleanName(body.name);
      if (!name) throw new HttpError(400, 'bad-name', 'Pick a name of 1 to 24 letters.');
      const bad = nameProblem(name);
      if (bad === 'reserved') throw new HttpError(400, 'reserved-name', 'That name is kept for the project. Try another one.');
      if (bad) throw new HttpError(400, 'rude-name', 'Please pick a friendlier name.');
      if (db.nameTaken(name, userId)) throw new HttpError(409, 'name-taken', 'That name is already taken. Try another one.');
      db.setName(userId, name);
      return [200, { user: publicUser(userId) }];
    },

    'DELETE /me': async ({ ip, sess }) => {
      const userId = needUser(sess);
      limit('account', ip, userId);
      db.deleteUser(userId);
      log(`account deleted (${utcDate(now())})`);
      return [200, { ok: true }, { 'Set-Cookie': endSessionCookie() }];
    },

    'GET /progress': async ({ ip, sess }) => {
      const userId = needUser(sess);
      limit('progress', ip, userId);
      return [200, { progress: sanitizeProgress(db.progress(userId) || emptyProgress(), known) }];
    },

    'PUT /progress': async ({ req, ip, sess }) => {
      const userId = needUser(sess);
      limit('progress', ip, userId);
      const body = await readJson(req, BODY.progress);
      if (!body.progress || typeof body.progress !== 'object') throw new HttpError(400, 'bad-input', 'Send { progress }.');
      const merged = db.tx(() => {
        const m = mergeProgress(db.progress(userId) || emptyProgress(), body.progress, known);
        db.putProgress(userId, m, now());
        return m;
      });
      return [200, { progress: merged }];
    },

    'POST /results': async ({ req, ip, sess }) => {
      const userId = needUser(sess);
      limit('results', ip, userId);
      const body = await readJson(req, BODY.results);
      // cheap checks first, here: a bad, closed or copied design never waits in the scorer's queue
      let pre;
      try { pre = await prepare(body.payload); } catch (e) {
        if (!(e instanceof ReplayError)) throw e;
        if (NOT_LISTED.has(e.code)) return [200, { listed: false, reason: e.code, message: e.message }];
        throw new HttpError(422, e.code, e.message);
      }
      if (pre.sc.kind === 'daily' && !dailyOpen(pre.sc.date, now())) throw new HttpError(422, 'closed', 'That daily challenge is closed for scores.');
      let r;
      try { r = await replayer.run(body.payload, { key: userId, address: ipKey(ip), daily: pre.sc.kind === 'daily' }); } catch (e) {
        if (!(e instanceof ReplayError)) throw e;
        if (e.code === 'scoring') throw new HttpError(429, 'scoring', e.message, { 'Retry-After': '5' });
        if (e.code === 'busy' || e.code === 'timeout' || e.code === 'stopping') throw new HttpError(503, e.code, e.message, { 'Retry-After': '30' });
        if (NOT_LISTED.has(e.code)) return [200, { listed: false, reason: e.code, message: e.message }];
        throw new HttpError(422, e.code, e.message);
      }
      if (r.kind === 'daily' && !dailyOpen(r.date, now())) throw new HttpError(422, 'closed', 'That daily challenge is closed for scores.');
      const rec = db.recordScore({ board: r.board, userId, score: r.score, stars: r.stars, passed: r.passed, verified: true }, now());
      const mine = db.rankOf(r.board, userId);
      return [200, {
        listed: true, board: r.board, kind: r.kind, date: r.date, problemId: r.problemId,
        score: r.score, stars: r.stars, passed: r.passed, replayed: true, clientScore: r.clientScore,
        improved: rec.improved, best: { score: rec.best.score, stars: rec.best.stars },
        rank: mine?.rank ?? null, total: db.count(r.board),
      }];
    },

    'POST /report': async ({ req, ip, sess }) => {
      const userId = needUser(sess);
      limit('report', ip, userId);
      const body = await readJson(req, BODY.small);
      const target = Number(body.uid);
      if (!Number.isSafeInteger(target) || target < 1 || !db.user(target)) throw new HttpError(404, 'no-player', 'No such player.');
      if (target === userId) throw new HttpError(400, 'self-report', 'That is you.');
      const reason = ['name', 'cheating', 'other'].includes(body.reason) ? body.reason : 'name';
      db.report(userId, target, reason, now());
      return [200, { ok: true }];
    },

    'GET /leaderboard': async ({ url, ip, sess }) => {
      limit('leaderboard', ip);
      const problem = url.searchParams.get('problem');
      const daily = url.searchParams.get('daily');
      let board, info;
      if (problem && !daily) {
        if (!game.problemIds.has(problem)) throw new HttpError(404, 'unknown-problem', 'No such problem.');
        board = 'p:' + problem;
        info = { kind: 'problem', problemId: problem, date: null };
      } else if (daily && !problem) {
        if (!DATE_RE.test(daily) || !game.isDateStr(daily)) throw new HttpError(400, 'bad-date', 'Use daily=YYYY-MM-DD.');
        board = 'd:' + daily;
        info = { kind: 'daily', problemId: game.dailyFor(daily, game.problems).problemId, date: daily };
      } else throw new HttpError(400, 'bad-input', 'Ask for ?problem=ID or ?daily=YYYY-MM-DD.');
      const me = sess?.userId ?? null;
      const top = db.top(board, TOP_N).map(({ userId, verified, ...row }) => ({ ...row, uid: userId, replayed: verified, at: new Date(row.at).toISOString(), you: userId === me }));
      const mine = me ? db.rankOf(board, me) : null;
      return [200, {
        board, ...info, total: db.count(board), top,
        you: mine ? { rank: mine.rank, score: mine.score, stars: mine.stars, passed: mine.passed, replayed: mine.verified } : null,
      }];
    },
  };

  const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    cors(req, res);
    const ip = clientIp(req);
    try {
      let url;
      try { url = new URL(req.url, 'http://api.local'); } catch { throw new HttpError(400, 'bad-url', 'Bad URL.'); }
      if (req.url.length > 2048) throw new HttpError(414, 'too-long', 'URL too long.');
      limit('all', ip);
      const origin = req.headers.origin;
      if (req.method === 'OPTIONS') {
        if (!origin || !config.sites.includes(origin)) throw new HttpError(403, 'origin', 'Origin not allowed.');
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      // Browsers always send Origin on these; a foreign page never gets to change anything.
      if (MUTATING.has(req.method) && origin && !config.sites.includes(origin)) throw new HttpError(403, 'origin', 'Origin not allowed.');
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) {
        const any = Object.keys(routes).some((k) => k.endsWith(' ' + url.pathname));
        throw new HttpError(any ? 405 : 404, any ? 'method' : 'not-found', any ? 'Method not allowed.' : 'Not found.');
      }
      const sess = sessionOf(req);
      const out = await route({ req, res, url, ip, sess });
      if (Array.isArray(out) && !res.headersSent) sendJson(res, out[0], out[1], out[2] || {});
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) { sendJson(res, e.status, { error: e.code, message: e.message }, e.headers); return; }
      log(`error ${req.method} ${String(req.url).split('?')[0]}: ${e?.code || e?.name || 'Error'}`);
      sendJson(res, 500, { error: 'server', message: 'Something went wrong.' });
    }
  };
}
