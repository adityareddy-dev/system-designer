// Every workload rejects unchanged references on transfer and checks each defense against broken routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems } from '../content/problems/index.js';
import { twistProblem } from '../content/problems/twist.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { defenseQuestions } from '../ui/play/interview.js';
import { checkClaim } from '../content/problems/defense-claims.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(name => [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
const run = (problem, graph) => { const sim = createSim({ catalog, problem, seed: 'practice' }); sim.loadGraph(graph); sim.start(); sim.advance(86400000); return sim.result(); };
let references = 0, prompts = 0, claims = 0, held = 0, failed = 0;
for (const problem of problems) {
  const twist = twistProblem(problem);
  assert(twist.requirements.budgetPerMonth < problem.requirements.budgetPerMonth, problem.id + ' has a binding changed constraint');
  assert.equal(twist.numbers[0].value, twist.requirements.peakRps);
  assert.equal(twist.numbers[2].value, twist.requirements.budgetPerMonth);
  const results = [];
  for (const design of problem.editorial.designs) {
    const own = run(problem, design.graph); assert.equal(own.score.total, 1000, problem.id); assert(own.passed);
    results.push(own);
    const old = run(twist, design.graph); assert(!old.passed, problem.id + ' unchanged base reference must miss transfer'); references++;
  }
  const reference = run(twist, twist.editorial.designs[0].graph);
  assert(reference.passed && reference.score.total === 1000, problem.id + ' twist reference');
  for (const result of results) {
  const graph = result.graph;
  const broken = { ...graph, edges: graph.edges.filter(e => !graph.nodes.some(n => n.id === e.from && catalog.elementById.get(n.type).kind === 'source')) };
  for (const prompt of defenseQuestions(problem, graph, result, catalog)) {
    prompts++; assert(prompt.claims.length >= 2 && prompt.claims.length <= 4);
    for (const claim of prompt.claims) {
      const context = { problem, graph, result, catalog };
      const checked = checkClaim(claim, context);
      const service = checked.checks.availability && checked.checks.latency;
      const expected = claim.kind === 'saving' ? service && checked.checks.safety && checked.cost <= result.slo.cost.perMonth * .7 : claim.kind === 'cut' ? service && checked.checks.safety : service;
      assert.equal(checked.held, checked.applied && expected, problem.id + ' ' + claim.id);
      assert(checked.steps.length >= 4 && checked.steps.at(-1).includes(checked.held ? 'Claim held' : 'Claim failed'));
      assert(!checkClaim(claim, { ...context, graph: broken }).held, problem.id + ' broken ' + claim.id);
      if (claims % 30 === 0) assert.deepEqual(checkClaim(claim, context), checked, 'replays are deterministic');
      checked.held ? held++ : failed++; claims++;
    }
  }
  }
}
assert(held > 0 && failed > 0, 'reference counterexamples include supported and unsupported claims');
console.log(`${problems.length} transfers, ${references} unchanged base references rejected, ${prompts} prompts, ${claims} claims checked on own and broken graphs (${held} held, ${failed} failed on reference counterexamples).`);
