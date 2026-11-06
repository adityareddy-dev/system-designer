// Wiring and local spacing for a part dropped onto a connection.
export function createInsertionPlanner({ graph, version, catalog, canConnect, freeSpot }) {
  let cachedVersion = -1, plans = new Map();
  return (type, edgeId) => {
    const current = version();
    if (current !== cachedVersion) { cachedVersion = current; plans = new Map(); }
    const key = `${edgeId}:${type}`;
    if (plans.has(key)) return plans.get(key);
    const plan = insertionWiring(graph(), type, edgeId, catalog, canConnect);
    if (plan?.kind === 'side') plan.position = freeSpot((plan.source.x + plan.target.x) / 2, (plan.source.y + plan.target.y) / 2 - 160);
    plans.set(key, plan);
    return plan;
  };
}

export function insertionWiring(graph, type, edgeId, catalog, canConnect) {
  const edge = graph.edges.find(e => e.id === edgeId && e.kind === 'flow');
  const part = catalog.elementById.get(type);
  const source = graph.nodes.find(n => n.id === edge?.from);
  const target = graph.nodes.find(n => n.id === edge?.to);
  if (!part || !source || !target) return null;
  const a = canConnect(source.type, type);
  if (!a.ok || a.swap || a.kind !== 'flow') return null;
  if (part.kind === 'lookaside' || part.params?.lookasideFor?.length) return { kind: 'side', edge, source, target };
  const b = canConnect(type, target.type);
  return b.ok && !b.swap && b.kind === 'flow' ? { kind: 'route', edge, source, target } : null;
}

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
  const inserted = { x: (a.x + target.x) / 2, y: (a.y + target.y) / 2 };
  const nearby = [...positions.values()].filter(n => Math.abs(n[axis] - inserted[axis]) < gap);
  const candidates = [inserted[other], ...nearby.flatMap(n => [n[other] + cross, n[other] - cross])]
    .sort((u, v) => Math.abs(u - inserted[other]) - Math.abs(v - inserted[other]) || v - u);
  inserted[other] = candidates.find(value => nearby.every(n => Math.abs(n[other] - value) >= cross));
  return { ...inserted,
    moves: graph.nodes.filter(n => n.x !== positions.get(n.id).x || n.y !== positions.get(n.id).y)
      .map(n => ({ id: n.id, x: positions.get(n.id).x, y: positions.get(n.id).y })) };
}
