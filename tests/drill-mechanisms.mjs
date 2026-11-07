// Lesson mechanisms are explicit and no round can repeat a question template.
import assert from 'node:assert/strict';
import { lessons } from '../content/lessons/index.js';
import { transferFor } from '../content/transfers.js';
import { drillCase } from '../content/drills.js';
import { buildPool, pickRound } from '../ui/shell/drill.js';
import { mulberry32 } from '../sim/rng.js';
const pool = buildPool(lessons);
for (const question of [...pool.quiz, ...pool.num]) {
  const lesson = lessons.find(l => l.id === question.lessonId);
  assert.equal(question.mechanism, lesson.id); assert.equal(question.lesson, lesson.title);
  assert(question.q.includes(transferFor(lesson.id).q), lesson.id + ' uses its authored mechanism, never a generic fallback');
  assert(question.calculation.length > 10);
  assert.equal(drillCase(lesson.id).mistakes.length, 3);
  assert.equal(new Set([drillCase(lesson.id).value, ...drillCase(lesson.id).mistakes]).size, 4);
}
for (let seed = 0; seed < 1000; seed++) {
  const round = pickRound(pool, 10, mulberry32(seed));
  assert.equal(round.length, 10); assert.equal(new Set(round.map(q => q.template)).size, 10);
  assert(round.every(q => q.choices.length >= 3 && q.answer >= 0 && q.answer < q.choices.length));
}
console.log(`${pool.quiz.length} lesson mechanisms, ${pool.quiz.length + pool.num.length} questions and 1,000 rounds checked.`);
