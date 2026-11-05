// Compiles a graph into the runtime model: node table, edge classes, topological order and per-type routing tables.
import { NEAR_USER, knobValue, inRequestPath } from './graph.js';
import { sourceWeights } from './sources.js';

export const KIND = { source: 0, router: 1, filter: 2, cache: 3, compute: 4, store: 5, queue: 6, lookaside: 7, tap: 8, external: 9, observer: 10, control: 11 };
export const M = { NONE: 0, COMPLETE: 1, FORWARD: 2, QUEUE: 3, CALLED: 4, TAPEND: 5, CACHE: 6, SIDECACHE: 7, ABSORB: 8 };

// Share of a lookaside service's calls that continue to an outside service (for example SMS codes on some sign-ins), approx.
const LOOKASIDE_EXT_SHARE = 0.1;

// Stores that are durable by design and are not expected to sit behind the backups element.
const SELF_DURABLE = new Set(['object-storage', 'cold-archive', 'data-lake', 'block-storage', 'file-system', 'data-warehouse', 'timeseries-db', 'search-index', 'vector-db']);

const COPY_TYPES = new Set(['search', 'report']); // what a copy store is for
const ASYNC_ACCEPT_P50 = 200; // ms to accept a job on an asynchronous service, approx.
const ASYNC_ACCEPT_P99 = 1000;

const EMPTY = new Int32Array(0);
const EMPTYF = new Float64Array(0);

function nodeInfo(catalog, g, i, env) {
  const el = catalog.elementById.get(g.type);
  const p = el.params || {};
  const knobs = el.knobs || [];
  const kv = (k) => knobValue(catalog, g, k);
  const cap1 = el.capacity ? el.capacity.rps : 0;
  const wr = el.capacity && el.capacity.writeRps;
  const tierDef = catalog.world.tiers[g.tier] || catalog.world.tiers.M;
  const info = {
    id: g.id, i, g, el, kind: el.kind, k: KIND[el.kind], cat: el.category,
    managed: !!el.managed,
    elastic: el.units && el.units.max === 1,
    keyed: !!p.keyed,
    hasCap: el.capacity != null,
    cap1,
    wCost: wr ? cap1 / wr : 1,
    p50: el.latencyMs ? el.latencyMs.p50 : 0,
    p99: el.latencyMs ? el.latencyMs.p99 : 0,
    near: el.kind === 'source' || NEAR_USER.has(el.id) || !!p.regionless,
    hasZonesKnob: knobs.includes('zones'),
    hasRegionKnob: knobs.includes('region'),
    hasRetries: knobs.includes('retries'),
    hasTimeout: knobs.includes('timeoutMs'),
    isDLQ: el.id === 'dead-letter-queue',
    role: p.role || null,
    family: p.family || null,
    failoverSec: p.failoverSec != null ? p.failoverSec : (knobs.includes('replication') && el.kind === 'store' ? 30 : null),
    tierCap: knobs.includes('tier') ? tierDef.capacity : 1,
    tierCost: knobs.includes('tier') ? tierDef.cost : 1,
    // filled below
    loc0: -1, primaryOf: -1, replicas: [], callers: [], proxied: false, backedUp: false, drFrom: -1,
    autoscaler: -1, cdcFed: false, customerData: false, region: null, laneNear: false, batcher: false,
  };
  // An asynchronous job service (a video transcoder) answers the call once the job is accepted; the work finishes later.
  if (p.async) { info.p50 = Math.min(info.p50, ASYNC_ACCEPT_P50); info.p99 = Math.min(info.p99, ASYNC_ACCEPT_P99); }
  info.multiZone = info.managed && !info.hasZonesKnob;
  info.stateful = el.kind === 'store' || (el.kind === 'cache');
  info.customerData = el.kind === 'store' && !SELF_DURABLE.has(el.id) && !p.isCopy && el.params?.role !== 'replica'
    && (el.completes || []).some((t) => ['write', 'payment', 'sync', 'message'].includes(t));
  refreshKnobs(catalog, info, env);
  return info;
}

