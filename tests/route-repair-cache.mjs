// Repeated route advice reuses verification without sharing mutable repair plans.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { createCatalog } from '../sim/catalog.js';

let compiles = 0;
globalThis.__repairCompile = () => compiles++;
const hook = registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (!url.endsWith('/sim/route.js')) return loaded;
  const source = String(loaded.source);
  const signature = 'export function compile(catalog, graph, env, problem = { traffic: {} }) {';
  assert(source.includes(signature));
  return { ...loaded, source: source.replace(signature, signature + ' globalThis.__repairCompile();') };
} });
const { createSim } = await import('../sim/engine.js');
hook.deregister();
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(name =>
  [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)))])));
const sim = createSim({ catalog, problem: {
  id: 'repair-cache', requirements: { peakRps: 10, mix: { notify: 1 } },
  traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, events: [],
} });
sim.loadGraph({ nodes: [
  { id: 'u', type: 'mobile-app' }, { id: 'producer', type: 'worker-pool' },
  { id: 'q', type: 'queue' }, { id: 'destination', type: 'email-provider' },
], edges: [['u', 'producer'], ['producer', 'q']] });
const first = sim.trace('notify'), original = structuredClone(first.repair);
assert(original?.addNodes?.length, 'the blocked queue needs a distinct downstream consumer');
const verified = compiles;
first.repair.path.length = 0;
first.repair.steps[0][0] = 'corrupted';
first.repair.addNodes[0].id = 'corrupted';
sim.validate();
assert.deepEqual(sim.trace('notify').repair, original, 'returned plans cannot change later advice');
assert.equal(compiles, verified, 'validation and repeated traces do not recompile unchanged repair candidates');
for (const n of original.addNodes) sim.addNode(n.type, 0, 0, { id: n.id });
for (const [from, to] of original.steps) sim.connect(from, to);
assert.equal(sim.trace('notify').repair, null, 'a changed graph discards the old repair');
assert(compiles > verified, 'rewiring compiles the changed graph');
sim.disconnect(original.steps.at(-1).join('>'));
assert(sim.trace('notify').repair, 'removing a delivery hop produces fresh advice');
delete globalThis.__repairCompile;
console.log('Route advice reuses verified repairs and stays independent of returned plans and graph edits.');
