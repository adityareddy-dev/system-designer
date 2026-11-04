// Diagram inspection preserves direction, terminates cycles and separates regions.
import assert from 'node:assert/strict';
import { pathsThrough, regionLayout } from '../render/diagram.js';
import { createCamera } from '../render/camera.js';
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
const large = { nodes: Array.from({ length: 27 }, (_, i) => ({ id: `n${i}`, region: i < 14 ? 'us' : 'eu' })), edges: [] };
const arranged = regionLayout(large, { width: 628, height: 406 });
assert.deepEqual(regionLayout(large, { width: 628, height: 406 }), arranged, 'layout is deterministic');
assert(large.nodes.every(n => n.x === undefined), 'layout does not mutate the graph');
const camera = createCamera({ position: { set() {} }, scale: { set() {} } });
camera.resize(1360, 800);
camera.fitBounds(Math.min(...arranged.map(n => n.x)) - 36, -50,
  Math.max(...arranged.map(n => n.x)) + 36, Math.max(...arranged.map(n => n.y)) + 66,
  { l: 350, r: 382, t: 100, b: 294 }, false, { minZ: 0.2, maxZ: 1.4 });
const points = arranged.map(n => camera.worldToScreen(n.x, n.y));
for (const p of points) {
  assert(p.x - 40 >= 304 && p.x + 40 <= 1024, 'names stay between the side panels');
  assert(p.y - 36 * camera.zoom >= 64 && p.y + 36 * camera.zoom + 50 <= 564, 'names stay above the HUD');
}
for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
  assert(Math.abs(points[i].x - points[j].x) >= 80 || Math.abs(points[i].y - points[j].y) >= 72,
    'neighbouring names and parts have collision spacing');
}
assert(camera.zoom >= 0.3, 'the arranged design keeps names visible');
console.log('Diagram checks passed');
