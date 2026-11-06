// Problems, lesson transfers and drills use independent situations with plausible numerical alternatives.
import assert from 'node:assert/strict';
import { problems } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { transferFor, transferCorrect } from '../content/transfers.js';
import { checkFor } from '../ui/play/design-check.js';
import { buildPool } from '../ui/shell/drill.js';
const seen = new Set();
function check(test, id) {
  assert(test && !seen.has(test.q), id + ' has a distinct question'); seen.add(test.q);
  assert(transferCorrect(test, test.answer, test.value), id);
  assert(!transferCorrect(test, (test.answer + 1) % test.choices.length, test.value), id);
  assert(test.choices.every(choice => choice.length >= 4) && new Set(test.choices).size === test.choices.length, id + ' uses distinct engineering alternatives');
}
for (const p of problems) check(checkFor(p), p.id);
for (const l of lessons.filter(l => l.id !== 'intro')) check(transferFor(l.id), l.id);
const pool = buildPool(lessons);
for (const q of pool.quiz) check(q, q.lesson + ' drill');
for (const n of pool.num) {
  assert(!seen.has(n.q)); seen.add(n.q);
  assert.equal(new Set([n.correct, ...n.others]).size, 4, n.lesson);
}
console.log(`Transfer sweep: ${problems.length} problems, ${lessons.length - 1} lesson transfers and ${pool.quiz.length + pool.num.length} fresh drill items.`);
