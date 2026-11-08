// Background anonymous counts: no identifiers, no simulation work, and no retries.
import { createStore } from './store.js';

const pending = [], seen = new Set();
let ctx, store, painted = false, timer, errorSent = false;
const local = () => ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
function endpoint() {
  if (location.protocol === 'https:' && location.hostname === 'systemdesigner.io') return 'https://api.systemdesigner.io';
  const port = new URLSearchParams(location.search).get('measure');
  return local() && /^\d{4,5}$/.test(port || '') && +port >= 1024 && +port <= 65535 ? `http://127.0.0.1:${port}` : null;
}
function allowed() {
  return !!endpoint() && navigator.onLine !== false && navigator.doNotTrack !== '1' && globalThis.doNotTrack !== '1' && navigator.msDoNotTrack !== '1' && navigator.globalPrivacyControl !== true &&
    (ctx ? ctx.settings.get('anonymousCounts') !== false : store?.get('settings', {})?.anonymousCounts !== false);
}
function flush() {
  clearTimeout(timer); timer = null;
  if (!painted || !allowed()) { pending.length = 0; return; }
  const events = pending.splice(0, 20);
  if (!events.length) return;
  try { navigator.sendBeacon(endpoint() + '/e', new Blob([JSON.stringify({ events })], { type: 'application/json' })); } catch { /* counts are optional */ }
  if (pending.length) timer = setTimeout(flush, 1000);
}
function track(name, id, extra = {}) {
  if (!painted || !allowed() || pending.length >= 40) return;
  pending.push({ name, ...(id ? { id } : {}), screen: innerWidth < 700 ? 'phone' : 'desktop', ...extra });
  if (!timer) timer = setTimeout(flush, 1000);
}
function once(name, id) {
  const key = name.startsWith('first_problem_') ? name : name + ':' + (id || '');
  if (seen.has(key)) return;
  seen.add(key); track(name, id);
}
function reportError(error, file = 'unknown', module = false) {
  if (errorSent) return;
  errorSent = true;
  const raw = String(error?.message || '');
  const errorName = module ? 'ModuleError' : ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError'].includes(error?.name) ? error.name : 'Error';
  const message = module ? 'Module could not load' : /unexpected token|syntax/i.test(raw) ? 'Unexpected syntax' : /undefined|null|not defined/i.test(raw) ? 'Value is unavailable' : /invalid/i.test(raw) ? 'Invalid operation' : 'Unhandled error';
  try { file = new URL(file, location.href).pathname.split('/').pop(); } catch { file = 'unknown'; }
  if (!/^[a-z0-9-]{1,60}\.js$/.test(file)) file = 'unknown';
  const send = () => track('error', null, { errorName, message, file });
  if (painted) send(); else afterPaint.push(send);
}
const afterPaint = [];
export const metrics = {
  track, once, reportError,
  bind(context) {
    ctx = context;
    ctx.bus.on('settings', ({ key, value }) => { if (key === 'anonymousCounts' && !value) { pending.length = 0; clearTimeout(timer); timer = null; } });
    ctx.bus.on('lesson:done', ({ lessonId }) => { if (lessonId === 'intro') once('intro_finished'); });
    ctx.bus.on('play:start', ({ mode, problemId }) => {
      if (!['practice', 'challenge', 'beat'].includes(mode)) return;
      once('first_problem_started', problemId);
      if (mode === 'challenge') once('daily_challenge_played', problemId);
    });
  },
  // User-requested feedback still works when automatic counts are disabled.
  async feedback(data) {
    const api = endpoint();
    if (!api || navigator.onLine === false) return false;
    try {
      const r = await fetch(api + '/feedback', { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  },
};

// Two frames let the loading screen paint before storage, event processing or network work.
if (globalThis.document && globalThis.requestAnimationFrame) requestAnimationFrame(() => requestAnimationFrame(() => {
  setTimeout(() => {
    painted = true; store = createStore();
    let referrer = ''; try { const u = new URL(document.referrer); if (/^https?:$/.test(u.protocol) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(u.hostname)) referrer = u.hostname.toLowerCase(); } catch { /* direct visit */ }
    track('app_opened', null, { referrer });
    for (const send of afterPaint.splice(0)) send();
  }, 0);
}));
if (globalThis.document) {
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
