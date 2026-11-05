// Usable per-type flow paths from sources that actually emit that workload.
export function sourceFlow(S, t) {
  const { model, T } = S;
  const reached = new Set(), incoming = Array.from({ length: model.N }, () => []);
  const stack = [...model.sources].filter(u => S.srcShare[u * T + t] > 0);
  while (stack.length) {
    const u = stack.pop();
    if (reached.has(u)) continue;
    reached.add(u);
    const r = model.route[u * T + t];
    if (!r) continue;
    for (const list of [r.P, r.miss, r.calls]) for (const ei of list) {
      const e = model.edges[ei];
      if (e.kind !== 'flow') continue;
      incoming[e.ti].push(u);
      stack.push(e.ti);
    }
  }
  return { reached, incoming };
}

export function upstreamDns(S, target) {
  const found = new Set();
  for (let t = 0; t < S.T; t++) {
    if (!(S.mixArr[t] > 0)) continue;
    const { reached, incoming } = sourceFlow(S, t);
    if (!reached.has(target)) continue;
    const seen = new Set(), stack = [target];
    while (stack.length) {
      const u = stack.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      if (['dns', 'geo-dns'].includes(S.model.nodes[u].el.id)) found.add(u);
      stack.push(...incoming[u]);
    }
  }
  return found;
}
