// Connection feedback follows the engine's normalized direction and destination.
export function connectionCaption(edge, graph, catalog) {
  const node = id => graph.nodes.find(n => n.id === id);
  const name = id => node(id)?.label || catalog.elementById.get(node(id)?.type)?.name || id;
  const part = catalog.elementById.get(node(edge.to)?.type);
  const traffic = edge.kind === 'observe' ? 'Measurements now travel here.' : edge.kind === 'replication' ? 'Data copies now travel here.' : edge.kind === 'control' ? 'Control signals now travel here.'
    : part?.kind === 'lookaside' || part?.params?.lookasideFor?.length ? 'Checks travel here and answers return to the caller.'
    : 'Requests now travel in this direction.';
  return `${name(edge.from)} → ${name(edge.to)}. ${traffic}`;
}
