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

for (const vertical of [false, true]) for (const sign of [-1, 1]) for (const span of [20, 100]) {
  const gap = vertical ? 144 : 120;
  const route = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: span, y: 0 },
    { id: 'c', x: span + 100, y: 0 }, { id: 'd', x: span + 200, y: 0 },
    { id: 'tail', x: 800, y: 0 }, { id: 'sibling', x: span + 100, y: 260 }];
  for (const n of route) { n.x *= sign; if (vertical) [n.x, n.y] = [n.y, n.x]; }
  const expected = new Map(route.map(n => [n.id, { ...n }]));
  for (const [i, id] of ['b', 'c', 'd'].entries()) expected.get(id)[vertical ? 'y' : 'x'] = sign * gap * (i + 2);
  for (const nodes of [route, [...route].reverse(), [route[3], route[0], route[2], route[5], route[1], route[4]]]) {
    const graph = { nodes, edges: [{ id: 'ab', from: 'a', to: 'b' }] };
    const original = JSON.stringify(graph), result = insertionLayout(graph, 'ab');
    const placed = new Map(nodes.map(n => [n.id, result.moves.find(p => p.id === n.id) || n]));
    assert.equal(JSON.stringify(graph), original, 'insertion never mutates the graph');
    for (const [id, p] of placed) {
      assert.equal(p.x, expected.get(id).x, `${id} moves only as far as required horizontally`);
      assert.equal(p.y, expected.get(id).y, `${id} moves only as far as required vertically`);
    }
    const inserted = { x: result.x, y: result.y };
    const ordered = [placed.get('a'), inserted, ...['b', 'c', 'd', 'tail'].map(id => placed.get(id))];
    for (let i = 1; i < ordered.length; i++) {
      const axis = vertical ? 'y' : 'x';
      assert((ordered[i][axis] - ordered[i - 1][axis]) * sign >= gap, 'swept parts remain ordered and separated');
    }
  }
}
console.log('Swept insertion preserves spacing in both axes and directions, independently of node order.');
