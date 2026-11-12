// Optional accounts: asks the sign-in service what is set up, keeps progress in sync, and sends finished days to the leaderboards.
// With no service (or an unreachable one) it stays silent and the game works exactly as without it.
import { apiBase, previewHosted } from './config.js';
import { sanitizeProgress, mergeProgress } from './merge.js';
import { createAccountUi } from './ui.js';

const DAILY_SEED = /^daily-(\d{4}-\d{2}-\d{2})$/;
const RETURN_RE = /^#\/[A-Za-z0-9/_-]{0,100}$/;
const NUDGE_KEY = 'accountNudged';
const SIGNIN_NOTES = {
  github: null,
  cancelled: { text: 'GitHub sign-in was cancelled.', level: 'info' },
  failed: { text: 'Sign-in did not go through. You can keep playing without it.', level: 'warn' },
  unavailable: { text: 'That sign-in option is not set up yet.', level: 'info' },
};

const HOUR = 3600 * 1000;
// The same window as the service: a daily board is open while its date is "today" in some time zone (UTC+14 to UTC-12),
// plus an hour for a day finished just after midnight.
function dailyOpen(date, t = Date.now()) {
  const start = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(start) && t >= start - 14 * HOUR && t < start + 37 * HOUR;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createAccount(ctx) {
  const { bus, store } = ctx;
  const base = apiBase();
  // A stand-in for the service, only for ?preview=hosted on a page with no service: it signs in locally so the gate can be seen and passed.
  const preview = !base && previewHosted();
  const PREVIEW_KEY = 'sd.preview.user';
  const S = { status: base ? 'checking' : preview ? 'ready' : 'off', config: preview ? { google: null, github: true, fake: false, preview: true } : null, user: null, sync: 'idle', syncedAt: 0, lastJson: '', lastResult: null };
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  const toast = (text, level = 'info', ms) => bus.emit('toast', { text, level, ms });

  async function call(method, path, body, timeout = 8000) {
    if (preview) throw Object.assign(new Error('Not available in the preview.'), { status: 0, code: 'preview' });
    const init = { method, credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeout);
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const res = await fetch(base + path, init);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const e = new Error(data?.message || 'The account service did not answer.');
      e.status = res.status;
      e.code = data?.error || 'http';
      throw e;
    }
    return data;
  }

  const providers = () => (S.config ? { google: !!S.config.google, github: S.config.github, fake: S.config.fake, preview } : { google: false, github: false, fake: false, preview: false });
  const available = () => S.status === 'ready' && !!S.config && (S.config.google || S.config.github || S.config.fake);
  const snapshot = () => ({ status: S.status, available: available(), user: S.user, sync: S.sync, syncedAt: S.syncedAt, providers: providers() });
  const emit = () => bus.emit('account', snapshot());

  // ---- progress sync: upload what is here, keep the merged answer, and never drop anything played meanwhile
  function local() {
    const ex = ctx.progress?.exportAll?.() || {};
    return { problems: ex.problems || {}, lessons: ex.lessons || {}, bests: store.get('bests', null) || {} };
  }
  function applyLocal(fromServer) {
    const here = local();
    const next = mergeProgress(here, fromServer);
    if (JSON.stringify(sanitizeProgress(here)) !== JSON.stringify(next)) {
      store.set('bests', next.bests);
      ctx.progress?.importAll?.({ app: 'system-designer', v: 1, problems: next.problems, lessons: next.lessons }, { preserveInterviews: true });
    }
    S.lastJson = JSON.stringify(sanitizeProgress(local()));
  }

  let syncing = null;
  let again = false;
  let timer = 0;
  function syncSoon(ms = 2000) {
    clearTimeout(timer);
    if (S.user) timer = setTimeout(() => { syncNow(false); }, ms);
  }
  function syncNow(force) {
    if (!S.user) return Promise.resolve();
    if (syncing) { again = true; return syncing; }
    const snap = sanitizeProgress(local());
    if (!force && JSON.stringify(snap) === S.lastJson) return Promise.resolve();
    if (preview) { S.lastJson = JSON.stringify(snap); S.sync = 'ok'; S.syncedAt = Date.now(); emit(); return Promise.resolve(); }
    S.sync = 'syncing';
    emit();
    syncing = (async () => {
      try {
        const r = await call('PUT', '/progress', { progress: snap }, 12000);
        applyLocal(r.progress);
        S.sync = 'ok';
        S.syncedAt = Date.now();
      } catch (e) {
        if (e.status === 401) S.user = null;
        S.sync = 'failed';
      } finally {
        syncing = null;
        emit();
        if (again) { again = false; syncSoon(1000); }
      }
    })();
    return syncing;
  }

  // ---- sign in and out
  async function signedIn(user, how) {
    S.user = user || null;
    S.sync = 'idle';
    emit();
    if (S.user) {
      if (how !== 'quiet') toast(`Signed in as ${S.user.name}. Your progress now follows you.`, 'ok', 3600);
      await syncNow(true);
    }
  }

  const api = {
    ready,
    state: snapshot,
    available,
    isSignedIn: () => !!S.user,
    user: () => S.user,
    displayName: () => S.user?.name || '',
    googleClientId: () => S.config?.google || null,
    lastResult: () => S.lastResult,

    // A fresh one-time value for Google's token request; the service checks the token carries it.
    async googleNonce() {
      const r = await call('POST', '/auth/google/nonce', {});
      return typeof r?.nonce === 'string' ? r.nonce : null;
    },
    async signInWithGoogle(credential, surveyOptIn) {
      const r = await call('POST', '/auth/google', typeof surveyOptIn === 'boolean' ? { credential, surveyOptIn } : { credential });
      await signedIn(r.user);
      return r.user;
    },
    githubUrl(surveyOptIn) {
      const path = location.hash.split('?')[0];
      const ret = RETURN_RE.test(path) ? path : '#/';
      const q = { return: ret, origin: location.origin };
      if (typeof surveyOptIn === 'boolean') q.survey = surveyOptIn ? '1' : '0';
      return `${base}/auth/github/start?${new URLSearchParams(q)}`;
    },
    isPreview: () => preview,
    async signInPreview(provider, surveyOptIn = false) {
      const user = { name: 'Preview player', avatar: null, providers: [provider === 'github' ? 'github' : 'google'], email: 'player@example.com', surveyOptIn: !!surveyOptIn };
      try { sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(user)); } catch { /* keep going */ }
      await signedIn(user);
      return user;
    },
    async signInFake(id = 'tester', name = 'Test player', surveyOptIn) {
      const r = await call('POST', '/auth/fake', typeof surveyOptIn === 'boolean' ? { id, name, surveyOptIn } : { id, name });
      await signedIn(r.user);
      return r.user;
    },
    async signOut() {
      clearTimeout(timer);
      if (preview) { try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ } }
      try { await call('POST', '/auth/signout', {}); } catch { /* the cookie ends anyway when it expires */ }
      S.user = null;
      S.sync = 'idle';
      S.lastJson = '';
      emit();
      toast('Signed out. Your progress stays on this device.', 'info');
    },
    async deleteAccount() {
      if (preview) { try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ } } else await call('DELETE', '/me');
      clearTimeout(timer);
      S.user = null;
      S.sync = 'idle';
      S.lastJson = '';
      emit();
      toast('Account deleted. Everything about it is gone from the server.', 'ok', 4200);
    },
    async rename(name) {
      const r = preview ? { user: { ...S.user, name } } : await call('PATCH', '/me', { name });
      S.user = r.user;
      if (preview) { try { sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(S.user)); } catch { /* ignore */ } }
      emit();
      return r.user;
    },
    // The player turns survey and product update emails on or off. Saved at once.
    async setSurveyOptIn(on) {
      const surveyOptIn = !!on;
      const r = preview ? { user: { ...S.user, surveyOptIn } } : await call('PATCH', '/me', { surveyOptIn });
      S.user = r.user;
      if (preview) { try { sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(S.user)); } catch { /* ignore */ } }
      emit();
      return r.user;
    },
    syncNow: () => syncNow(true),
    report: (uid, reason = 'name') => call('POST', '/report', { uid, reason }),
    leaderboard({ problem, daily }) {
      if (preview) return Promise.resolve({ top: [], total: 0 });
      const q = daily ? `daily=${encodeURIComponent(daily)}` : `problem=${encodeURIComponent(problem)}`;
      return call('GET', '/leaderboard?' + q);
    },
  };

  // ---- finished days go to the leaderboards (the service replays them and keeps its own score)
  // The scorer takes one result per player at a time: wait for the one before, a few times at most.
  async function sendResult(payload) {
    for (let i = 0; ; i++) {
      try { return await call('POST', '/results', { payload }, 20000); } catch (e) {
        if (e?.status !== 429 || e.code !== 'scoring' || i >= 3) throw e;
        await sleep(2500 * (i + 1));
      }
    }
  }
  async function postResult({ mode, problemId, seed, result }) {
    if (preview || !S.user || !result?.graph || !problemId || !['practice', 'challenge', 'beat'].includes(mode)) return;
    const m = DAILY_SEED.exec(String(seed));
    if (!(seed === 'practice' || (m && dailyOpen(m[1])))) return;
    const share = ctx.compete?.share;
    if (!share) return;
    try {
      const payload = await share.encodeShare({ mode: m ? 'challenge' : 'practice', problemId, seed, graph: result.graph, score: share.scoreOf(result), name: api.displayName() });
      const r = await sendResult(payload);
      S.lastResult = r;
      if (r?.listed === false) {
        // the editorial's own design (or a near copy) and an empty starter replay fine but are not listed
        if (r.reason === 'editorial-design') setTimeout(() => toast('This design matches the editorial, so it stays off the leaderboard. Change it your way and play again to get on the board.', 'warn', 6500), 900);
        return;
      }
      bus.emit('account:result', r);
      const where = r.kind !== 'daily' ? (ctx.content?.problemById?.get?.(problemId)?.title || 'this problem')
        : r.date === ctx.compete?.daily?.todayLocal?.() ? 'today\'s challenge' : `the ${r.date} challenge`;
      const local = Math.round(result.score?.total ?? 0);
      const replay = r.score !== local ? ` The server replays your final design on the full standard day and scored it ${r.score}, so it can differ from your run.` : '';
      setTimeout(() => toast(`Leaderboard: #${r.rank} of ${r.total} on ${where}.${replay}`, 'ok', replay ? 6500 : 4200), 900);
    } catch (e) {
      if (e?.status === 401) { S.user = null; emit(); }
      // a design the service refused says why (too big, a closed day); anything else is the service being out of reach
      const why = e?.status === 422 && e.code && e.code !== 'http' ? `Your score is saved on this device, but not on the leaderboard: ${e.message}` : 'Your score is saved on this device. The leaderboard could not be reached.';
      setTimeout(() => toast(why, 'warn', 5200), 900);
    }
  }

  // ---- one gentle nudge, ever, after a finished day while signed out
  function maybeNudge({ mode, result }) {
    if (S.user || !available() || !result || !['practice', 'challenge', 'beat'].includes(mode)) return;
    if (!(result.stars > 0 || result.passed)) return; // no nudge after a run that missed every target
    if (store.get(NUDGE_KEY, false) === true) return;
    store.set(NUDGE_KEY, true);
    setTimeout(() => ui.nudge(), 6000);
  }

  // A GitHub sign-in comes back as ?signin=<status>: say what happened and tidy the address.
  function handleReturn() {
    let q;
    try { q = new URLSearchParams(location.search); } catch { return; }
    const v = q.get('signin');
    if (v === null) return;
    q.delete('signin');
    const s = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch { /* keep the address */ }
    const note = SIGNIN_NOTES[v];
    if (v === 'github' && S.user) return 'github';
    if (note) setTimeout(() => toast(note.text, note.level, 4200), 400);
    return null;
  }

  bus.on('progress:updated', () => syncSoon());
  bus.on('play:day-end', (e) => {
    syncSoon(1500);
    postResult(e);
    maybeNudge(e);
  });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.user && Date.now() - S.syncedAt > 5 * 60_000) syncSoon(500);
  });

  const ui = createAccountUi(ctx, api);
  api.mountHeader = ui.mountHeader;
  api.leaderboardCard = ui.leaderboardCard;
  api.signInCard = ui.signInCard;
  api.emailBlock = ui.emailBlock;
  api.openSignIn = ui.open;

  // Is the service there? A hidden frame loads its /probe page, which posts the public settings back. A frame that cannot
  // load leaves nothing in the console (a failed fetch would), so an unreachable service stays silent.
  function probe(timeoutMs = 6000) {
    return new Promise((resolve) => {
      let origin;
      try { origin = new URL(base).origin; } catch { resolve(null); return; }
      const frame = document.createElement('iframe');
      frame.hidden = true;
      frame.tabIndex = -1;
      frame.title = 'Sign-in service check';
      frame.setAttribute('aria-hidden', 'true');
      let done = false;
      let grace = 0;
      const finish = (cfg) => {
        if (done) return;
        done = true;
        clearTimeout(limit);
        clearTimeout(grace);
        removeEventListener('message', onMessage);
        frame.remove();
        resolve(cfg);
      };
      const onMessage = (e) => {
        if (e.source === frame.contentWindow && e.origin === origin && e.data && e.data.sd === 'systemdesigner-api') finish(e.data.config || null);
      };
      addEventListener('message', onMessage);
      // the frame's script posts before its load event; a load with no message is an error page
      frame.addEventListener('load', () => { grace = setTimeout(() => finish(null), 800); });
      const limit = setTimeout(() => finish(null), timeoutMs);
      frame.src = base + '/probe';
      (document.body || document.documentElement).append(frame);
    });
  }

  // Start: nothing at all when there is no service for this page; otherwise one silent check, then who is signed in.
  (async () => {
    if (!base) {
      if (preview) {
        try { S.user = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || 'null'); } catch { S.user = null; }
        emit();
      }
      readyResolve();
      return;
    }
    try {
      const cfg = await probe();
      if (!cfg) throw new Error('unreachable');
      S.config = { google: typeof cfg?.google?.clientId === 'string' ? cfg.google.clientId : null, github: cfg?.github === true, fake: cfg?.fake === true };
      S.status = 'ready';
      if (available()) S.user = (await call('GET', '/me', undefined, 5000))?.user || null;
    } catch {
      S.status = 'unreachable';
      S.config = null;
      S.user = null;
    }
    const back = handleReturn();
    emit();
    readyResolve();
    if (S.user) await signedIn(S.user, back === 'github' ? 'loud' : 'quiet');
  })();

  return api;
}