// Re-reads knob values into the node info (cheap; used when a knob changes during the day).
export function refreshKnobs(catalog, info, env) {
  const g = info.g;
  const kv = (k) => knobValue(catalog, g, k);
  const knobs = info.el.knobs || [];
  const tierDef = catalog.world.tiers[g.tier] || catalog.world.tiers.M;
  info.tierCap = knobs.includes('tier') ? tierDef.capacity : 1;
  info.tierCost = knobs.includes('tier') ? tierDef.cost : 1;
  info.units = info.elastic ? 1 : Math.max(info.el.units?.min ?? 1, g.units || 1);
  info.zones = info.hasZonesKnob ? Math.max(1, Math.min(3, g.zones || 1)) : 1;
  info.retries = info.hasRetries ? Number(kv('retries')) : (info.el.params?.addsRetries || 0);
  info.backoff = knobs.includes('backoff') ? kv('backoff') : (info.el.params?.backoff || 'none');
  info.timeoutMs = info.hasTimeout ? Number(kv('timeoutMs')) : 0;
  info.ttlSec = knobs.includes('ttlSec') ? Number(kv('ttlSec')) : null;
  info.coalesce = knobs.includes('coalesce') ? !!kv('coalesce') : false;
  info.replication = knobs.includes('replication') ? kv('replication') : (info.el.params?.replication || (info.kind === 'store' ? 'async' : 'none'));
  info.readFrom = knobs.includes('readFrom') ? kv('readFrom') : 'replicas';
  info.partitions = knobs.includes('partitions') ? Number(kv('partitions')) : 0;
  info.retentionDays = knobs.includes('retentionDays') ? Number(kv('retentionDays')) : (info.el.params?.retentionDays || 0);
  info.limitRps = knobs.includes('limitRps') ? Number(kv('limitRps')) : 0;
  info.warmPool = knobs.includes('warmPool') ? Number(kv('warmPool')) : 0;
  info.sampling = knobs.includes('sampling') ? Number(kv('sampling')) : 0.1;
  info.mode = knobs.includes('mode') ? kv('mode') : null;
  const as = knobs.includes('autoscale') ? kv('autoscale') : null;
  info.autoscaleKnob = as && as.on ? as : null;
  // derived hit rate for caches
  if (info.kind === 'cache') {
    let hr = info.el.params?.hitRate ?? 0.8;
    if (info.ttlSec != null) {
      const adj = env.ttlAdjust[String(info.ttlSec)];
      if (typeof adj === 'number') hr += adj;
    }
    info.hitRate = Math.max(0.2, Math.min(0.99, hr));
  } else info.hitRate = 0;
  info.region = g.region || env.homeRegion;
}

