// Every problem's visible contract agrees with effective scoring, including deadlines and retention.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems } from '../content/problems/index.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim, latencyTarget, queueLimitFor } from '../sim/engine.js';
import { checkpointCorrect } from '../ui/play/correctness.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`))])));
let references = 0, retention = 0, correctness = 0;
for (const p of problems) {
  const r = p.requirements;
  assert(Object.keys(r.userRegions).every(id => catalog.world.regions.some(region => region.id === id)), p.id + ' uses actual regions');
  for (const id of Object.keys(r.mix)) {
    const rt = catalog.requestById.get(id);
    assert(queueLimitFor(r, rt) > 0, p.id + '/' + id);
    if (r.queueDeadlineSec?.[id]) assert.equal(queueLimitFor(r, rt), r.queueDeadlineSec[id]);
  }
  for (const d of p.editorial.designs) {
    const sim = createSim({ catalog, problem: p, seed: 'practice' }); sim.loadGraph(d.graph);
    sim.start(); sim.advance(86400000); const result = sim.result(); references++;
    assert(result.passed, `${p.id}/${d.name}: ${result.verdict}`);
    assert.equal(result.score.total, 1000, `${p.id}/${d.name}: every reference earns full marks`);
    assert.equal(result.slo.availability.target, r.availability, p.id);
    assert.equal(result.slo.cost.budget, r.budgetPerMonth, p.id);
    for (const [id, v] of Object.entries(result.slo.latency.byType)) assert.equal(v.targetMs, latencyTarget(r.latencyP99Ms, catalog.requestById.get(id)), p.id + '/' + id);
    assert(result.queues.every(q => Object.keys(r.mix).some(id => queueLimitFor(r, catalog.requestById.get(id)) === q.limitSec)), p.id + ' queue limit is a workload deadline');
    if (r.retentionDays) {
      const short = sim.getGraph();
      short.nodes = short.nodes.map(n => catalog.elementById.get(n.type).kind === 'store' ? { ...n, knobs: { ...n.knobs, retentionDays: 1 } } : n);
      sim.reset(); sim.loadGraph(short);
      assert(sim.validate().some(i => i.code === 'retention'), p.id + ' cannot silently shorten promised history'); retention++;
    }
  }
  const words = [p.brief, ...p.clarify.map(c => c.a)].join(' ');
  if (/exactly.once|twice|duplicates|sequence|order of edits|never.*lost|never lose/i.test(words) || r.dataSafety !== 'best-effort') {
    assert(p.correctness?.fields?.length >= 2, p.id + ' has a checked failure trace');
    const answer = { text: 'The retry must preserve the committed operation and its durable outcome.', choices: p.correctness.fields.map(f => f.correct) };
    assert(checkpointCorrect(p.correctness, answer), p.id);
    for (let i = 0; i < answer.choices.length; i++) { const wrong = { ...answer, choices: [...answer.choices] }; wrong.choices[i] = 1 - wrong.choices[i]; assert(!checkpointCorrect(p.correctness, wrong), p.id + ' checks every step'); }
    correctness++;
  }
}
const scheduler = problems.find(p => p.id === 'job-scheduler');
assert.equal(queueLimitFor(scheduler.requirements, catalog.requestById.get('webhook')), 60);
assert.match(scheduler.clarify[0].a, /60 seconds/);
assert(!/exactly once/.test(scheduler.brief), 'an arbitrary external endpoint cannot guarantee one effect');
assert.equal(queueLimitFor(problems.find(p => p.id === 'otp-sms-delivery').requirements, catalog.requestById.get('notify')), 10);
console.log(`Promise sweep: ${problems.length} problems, ${references} full-mark references, ${retention} retention trials, ${correctness} checked correctness traces.`);
