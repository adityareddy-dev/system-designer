// Check that an intro component sits between the instructed endpoints.
export function introPathHolds(graph, spec) {
  const path = spec.path;
  if (!path) return graph.nodes.some(n => n.type === spec.type && !n.locked);
  const flow = graph.edges.filter(e => e.kind === 'flow');
  if (flow.some(e => e.from === path[0] && e.to === path[1])) return false;
  return graph.nodes.some(n => n.type === spec.type && !n.locked &&
    flow.some(e => e.from === path[0] && e.to === n.id) &&
    flow.some(e => e.from === n.id && e.to === path[1]));
}
