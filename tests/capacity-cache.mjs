// Cached routing capacities must match fresh calculations through full days and sandbox edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';

const data = Object.fromEntries(['elements', 'requests', 'events', 'world'].map(name => [name,
  JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url), 'utf8'))]));
const catalog = createCatalog(data);
function pair(id, mode = 'practice') {
  const problem = problemById.get(id);
  return [0, 1].map(() => {
    const sim = createSim({ catalog, problem, mode, seed: 'capacity-cache' });
    sim.loadGraph(problem.editorial.designs[0].graph);
    sim.start();
    return sim;
  });
}
function advance(sims, ticks) {
  const [cached, fresh] = sims;
  for (let i = 0; i < ticks; i++) {
    fresh.debug().effCap = null;
    cached.tick(); fresh.tick();
  }
  assert.deepEqual(cached.debug().effCap, fresh.debug().effCap);
  assert.deepEqual(cached.state(), fresh.state());
}
for (const id of ['url-shortener', 'notification-service', 'bank-ledger']) {
  const sims = pair(id);
  advance(sims, catalog.world.sim.dayMs / catalog.world.sim.tickMs);
  assert.deepEqual(sims[0].result(), sims[1].result(), id);
}

const sims = pair('url-shortener', 'sandbox');
advance(sims, 120);
for (const sim of sims) {
  const app = sim.getGraph().nodes.find(n => n.type === 'vm-fleet' || n.type === 'container-cluster');
  assert.ok(app);
  sim.setKnob(app.id, 'units', 3);
  sim.setKnob(app.id, 'autoscale', { on: true, min: 3, max: 30, targetUtil: 0.6 });
  sim.fireEvent('slow-dependency');
  sim.fireEvent('zone-outage');
}
advance(sims, 240);
for (const sim of sims) {
  sim.setTraffic({ peakRps: 5000, mix: { read: 0.6, write: 0.3, search: 0.1 }, userRegions: { us: 0.5, eu: 0.5 } });
  sim.fireEvent('ddos-attack');
}
advance(sims, 240);
console.log('Cached capacities match fresh calculations through full days, outages, autoscaling and traffic edits.');
