// Mixed queue deadlines and synced correctness records survive day-end and account merges.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { mergeProgress, sanitizeProgress } from '../account/merge.js';
import { createProgress } from '../ui/shell/progress.js';
import { problemById } from '../content/problems/index.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k =>
  [k, JSON.parse(fs.readFileSync(new URL(`../catalog/${k}.json`, import.meta.url)))])));
function queueDay(queueDeadlineSec) {
  const sim = createSim({ catalog, problem: { id: 'mixed-deadlines',
    requirements: { peakRps: 60, mix: { event: 0.01, telemetry: 0.99 }, queueDeadlineSec,
      availability: 0.995, latencyP99Ms: { default: 1000 } },
    traffic: { curve: 'flat', sources: { 'iot-device': 1 } },
    events: [{ id: 'viral-spike', at: '23:59', params: { factor: 100, rampSec: 0, holdSec: 60, decaySec: 0 } }] } });
  sim.loadGraph({ nodes: [
    { id: 'u', type: 'iot-device', x: 0, y: 0 },
    { id: 'app', type: 'vm-fleet', units: 100, x: 100, y: 0 },
    { id: 'q', type: 'queue', x: 200, y: 0 },
    { id: 'wk', type: 'worker-pool', units: 1, x: 300, y: 0 },
    { id: 'db', type: 'timeseries-db', units: 100, x: 400, y: 0 },
  ], edges: [['u', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'db']] });
  let beforeSettlement;
  sim.on('tick', ({ clockMs }) => {
    if (clockMs === 86400000) beforeSettlement = sim.state().slo.availability.actual;
  });
  sim.start(); sim.advance(86400000);
  return { ...sim.result(), beforeSettlement };
}
const relaxed = queueDay({ event: 3600, telemetry: 3600 });
const mixed = queueDay({ event: 10, telemetry: 3600 });
assert.equal(relaxed.lateRequests, 0, 'the final spike can drain within an hour');
assert(mixed.lateRequests > 0, 'the short event deadline is still enforced');
assert(mixed.lateRequests < 6000, 'late requests belong only to the small event share of the final spike');
assert(mixed.slo.availability.actual >= 0.995, 'telemetry within its deadline cannot fail availability');
const strict = queueDay({ event: 10, telemetry: 10 });
assert(strict.lateRequests > mixed.lateRequests * 50, 'short telemetry deadlines charge telemetry separately');
assert.equal(strict.slo.availability.actual, Math.round(strict.beforeSettlement * 1e6) / 1e6,
  'settlement cannot charge the last tick again after its one-tick deadlines were checked');

const memory = new Map();
const store = { get: (key, fallback) => memory.get(key) ?? fallback, set: (key, value) => memory.set(key, value) };
const progress = createProgress(store, { emit() {} });
const checkpoint = problemById.get('bank-ledger').correctness;
const answer = { choices: checkpoint.fields.map(f => f.correct), text: 'Commit balanced entries and a unique transfer id atomically.' };
progress.record('bank-ledger', { score: { total: 950 }, stars: 3, passed: true });
assert(progress.recordCorrectness('bank-ledger', checkpoint, answer, true));
const saved = progress.get('bank-ledger');
const merged = mergeProgress(progress.exportAll(), { problems: { 'chat-app': { attempts: 1, bestScore: 800 } } });
progress.importAll({ app: 'system-designer', ...merged }, { preserveInterviews: true });
assert.deepEqual(progress.get('bank-ledger').correctness, saved.correctness, 'sync retains mastery, choices and explanation');
assert.equal(progress.get('bank-ledger').bestScore, saved.bestScore);
assert.equal(progress.get('bank-ledger').solvedAt, saved.solvedAt);
const otherDevice = createProgress({ get: (key, fallback) => fallback, set() {} }, { emit() {} });
otherDevice.importAll({ app: 'system-designer', ...sanitizeProgress(progress.exportAll()) }, { preserveInterviews: true });
assert.deepEqual(otherDevice.get('bank-ledger').correctness, saved.correctness, 'mastery reaches another device');

const snapshot = correctness => ({ problems: { 'bank-ledger': { correctness } } });
const original = snapshot(saved.correctness);
for (const replacement of [
  { ...saved.correctness, checkedAt: saved.correctness.checkedAt + 1, explanation: 'Newer answer' },
  { ...saved.correctness, version: saved.correctness.version + 1, checkedAt: saved.correctness.checkedAt - 1 },
]) {
  const updated = snapshot(replacement);
  const result = mergeProgress(original, updated);
  assert.deepEqual(result.problems['bank-ledger'].correctness, replacement);
  assert.deepEqual(mergeProgress(updated, original), result, 'merge order is irrelevant');
  assert.deepEqual(mergeProgress(result, original), result, 'repeated sync is stable');
}
const tied = snapshot({ ...saved.correctness, explanation: 'Another answer at the same time' });
assert.deepEqual(mergeProgress(original, tied), mergeProgress(tied, original));
for (const bad of [null, [], { ...saved.correctness, version: -1 }, { ...saved.correctness, checkedAt: 'today' },
  { ...saved.correctness, choices: [NaN] }, { ...saved.correctness, choices: Array(21).fill(0) },
  { ...saved.correctness, explanation: {} }]) {
  assert.equal(sanitizeProgress(snapshot(bad)).problems['bank-ledger'].correctness, undefined, 'invalid mastery is discarded');
}
assert.equal(sanitizeProgress(snapshot({ ...saved.correctness, explanation: 'x'.repeat(10000) }))
  .problems['bank-ledger'].correctness.explanation.length, 4096, 'synced explanations are bounded');
console.log('Mixed queue deadlines and synced correctness checks passed.');
