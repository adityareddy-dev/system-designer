// Intro insertion goals require both directed links and no original bypass.
import assert from 'node:assert/strict';
import { introPathHolds } from '../ui/play/intro-path.js';
import intro from '../content/lessons/intro.js';

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
console.log('Intro path checks passed.');
