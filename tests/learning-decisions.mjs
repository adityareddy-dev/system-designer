// Decision and diagnostic regressions from independent play sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { transferFor, transferCorrect } from '../content/transfers.js';
import { checkFor } from '../ui/play/design-check.js';
import { allocate } from '../ui/shell/allocation.js';
import { phoneLayout } from '../render/diagram.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
for (const lesson of lessons.filter(l => l.id !== 'intro')) {
  const test = transferFor(lesson.id);
  assert.ok(test, `${lesson.id} has a new situation`);
  assert.ok(transferCorrect(test, test.answer, test.value));
  assert.ok(!transferCorrect(test, (test.answer + 1) % test.choices.length, test.value));
  assert.ok(!transferCorrect(test, test.answer, test.value * 2));
  assert.ok(!transferCorrect(test, test.answer, NaN));
}
for (const id of ['url-shortener', 'rate-limiter-service']) {
  const problem = problemById.get(id), sim = createSim({ catalog, problem, seed: 'reported-sizing' });
  const a = sim.addNode('vm-fleet', 0, 0, { units: 2 });
  const db = sim.addNode('sql-primary', 200, 0);
  for (const n of sim.getGraph().nodes.filter(n => catalog.elementById.get(n.type).kind === 'source')) sim.connect(n.id, a);
  if (id === 'rate-limiter-service') { const limiter = sim.addNode('rate-limiter', 100, 0); sim.connect(a, limiter); sim.connect(limiter, db); } else sim.connect(a, db); sim.start(); sim.advance(86400000);
  const advice = sim.result().nextStep;
  assert.ok(advice.sizing?.units > 29, id + ' uses the full measured peak: ' + JSON.stringify(advice));
  assert.match(advice.text, new RegExp('= ' + advice.sizing.units + ' servers'));
  assert.match(advice.text, /including retries and repeat visits/);
  const decision = checkFor(problem);
  assert.ok(!transferCorrect(decision, null, decision.value), 'repair advice cannot answer the independent decision');
}
const limiter = createSim({ catalog, problem: problemById.get('rate-limiter-service') });
const app = limiter.addNode('vm-fleet', 0, 0), gate = limiter.addNode('rate-limiter', 200, 0);
for (const n of limiter.getGraph().nodes.filter(n => catalog.elementById.get(n.type).kind === 'source')) limiter.connect(n.id, app);
limiter.connect(app, gate);
const warnings = limiter.validate().map(i => i.message).join(' ');
assert.match(warnings, /[Kk]ey-value/);
assert.doesNotMatch(warnings, /through rate limiter or/);
const queue = limiter.addNode('queue', 300, 0), api = limiter.addNode('third-party-api', 500, 0);
assert.match(limiter.canConnect('queue', 'third-party-api').reason, /Background workers/);
const small = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }] };
const phone = phoneLayout(small);
assert.ok(phone.every(n => n.x === 0));
assert.ok(phone[3].y - phone[0].y <= 440, 'four modules fit a useful phone stage');
assert.equal(allocate([5, 0, 1], new Set([1]), 'least-requests', 0), 2);
assert.equal(allocate([5, 0, 1], new Set([1]), 'round-robin', 1), 2);
assert.equal(allocate([1, 1, 1], new Set([0, 1, 2]), 'round-robin', 0), -1);
console.log('Lesson transfer, allocation, sizing and path diagnosis checks passed.');
