// Check that the replication lesson's wiring and sizing advice reaches its goal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import lesson from '../content/lessons/replication-lag.js';
import { replicaReadsActive } from '../ui/play/lesson-replica.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url), 'utf8'));
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map((name) => [name, read(name)])));
const demo = lesson.steps.find((step) => step.kind === 'demo');
const problem = { id: lesson.id, ...demo.setup };
const sim = createSim({ catalog, problem, mode: 'lesson', seed: lesson.id });
const replica = sim.addNode('sql-replica', 60, 120);
sim.start();
sim.tick();
assert.equal(replicaReadsActive(sim.getGraph(), sim.flows()), false, 'loose replicas do not meet the goal');
sim.connect('db', replica);
sim.tick();
assert.equal(replicaReadsActive(sim.getGraph(), sim.flows()), false, 'copying data alone does not send reads');
sim.connect('app', replica);
assert.equal(sim.getGraph().edges.find((e) => e.from === 'db' && e.to === replica).kind, 'replication');
assert.equal(sim.getGraph().edges.find((e) => e.from === 'app' && e.to === replica).kind, 'flow');
sim.advance(10 * 3600000);
assert.equal(replicaReadsActive(sim.getGraph(), sim.flows()), true, 'both links carry replica reads');
assert.ok(sim.state().nodes.find((n) => n.id === 'db').util > demo.goal.value, 'one replica still needs sizing');
sim.setKnob(replica, 'units', 4);
let heldMs = 0;
for (let i = 0; i < 60; i++) {
  sim.tick();
  const db = sim.state().nodes.find((n) => n.id === 'db');
  heldMs = db.util <= demo.goal.value && replicaReadsActive(sim.getGraph(), sim.flows()) ? heldMs + catalog.world.sim.tickMs : 0;
}
assert.ok(heldMs >= demo.goal.holdSec * 1000, 'four replicas hold the goal at peak');
const flows = sim.flows();
const rate = (from, to, type) => {
  const edge = sim.getGraph().edges.find((e) => e.from === from && e.to === to);
  return flows.edgeRps[flows.edgeIds.indexOf(edge.id) * flows.typeIds.length + flows.typeIds.indexOf(type)];
};
assert.ok(rate('app', replica, 'read') > 0, 'reads use the replica group');
assert.equal(rate('app', replica, 'write'), 0, 'replicas receive no application writes');
assert.ok(rate('app', 'db', 'write') > 0, 'writes retain the primary path');
assert.equal(replicaReadsActive(sim.getGraph(), { ...sim.flows(), edgeRps: new Float32Array(sim.flows().edgeRps.length) }), false, 'wiring without flowing reads does not meet the goal');
sim.disconnect('app>db');
sim.tick();
assert.equal(replicaReadsActive(sim.getGraph(), sim.flows()), false, 'the primary write path must stay connected');
sim.connect('app', 'db');
sim.disconnect(`db>${replica}`);
sim.tick();
assert.equal(replicaReadsActive(sim.getGraph(), sim.flows()), false, 'reads without a data copy cannot meet the goal');
console.log('Replication lesson wiring and four-replica sizing pass.');
