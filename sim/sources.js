// Per-type source weights preserve the global mix and support separate device and human paths.
export function sourceWeights(problem, model, t, typeId) {
  const types = problem.traffic.sourceTypes;
  const list = model.nodes.filter(n => n.kind === 'source' && model.H(n.i, t) &&
    (!types || (types[n.id] || types[n.el.id] || []).includes(typeId)));
  const counts = new Map();
  for (const n of list) counts.set(n.el.id, (counts.get(n.el.id) || 0) + 1);
  const weights = list.map(n => [n.i, (problem.traffic.sources?.[n.el.id] || 0) / counts.get(n.el.id)]);
  const sum = weights.reduce((a, [, w]) => a + w, 0);
  return weights.map(([u, w]) => [u, sum > 0 ? w / sum : 1 / list.length]);
}
