// Walk every problem: traces, independently calculated repairs, transfer credit and legacy progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems } from '../content/problems/index.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { checkpointCorrect } from '../ui/play/correctness.js';
import { learningCredit } from '../ui/play/mastery.js';
import { repairCase, repairCorrect } from '../ui/play/repair.js';
import { previewLimits } from '../ui/play/capacity-preview.js';
import { createProgress } from '../ui/shell/progress.js';
import { mergeProgress } from '../account/merge.js';
import { questionCoverage, defenseQuestions } from '../ui/play/interview.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const seen = new Set();
let traces = 0, references = 0, repairs = 0;
for (const problem of problems) {
  assert(problem.twist, problem.id + ' has a reachable mastery replay');
  assert.notDeepEqual(problem.twist.events, problem.events, problem.id + ' changes conditions for transfer');
  const cp = problem.correctness;
  const answer = cp ? { choices: cp.fields.map(f => f.correct), text: 'Preserve the stated invariant through each committed transition.' } : null;
  if (problem.difficulty !== 'Easy') {
    traces++;
    assert.equal(cp.version, 3, problem.id);
    assert.ok(cp.responsibility && cp.fields.length >= 3 && cp.fields.length <= 5, problem.id);
    assert(!seen.has(cp.responsibility)); seen.add(cp.responsibility);
    assert(checkpointCorrect(cp, answer));
    for (let i = 0; i < cp.fields.length; i++) {
      const wrong = structuredClone(answer); wrong.choices[i] = 1 - wrong.choices[i];
      assert(!checkpointCorrect(cp, wrong), `${problem.id} step ${i} is checked`);
      assert(!learningCredit(problem, wrong, { passed: true }).eligible);
      assert(cp.fields[i].explanation.length > 30 && cp.fields[i].options.length >= 2);
    }
    assert(!problem.hints[2].includes('→'));
  }
  const plain = learningCredit(problem, answer, { passed: true });
  assert(plain.eligible);
  assert(!plain.independentTwist, 'ordinary passes never grant full mastery');
  assert(learningCredit(problem, answer, { passed: true, hintsUsed: 3 }).assisted);
  assert(learningCredit(problem, answer, { passed: true, workedRepair: true }).assisted);
  if (problem.twist) {
    const twist = { ...problem, twistDay: true };
    assert(learningCredit(twist, answer, { passed: true }, { eligibleAt: 1 }).independentTwist);
    assert(!learningCredit(twist, answer, { passed: true }).independentTwist);
    assert(!learningCredit(twist, answer, { passed: true, hintsUsed: 1 }, { eligibleAt: 1 }).independentTwist);
    assert(!learningCredit(twist, answer, { passed: true, workedRepair: true }, { eligibleAt: 1 }).independentTwist);
  }
  for (const design of problem.editorial.designs) {
    const sim = createSim({ catalog, problem, seed: 'practice' });
    sim.loadGraph(design.graph);
    const preview = previewLimits(problem, sim.getGraph(), sim.estimate(), catalog);
    assert.match(preview, /Rough capacity check/);
    assert.match(preview, /retries/);
    sim.start(); sim.advance(86400000);
    const result = sim.result();
    assert(result.passed && result.score.total === 1000, `${problem.id} reference ${design.name}`);
    assert(!learningCredit(problem, answer, { passed: true, reference: true }).eligible);
    for (const q of defenseQuestions(problem, result.graph, result, catalog)) {
      assert(q.evidence.length >= 3);
      assert(q.checklist.some(p => /Quote/.test(p)));
      assert(q.checklist.some(p => /Compare/.test(p)));
      assert(q.checklist.some(p => /threshold.*restore/.test(p)));
    }
    references++;
  }
  const sim = createSim({ catalog, problem });
  const app = sim.addNode('vm-fleet', 0, 0, { units: 1 });
  const db = sim.addNode('sql-primary', 200, 0);
  for (const node of sim.getGraph().nodes.filter(n => catalog.elementById.get(n.type)?.kind === 'source')) sim.connect(node.id, app);
  sim.connect(app, db); sim.start(); sim.advance(86400000);
  const test = repairCase(sim.result(), problem, catalog);
  assert(!repairCorrect(test, null, null, test.value));
  assert(!repairCorrect(test, test.answer, test.effect, NaN));
  assert(!repairCorrect(test, (test.answer + 1) % test.choices.length, test.effect, test.value));
  assert(!repairCorrect(test, test.answer, (test.effect + 1) % test.effects.length, test.value));
  assert(!repairCorrect(test, test.answer, test.effect, test.value + Math.max(2, test.value)));
  assert(repairCorrect(test, test.answer, test.effect, test.value));
  repairs++;
}
const memory = new Map([['progress', { legacy: { attempts: 8, bestScore: 1000, stars: 3, solvedAt: 1700000000000 } }]]);
const progress = createProgress({ get: (k,f) => memory.get(k) ?? f, set: (k,v) => memory.set(k,v) }, { emit() {} });
progress.recordLearning('legacy', { eligible: true, assisted: true });
progress.recordLearning('legacy', { independentTwist: true });
const saved = progress.exportAll();
const merged = mergeProgress(saved, { problems: { legacy: { bestScore: 400, stars: 1, attempts: 2 } } });
assert.equal(merged.problems.legacy.bestScore, 1000);
assert.equal(merged.problems.legacy.solvedAt, 1700000000000);
assert.deepEqual(merged.problems.legacy.learning, saved.problems.legacy.learning);
assert.deepEqual(merged, mergeProgress({ problems: { legacy: { bestScore: 400, stars: 1, attempts: 2 } } }, saved));
assert.equal(questionCoverage('What idempotency guarantees do we need?', [{ q: 'What if the same message is asked for twice?' }])[0], true);
assert.equal(questionCoverage('Can the counter fail open during an outage?', [{ q: 'If the limiter itself breaks, do we let traffic through or block it?' }])[0], true);
assert.equal(questionCoverage('How is consent enforced when a recipient opts out?', [{ q: 'Do people opt out?' }])[0], true);
const scheduled = problems.find(p => p.id === 'job-scheduler');
const previewSim = createSim({ catalog, problem: scheduled });
const previewGraph = structuredClone(scheduled.editorial.designs[0].graph);
previewGraph.nodes.filter(n => n.type === 'worker-pool').forEach(n => { n.units = 12; });
previewSim.loadGraph(previewGraph);
assert.match(previewLimits(scheduled, previewSim.getGraph(), previewSim.estimate(), catalog), /above the 60-second deadline/);
assert.equal(traces, 63);
console.log(`Learning credit: ${problems.length} problems, ${traces} central traces, ${repairs} checked repairs, ${references} full-mark references; legacy and synced mastery preserved.`);
