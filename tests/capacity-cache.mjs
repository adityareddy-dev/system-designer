// Capacity reuse matches fresh calculations through events, estimates and fleet edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(name =>
  [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
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
    fresh.debug().effCapInputs = null;
    for (const sim of sims) sim.tick();
    if (tick % 900 === 0) assert.deepEqual(cached.flows(), fresh.flows(), `${id}: tick ${tick}`);
  }
  assert.deepEqual(cached.result(), fresh.result(), `${id}: full day`);
}
console.log('Capacity reuse matches fresh days through events, fleet edits and live estimates.');
