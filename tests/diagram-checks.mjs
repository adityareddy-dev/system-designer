// Diagram inspection preserves direction, terminates cycles and separates regions.
import assert from 'node:assert/strict';
import { pathsThrough, regionLayout } from '../render/diagram.js';
const graph = { nodes: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, region: i < 3 ? 'us' : 'eu', x: 0, y: 0 })), edges: [
  { id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' },
  { id: 'ca', from: 'c', to: 'a' }, { id: 'ad', from: 'a', to: 'd' },
  { id: 'ce', from: 'c', to: 'e', kind: 'observe' },
] };
const focus = pathsThrough(graph, 'b');
assert.deepEqual([...focus.nodes].sort(), ['a', 'b', 'c', 'd']);
assert(!focus.edges.has('ce'));
const branch = pathsThrough({ ...graph, edges: graph.edges.filter(e => e.id !== 'ca') }, 'b');
assert(!branch.nodes.has('d'), 'a sibling branch is not on the selected path');
const before = JSON.stringify(graph);
const layout = regionLayout(graph);
assert.equal(JSON.stringify(graph), before);
assert.equal(new Set(layout.map(n => `${n.x},${n.y}`)).size, graph.nodes.length);
assert(Math.min(...layout.slice(3).map(n => n.y)) > Math.max(...layout.slice(0, 3).map(n => n.y)) + 180);
console.log('Diagram checks passed');
