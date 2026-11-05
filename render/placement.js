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
  const pending = [target];
  const moved = new Set();
  while (pending.length) {
    const current = pending.shift();
    moved.add(current.id);
    for (const n of positions.values()) {
      if (n.id === a.id || n.id === current.id || moved.has(n.id)) continue;
      const distance = (n[axis] - current[axis]) * sign;
      if (distance >= 0 && distance < gap && Math.abs(n[other] - current[other]) < cross) {
        n[axis] += sign * (gap - distance); pending.push(n);
      }
    }
  }
  return { x: (a.x + target.x) / 2, y: (a.y + target.y) / 2,
    moves: graph.nodes.filter(n => n.x !== positions.get(n.id).x || n.y !== positions.get(n.id).y)
      .map(n => ({ id: n.id, x: positions.get(n.id).x, y: positions.get(n.id).y })) };
}
