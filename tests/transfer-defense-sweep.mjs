// Every workload rejects unchanged references on transfer and checks each defense against broken routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { problems } from '../content/problems/index.js';
import { twistProblem } from '../content/problems/twist.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { defenseQuestions } from '../ui/play/interview.js';
import { checkClaim } from '../content/problems/defense-claims.js';
import sizing, { twistSizing } from '../content/sizing.js';
if (process.argv.length === 2) {
  const lanes = Array.from({ length: Math.min(4, availableParallelism()) }, () => []);
  problems.forEach((problem, i) => lanes[i % lanes.length].push(problem.id));
  const children = [];
  const outputs = await Promise.all(lanes.map(ids => new Promise((resolve, reject) => {
    children.push(execFile(process.execPath, [fileURLToPath(import.meta.url), ...ids], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stdout + stderr)) : resolve(stdout)));
  }))).catch(error => { children.forEach(child => child.kill()); throw error; });
  const totals = outputs.map(out => JSON.parse(out.trim().split('\n').at(-1))).reduce((a, b) => a.map((n, i) => n + b[i]), [0, 0, 0, 0, 0, 0]);
  assert.equal(totals[0], problems.length);
  assert(totals[4] > 0 && totals[5] > 0);
  console.log(`${totals[0]} transfers, ${totals[1]} unchanged base references rejected, ${totals[2]} prompts, ${totals[3]} claims checked on own and broken graphs (${totals[4]} held, ${totals[5]} failed on reference counterexamples).`);
  process.exit(0);
}
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(name => [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
const run = (problem, graph) => { const sim = createSim({ catalog, problem, seed: 'practice' }); sim.loadGraph(graph); sim.start(); sim.advance(86400000); return sim.result(); };
let references = 0, prompts = 0, claims = 0, held = 0, failed = 0, checkedProblems = 0;
for (const problem of problems) {
  if (!process.argv.slice(2).includes(problem.id)) continue;
  checkedProblems++;
  const twist = twistProblem(problem);
  assert(twist.requirements.budgetPerMonth < problem.requirements.budgetPerMonth, problem.id + ' has a binding changed constraint');
  const crowd = twist.events.find(e => e.id === 'flash-crowd');
  const arrivals = twist.requirements.peakRps * (twist.traffic.curve === 'drop' && crowd ? .1 * (crowd.params?.factor || 25) : 1);
  assert(Math.abs(twist.numbers[0].value - arrivals) < 1e-8, problem.id + ' arrival estimate follows the scenario curve and event');
  assert.equal(twist.numbers[2].value, twist.requirements.budgetPerMonth);
  const results = [];
  for (const design of problem.editorial.designs) {
    const own = run(problem, design.graph); assert.equal(own.score.total, 1000, problem.id); assert(own.passed);
    results.push(own);
    const old = run(twist, design.graph); assert(!old.passed, problem.id + ' unchanged base reference must miss transfer'); references++;
  }
  const reference = run(twist, twist.editorial.designs[0].graph);
  assert(reference.passed && reference.score.total === 1000, problem.id + ' twist reference');
  if (problem.difficulty === 'Hard') {
    const measured = twistSizing[problem.id].find(m => m.graphKey === JSON.stringify(twist.editorial.designs[0].graph));
    assert(measured, problem.id + ' twist evidence matches the actual graph');
    assert.equal(measured.score, reference.score.total);
    assert.equal(measured.passed, reference.passed);
    assert.equal(measured.cost, reference.slo.cost.perMonth);
    for (const row of measured.rows) {
      const node = reference.graph.nodes.find(n => n.id === row.id), metric = reference.nodes.find(n => n.id === row.id);
      assert.equal(row.type, node.type); assert.equal(row.installed, node.units); assert.equal(row.tier, node.tier);
      assert.equal(row.peakUtil, metric.peakUtil); assert.equal(row.peakRequests, Math.round(metric.peakRequests));
    }
    for (const design of problem.editorial.designs) assert(sizing[problem.id].some(m => m.graphKey === JSON.stringify(design.graph)), problem.id + ' original evidence retained');
  }
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
console.log(JSON.stringify([checkedProblems, references, prompts, claims, held, failed]));
