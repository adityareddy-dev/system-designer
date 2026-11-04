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

export function regionLayout(graph, area = null) {
  const groups = new Map();
  for (const node of graph.nodes) {
    const region = node.region || 'us';
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(node);
  }
  // Reserve room for names that stay readable as the diagram zooms out.
  const dx = 260, dy = 240;
  let columns = 5;
  if (area && groups.size) {
    let best = -Infinity;
    const largest = Math.max(...[...groups.values()].map(nodes => nodes.length));
    for (let count = 1; count <= largest; count++) {
      const rows = [...groups.values()].reduce((sum, nodes) => sum + Math.ceil(nodes.length / count), 0) + groups.size - 1;
      const scale = Math.min(area.width / (count * dx), area.height / (rows * dy));
      if (scale > best) { best = scale; columns = count; }
    }
  }
  let y = 0;
  return [...groups.values()].flatMap(nodes => {
    const positions = nodes.map((node, i) => ({ id: node.id, x: (i % columns) * dx, y: y + Math.floor(i / columns) * dy }));
    y += (Math.ceil(nodes.length / columns) + 1) * dy;
    return positions;
  });
}
