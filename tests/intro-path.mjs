// Intro insertion goals require both directed links and no original bypass.
import assert from 'node:assert/strict';
import { introPathHolds, repairInsertion } from '../ui/play/intro-path.js';
import intro from '../content/lessons/intro.js';
import { goalPassed } from '../ui/play/goal-feedback.js';
import { createSim } from '../sim/engine.js';
import { createCatalog } from '../sim/catalog.js';
import { readFile } from 'node:fs/promises';

const insertions = intro.steps[0].beats.filter(b => b.waitFor?.path);
assert.equal(insertions.length, 2, 'Both intro insertions require a path');
for (const beat of insertions) {
  const spec = beat.waitFor, [from, to] = spec.path;
  const graph = { nodes: [{ id: 'part', type: spec.type }], edges: [] };
  const edge = (a, b, kind = 'flow') => ({ from: a, to: b, kind });
  assert.equal(introPathHolds(graph, spec), false, 'A loose part cannot pass');
  graph.edges = [edge(from, 'part')];
  assert.equal(introPathHolds(graph, spec), false, 'Both sides must connect');
  graph.edges.push(edge('part', to));
  assert.equal(introPathHolds(graph, spec), true, 'A completed insertion passes');
  graph.edges.push(edge(from, to));
  assert.equal(introPathHolds(graph, spec), false, 'The original bypass must be removed');
  graph.edges = [edge('part', from), edge(to, 'part')];
  assert.equal(introPathHolds(graph, spec), false, 'Reversed links cannot pass');
  graph.edges = [edge(from, 'part', 'observe'), edge('part', to)];
  assert.equal(introPathHolds(graph, spec), false, 'Only traffic links count');
}
const data = await Promise.all(['elements', 'requests', 'events', 'world'].map(async name =>
  [name, JSON.parse(await readFile(new URL(`../catalog/${name}.json`, import.meta.url), 'utf8'))]));
const sim = createSim({ catalog: createCatalog(Object.fromEntries(data)), problem: intro.steps[0].setup, mode: 'intro' });
const specs = intro.steps[0].beats.filter(b => b.waitFor).map(b => b.waitFor);
const ready = () => specs.every(spec => introPathHolds(sim.getGraph(), spec));
const lb = sim.addNode('regional-lb', 0, 100), cache = sim.addNode('cache', 100, 100);
sim.setKnob('app', 'units', 3);
sim.setKnob('app', 'autoscale', { on: true });
assert.equal(ready(), false, 'Clicking loose parts must not unlock victory');
for (const [from, mid, to] of [['users', lb, 'app'], ['app', cache, 'db']]) {
  sim.disconnect(sim.getGraph().edges.find(e => e.from === from && e.to === to).id);
  sim.connect(from, mid); sim.connect(mid, to);
}
assert.equal(ready(), true, 'The instructed chain and app settings unlock victory');
sim.setKnob('app', 'autoscale', { on: false });
const spare = sim.addNode('vm-fleet', 0, 200);
sim.setKnob(spare, 'units', 30); sim.setKnob(spare, 'autoscale', { on: true });
assert.equal(ready(), false, 'A loose fleet cannot supply autoscaling credit');
sim.setKnob('app', 'autoscale', { on: true });
sim.disconnect(sim.getGraph().edges.find(e => e.from === 'users').id);
assert.equal(ready(), false, 'Removing an earlier connection revokes completion');
assert.equal(goalPassed({ metric: 'util', op: '<=', value: 0.7 }, 0.42, 'SQL'),
  'Check passed now: SQL busy 42%, goal at most 70%.');
assert.match(goalPassed({ metric: 'cost', op: '<=', value: 2000 }, 1500), /Cost \$1,500 a month, goal at most \$2,000/);
console.log('Intro path and lesson feedback checks passed.');

{
  const sim = createSim({ catalog: createCatalog(Object.fromEntries(data)), problem: { id: 'repair', requirements: { peakRps: 100, mix: { read: 1 } }, traffic: { sources: { 'web-browser': 1 } } }, mode: 'intro' });
  const source = sim.addNode('web-browser', -400, 0), app = sim.addNode('vm-fleet', 0, 0), db = sim.addNode('sql-primary', 300, 0);
  const cache = sim.addNode('cache', -200, 0);
  sim.connect(source, cache); sim.connect(cache, app); sim.connect(app, db);
  const spec = { type: 'cache', path: [app, db] };
  repairInsertion(sim, spec, () => ({ x: 150, y: 0 }));
  assert(introPathHolds(sim.getGraph(), spec));
  assert(sim.getGraph().edges.some(e => e.from === source && e.to === app), 'wrong-wire insertion restores the old route');
  const inserted = sim.getGraph().nodes.find(n => n.type === 'cache'); sim.removeNode(inserted.id);
  repairInsertion(sim, spec, () => ({ x: 150, y: 0 }));
  assert(introPathHolds(sim.getGraph(), spec), 'retry restores the intended wire even after the misplaced part was deleted');
}
