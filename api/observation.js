// Strict anonymous input validation and a daily, memory-only visitor estimate.
import { randomBytes, createHmac } from 'node:crypto';
import { HttpError, readJson } from './http.js';
import { dayOf } from './observation-store.js';
import { errorFiles } from './error-files.js';

const problemEvents = new Set(['first_problem_started', 'first_problem_passed', 'problem_passed', 'daily_challenge_played', 'interview_finished', 'result_shared', 'beat_link_opened']);
const names = new Set(['app_opened', 'intro_finished', 'lesson_finished', 'error', ...problemEvents]);
const errorNames = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'ModuleError']);
const messages = new Set(['Unexpected syntax', 'Value is unavailable', 'Invalid operation', 'Module could not load', 'Unhandled error']);
const files = new Set(errorFiles);
const bad = () => { throw new HttpError(400, 'bad-input', 'Unknown or invalid anonymous fields.'); };
const fields = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every(k => keys.includes(k));
const host = value => typeof value === 'string' && value.length <= 253 && (value === '' || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(value));

export function createObservation({ db, game, now }) {
  let day = '', salt, visitors = new Set();
  function rotate() {
    const today = dayOf(now());
    if (today !== day) { day = today; salt = randomBytes(32); visitors.clear(); }
  }
  function validate(e) {
    if (!fields(e, ['name', 'id', 'screen', 'referrer', 'errorName', 'message', 'file']) || !names.has(e.name) || !['phone', 'desktop'].includes(e.screen)) bad();
    if (problemEvents.has(e.name)) { if (!game.problemIds.has(e.id)) bad(); }
    else if (e.name === 'lesson_finished') { if (!game.lessonIds.has(e.id) || e.id === 'intro') bad(); }
    else if (e.id !== undefined) bad();
    if (e.name === 'app_opened') { if (!host(e.referrer)) bad(); }
    else if (e.referrer !== undefined) bad();
    if (e.name === 'error') {
      if (!errorNames.has(e.errorName) || !messages.has(e.message) || typeof e.file !== 'string' || e.file.length > 100) bad();
      if (!files.has(e.file)) e.file = 'unknown';
    } else if (e.errorName !== undefined || e.message !== undefined || e.file !== undefined) bad();
    return e;
  }
  const privateSignal = req => req.headers.dnt === '1' || req.headers['sec-gpc'] === '1';
  return {
    rotate,
    async events(req, ip) {
      const body = await readJson(req, 8192);
      if (!fields(body, ['events']) || !Array.isArray(body.events) || !body.events.length || body.events.length > 20) bad();
      const events = body.events.map(validate);
      if (privateSignal(req)) return;
      rotate();
      const hash = createHmac('sha256', salt).update(ip).update('\n').update(String(req.headers['user-agent'] || '').slice(0, 512)).digest('hex');
      const fresh = !visitors.has(hash);
      db.countEvents(day, events, fresh);
      visitors.add(hash);
    },
    async feedback(req) {
      const f = await readJson(req, 4096);
      if (!fields(f, ['rating', 'comment', 'page', 'version']) || !Number.isInteger(f.rating) || f.rating < 1 || f.rating > 5 ||
        typeof f.comment !== 'string' || f.comment.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(f.comment) ||
        typeof f.version !== 'string' || !/^[0-9]{1,4}(?:\.[0-9]{1,4}){0,7}$/.test(f.version)) bad();
      const [kind, id, extra] = String(f.page).split(':');
      if (extra !== undefined || !(f.page === 'general' || kind === 'problem' && game.problemIds.has(id) || kind === 'lesson' && game.lessonIds.has(id))) bad();
      // Deliberately no session, address, user agent, timestamp or generated identifier.
      db.addFeedback({ ...f, comment: f.comment.trim() }, dayOf(now()));
    },
  };
}
