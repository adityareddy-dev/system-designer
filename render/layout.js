// Arrange serving, background and operations paths without changing the graph.
export function pathLayout(graph, catalog) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const element = n => catalog?.elementById?.get(n.type) || {};
  const flow = graph.edges.filter(e => !['observe', 'control', 'replication'].includes(e.kind));
  const background = new Set(graph.nodes.filter(n => element(n).kind === 'queue' || ['worker-pool', 'scheduler'].includes(n.type)).map(n => n.id));
  const ops = new Set(graph.nodes.filter(n => ['observer', 'control'].includes(element(n).kind) && !background.has(n.id)).map(n => n.id));
  // Background-only descendants stay in that band; shared stores stay on the serving path.
  for (let pass = 0; pass < graph.nodes.length; pass++) for (const e of flow) {
    const incoming = flow.filter(p => p.to === e.to);
    if (background.has(e.from) && incoming.every(p => background.has(p.from)) && ['external', 'store'].includes(element(byId.get(e.to) || {}).kind)) background.add(e.to);
  }
  const rank = new Map(), visiting = new Set();
  function visit(id) {
    if (rank.has(id)) return rank.get(id);
    if (visiting.has(id)) return -1;
    visiting.add(id);
    let r = 0;
    for (const e of flow) if (e.to === id && byId.has(e.from) && background.has(e.from) === background.has(id)) r = Math.max(r, visit(e.from) + 1);
    if (background.has(id)) for (const e of flow) if(e.to === id && !background.has(e.from) && byId.has(e.from)) r=Math.max(r,visit(e.from)+1);
    visiting.delete(id); rank.set(id, r); return r;
  }
  graph.nodes.forEach(n => visit(n.id));
  const result = [];
  let base = 0;
  for (const band of [0, 1, 2]) {
    const columns = new Map();
    for (const n of graph.nodes) {
      if ((ops.has(n.id) ? 2 : background.has(n.id) ? 1 : 0) !== band) continue;
      const col = band === 2 ? columns.size : rank.get(n.id);
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col).push(n);
    }
    let rows = 0;
    for (const [col, ns] of columns) {
      rows = Math.max(rows, ns.length);
      ns.forEach((n, i) => result.push({ id: n.id, x: col * 260, y: base + i * 160 }));
    }
    if (rows) base += rows * 160 + 60;
  }
  return result;
}
