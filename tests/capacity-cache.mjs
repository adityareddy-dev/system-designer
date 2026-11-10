// Cached routing capacities must match fresh calculations through full days and sandbox edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';

const data = Object.fromEntries(['elements', 'requests', 'events', 'world'].map(name => [name,
  JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url), 'utf8'))]));
const catalog = createCatalog(data);
const outageProblem = {
  id: 'preview-outage', requirements: { peakRps: 100, mix: { read: 1 }, userRegions: { us: 1 }, homeRegion: 'us' },
  traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [],
  starter: { nodes: [{ ref: 'users', type: 'web-browser' }], edges: [] },
};
const outageSims = [0, 1].map(() => {
  const sim = createSim({ catalog, problem: outageProblem, mode: 'sandbox', seed: 'preview-outage' });
  for (const region of ['us', 'eu']) {
    sim.addNode('vm-fleet', 200, 0, { id: region, region, units: 10 });
    sim.addNode('sql-primary', 400, 0, { id: region + '-db', region });
    sim.connect('users', region); sim.connect(region, region + '-db');
  }
  sim.start(); sim.fireEvent('region-outage', { region: 'us' }); sim.tick();
  sim.setTraffic({ peakRps: 200, mix: { read: 1 } }); sim.tick();
  return sim;
});
const liveCapacity = outageSims[0].debug().effCap.slice();
outageSims[0].estimate();
assert.deepEqual(outageSims[0].debug().effCap, liveCapacity, 'preview cannot overwrite live outage capacities');
outageSims.forEach(sim => sim.tick());
assert.deepEqual(outageSims[0].state(), outageSims[1].state(), 'preview leaves the next outage tick unchanged');
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

for (const id of ['url-shortener', 'payments-checkout', 'job-scheduler']) {
  const problem = problemById.get(id);
  const sims = [0, 1].map(() => {
    const sim = createSim({ catalog, problem, seed: 'practice' });
    sim.loadGraph(problem.editorial.designs[0].graph);
    sim.start();
    return sim;
  });
  const [cached, fresh] = sims;
  const pool = cached.getGraph().nodes.find(n => catalog.elementById.get(n.type).kind === 'compute');
  for (let tick = 0; tick < 8640; tick++) {
    if ([1200, 3600, 6000].includes(tick)) {
      const max = catalog.elementById.get(pool.type).units.max;
      const units = Math.min(max, pool.units + (tick === 3600 ? 2 : 1));
      for (const sim of sims) sim.setKnob(pool.id, 'units', units);
    }
    if (tick % 600 === 0) cached.estimate();
    fresh.debug().effCap = null;
    for (const sim of sims) sim.tick();
    if (tick % 900 === 0) assert.deepEqual(cached.flows(), fresh.flows(), `${id}: tick ${tick}`);
  }
  assert.deepEqual(cached.result(), fresh.result(), `${id}: full day`);
}
