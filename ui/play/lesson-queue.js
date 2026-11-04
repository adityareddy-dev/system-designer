// Queue lesson guidance from downstream capacity and observed arrival and completion rates.
export function queueDrainAdvice(graph, state, catalog, mix) {
  const live = new Map((state.nodes || []).map(n => [n.id, n]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const messages = [];
  for (const queue of graph.nodes.filter(n => n.type === 'queue')) {
    const seen = new Set([queue.id]), todo = [queue.id];
    while (todo.length) {
      const from = todo.pop();
      for (const edge of graph.edges) if (edge.from === from && edge.kind !== 'replication' && !seen.has(edge.to)) {
        seen.add(edge.to); todo.push(edge.to);
      }
    }
    const rates = graph.nodes.filter(n => n.id !== queue.id && seen.has(n.id)).flatMap(n => {
      const el = catalog.elementById.get(n.type);
      if (!el?.capacity || !['compute', 'store', 'external'].includes(el.kind)) return [];
      const weight = Object.entries(mix || {}).reduce((sum, [type, share]) => sum + share *
        (catalog.requestById.get(type)?.isWrite && el.capacity.writeRps ? el.capacity.rps / el.capacity.writeRps : 1), 0);
      const units = el.units?.max === 1 ? 1 : (live.get(n.id)?.units ?? n.units ?? el.units?.default ?? 1);
      return [{ node: n, el, rate: el.capacity.rps * units * (catalog.world.tiers[n.tier || 'M']?.capacity ?? 1) / (weight || 1) }];
    }).sort((a, b) => a.rate - b.rate);
    const limit = rates[0], q = live.get(queue.id);
    if (!limit || !q) continue;
    const arrivals = q.queueAcceptedRps || 0, drain = q.queueDrainRps || 0;
    const net = drain - arrivals;
    const name = limit.node.label || limit.el.name;
    const ratesText = `${name} limits downstream service to ≈ ${fmt(limit.rate)}/s. Arrivals are ≈ ${fmt(arrivals)}/s; completed drain is ≈ ${fmt(drain)}/s (smoothed).`;
    const action = net > 0
      ? `The backlog is shrinking by ≈ ${fmt(net)}/s. At these rates, ≈ ${fmt(q.queueDepth / net / 60)} minutes remain to clear it.`
      : limit.node.type === 'worker-pool'
        ? 'Increase worker units until the next downstream part becomes the limit, or slow the senders.'
        : 'More workers cannot raise that limit. Increase capacity there, slow the senders, or wait for the burst to end.';
    messages.push(`${ratesText} ${action}`);
  }
  return messages.join(' ') || 'Check the queue-to-workers-to-database path. The slowest downstream service limits completed drain.';
}