export function compile(catalog, graph, env, problem = { traffic: {} }) {
  const T = catalog.requests.length;
  const attackT = catalog.typeIndex.get('attack');
  const regionIds = env.regionIds;
  const homeIdx = Math.max(0, regionIds.indexOf(env.homeRegion));
  const cacheable = new Uint8Array(T);
  catalog.requests.forEach((r, i) => { cacheable[i] = r.cacheable ? 1 : 0; });

  const N = graph.nodes.length;
  const nodes = graph.nodes.map((g, i) => nodeInfo(catalog, g, i, env));
  const idx = new Map(nodes.map((n) => [n.id, n.i]));
  const hm = new Uint8Array(N * T), cm = new Uint8Array(N * T);
  for (let u = 0; u < N; u++) {
    const h = catalog.handlesMask.get(nodes[u].el.id), c = catalog.completesMask.get(nodes[u].el.id);
    for (let t = 0; t < T; t++) { hm[u * T + t] = h[t]; cm[u * T + t] = c[t]; }
  }
  const H = (u, t) => hm[u * T + t] === 1;
  const C = (u, t) => cm[u * T + t] === 1;

  // ---- edges
  const edges = [];
  for (const ge of graph.edges) {
    const fi = idx.get(ge.from), ti = idx.get(ge.to);
    if (fi == null || ti == null) continue;
    edges.push({ id: ge.id, from: ge.from, to: ge.to, kind: ge.kind, fi, ti, i: edges.length, dag: false, reentry: false, parking: false, back: false, keep: false });
  }
  const E = edges.length;
  const outAll = Array.from({ length: N }, () => []);
  const inAll = Array.from({ length: N }, () => []);
  for (const e of edges) { outAll[e.fi].push(e); inAll[e.ti].push(e); }

  for (const e of edges) {
    const a = nodes[e.fi], b = nodes[e.ti];
    if (e.kind === 'flow' || e.kind === 'tap') {
      if (a.kind === 'external') e.reentry = true;
      else e.dag = true;
      if (b.isDLQ) e.parking = true;
    }
    if (e.kind === 'replication') { b.primaryOf = a.i; a.replicas.push(b.i); }
    if (e.kind === 'control') {
      if (a.el.id === 'backups') b.backedUp = true;
      if (a.el.id === 'disaster-recovery') b.drFrom = a.i;
      if (a.el.id === 'autoscaler') b.autoscaler = a.i;
    }
    if (e.kind === 'flow' && a.el.id === 'db-proxy') b.proxied = true;
    if (e.kind === 'flow' && a.el.id === 'cdc-connector' && b.kind === 'cache') b.cdcFed = true;
    if (e.kind === 'flow') b.callers.push(a.i);
  }

  // ---- topological order (DFS from sources, back edges ignored)
  const state = new Uint8Array(N); // 0 new, 1 on stack, 2 done
  const post = [];
  const visit = (u) => {
    state[u] = 1;
    for (const e of outAll[u]) {
      if (!e.dag) continue;
      const v = e.ti;
      if (state[v] === 1) { e.back = true; e.dag = false; continue; }
      if (state[v] === 0) visit(v);
    }
    state[u] = 2;
    post.push(u);
  };
  for (let u = 0; u < N; u++) if (nodes[u].kind === 'source' && state[u] === 0) visit(u);
  for (let u = 0; u < N; u++) if (state[u] === 0) visit(u);
  const topo = Int32Array.from(post.reverse());

  const outFlow = Array.from({ length: N }, () => []);
  const tapOut = Array.from({ length: N }, () => []);
  const reentry = Array.from({ length: N }, () => []);
  for (const e of edges) {
    if (e.reentry) { reentry[e.fi].push(e.i); continue; }
    if (!e.dag) continue;
    if (e.kind === 'tap') tapOut[e.fi].push(e.i);
    else outFlow[e.fi].push(e);
  }

  // ---- locations: near-user (-1), fixed region, or inherited from neighbours
  const fixed = new Int8Array(N).fill(-2);
  for (const n of nodes) {
    if (n.near || n.kind === 'observer' || n.kind === 'control') fixed[n.i] = -1;
    else if (n.hasRegionKnob) fixed[n.i] = Math.max(0, regionIds.indexOf(n.region));
  }
  const findRegion = (start) => {
    const seen = new Set([start]);
    let frontier = [start];
    for (let depth = 0; depth < 6 && frontier.length; depth++) {
      const next = [];
      for (const u of frontier) {
        for (const e of outAll[u]) {
          if (e.kind !== 'flow' && e.kind !== 'tap') continue;
          const v = e.ti; if (seen.has(v)) continue; seen.add(v);
          if (fixed[v] >= 0) return fixed[v];
          next.push(v);
        }
      }
      frontier = next;
    }
    frontier = [start];
    for (let depth = 0; depth < 6 && frontier.length; depth++) {
      const next = [];
      for (const u of frontier) {
        for (const e of inAll[u]) {
          if (e.kind !== 'flow' && e.kind !== 'tap') continue;
          const v = e.fi; if (seen.has(v)) continue; seen.add(v);
          if (fixed[v] >= 0) return fixed[v];
          next.push(v);
        }
      }
      frontier = next;
    }
    return homeIdx;
  };
  for (const n of nodes) n.loc0 = fixed[n.i] === -2 ? findRegion(n.i) : fixed[n.i];

  // parts next to users keep one lane per user region only while everything feeding them is also next to users
  for (let oi = 0; oi < N; oi++) {
    const n = nodes[topo[oi]];
    let ln = n.near;
    if (ln) for (const e of inAll[n.i]) if ((e.kind === 'flow' || e.kind === 'tap') && !nodes[e.fi].laneNear) { ln = false; break; }
    n.laneNear = ln;
  }
  for (const e of edges) e.keep = nodes[e.fi].laneNear && nodes[e.ti].laneNear;

  // ---- canServe in reverse topological order
  const canServe = new Uint8Array(N * T);
  const anyDown = (u, t) => {
    for (const e of outFlow[u]) if (!e.parking && canServe[e.ti * T + t]) return true;
    return false;
  };
  for (let oi = N - 1; oi >= 0; oi--) {
    const u = topo[oi];
    const n = nodes[u];
    for (let t = 0; t < T; t++) {
      if (t === attackT || !H(u, t)) continue;
      let cs = false;
      switch (n.kind) {
        case 'store': cs = C(u, t) && !(n.role === 'replica' && n.primaryOf < 0); break;
        case 'external': case 'lookaside': cs = C(u, t); break;
        case 'queue': cs = anyDown(u, t); break;
        case 'cache': cs = (cacheable[t] && C(u, t)) || anyDown(u, t); break;
        case 'compute': cs = C(u, t) || anyDown(u, t); break;
        case 'router': case 'filter': case 'source': case 'tap': cs = anyDown(u, t); break;
        default: cs = false;
      }
      if (cs) canServe[u * T + t] = 1;
    }
  }

  // ---- routing tables
  const route = new Array(N * T).fill(null);
  const ownProt = new Uint8Array(N * T);
  const mk = (mode, P = EMPTY, miss = EMPTY, calls = EMPTY, callShare = EMPTYF, side = false) => ({ mode, P, miss, calls, callShare, side });
  for (let u = 0; u < N; u++) {
    const n = nodes[u];
    for (let t = 0; t < T; t++) {
      if (t === attackT) continue;
      const handles = H(u, t);
      if (!handles) continue;
      const tid = catalog.requests[t].id;
      const elig = [], LC = [], CA = [], F = [], calls = [], shares = [];
      for (const e of outFlow[u]) {
        if (e.parking) continue;
        const v = e.ti, vn = nodes[v];
        const vh = H(v, t);
        const isCall = vh && ((vn.kind === 'lookaside' && !C(v, t)) || ((vn.el.params?.lookasideFor || []).includes(tid) && !canServe[v * T + t]));
        if (n.kind === 'lookaside') {
          if (vn.kind === 'external' && vh) { calls.push(e.i); shares.push(LOOKASIDE_EXT_SHARE); }
          continue;
        }
        if (isCall) { calls.push(e.i); shares.push(vn.kind === 'lookaside' ? (vn.el.params?.callShare ?? 1) : 1); continue; }
        if (!canServe[v * T + t]) continue;
        elig.push(e);
        if (vn.kind === 'lookaside') LC.push(e.i);
        else if (vn.kind === 'cache' && cacheable[t] && C(v, t)) CA.push(e);
        else F.push(e.i);
      }
      // A copy (a search index fed by change capture) answers its own kind of question; records are read from
      // and written to the system of record whenever one is reachable.
      if (!COPY_TYPES.has(tid) && F.length > 1) {
        const isCopy = (ei) => { const vn = nodes[edges[ei].ti]; return vn.kind === 'store' && !!vn.el.params?.isCopy; };
        const keep = F.filter((ei) => !isCopy(ei));
        if (keep.length && keep.length < F.length) F.splice(0, F.length, ...keep);
      }
      const callsA = Int32Array.from(calls), sharesA = Float64Array.from(shares);
      for (const ci of calls) if (nodes[edges[ci].ti].el.id === 'idempotency-store') ownProt[u * T + t] = 1;
      if (n.el.id === 'outbox' && n.el.params?.dedupe) ownProt[u * T + t] = 1;
      if (n.el.params?.immutable && C(u, t)) ownProt[u * T + t] = 1;

      let P = EMPTY, miss = EMPTY, side = false;
      if (LC.length) P = Int32Array.from(LC);
      else if (CA.length) {
        const inline = CA.filter((e) => anyDown(e.ti, t));
        if (inline.length) P = Int32Array.from(inline.map((e) => e.i));
        else { P = Int32Array.from(CA.map((e) => e.i)); miss = Int32Array.from(F); side = true; }
      } else P = Int32Array.from(F);
      // A cache beside the caller only holds what an origin gave it: with nowhere to send misses, it serves nothing.
      if (side && !miss.length) { P = EMPTY; side = false; }

      let entry;
      switch (n.kind) {
        case 'store': case 'external':
          entry = C(u, t) ? mk(M.COMPLETE, EMPTY, EMPTY, callsA, sharesA) : null; break;
        case 'lookaside':
          entry = mk(C(u, t) ? M.COMPLETE : M.CALLED, EMPTY, EMPTY, callsA, sharesA); break;
        case 'queue':
          entry = mk(M.QUEUE, Int32Array.from(elig.map((e) => e.i))); break;
        case 'cache':
          if (cacheable[t] && C(u, t)) entry = P.length && !side ? mk(M.CACHE, P, EMPTY, callsA, sharesA) : mk(M.SIDECACHE);
          else entry = P.length ? mk(M.FORWARD, P, miss, callsA, sharesA, side) : null;
          break;
        case 'compute':
          if (C(u, t)) entry = mk(M.COMPLETE, EMPTY, EMPTY, callsA, sharesA);
          else if (P.length) entry = mk(M.FORWARD, P, miss, callsA, sharesA, side);
          else if ((n.el.params?.lookasideFor || []).includes(tid)) entry = mk(M.CALLED);
          else entry = null;
          break;
        case 'tap':
          entry = P.length ? mk(M.FORWARD, P, miss, callsA, sharesA, side) : mk(M.TAPEND); break;
        case 'source': case 'router': case 'filter':
          entry = P.length ? mk(M.FORWARD, P, miss, callsA, sharesA, side) : null; break;
        default: entry = null;
      }
      route[u * T + t] = entry;
    }
  }

  // ---- which element types sit on the served paths of each type (for problem `requires` groups)
  const sources = [];
  for (const n of nodes) if (n.kind === 'source') sources.push(n.i);
  const pathEls = Array.from({ length: T }, () => new Set());
  const typeServed = new Uint8Array(T);
  const sourceShare = new Float64Array(N * T);
  // A type counts as served only if some path from a source ends at a part that finishes it (or a queue that holds it).
  const ENDS = new Set([M.COMPLETE, M.CACHE, M.SIDECACHE, M.QUEUE, M.CALLED, M.TAPEND]);
  for (let t = 0; t < T; t++) {
    if (t === attackT) continue;
    const seen = new Uint8Array(N);
    const stack = [];
    for (const [s, share] of sourceWeights(problem, { nodes, H }, t, catalog.requests[t].id)) {
      sourceShare[s * T + t] = share;
      const r = route[s * T + t];
      if (share > 0 && r && r.mode === M.FORWARD) stack.push(s);
    }
    while (stack.length) {
      const u = stack.pop();
      if (seen[u]) continue;
      seen[u] = 1;
      pathEls[t].add(nodes[u].el.id);
      const r = route[u * T + t];
      if (!r) continue;
      if (ENDS.has(r.mode)) typeServed[t] = 1;
      for (const list of [r.P, r.miss, r.calls]) for (const ei of list) stack.push(edges[ei].ti);
      for (const ei of tapOut[u]) if (H(edges[ei].ti, t)) stack.push(edges[ei].ti);
    }
  }

  // ---- stores a cache fills its reads from (for stale-read checks): follow the read routes, not every edge
  const behind = Array.from({ length: N }, () => []);
  const tr = catalog.typeIndex.get('read');
  for (const n of nodes) {
    if (n.kind !== 'cache') continue;
    const seen = new Set();
    const stack = [n.i];
    for (const c of n.callers) { const r = tr != null ? route[c * T + tr] : null; if (r && r.side) for (const ei of r.miss) stack.push(edges[ei].ti); }
    while (stack.length) {
      const u = stack.pop();
      if (seen.has(u)) continue; seen.add(u);
      if (nodes[u].kind === 'store') { behind[n.i].push(u); continue; }
      const r = tr != null ? route[u * T + tr] : null;
      if (!r) continue;
      for (const ei of r.P) stack.push(edges[ei].ti);
      for (const ei of r.miss) stack.push(edges[ei].ti);
    }
  }

  // ---- observers and controls in use (connected anywhere)
  const connected = (u) => outAll[u].length + inAll[u].length > 0;
  const has = (elId, pred = connected) => nodes.some((n) => n.el.id === elId && pred(n.i));
  const linkedTo = (u, otherEl) => outAll[u].some((e) => nodes[e.ti].el.id === otherEl) || inAll[u].some((e) => nodes[e.fi].el.id === otherEl);
  const observes = (u) => inAll[u].some((e) => e.kind === 'observe' && inRequestPath(nodes[e.fi].el));
  const ops = {
    metrics: has('metrics', observes),
    alerting: false, pager: false, dashboards: false,
    logs: has('logs', observes),
    traces: has('traces', observes),
    synthetic: has('synthetic-probe'),
    ciCd: has('ci-cd'), flags: has('feature-flags'), config: has('config-service'),
    secrets: has('secrets-manager'), kms: has('kms'), autoscaler: has('autoscaler'),
    backups: has('backups'), dr: has('disaster-recovery'),
  };
  ops.alerting = ops.metrics && has('alerting', (u) => linkedTo(u, 'metrics'));
  ops.pager = ops.alerting && has('pager', (u) => linkedTo(u, 'alerting'));
  ops.dashboards = ops.metrics && has('dashboards', (u) => linkedTo(u, 'metrics'));

  const present = new Map();
  for (const n of nodes) {
    if (!present.has(n.el.id)) present.set(n.el.id, []);
    present.get(n.el.id).push(n.i);
  }

  return {
    catalog, env, problem, T, attackT, regionIds, homeIdx, cacheable, sourceShare,
    N, nodes, idx, E, edges, outAll, inAll, outFlow, tapOut, reentry, topo,
    canServe, route, ownProt, sources: Int32Array.from(sources), pathEls, typeServed, behind, ops, present,
    attackRoutes: new Map(),
    H, C, hm, cm,
  };
}

