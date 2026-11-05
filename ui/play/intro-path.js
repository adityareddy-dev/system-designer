// Check that an intro component sits between the instructed endpoints.
export function introPathHolds(graph, spec) {
  if (spec.action === 'knob') {
    const app = graph.nodes.find(n => n.id === 'app' && n.type === 'vm-fleet');
    const onPath = graph.edges.some(e => e.kind === 'flow' && e.to === 'app') &&
      graph.edges.some(e => e.kind === 'flow' && e.from === 'app');
    return !!app && onPath && (spec.knob === 'units' ? Number(app.units) >= spec.min :
      spec.knob === 'autoscale' && app.knobs?.autoscale?.on === true);
  }
  const path = spec.path;
  if (!path) return graph.nodes.some(n => n.type === spec.type && !n.locked);
  const flow = graph.edges.filter(e => e.kind === 'flow');
  if (flow.some(e => e.from === path[0] && e.to === path[1])) return false;
  return graph.nodes.some(n => n.type === spec.type && !n.locked &&
    flow.some(e => e.from === path[0] && e.to === n.id) &&
    flow.some(e => e.from === n.id && e.to === path[1]));
}

// Retry restores only the misplaced insertion and its interrupted wire.
export function repairInsertion(sim, spec, position) {
  const graph = sim.getGraph();
  const loose = graph.nodes.find(n => n.type === spec.type && !n.locked);
  if (loose) {
    const incoming = graph.edges.filter(e => e.to === loose.id && e.kind === 'flow');
    const outgoing = graph.edges.filter(e => e.from === loose.id && e.kind === 'flow');
    sim.removeNode(loose.id);
    for (const a of incoming) for (const b of outgoing) { try { sim.connect(a.from, b.to); } catch {} }
  }
  let edge = sim.getGraph().edges.find(e => e.from === spec.path[0] && e.to === spec.path[1]);
  if (!edge) { try { sim.connect(spec.path[0], spec.path[1]); } catch {} }
  edge = sim.getGraph().edges.find(e => e.from === spec.path[0] && e.to === spec.path[1]);
  if (!edge) return null;
  const at = position(edge.id);
  const id = sim.addNode(spec.type, at.x, at.y);
  sim.disconnect(edge.id); sim.connect(edge.from, id); sim.connect(id, edge.to);
  return id;
}
