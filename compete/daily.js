// Daily challenge: seeded pick of the day's problem, plus the seeded variant (time shift, size, extra event).
import { hashSeed, mulberry32 } from '../sim/rng.js';
import { eventById } from './util.js';
import { DAILY_SAFE } from './daily-safe.js';

const DAY_MS = 86400000;

export function todayLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function shuffled(ids, seedStr) {
  const a = ids.slice();
  const r = mulberry32(hashSeed(seedStr));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// One shuffled pass over the whole pool per cycle, so no repeat until the bank is used up.
function cycleOrder(pool, c) {
  const a = shuffled(pool, 'daily-cycle-' + c);
  if (c > 0 && pool.length > 1) {
    const prev = shuffled(pool, 'daily-cycle-' + (c - 1));
    if (a[0] === prev[prev.length - 1]) [a[0], a[1]] = [a[1], a[0]];
  }
  return a;
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// The ids the daily draws from: flagged daily and not skipped as unsolvable.
export function dailyPool(problems = []) {
  return problems.filter((p) => p.daily && !DAILY_SAFE[p.id]?.skip).map((p) => p.id).sort();
}

// problems: the full list; only those flagged daily are drawn.
export function dailyFor(dateStr = todayLocal(), problems = []) {
  if (!isDateStr(dateStr)) dateStr = todayLocal();
  const pool = dailyPool(problems);
  const seed = 'daily-' + dateStr;
  const dn = dayNumber(dateStr);
  const n = pool.length;
  const problemId = n ? cycleOrder(pool, Math.floor(dn / n))[((dn % n) + n) % n] : null;
  const r = mulberry32(hashSeed(seed + '-variant'));
  const shiftMin = (Math.floor(r() * 25) - 12) * 5;               // -60..+60 in 5-minute steps
  const rawMag = Math.round((0.75 + r() * 0.5) * 100) / 100;      // 0.75..1.25
  const pick = r();
  const extraAt = hhmm(600 + 5 * Math.floor(r() * 109));          // 10:00..19:00
  const problem = problems.find((p) => p.id === problemId);
  const used = new Set((problem?.events || []).map((e) => e.id));
  // Only extra events and sizes a reference design still passes (measured by tools/daily-safe.mjs), so every day can be passed.
  const safe = DAILY_SAFE[problemId];
  const extras = (problem?.eventPool || []).filter((id) => !used.has(id) && (!safe || safe.extras[id]));
  const extraEventId = extras.length ? extras[Math.floor(pick * extras.length)] : null;
  const [lo, hi] = safe ? (extraEventId ? safe.extras[extraEventId] : safe.mag) : [0.75, 1.25];
  const magnitude = Math.round(Math.min(hi, Math.max(lo, rawMag)) * 100) / 100;
  return { date: dateStr, seed, problemId, variant: { shiftMin, magnitude, extraEventId, extraAt } };
}

// Where a date sits in the shuffled cycle. playedMap: { problemId: [daily dates (YYYY-MM-DD) the player played] }.
// A round is one full pass over the pool. Returns { poolSize, round, positionInRound (1-based), doneInRound,
// repeats (today's problem was played in an earlier round), lastPlayed (latest such date, or null) }.
export function poolStatus(dateStr, playedMap = {}, problems = []) {
  if (!isDateStr(dateStr)) dateStr = todayLocal();
  const pool = dailyPool(problems);
  const n = pool.length;
  if (!n) return { poolSize: 0, round: 0, positionInRound: 0, doneInRound: 0, repeats: false, lastPlayed: null };
  const dn = dayNumber(dateStr);
  const round = Math.floor(dn / n);
  const inPool = new Set(pool);
  let done = 0;
  for (const [id, dates] of Object.entries(playedMap || {})) {
    if (!inPool.has(id)) continue;
    if ((dates || []).some((d) => isDateStr(d) && Math.floor(dayNumber(d) / n) === round)) done++;
  }
  const todayId = cycleOrder(pool, round)[((dn % n) + n) % n];
  const earlier = ((playedMap || {})[todayId] || []).filter((d) => isDateStr(d) && Math.floor(dayNumber(d) / n) < round).sort();
  return { poolSize: n, totalProblems: problems.length, round, positionInRound: ((dn % n) + n) % n + 1, doneInRound: done, repeats: earlier.length > 0, lastPlayed: earlier.length ? earlier[earlier.length - 1] : null };
}

const MUL = new Set(['factor', 'factorOfPeak', 'addLatencyMs', 'addMs', 'lagSec']);
const MUL1 = new Set(['share', 'errorRate']);

function scaleValue(key, v, m) {
  if (typeof v !== 'number' || !isFinite(v)) return v;
  let out;
  if (MUL.has(key)) out = key === 'factor' && v < 1 ? v / m : v * m;
  else if (MUL1.has(key)) out = Math.min(1, v * m);
  else return v;
  if (key === 'factor' && v > 1) out = Math.max(1.05, out);
  if (key === 'factor' && v < 1) out = Math.min(0.95, out);
  return Number.isInteger(v) && out >= 10 ? Math.round(out) : Math.round(out * 100) / 100;
}

// A param key can be overridden on an event only when every effect that has it shares one default.
function defaultParams(catalog, id) {
  const ev = eventById(catalog, id);
  const seen = {};
  for (const fx of ev?.effects || []) {
    for (const [k, v] of Object.entries(fx.params || {})) (seen[k] ||= new Set()).add(JSON.stringify(v));
  }
  const out = {};
  for (const [k, set] of Object.entries(seen)) {
    if (set.size !== 1 || !(MUL.has(k) || MUL1.has(k))) continue;
    for (const fx of ev.effects) if (fx.params && k in fx.params) { out[k] = fx.params[k]; break; }
  }
  return out;
}

export function applyVariant(problem, variant, catalog = null) {
  const p = structuredClone(problem);
  if (!variant) return p;
  const shift = variant.shiftMin || 0;
  const m = variant.magnitude || 1;
  const scaled = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = scaleValue(k, v, m);
    return out;
  };
  p.events = (p.events || []).map((e) => ({
    ...e,
    at: hhmm(Math.min(1425, Math.max(5, toMin(e.at) + shift))),
    params: scaled({ ...defaultParams(catalog, e.id), ...(e.params || {}) }),
  }));
  if (variant.extraEventId && !p.events.some((e) => e.id === variant.extraEventId)) {
    p.events.push({ id: variant.extraEventId, at: variant.extraAt || '15:00', params: scaled(defaultParams(catalog, variant.extraEventId)) });
  }
  p.events.sort((a, b) => toMin(a.at) - toMin(b.at));
  p.dailyVariant = { ...variant };
  return p;
}

// Bound to the content bank (getProblems may be an array or a function) and the catalog.
export function createDaily(getProblems, catalog) {
  const list = () => (typeof getProblems === 'function' ? getProblems() : getProblems) || [];
  return {
    todayLocal,
    addDays,
    isDateStr,
    dailyFor: (dateStr = todayLocal()) => dailyFor(dateStr, list()),
    poolStatus: (dateStr = todayLocal(), playedMap = {}) => poolStatus(dateStr, playedMap, list()),
    applyVariant: (problem, variant) => applyVariant(problem, variant, catalog),
    forDate(dateStr = todayLocal()) {
      const d = dailyFor(dateStr, list());
      const base = list().find((p) => p.id === d.problemId) || null;
      return { ...d, problem: base ? applyVariant(base, d.variant, catalog) : null };
    },
  };
}