// Routing for attack traffic that imitates the types in `mask` (bit per type index).
export function attackRoute(model, mask) {
  let r = model.attackRoutes.get(mask);
  if (r) return r;
  const { N, T, nodes, edges, route, attackT, catalog } = model;
  const H = model.H, C = model.C;
  const types = [];
  for (let t = 0; t < T; t++) if (mask & (2 ** t)) types.push(t);
  const ok = (v) => H(v, attackT) || nodes[v].kind === 'router';
  r = new Array(N);
  for (let u = 0; u < N; u++) {
    const n = nodes[u];
    const set = new Set();
    let completes = false;
    for (const t of types) {
      if (C(u, t) && (n.kind === 'store' || n.kind === 'external' || n.kind === 'lookaside' || n.kind === 'compute')) completes = true;
      const e = route[u * T + t];
      if (!e) continue;
      const list = e.side ? e.miss : e.P;
      for (const ei of list) if (ok(edges[ei].ti)) set.add(ei);
    }
    const P = Int32Array.from([...set].sort((a, b) => a - b));
    if (completes || n.kind === 'queue') r[u] = { mode: M.ABSORB, P: EMPTY };
    else if (P.length) r[u] = { mode: M.FORWARD, P };
    else r[u] = { mode: H(u, attackT) ? M.ABSORB : M.NONE, P: EMPTY };
  }
  model.attackRoutes.set(mask, r);
  return r;
}
