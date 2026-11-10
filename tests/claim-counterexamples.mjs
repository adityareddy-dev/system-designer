// Analytical fixtures verify the counterexample rules independently of the full-bank replay sweep.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { checkClaim } from '../content/problems/defense-claims.js';
import { problemById } from '../content/problems/index.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(name => [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
function baseline(problem, graph) {
  const sim = createSim({ catalog, problem }); sim.loadGraph(graph); sim.start(); sim.advance(86400000);
  const result = sim.result(); assert(result.passed, 'the analytical fixture must serve its baseline workload');
  return { problem, graph: result.graph, result, catalog };
}
function fixture({ rate = 100, units = 4, zones = 1, dbTier = 'M', cache = false, alternate = false } = {}) {
  const problem = { id: 'claim-fixture', difficulty: 'Hard', requirements: { peakRps: rate, mix: { read: 1 }, availability: .99, latencyP99Ms: { default: 10000 }, dataSafety: 'best-effort', budgetPerMonth: 1e9, userRegions: { us: 1 }, homeRegion: 'us', storageTb: .01 }, traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [] };
  const graph = { nodes: [
    { id: 'client', type: 'web-browser', x: 0, y: 0, locked: true },
    { id: 'app', type: 'vm-fleet', x: 200, y: 0, units, zones },
    { id: 'db', type: 'sql-primary', x: 600, y: 0, tier: dbTier },
    ...(cache ? [{ id: 'cache', type: 'cache', x: 400, y: 0, knobs: { ttlSec: 86400, coalesce: true } }] : []),
    ...(alternate ? [{ id: 'other', type: 'vm-fleet', x: 200, y: 200, units }] : [])
  ], edges: [['client','app'], ...(cache ? [['app','cache'],['cache','db']] : [['app','db']]), ...(alternate ? [['client','other'],['other','db']] : [])] };
  return baseline(problem, graph);
}
function check(kind, context, held, nodeId = 'app') {
  const result = checkClaim({ id: kind, kind, nodeId }, context);
  assert.equal(result.held, held, kind + ': ' + result.steps.join(' '));
  return result;
}
// Four 1,000/s servers can lose one at 2,000/s. Two cannot at 1,800/s.
check('replica', fixture({ rate: 2000, units: 4 }), true);
check('replica', fixture({ rate: 1800, units: 2 }), false);
// Doubling 3,000/s exceeds a four-server pool, whereas doubling 100/s does not.
check('growth', fixture({ rate: 3000, units: 4 }), false);
check('growth', fixture(), true);
// A zone floor that prevents the requested reduction is not a successful cut.
assert.equal(check('cut', fixture({ units: 2, zones: 2 }), false).applied, false);
const expensiveData = fixture({ units: 10, dbTier: 'XL' });
check('cut', expensiveData, true);
check('saving', expensiveData, false); // Cutting 30% of compute cannot remove 30% of a bill that also pays for data.
check('cut', expensiveData, false, 'missing');
// An alternative delivery path, rather than extra capacity on a severed path, survives a missing link.
check('route', fixture(), false);
check('route', fixture({ alternate: true }), true);
// The hot read working set fits a cache; bypassing it exposes an 8,000/s primary to 15,000/s.
check('cold', fixture({ rate: 15000, units: 24, cache: true }), false, 'cache');
check('cold', fixture({ rate: 15000, units: 24, dbTier: 'XL', cache: true }), true, 'cache');
// A hot event needs a modeled boundary carrying relevant traffic when it starts.
assert.equal(check('hot', fixture(), false).applied, false);
assert.equal(check('hot', fixture({ cache: true }), true).applied, true);
const disconnected = fixture();
disconnected.graph.nodes.push({ id: 'idle-cache', type: 'cache', x: 0, y: 200 });
assert.equal(check('hot', disconnected, false).applied, false);
const uncached = fixture({ cache: true });
uncached.problem.requirements.mix = { write: 1 };
assert.equal(check('hot', uncached, false).applied, false, 'a cache carrying only uncacheable writes cannot test hot reads');
for (const id of ['health-records', 'device-notes']) {
  const problem = problemById.get(id), sim = createSim({ catalog, problem });
  sim.loadGraph(problem.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
  const result = sim.result();
  assert.equal(check('hot', { catalog, problem, result, graph: result.graph }, false).applied, false, id);
}
// A retry claim requires lost replies at an active compute target at noon.
assert.equal(check('retry', fixture(), true).applied, true);
const notes = problemById.get('device-notes');
const direct = baseline(notes, notes.editorial.designs[0].graph);
const compute = direct.graph.nodes.find(n => catalog.elementById.get(n.type).kind === 'compute');
assert(compute, 'the Device notes reference has a compute fleet to bypass');
const upstream = direct.graph.edges.filter(e => e.to === compute.id && e.kind === 'flow');
const downstream = direct.graph.edges.filter(e => e.from === compute.id);
const bypass = {
  nodes: direct.graph.nodes.filter(n => n !== compute),
  edges: direct.graph.edges.filter(e => e.to !== compute.id && e.from !== compute.id)
    .concat(upstream.flatMap(a => downstream.map(b => ({ from: a.from, to: b.to }))))
};
assert(!bypass.nodes.some(n => catalog.elementById.get(n.type).kind === 'compute'));
assert.equal(check('retry', baseline(notes, bypass), false).applied, false, 'no compute target');
bypass.nodes.push(compute);
assert.equal(check('retry', baseline(notes, bypass), false).applied, false, 'an idle fleet cannot receive lost replies');
const blocked = fixture();
blocked.graph.nodes.push({ id: 'limiter', type: 'rate-limiter', x: 100, y: 0 });
blocked.graph.edges = blocked.graph.edges.filter(e => e.from !== 'client')
  .concat([{ from: 'client', to: 'limiter' }, { from: 'limiter', to: 'app' }]);
blocked.problem.events = [{ id: 'bad-deploy', at: '11:59', params: { target: 'limiter', errorRate: 1, durationSec: 120 } }];
assert.equal(check('retry', baseline(blocked.problem, blocked.graph), false).applied, false, 'a fleet active earlier and later must carry traffic at the intervention tick');
// The same measured failure supports a committed negative prediction, not an optimistic claim.
const coldOrigin = fixture({ rate: 15000, units: 24, cache: true });
const predictedFailure = checkClaim({ id: 'cold', kind: 'cold', nodeId: 'cache', position: 'fail' }, coldOrigin);
assert.equal(predictedFailure.held, false, 'the measured targets still fail');
assert.equal(predictedFailure.position, 'fail');
assert.equal(predictedFailure.matched, true, 'correctly predicting an unsafe bypass earns prediction credit');
assert.equal(checkClaim({ id: 'cold', kind: 'cold', nodeId: 'cache', position: 'hold' }, coldOrigin).matched, false);
const predictedHold = checkClaim({ id: 'growth', kind: 'growth', position: 'hold' }, fixture());
assert.equal(predictedHold.matched, true);
assert.equal(checkClaim({ id: 'growth', kind: 'growth', position: 'fail' }, fixture()).matched, false);
for (const position of ['hold', 'fail']) {
  const untested = checkClaim({ id: 'cut', kind: 'cut', nodeId: 'app', position }, fixture({ units: 2, zones: 2 }));
  assert.equal(untested.outcome, 'untested');
  assert.equal(untested.matched, null, 'an unapplied intervention neither supports nor contradicts a prediction');
  assert.match(untested.steps.at(-1), /Not tested by this replay/);
  assert.doesNotMatch(untested.steps.at(-1), /Claim failed/);
  assert(untested.steps.some(s => /Try .+before replaying/.test(s)), 'unsupported experiments explain how to become applicable');
}
// A disconnected part and an idle edge do not exercise the advertised boundary.
const unused = fixture();
unused.graph.nodes.push({ id: 'unused-cache', type: 'cache', x: 0, y: 300 }, { id: 'unused-app', type: 'vm-fleet', units: 20, x: 200, y: 300 });
const unusedContext = baseline(unused.problem, unused.graph);
for (const [kind, nodeId] of [['cold', 'unused-cache'], ['replica', 'unused-app'], ['cut', 'unused-app'], ['saving', 'unused-app'], ['distance', 'unused-app']]) {
  const checked = checkClaim({ id: kind, kind, nodeId, position: 'fail' }, unusedContext);
  assert.equal(checked.applied, false, kind + ' must target a part carrying baseline work');
  assert.equal(checked.outcome, 'untested'); assert.equal(checked.matched, null);
}
const idleFirst = { ...unused.graph, edges: [['unused-app', 'db'], ...unused.graph.edges] };
const routeContext = baseline(unused.problem, idleFirst);
const routeTest = checkClaim({ id: 'route', kind: 'route', position: 'fail' }, routeContext);
assert.equal(routeTest.applied, true);
assert(routeTest.steps.some(s => s.startsWith('Disconnect ') && s.includes('client')), 'route replay skips the first edge when it carried no requests');
const noTrafficProblem = { ...unused.problem, traffic: { ...unused.problem.traffic, curve: 'no-traffic' } };
const noTrafficCatalog = { ...catalog, world: { ...catalog.world, curves: { ...catalog.world.curves, 'no-traffic': Array(24).fill(0) } } };
const noSourceSim = createSim({ catalog: noTrafficCatalog, problem: noTrafficProblem });
noSourceSim.loadGraph({ nodes: unused.graph.nodes.filter(n => n.id !== 'client'), edges: [] });
noSourceSim.start(); noSourceSim.advance(86400000);
const noSource = noSourceSim.result();
assert(noSource.timeline.every(row => row.offeredRps === 0), 'fixture offers no traffic despite a positive configured peak');
assert.equal(checkClaim({ id: 'growth', kind: 'growth', position: 'fail' }, { catalog: noTrafficCatalog, problem: noTrafficProblem, graph: noSource.graph, result: noSource }).outcome, 'untested', 'positive configured peak is not evidence of offered traffic');
console.log('Claim fixtures passed for surviving capacity, growth, minimum fleets, whole-bill savings, alternate routes, cold origins, applicable hot items and retry targets.');
