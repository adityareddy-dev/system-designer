// Diagram-only path selection and region layout helpers.
export function pathsThrough(graph, id) {
  const nodes = new Set([id]), edges = new Set();
  for (const direction of ['from', 'to']) {
    const seen = new Set([id]), pending = [id];
    while (pending.length) {
      const current = pending.pop();
      for (const edge of graph.edges) {
        if (edge.kind === 'observe' || edge.kind === 'control' || edge[direction] !== current) continue;
        edges.add(edge.id);
        const next = edge[direction === 'from' ? 'to' : 'from'];
        nodes.add(next);
        if (!seen.has(next)) { seen.add(next); pending.push(next); }
      }
    }
  }
  return { nodes, edges };
}

export function regionLayout(graph) {
  const groups = new Map();
  for (const node of graph.nodes) {
    const region = node.region || 'us';
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(node);
  }
  let y = 0;
  return [...groups.values()].flatMap(nodes => {
    const positions = nodes.map((node, i) => ({ id: node.id, x: (i % 5) * 220, y: y + Math.floor(i / 5) * 180 }));
    y += Math.ceil(nodes.length / 5) * 180 + 180;
    return positions;
  });
}
