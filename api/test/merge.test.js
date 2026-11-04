// Progress merge: union of solved problems and lessons, best score per problem, streak days, and junk dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProgress, mergeProgress, streakOf, LIMITS } from '../../account/merge.js';

const T = Date.UTC(2026, 10, 1, 12);
const day = 86400000;
const laptop = {
  problems: {
    'url-shortener': { attempts: 3, bestScore: 910, stars: 2, hintsUsed: 1, solvedAt: T, lastResultAt: T + 2 * day },
    'chat-app': { attempts: 1, bestScore: 400, stars: 0, hintsUsed: 0, solvedAt: null, lastResultAt: T },
  },
  lessons: { caching: T, cdn: T + day },
  bests: {
    best: { 'challenge:leaderboards:daily-2026-11-01': { total: 700, stars: 1, passed: true, availability: 0.999, p99Ms: 120, costPerMonth: 900, date: '2026-11-01', at: '2026-11-01T18:00:00.000Z', attempts: 2, lastTotal: 650 } },
    days: { '2026-11-01': { plays: 2, best: 700, challenge: true }, '2026-11-02': { plays: 1, best: 910, challenge: false } },
    history: [{ key: 'challenge:leaderboards:daily-2026-11-01', mode: 'challenge', problemId: 'leaderboards', seed: 'daily-2026-11-01', total: 700, stars: 1, passed: true, availability: 0.999, p99Ms: 120, costPerMonth: 900, date: '2026-11-01', at: '2026-11-01T18:00:00.000Z' }],
  },
};
const phone = {
  problems: {
    'url-shortener': { attempts: 5, bestScore: 960, stars: 3, hintsUsed: 3, solvedAt: T + day, lastResultAt: T + day },
    'bank-ledger': { attempts: 2, bestScore: 930, stars: 3, hintsUsed: 0, solvedAt: T + 3 * day, lastResultAt: T + 3 * day },
  },
  lessons: { caching: T + 5 * day, sharding: T + 2 * day },
  bests: {
    best: { 'challenge:leaderboards:daily-2026-11-01': { total: 820, stars: 2, passed: true, availability: 0.9995, p99Ms: 90, costPerMonth: 1100, date: '2026-11-01', at: '2026-11-01T20:00:00.000Z', attempts: 1, lastTotal: 820 } },
    days: { '2026-11-01': { plays: 1, best: 820, challenge: true }, '2026-11-03': { plays: 1, best: 500, challenge: true } },
    history: [],
  },
};

test('solved problems and lessons are a union, best score per problem wins', () => {
  const m = mergeProgress(laptop, phone);
  assert.deepEqual(Object.keys(m.problems).sort(), ['bank-ledger', 'chat-app', 'url-shortener']);
  const u = m.problems['url-shortener'];
  assert.equal(u.bestScore, 960);
  assert.equal(u.stars, 3);
  assert.equal(u.attempts, 5);
  assert.equal(u.hintsUsed, 3, 'hints follow the best score');
  assert.equal(u.solvedAt, T, 'first solve is kept');
  assert.equal(u.lastResultAt, T + 2 * day);
  assert.deepEqual(Object.keys(m.lessons).sort(), ['caching', 'cdn', 'sharding']);
  assert.equal(m.lessons.caching, T, 'earliest finish is kept');
});

test('challenge bests keep the higher score, and played days merge into one streak', () => {
  const m = mergeProgress(laptop, phone);
  assert.equal(m.bests.best['challenge:leaderboards:daily-2026-11-01'].total, 820);
  assert.equal(m.bests.best['challenge:leaderboards:daily-2026-11-01'].attempts, 2);
  assert.deepEqual(m.bests.days['2026-11-01'], { plays: 2, best: 820, challenge: true });
  assert.deepEqual(Object.keys(m.bests.days), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.equal(streakOf(laptop, '2026-11-03'), 2, 'laptop alone: Nov 1 and 2');
  assert.equal(streakOf(phone, '2026-11-03'), 1, 'phone alone: Nov 3 only');
  assert.equal(streakOf(m, '2026-11-03'), 3, 'together: three days in a row');
  assert.equal(m.bests.history.length, 1);
});

test('merge is order-free and merging again changes nothing', () => {
  const ab = mergeProgress(laptop, phone);
  const ba = mergeProgress(phone, laptop);
  assert.deepEqual(ab, ba);
  assert.deepEqual(mergeProgress(ab, ab), ab);
  assert.deepEqual(mergeProgress(ab, laptop), ab);
  assert.deepEqual(mergeProgress({}, ab), ab);
});

test('junk, unknown ids and prototype keys are dropped', () => {
  const evil = JSON.parse(`{
    "problems": { "__proto__": { "bestScore": 1000 }, "BAD ID": { "bestScore": 5 }, "url-shortener": { "bestScore": 99999, "stars": 7, "attempts": -4, "solvedAt": "yesterday" }, "not-a-problem": { "bestScore": 1 } },
    "lessons": { "caching": "x", "constructor": 1 },
    "bests": { "best": { "practice:url-shortener:practice": { "total": 50, "at": "nope" }, "weird": { "total": 1, "at": "2026-11-01T00:00:00Z" } },
               "days": { "2026-02-30": { "plays": 1 }, "2026-11-01": { "plays": 1e12, "best": -5, "challenge": "yes" } },
               "history": "lots" }
  }`);
  const known = { problemIds: new Set(['url-shortener', 'chat-app']), lessonIds: new Set(['caching']) };
  const s = sanitizeProgress(evil, known);
  assert.deepEqual(Object.keys(s.problems), ['url-shortener']);
  assert.deepEqual(s.problems['url-shortener'], { attempts: 0, bestScore: 1000, stars: 3, hintsUsed: 0, solvedAt: null, lastResultAt: null });
  assert.equal(Object.getPrototypeOf(s.problems), Object.prototype);
  assert.deepEqual(Object.keys(s.lessons), ['caching']);
  assert.deepEqual(s.bests.best, {}, 'bad time and bad key both dropped');
  assert.deepEqual(s.bests.days, { '2026-11-01': { plays: 1e6, best: 0, challenge: false } });
  assert.deepEqual(s.bests.history, []);
  assert.deepEqual(sanitizeProgress(null), { v: 1, problems: {}, lessons: {}, bests: { best: {}, days: {}, history: [] } });
});

test('sizes are capped', () => {
  const days = {};
  for (let i = 0; i < 1000; i++) days[new Date(Date.UTC(2023, 0, 1) + i * day).toISOString().slice(0, 10)] = { plays: 1, best: 1, challenge: false };
  const s = sanitizeProgress({ bests: { days } });
  assert.equal(Object.keys(s.bests.days).length, LIMITS.days);
  assert.ok(Object.keys(s.bests.days).includes('2025-09-26'), 'newest days kept');
});
