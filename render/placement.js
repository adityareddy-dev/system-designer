// Local insertion spacing: preserve every part that the new face does not touch.
export function insertionLayout(graph, edgeId) {
  const edge = graph.edges.find(e => e.id === edgeId);
  const a = graph.nodes.find(n => n.id === edge?.from), b = graph.nodes.find(n => n.id === edge?.to);
  if (!a || !b) return null;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const axis = horizontal ? 'x' : 'y', other = horizontal ? 'y' : 'x';
  const gap = horizontal ? 120 : 144, cross = horizontal ? 128 : 112;
  const sign = Math.sign(b[axis] - a[axis]) || 1;
  const positions = new Map(graph.nodes.map(n => [n.id, { ...n }]));
  const target = positions.get(b.id);
  target[axis] += sign * Math.max(0, gap * 2 - Math.abs(b[axis] - a[axis]));
  // Keep the original order so a swept part cannot be left behind the target.
  const downstream = graph.nodes.filter(n => n.id !== a.id && (n[axis] - b[axis]) * sign >= 0)
    .sort((u, v) => (u[axis] - v[axis]) * sign || (u.id === b.id ? -1 : v.id === b.id ? 1 : 0));
  for (let i = 0; i < downstream.length; i++) {
    const original = downstream[i], current = positions.get(original.id);
    if (current[axis] === original[axis]) continue;
    for (const next of downstream.slice(i + 1)) {
      const n = positions.get(next.id);
      const distance = (n[axis] - current[axis]) * sign;
      if (distance < gap && Math.abs(n[other] - current[other]) < cross) {
        n[axis] += sign * (gap - distance);
      }
    }
  }
  return { x: (a.x + target.x) / 2, y: (a.y + target.y) / 2,
    moves: graph.nodes.filter(n => n.x !== positions.get(n.id).x || n.y !== positions.get(n.id).y)
      .map(n => ({ id: n.id, x: positions.get(n.id).x, y: positions.get(n.id).y })) };
}
