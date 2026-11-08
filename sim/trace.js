// Build-time request paths and excluded hops from the compiled routing tables.
import { M, compile } from './route.js';
import { connectRule, makeNode } from './graph.js';

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

// A repair must be carried on one compiled source-to-destination path.
function repairPath(model, t, links, queues) {
  const queueIds = new Set(queues), visited = new Set();
  const allLinks = (1 << links.length) - 1;
  const linkBits = model.edges.map(e => {
    const i = links.findIndex(([from, to]) => e.from === from && e.to === to);
    return i < 0 ? 0 : 1 << i;
  });
  const walk = (u, usedLinks = 0, usedQueue = !queues.length) => {
    const id = model.nodes[u].id;
    usedQueue ||= queueIds.has(id);
    // Compiled delivery paths are acyclic; only repair conditions distinguish converging paths.
    const key = `${u}:${usedLinks}:${usedQueue}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const r = model.route[u * model.T + t];
    if (!r) return null;
    if (r.mode === M.COMPLETE && usedLinks === allLinks && usedQueue) return [id];
    for (const ei of [...r.P, ...r.miss]) {
      const found = walk(model.edges[ei].ti, usedLinks | linkBits[ei], usedQueue);
      if (found) return [id, ...found];
    }
    return null;
  };
  for (const s of model.sources) {
    if (!(model.sourceShare[s * model.T + t] > 0)) continue;
    const path = walk(s);
    if (path) return path;
  }
  return null;
}

// Verify a missing connection by compiling it with the same rules as the run.
function findRepair(model, t) {
  const { nodes, edges, catalog } = model;
  const reachable = new Set(), pending = [...model.sources].filter(u => model.sourceShare[u * model.T + t] > 0);
  while (pending.length) { const u = pending.pop(); if (reachable.has(u)) continue; reachable.add(u); for (const e of model.outFlow[u]) if (model.H(e.ti,t)) pending.push(e.ti); }
  const queues = nodes.filter(n => n.kind === 'queue' && !n.isDLQ && reachable.has(n.i));
  // A single added hop must join a path before or after a required queue.
  // Include ignored flow links here so this only rules out impossible repairs.
  const aroundQueues = (reverse) => {
    const seen = new Set(), pending = queues.map(q => q.i);
    while (pending.length) {
      const u = pending.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      for (const e of reverse ? model.inAll[u] : model.outAll[u]) {
        const v = reverse ? e.fi : e.ti;
        if (e.kind === 'flow' && model.H(v, t)) pending.push(v);
      }
    }
    return seen;
  };
  const afterQueue = aroundQueues(false), beforeQueue = aroundQueues(true);
  const callers = [...nodes.filter((n) => n.kind === 'compute').reverse(), ...nodes.filter((n) => n.kind !== 'compute')];
  for (const a of callers) for (const b of nodes) {
    if (a.i === b.i || !model.H(a.i, t) || !model.canServe[b.i * model.T + t]) continue;
    if (queues.length && !afterQueue.has(a.i) && !beforeQueue.has(b.i)) continue;
    if (edges.some((e) => e.fi === a.i && e.ti === b.i)) continue;
    const rule = connectRule(a.el, b.el);
    if (!rule.ok || rule.swap || rule.kind !== 'flow') continue;
    const id = `${a.id}>${b.id}`;
    const candidate = compile(catalog, { nodes: nodes.map((n) => n.g),
      edges: [...edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })), { id, from: a.id, to: b.id, kind: 'flow' }] }, model.env, model.problem);
    if (!candidate.typeServed[t]) continue;
    const path = repairPath(candidate, t, [[a.id, b.id]], queues.map(q => q.id));
    if (path) return { from: a.id, to: b.id, path };
  }
  // A queue needs a consumer and its delivery destination, not a bypass back to synchronous calls.
  for (const q of queues) {
    const upstream = new Set(), pending = [q.i];
    while (pending.length) {
      const u = pending.pop();
      if (upstream.has(u)) continue;
      upstream.add(u);
      for (const e of edges) if (e.kind === 'flow' && e.ti === u) pending.push(e.fi);
    }
    const workers = [...nodes.filter(n => n.el.id === 'worker-pool' && !upstream.has(n.i)), null];
    for (const worker of workers) for (const b of nodes.filter(n => model.C(n.i, t) && n.kind !== 'source' && n.kind !== 'cache')) {
      let id = worker?.id || 'repair-workers';
      if (!worker) for (let i = 2; model.idx.has(id); i++) id = `repair-workers-${i}`;
      const added = worker ? [] : [makeNode(catalog, catalog.elementById.get('worker-pool'), id, q.g.x + 160, q.g.y, {}, model.env)];
      const links = [[q.id, id], [id, b.id]];
      const steps = links.filter(([from, to]) => !edges.some(e => e.from === from && e.to === to));
      if (!steps.length) continue;
      const candidate = compile(catalog, { nodes: [...nodes.map(n => n.g), ...added], edges: [...edges.map(e => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })), ...steps.map(([from,to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' }))] }, model.env, model.problem);
      if (!candidate.typeServed[t]) continue;
      const path = repairPath(candidate, t, links, [q.id]);
      if (path) return { from: steps[0][0], to: steps[0][1], path, steps, addNodes: added.map(n => ({ id: n.id, type: n.type })) };
    }
  }
  return null;
}
