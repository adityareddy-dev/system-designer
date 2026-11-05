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

// A top-to-bottom starter keeps small phone systems readable without shrinking captions.
export function phoneLayout(graph) {
  const incoming = new Set(graph.edges.filter(e => e.kind !== 'observe' && e.kind !== 'control').map(e => e.to));
  const rank = new Map(graph.nodes.filter(n => !incoming.has(n.id)).map(n => [n.id, 0]));
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const e of graph.edges) if (rank.has(e.from) && !rank.has(e.to)) { rank.set(e.to, rank.get(e.from) + 1); changed = true; }
    if (!changed) break;
  }
  const rows = new Map();
  for (const n of graph.nodes) { const r = rank.get(n.id) ?? 0; if (!rows.has(r)) rows.set(r, []); rows.get(r).push(n); }
  return [...rows.entries()].flatMap(([r, nodes]) => nodes.map((n, i) => ({ id: n.id, x: (i - (nodes.length - 1) / 2) * 160, y: r * 144 })));
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
