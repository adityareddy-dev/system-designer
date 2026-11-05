// Measure displacement caused by inserting into short and already roomy routes.
import assert from 'node:assert/strict';
import { insertionLayout } from '../render/placement.js';
for (const vertical of [false, true]) for (const span of [180, 280, 600]) {
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: span, y: 0 },
    { id: 'c', x: span + 200, y: 0 }, { id: 'sibling', x: span, y: 260 }];
  if (vertical) for (const n of nodes) [n.x, n.y] = [n.y, n.x];
  const graph = { nodes, edges: [{ id: 'ab', from: 'a', to: 'b' }] };
  const original = JSON.stringify(graph), result = insertionLayout(graph, 'ab');
  const distances = nodes.map(n => { const p = result.moves.find(p => p.id === n.id) || n; return [n.id, Math.hypot(p.x - n.x, p.y - n.y)]; });
  assert.equal(JSON.stringify(graph), original);
  assert.equal(distances.find(([id]) => id === 'a')[1], 0);
  assert.equal(distances.find(([id]) => id === 'sibling')[1], 0);
  assert.equal(distances.find(([id]) => id === 'c')[1], Math.max(0, (vertical ? 288 : 240) - span - (200 - (vertical ? 144 : 120))));
  assert.equal(distances.find(([id]) => id === 'b')[1], Math.max(0, (vertical ? 288 : 240) - span));
  console.log(`${vertical ? 'Vertical' : 'Horizontal'} ${span}: displacement ${JSON.stringify(distances)}`);
}
