// Across the bank, an inflated paid pool cannot buy full marks merely by fitting a budget.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problems } from '../content/problems/index.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k=>[k,JSON.parse(fs.readFileSync(`catalog/${k}.json`))])));
const shortener = problems.find(p => p.id === 'url-shortener');
function fixedFloorDay(units) {
  const sim = createSim({ catalog, problem: shortener });
  const graph = structuredClone(shortener.editorial.designs[0].graph);
  const api = graph.nodes.find(n => n.ref === 'api');
  api.units = units;
  api.knobs = { ...api.knobs, autoscale: { on: true, min: 10, max: 10, targetUtil: 0.6 } };
  sim.loadGraph(graph);
  sim.start();
  sim.tick();
  assert.equal(sim.state().nodes.find(n => n.id === 'api').units, 10);
  sim.advance(86400000);
  return sim.result();
}
const fullStart = fixedFloorDay(10), lowStart = fixedFloorDay(2);
assert.deepEqual(lowStart.efficiency, fullStart.efficiency, 'the same billed floor gets the same capacity deduction regardless of build count');
assert(lowStart.efficiency.some(n => n.nodeId === 'api' && n.units === 10));
assert.deepEqual(lowStart.score, fullStart.score);
assert.deepEqual(lowStart.slo.cost, fullStart.slo.cost);
assert.deepEqual(lowStart.nodes, fullStart.nodes, 'both runs measure the same traffic and fleets');
for (const p of problems) {
  const sim = createSim({ catalog, problem: { ...p, requirements: { ...p.requirements, peakRps: p.requirements.peakRps * 0.01, budgetPerMonth: 1e12 } } });
  sim.loadGraph(p.editorial.designs[0].graph);
  const n = sim.getGraph().nodes.find(n=>catalog.elementById.get(n.type).kind==='compute'&&catalog.elementById.get(n.type).cost?.perUnit&&catalog.elementById.get(n.type).units.max>1);
  assert(n,p.id+' has a paid pool');
  const el = catalog.elementById.get(n.type), units = el.units.max;
  sim.setKnob(n.id,'units',units);
  if (el.knobs.includes('autoscale')) sim.setKnob(n.id,'autoscale',{on:false});
  sim.start();sim.advance(86400000);const r=sim.result();
  assert(r.score.total<1000,p.id+' cannot get full marks with a maximum fleet');
  assert(r.efficiency.some(item=>item.nodeId===n.id)||!r.passed,p.id+' exposes the capacity tradeoff or its new failure');
}
console.log(`Efficiency sweep: all ${problems.length} maximum-pool designs at 1% load lose full marks, even with an unlimited budget.`);
