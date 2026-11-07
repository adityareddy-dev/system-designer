// Analytical fixtures verify the counterexample rules independently of the full-bank replay sweep.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { checkClaim } from '../content/problems/defense-claims.js';
import { problemById } from '../content/problems/index.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(name => [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
function fixture({ rate = 100, units = 4, zones = 1, dbTier = 'M', cache = false, alternate = false } = {}) {
  const problem = { id: 'claim-fixture', difficulty: 'Hard', requirements: { peakRps: rate, mix: { read: 1 }, availability: .99, latencyP99Ms: { default: 10000 }, dataSafety: 'best-effort', budgetPerMonth: 1e9, userRegions: { us: 1 }, homeRegion: 'us', storageTb: .01 }, traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [] };
  const graph = { nodes: [
    { id: 'client', type: 'web-browser', x: 0, y: 0, locked: true },
    { id: 'app', type: 'vm-fleet', x: 200, y: 0, units, zones },
    { id: 'db', type: 'sql-primary', x: 600, y: 0, tier: dbTier },
    ...(cache ? [{ id: 'cache', type: 'cache', x: 400, y: 0, knobs: { ttlSec: 86400, coalesce: true } }] : []),
    ...(alternate ? [{ id: 'other', type: 'vm-fleet', x: 200, y: 200, units }] : [])
  ], edges: [['client','app'], ...(cache ? [['app','cache'],['cache','db']] : [['app','db']]), ...(alternate ? [['client','other'],['other','db']] : [])] };
  const sim = createSim({ catalog, problem }); sim.loadGraph(graph); sim.start(); sim.advance(86400000);
  const result = sim.result(); assert(result.passed, 'the analytical fixture must serve its baseline workload');
  return { problem, graph: result.graph, result, catalog };
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
console.log('Claim fixtures passed for surviving capacity, growth, minimum fleets, whole-bill savings, alternate routes, cold origins and applicable hot items.');
