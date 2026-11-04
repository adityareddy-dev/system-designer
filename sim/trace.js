// Build-time request paths and excluded hops from the compiled routing tables.
import { M } from './route.js';

export function traceRoute(model, type) {
  const t = model.catalog.typeIndex.get(type);
  const result = { type, nodeIds: [], edgeIds: [], rejected: [], stops: [] };
  if (t == null || t === model.attackT) return result;
  const { nodes, edges, T } = model;
  const selected = new Set(), visited = new Set();
  const visit = (u) => {
    if (visited.has(u)) return;
    visited.add(u);
    result.nodeIds.push(nodes[u].id);
    const r = model.route[u * T + t];
    if (!r) { result.stops.push({ nodeId: nodes[u].id, reason: 'No usable route to a destination for this request type.' }); return; }
    const calls = [M.FORWARD, M.COMPLETE, M.CALLED].includes(r.mode) ? r.calls : [];
    for (const list of [r.P, r.miss, calls]) for (const ei of list) {
      selected.add(ei); visit(edges[ei].ti);
    }
    if (r.mode === M.FORWARD || r.mode === M.COMPLETE) for (const ei of model.tapOut[u]) if (model.H(edges[ei].ti, t)) { selected.add(ei); visit(edges[ei].ti); }
    if (r.mode === M.COMPLETE || r.mode === M.CALLED) result.stops.push({ nodeId: nodes[u].id,
      reason: r.mode === M.CALLED ? 'Side call returns to its caller; it does not forward the request.' : 'This part completes the request.' });
  };
  for (const u of model.sources) if (model.H(u, t)) visit(u);
  result.edgeIds = [...selected].map((ei) => edges[ei].id);
  // Inspect drawn branches too: upstream pruning should not hide the hop that caused it.
  const seen = new Set();
  const inspect = (u) => {
    if (seen.has(u)) return;
    seen.add(u);
    const r = model.route[u * T + t];
    for (const e of model.outFlow[u]) {
      if (!selected.has(e.i)) {
        let reason;
        if (!model.H(u, t)) reason = 'The source part does not handle this request type.';
        else if (r?.mode === M.COMPLETE) reason = 'The request completes here instead of continuing.';
        else if (nodes[u].kind === 'lookaside' && nodes[e.ti].kind !== 'external') reason = 'Side calls return to their caller; they do not forward requests along this connection.';
        else if (e.parking) reason = 'This is a parking connection, not a delivery route.';
        else if (!model.H(e.ti, t)) reason = 'The destination does not handle this request type.';
        else if (nodes[e.ti].kind === 'lookaside' && !model.C(e.ti, t)) reason = 'This is a side call that returns to its caller; the caller also needs a usable delivery route.';
        else if (!model.canServe[e.ti * T + t]) reason = 'No usable destination for this request type is reachable through this branch.';
        else reason = 'The routing rules prefer another connected destination for this request type.';
        result.rejected.push({ edgeId: e.id, from: nodes[u].id, to: nodes[e.ti].id, reason });
      }
      inspect(e.ti);
    }
  };
  for (const u of model.sources) inspect(u);
  return result;
}
