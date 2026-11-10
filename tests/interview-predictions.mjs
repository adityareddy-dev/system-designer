// Prediction credit, measured target outcomes and unsupported replays remain separate in reports.
import assert from 'node:assert/strict';
import * as claims from '../content/problems/defense-claims.js';
import { createProgress } from '../ui/shell/progress.js';

assert.equal(typeof claims.summarizeClaims, 'function', 'reports summarize tested predictions separately from unsupported experiments');
assert.deepEqual(claims.summarizeClaims([
  { applied: true, held: false, position: 'fail', matched: true },
  { applied: true, held: true, position: 'fail', matched: false },
  { applied: false, held: false, position: 'fail', matched: null },
  { applied: false, held: false, position: 'hold', matched: null },
]), { covered: 1, total: 2, held: 1, failed: 1, untested: 2 });
assert.deepEqual(claims.summarizeClaims([{ held: true }, { held: false }, { applied: false, held: false }]),
  { covered: 1, total: 2, held: 1, failed: 1, untested: 1 }, 'old positive claim traces remain readable');
assert.deepEqual(claims.summarizeClaims([{ applied: false, held: false }]),
  { covered: 0, total: 0, held: 0, failed: 0, untested: 1 }, 'an untested-only report has no failed or held total');

const data = {};
const progress = createProgress({ get: (key, fallback) => data[key] || fallback, set: (key, value) => data[key] = value }, { emit() {} });
progress.recordInterview('bank-ledger', { covered: 1, total: 1, score: 700 });
progress.recordInterview('bank-ledger', { coverageKind: 'computed-claims', covered: 1, total: 1, score: 800 });
const old = structuredClone(progress.get('bank-ledger'));
progress.recordInterview('bank-ledger', { coverageKind: 'computed-predictions', covered: 1, total: 2, untested: 1, score: 600,
  defense: [{ claims: { cut: { position: 'fail', matched: true, held: false, applied: true } } }] });
const saved = progress.get('bank-ledger');
assert.deepEqual(saved.interview.bestCoverage, old.interview.bestCoverage);
assert.deepEqual(saved.interview.bestClaims, old.interview.bestClaims);
assert.equal(saved.interview.bestPredictions.covered, 1);
assert.equal(saved.interview.bestDay.score, 800);
assert.equal(saved.attempts, 0, 'prediction credit does not change ordinary attempts');
const backup = structuredClone(progress.exportAll());
progress.reset(); progress.importAll(backup);
assert.deepEqual(progress.get('bank-ledger'), saved, 'backup roundtrip retains old and new reports');
console.log('Tested-only prediction totals and old/new interview progress survive backup restoration.');
