// Build-time request paths and excluded hops from the compiled routing tables.
import { M, compile } from './route.js';
import { connectRule } from './graph.js';

export function traceRoute(model, type) {
  const t = model.catalog.typeIndex.get(type);
  const result = { type, nodeIds: [], edgeIds: [], rejected: [], stops: [], repair: null };
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
  for (const u of model.sources) if (model.sourceShare[u * T + t] > 0) visit(u);
  result.edgeIds = [...selected].map((ei) => edges[ei].id);
  // Inspect drawn branches too: upstream pruning should not hide the hop that caused it.
  const seen = new Set();
  const inspect = (u, path = [nodes[u].id]) => {
    if (seen.has(u)) return;
    seen.add(u);
    const r = model.route[u * T + t];
    for (const e of model.outFlow[u]) {
      if (!selected.has(e.i)) {
        let reason;
        if (!model.H(u, t)) reason = 'The source part does not handle this request type.';
        else if (r?.mode === M.COMPLETE) reason = 'The request completes here instead of continuing.';
        else if (nodes[u].kind === 'lookaside') reason = 'Side calls return to their caller; an outside-service call here does not replace the caller’s delivery route.';
        else if (e.parking) reason = 'This is a parking connection, not a delivery route.';
        else if (!model.H(e.ti, t)) reason = 'The destination does not handle this request type.';
        else if (nodes[e.ti].kind === 'lookaside' && !model.C(e.ti, t)) reason = 'This is a side call that returns to its caller; the caller also needs a usable delivery route.';
        else if (!model.canServe[e.ti * T + t]) reason = 'No usable destination for this request type is reachable through this branch.';
        else reason = 'The routing rules prefer another connected destination for this request type.';
        const carries = model.catalog.requests.filter((rt, ti) => {
          const entry = model.route[u * T + ti];
          if (!entry || ti === model.attackT) return false;
          return [...entry.P, ...entry.miss, ...([M.FORWARD, M.COMPLETE, M.CALLED].includes(entry.mode) ? entry.calls : [])].includes(e.i);
        }).map((rt) => rt.id);
        result.rejected.push({ edgeId: e.id, from: nodes[u].id, to: nodes[e.ti].id, reason, carries, path: [...path, nodes[e.ti].id] });
      }
      inspect(e.ti, [...path, nodes[e.ti].id]);
    }
  };
  for (const u of model.sources) inspect(u);
  if (!model.typeServed[t]) result.repair = findRepair(model, t);
  return result;
}

// Verify a missing connection by compiling it with the same rules as the run.
function findRepair(model, t) {
  const { nodes, edges, catalog } = model;
  const callers = [...nodes.filter((n) => n.kind === 'compute').reverse(), ...nodes.filter((n) => n.kind !== 'compute')];
  for (const a of callers) for (const b of nodes) {
    if (a.i === b.i || !model.H(a.i, t) || !model.canServe[b.i * model.T + t]) continue;
    if (edges.some((e) => e.fi === a.i && e.ti === b.i)) continue;
    const rule = connectRule(a.el, b.el);
    if (!rule.ok || rule.swap || rule.kind !== 'flow') continue;
    const id = `${a.id}>${b.id}`;
    const candidate = compile(catalog, { nodes: nodes.map((n) => n.g),
      edges: [...edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })), { id, from: a.id, to: b.id, kind: 'flow' }] }, model.env, model.problem);
    if (!candidate.typeServed[t]) continue;
    const walk = (u, path = [], seen = new Set()) => {
      if (seen.has(u)) return null;
      seen = new Set(seen).add(u);
      const r = candidate.route[u * candidate.T + t];
      if (!r) return null;
      const next = [...path, candidate.nodes[u].id];
      if (r.mode === M.COMPLETE) return next;
      for (const ei of [...r.P, ...r.miss]) {
        const found = walk(candidate.edges[ei].ti, next, seen);
        if (found) return found;
      }
      return null;
    };
    for (const s of candidate.sources) {
      if (!(candidate.sourceShare[s * candidate.T + t] > 0)) continue;
      const path = walk(s);
      if (path?.some((node, i) => node === a.id && path[i + 1] === b.id)) return { from: a.id, to: b.id, path };
    }
  }
  return null;
}
