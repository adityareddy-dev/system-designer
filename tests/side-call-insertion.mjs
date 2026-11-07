// Side-call drops retain the delivery path for every catalog service with call-and-return behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { insertionWiring } from '../render/placement.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(name => [name, read(name)])));
const sideCalls = catalog.elements.filter(el => el.kind === 'lookaside' || el.params?.lookasideFor?.length);
for (const part of sideCalls) {
  const sim = createSim({ catalog, mode: 'sandbox' });
  const worker = sim.addNode('worker-pool', 0, 0), api = sim.addNode('third-party-api', 240, 0);
  const edge = sim.connect(worker, api);
  const plan = insertionWiring(sim.getGraph(), part.id, edge, catalog, (a, b) => sim.canConnect(a, b));
  assert.equal(plan?.kind, 'side', part.id);
  const added = sim.addNode(part.id, 120, -160);
  sim.connect(plan.source.id, added);
  const graph = sim.getGraph();
  assert(graph.edges.some(e => e.id === edge), `${part.id} keeps the main route`);
  assert(graph.edges.some(e => e.from === worker && e.to === added), `${part.id} receives a side call`);
  assert(!graph.edges.some(e => e.from === added && e.to === api), `${part.id} returns to its caller`);
}
console.log(`Checked side-call insertion for all ${sideCalls.length} catalog services.`);
