// Captions and side-call plans follow normalized connections and graph edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { connectionCaption } from '../ui/play/connection-caption.js';
import { createInsertionPlanner } from '../render/placement.js';
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
for (const [a, b, kind, phrase] of [['metrics', 'vm-fleet', 'observe', 'Measurements'], ['vm-fleet', 'autoscaler', 'control', 'Control signals'], ['sql-replica', 'sql-primary', 'replication', 'Data copies']]) {
  const sim = createSim({ catalog, mode: 'sandbox' });
  const from = sim.addNode(a, 0, 0), to = sim.addNode(b, 240, 0);
  const id = sim.connect(from, to), graph = sim.getGraph(), edge = graph.edges.find(e => e.id === id);
  assert.equal(edge.kind, kind);
  const name = id => catalog.elementById.get(graph.nodes.find(n => n.id === id).type).name;
  assert.equal(connectionCaption(edge, graph, catalog), `${name(edge.from)} → ${name(edge.to)}. ${phrase} now travel here.`);
  assert.equal(edge.to, from, 'these reverse gestures normalize the destination');
}
const sim = createSim({ catalog, mode: 'sandbox' });
const a = sim.addNode('worker-pool', 0, 0), b = sim.addNode('third-party-api', 240, 0), edge = sim.connect(a, b);
let version = 0, searches = 0;
const plan = createInsertionPlanner({ graph: () => sim.getGraph(), version: () => version, catalog,
  canConnect: (a,b) => sim.canConnect(a,b), freeSpot: (x,y) => { searches++; return {x,y}; } });
const first = plan('idempotency-store', edge);
for (let i = 0; i < 240; i++) assert.equal(plan('idempotency-store', edge), first);
assert.equal(searches, 1, 'preview and caption share one placement search across pointer frames');
sim.moveNode(b, 480, 0); version++;
assert.notEqual(plan('idempotency-store', edge).position.x, first.position.x, 'moves invalidate the position');
assert.equal(searches, 2);
plan('kms', edge); assert.equal(searches, 3, 'part type has its own plan');
const other = sim.addNode('third-party-api', 480, 240), otherEdge = sim.connect(a, other); version++;
plan('idempotency-store', otherEdge); assert.equal(searches, 4, 'a different edge has its own plan');
sim.disconnect(edge); version++;
assert.equal(plan('idempotency-store', edge), null);
console.log('Normalized feedback and cached side-call placement follow endpoints, parts and graph edits.');
