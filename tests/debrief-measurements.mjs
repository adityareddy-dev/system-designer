// Regression checks for unserved request speed and observed event overload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
const read = name => JSON.parse(fs.readFileSync(new URL('../catalog/' + name + '.json', import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const base = problemById.get('url-shortener');
const run = (problem, graph) => {
  const sim = createSim({ catalog, problem, seed: 'debrief-measurements' });
  sim.loadGraph(graph);
  sim.start(); sim.advance(86400000);
  return sim.result();
};
const mixed = { ...base, events: [], requirements: { ...base.requirements, peakRps: 10, mix: { read: 0.9, payment: 0.1 }, latencyP99Ms: { read: 1000, payment: 1000 } } };
const result = run(mixed, base.editorial.designs[0].graph);
assert.ok(result.slo.availability.actual > 0.5);
assert.equal(result.slo.latency.byType.payment.measured, false);
assert.equal(result.slo.latency.byType.payment.servedCount, 0);
assert.equal(result.slo.latency.byType.read.measured, true);
assert.ok(result.slo.latency.byType.read.servedCount > 0);
assert.ok(result.slo.latency.byType.read.p99Ms > 0);
const empty = run(mixed, { nodes: [], edges: [] });
assert.ok(Object.values(empty.slo.latency.byType).every(v => !v.measured));
const quiet = run({ ...base, requirements: { ...base.requirements, peakRps: 1 } }, base.editorial.designs[0].graph);
assert.ok(quiet.nodes.every(n => n.peakUtil < 1 && n.minutesOverloaded === 0));
const events = quiet.events.filter(e => e.durations);
assert.ok(events.length > 0);
for (const event of events) {
  assert.ok(event.durations.observedSec > 0);
  assert.equal(event.durations.overloadSec, 0, event.name);
}
const busy = run({ ...base, requirements: { ...base.requirements, peakRps: 1000000 } }, base.editorial.designs[0].graph);
assert.ok(busy.events.some(e => e.durations?.overloadSec > 0));
console.log('Debrief request measurements and observed overload passed.');


// The action and prose must use the same measured demand, including retry amplification.
const weak = createSim({ catalog, problem: base, seed: 'reported-sizing' });
const app = weak.addNode('vm-fleet', 0, 0, { units: 2 });
const db = weak.addNode('sql-primary', 200, 0);
for (const n of weak.getGraph().nodes.filter(n => catalog.elementById.get(n.type).kind === 'source')) weak.connect(n.id, app);
weak.connect(app, db); weak.start(); weak.advance(86400000);
const sizing = weak.result().nextStep;
assert.equal(sizing.sizing.units, 55);
assert.match(sizing.text, /= 55 servers/);
assert.match(sizing.text, /including retries and repeat visits/);
assert.match(weak.canConnect('queue', 'third-party-api').reason, /Background workers/);

// A down fleet's zero-capacity utilization sentinel is not measured saturation.
function outageTrial(units, zones, peakRps) {
  const problem = { id: 'outage-evidence', requirements: { peakRps, mix: { read: 1 }, latencyP99Ms: { default: 1000 } },
    traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [{ id: 'zone-outage', at: '12:00' }] };
  const sim = createSim({ catalog, problem, seed: 'practice' });
  const src = sim.addNode('web-browser', -200, 0), app = sim.addNode('vm-fleet', 0, 0, { units, zones });
  const db = sim.addNode('sql-primary', 200, 0, { units: 50, zones: 3 });
  sim.connect(src, app); sim.connect(app, db); sim.start(); sim.advance(86400000);
  return { result: sim.result(), app };
}
const downFleet = outageTrial(2, 1, 100);
assert.equal(downFleet.result.firstFailure.kind, 'dependency');
assert.equal(downFleet.result.firstFailure.nodeId, downFleet.app);
assert.equal(downFleet.result.firstFailure.atMs, 12 * 3600000);
assert(downFleet.result.nodes.find(n => n.id === downFleet.app).peakUtil < 1);
const saturatedFleet = outageTrial(2, 3, 10000);
assert.equal(saturatedFleet.result.firstFailure.kind, 'capacity', 'available saturated capacity still qualifies');
const metrics = problemById.get('observability-platform');
const reference = createSim({ catalog, problem: metrics, seed: 'practice' });
reference.loadGraph(metrics.editorial.designs[0].graph); reference.start(); reference.advance(86400000);
const distributor = reference.result().nodes.find(n => n.id === 'dist');
assert.equal(distributor.peakUnits, 28);
assert.equal(distributor.peakInstalledUnits, 42);
assert.equal(Math.round(distributor.effectiveRpsPerUnit), 1000);
