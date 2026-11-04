// Replication lesson requires both a copy link and live application reads.
export const replicaWiringAdvice = 'A read replica cannot go between App servers and SQL database. Place it beside the database. Connect SQL database to Read replica to copy data, and App servers to Read replica to send reads. Keep App servers connected to SQL database for writes.';

export function replicaReadsActive(graph, flows) {
  const read = flows.typeIds.indexOf('read');
  if (read < 0) return false;
  return graph.nodes.some((n) => n.type === 'sql-replica' &&
    graph.edges.some((e) => e.from === 'db' && e.to === n.id && e.kind === 'replication') &&
    graph.edges.some((e) => e.from === 'app' && e.to === n.id && e.kind === 'flow' &&
      flows.edgeRps[flows.edgeIds.indexOf(e.id) * flows.typeIds.length + read] > 0) &&
    graph.edges.some((e) => e.from === 'app' && e.to === 'db' && e.kind === 'flow'));
}
