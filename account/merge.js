// Progress from two devices, cleaned and merged: union of solved problems and lessons, best score per problem, union of played days.
// Pure and shared by the browser (account/index.js) and the sign-in service (api/app.js).

const PROBLEM_ID = /^[a-z0-9-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BEST_KEY = /^(practice|challenge|beat):([a-z0-9-]{1,64}):([A-Za-z0-9_.-]{1,64})$/;
const MIN_TS = Date.UTC(2020, 0, 1);
const MAX_TS = Date.UTC(2100, 0, 1);

export const LIMITS = { problems: 300, lessons: 100, best: 400, days: 800, history: 100 };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, d = lo) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const int = (v, lo, hi, d = lo) => Math.round(num(v, lo, hi, d));
const ts = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= MIN_TS && v <= MAX_TS ? Math.round(v) : null);
function iso(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= MIN_TS && t <= MAX_TS ? new Date(t).toISOString() : null;
}
function isDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2020 && y < 2100;
}
// Own keys only, never prototype names.
const entries = (o) => (isObj(o) ? Object.keys(o).filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype').map((k) => [k, o[k]]) : []);

function cleanCorrectness(c) {
  if (!isObj(c) || !Number.isInteger(c.version) || c.version < 1 || c.version > 1e6 || !ts(c.checkedAt)
    || !Array.isArray(c.choices) || !c.choices.length || c.choices.length > 20
    || !c.choices.every(v => Number.isInteger(v) && v >= 0 && v <= 100)
    || typeof c.explanation !== 'string') return null;
  return { version: c.version, checkedAt: ts(c.checkedAt), choices: [...c.choices], explanation: c.explanation.slice(0, 4096) };
}

function cleanProblem(p) {
  if (!isObj(p)) return null;
  const correctness = cleanCorrectness(p.correctness);
  return {
    ...(correctness ? { correctness } : {}),
    ...(Array.isArray(p.estimates) && ts(p.estimatesAt) ? {
      estimates: p.estimates.slice(0, 20).map((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e30 ? v : null),
      estimatesAt: ts(p.estimatesAt),
    } : {}),
    attempts: int(p.attempts, 0, 1e6),
    bestScore: int(p.bestScore, 0, 1000),
    stars: int(p.stars, 0, 3),
    hintsUsed: int(p.hintsUsed, 0, 10),
    solvedAt: ts(p.solvedAt),
    lastResultAt: ts(p.lastResultAt),
  };
}

function cleanScore(e) {
  const availability = typeof e.availability === 'number' && Number.isFinite(e.availability) ? num(e.availability, 0, 1) : null;
  return {
    total: int(e.total, 0, 1000),
    stars: int(e.stars, 0, 3),
    passed: e.passed === true,
    availability,
    p99Ms: int(e.p99Ms, 0, 1e7),
    costPerMonth: int(e.costPerMonth, 0, 1e10),
    date: isDate(e.date) ? e.date : null,
    at: iso(e.at),
  };
}

function cleanBest(e) {
  if (!isObj(e)) return null;
  const s = cleanScore(e);
  if (!s.at) return null;
  return { ...s, attempts: int(e.attempts, 1, 1e6, 1), lastTotal: int(e.lastTotal ?? e.total, 0, 1000) };
}

function cleanHistory(e) {
  if (!isObj(e) || typeof e.key !== 'string') return null;
  const m = BEST_KEY.exec(e.key);
  if (!m) return null;
  const s = cleanScore(e);
  if (!s.at) return null;
  return { key: e.key, mode: m[1], problemId: m[2], seed: m[3], ...s };
}

// Newest first by ISO time, then by text so the order never depends on input order.
const byAtDesc = (a, b) => (a[1].at < b[1].at ? 1 : a[1].at > b[1].at ? -1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

// known: { problemIds?: Set, lessonIds?: Set } drops ids this version does not have (the service passes its content).
export function sanitizeProgress(raw, known = {}) {
  const src = isObj(raw) ? raw : {};
  const okProblem = (id) => PROBLEM_ID.test(id) && (!known.problemIds || known.problemIds.has(id));
  const okLesson = (id) => PROBLEM_ID.test(id) && (!known.lessonIds || known.lessonIds.has(id));

  const problems = {};
  for (const [id, p] of entries(src.problems).filter(([id]) => okProblem(id)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, LIMITS.problems)) {
    const c = cleanProblem(p);
    if (c) problems[id] = c;
  }

  const lessons = {};
  for (const [id, v] of entries(src.lessons).filter(([id]) => okLesson(id)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, LIMITS.lessons)) {
    if (v === false || v == null) continue;
    lessons[id] = ts(v) ?? MIN_TS;
  }

  const b = isObj(src.bests) ? src.bests : {};
  const bestList = [];
  for (const [key, e] of entries(b.best)) {
    const m = BEST_KEY.exec(key);
    if (!m || !okProblem(m[2])) continue;
    const c = cleanBest(e);
    if (c) bestList.push([key, c]);
  }
  bestList.sort(byAtDesc);
  const best = {};
  for (const [k, v] of bestList.slice(0, LIMITS.best).sort((x, y) => (x[0] < y[0] ? -1 : 1))) best[k] = v;

  const days = {};
  for (const [date, d] of entries(b.days).filter(([date]) => isDate(date)).sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, LIMITS.days).reverse()) {
    if (!isObj(d)) continue;
    days[date] = { plays: int(d.plays, 0, 1e6), best: int(d.best, 0, 1000), challenge: d.challenge === true };
  }

  const history = mergeHistory(Array.isArray(b.history) ? b.history.slice(0, LIMITS.history * 4).map(cleanHistory).filter((h) => h && okProblem(h.problemId)) : [], []);

  return { v: 1, problems, lessons, bests: { best, days, history } };
}

function mergeHistory(a, b) {
  const seen = new Map();
  for (const h of [...a, ...b]) {
    const k = h.key + '|' + h.at;
    const prev = seen.get(k);
    if (!prev || JSON.stringify(h) < JSON.stringify(prev)) seen.set(k, h);
  }
  return [...seen.values()]
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .slice(0, LIMITS.history);
}

const minTs = (x, y) => (x == null ? y : y == null ? x : Math.min(x, y));
const maxTs = (x, y) => (x == null ? y : y == null ? x : Math.max(x, y));
const smaller = (x, y) => (JSON.stringify(x) <= JSON.stringify(y) ? x : y);

function mergeProblem(a, b) {
  const x = a.correctness, y = b.correctness;
  const correctness = !x || !y ? x || y : x.version !== y.version ? (x.version > y.version ? x : y)
    : x.checkedAt !== y.checkedAt ? (x.checkedAt > y.checkedAt ? x : y) : smaller(x, y);
  const estimates = (a.estimatesAt || 0) === (b.estimatesAt || 0) ? smaller(a.estimates || [], b.estimates || [])
    : (a.estimatesAt || 0) > (b.estimatesAt || 0) ? a.estimates : b.estimates;
  const lead = a.bestScore !== b.bestScore ? (a.bestScore > b.bestScore ? a : b) : (a.hintsUsed <= b.hintsUsed ? a : b);
  return {
    ...(correctness ? { correctness } : {}),
    ...(estimates && (a.estimatesAt || b.estimatesAt) ? { estimates, estimatesAt: maxTs(a.estimatesAt, b.estimatesAt) } : {}),
    attempts: Math.max(a.attempts, b.attempts),
    bestScore: Math.max(a.bestScore, b.bestScore),
    stars: Math.max(a.stars, b.stars),
    hintsUsed: lead.hintsUsed,
    solvedAt: minTs(a.solvedAt, b.solvedAt),
    lastResultAt: maxTs(a.lastResultAt, b.lastResultAt),
  };
}

function mergeBest(a, b) {
  let win;
  if (a.total !== b.total) win = a.total > b.total ? a : b;
  else if (a.at !== b.at) win = a.at < b.at ? a : b;
  else win = smaller(a, b);
  return { ...win, attempts: Math.max(a.attempts, b.attempts) };
}

// Both sides are cleaned first; the result is the same whichever side comes first, and merging twice changes nothing.
export function mergeProgress(x, y, known = {}) {
  const a = sanitizeProgress(x, known);
  const b = sanitizeProgress(y, known);
  const out = { v: 1, problems: {}, lessons: {}, bests: { best: {}, days: {}, history: [] } };

  for (const id of [...new Set([...Object.keys(a.problems), ...Object.keys(b.problems)])].sort()) {
    const p = a.problems[id], q = b.problems[id];
    out.problems[id] = p && q ? mergeProblem(p, q) : { ...(p || q) };
  }
  for (const id of [...new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)])].sort()) {
    out.lessons[id] = minTs(a.lessons[id], b.lessons[id]);
  }
  for (const k of [...new Set([...Object.keys(a.bests.best), ...Object.keys(b.bests.best)])].sort()) {
    const p = a.bests.best[k], q = b.bests.best[k];
    out.bests.best[k] = p && q ? mergeBest(p, q) : { ...(p || q) };
  }
  for (const d of [...new Set([...Object.keys(a.bests.days), ...Object.keys(b.bests.days)])].sort()) {
    const p = a.bests.days[d], q = b.bests.days[d];
    out.bests.days[d] = p && q ? { plays: Math.max(p.plays, q.plays), best: Math.max(p.best, q.best), challenge: p.challenge || q.challenge } : { ...(p || q) };
  }
  out.bests.history = mergeHistory(a.bests.history, b.bests.history);
  // caps again, in case the union grew past them
  return sanitizeProgress(out, known);
}

export function emptyProgress() {
  return { v: 1, problems: {}, lessons: {}, bests: { best: {}, days: {}, history: [] } };
}

// Days in a row with a finished day, ending today or yesterday (same rule as compete/bests.js).
export function streakOf(progress, today) {
  const days = progress?.bests?.days || {};
  const step = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  let s = days[today] ? today : step(today, -1);
  let n = 0;
  while (days[s]) { n++; s = step(s, -1); }
  return n;
}
