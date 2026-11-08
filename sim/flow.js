// One tick of the flow model: a forward pass moves rates through the graph, a backward pass works out success and latency.
import { M, KIND, attackRoute } from './route.js';
import { queueFactor, tailBeyond } from './util.js';

const PROBE_SHARE = 0.05; // share an open circuit breaker still lets through to test the dependency
const SYNC_WRITE_MS = 2; // sync replication adds a few ms to each write, approx.
const PARTITION_MS = 10000; // per-partition limit of an event stream, about 10 MB/s of 1 KB messages, approx.
const MISSED_CLEAR_SHARE = 0.05; // share of cache clears that miss when a server writes, approx.
const READ_BACK_SEC = 2; // people read back their own change about 2 seconds after making it, approx.

// Per-node flags that depend on knobs or element params; called after compile and after knob changes.
export function prepareNode(n, model) {
  const p = n.el.params || {};
  const T = model.T;
  n.hAtk = model.H(n.i, model.attackT);
  n.isDns = n.el.id === 'dns';
  n.isGeo = n.el.id === 'geo-dns' || n.el.id === 'global-lb';
  n.healthRoute = (n.kind === 'router' && !n.isDns && !n.isGeo) || !!p.fallback;
  n.failOpen = n.kind === 'cache' && (n.cat === 'data' || n.cat === 'ai');
  n.filterish = n.kind === 'filter' || p.absorbsAttackShare != null;
  n.isRL = n.el.id === 'rate-limiter';
  n.isCB = n.el.id === 'circuit-breaker';
  n.fanoutQ = n.kind === 'queue' && !!p.fanout;
  n.fifo = n.kind === 'queue' && n.mode === 'fifo';
  n.emitsWebhooks = !!p.emitsWebhooks;
  n.alwaysCoalesce = n.el.id === 'origin-shield';
  // A shared copy at the edge (CDN, origin shield) answers everyone with the same bytes: it cannot hold personal
  // answers, and it cannot be cleared on every write, so a read-back can see the old copy until it expires.
  // Caches next to your servers are cleared by your servers when they write, so they stay fresh for the writer.
  n.edgeCache = n.kind === 'cache' && n.cat === 'edge';
  const ttl = n.ttlSec ?? p.ttlSec ?? 300;
  n.ttlStale = n.edgeCache && ttl > 0 ? Math.max(0, 1 - READ_BACK_SEC / ttl) : 0;
  // A cache beside your servers is cleared when your servers write, but a few clears are missed (races, writes by another
  // path), and a missed one is wrong until the TTL runs out. The longer the TTL, the more of those survive (approx.).
  n.ttlStaleData = n.kind === 'cache' && n.cat === 'data' && ttl > 0 ? Math.min(1, ttl / 86400) * MISSED_CLEAR_SHARE : 0;
  // workers that read from a queue or stream apply writes in batches, so one hot item becomes a few updates a second
  n.batcher = n.kind === 'compute' && model.inAll[n.i].some((e) => model.nodes[e.fi].kind === 'queue');
  n.passThrough = !!(n.el.cost && n.el.cost.perGB && n.kind !== 'store');
  n.connLimit = p.maxConnections || 0;
  n.modeFactor = n.el.id === 'wide-column' ? (n.mode === 'ALL' ? 1.8 : n.mode === 'QUORUM' ? 1.3 : 1) : 1;
  n.writeAdd = n.kind === 'store' && n.replication === 'sync' && (n.zones > 1 || n.replicas.length) ? SYNC_WRITE_MS : 0;
  let stale = 0;
  if (n.kind === 'store') {
    if (n.role === 'replica') stale = 1;
    else if (n.el.id === 'document-db' && n.readFrom === 'replicas') stale = 0.5;
    else if (n.el.id === 'wide-column' && (n.mode || 'ONE') === 'ONE') stale = 0.67;
    else if (p.isCopy) stale = 1;
  }
  n.staleShare = stale;
  n.baseLagSec = (p.replicationLagMs ?? p.lagMs ?? 0) / 1000 + (p.refreshSec ? p.refreshSec : 0);
  // consumer edges of a queue (union over types) for fan-out draining
  if (n.kind === 'queue') {
    const set = new Set();
    for (let t = 0; t < T; t++) { const r = model.route[n.i * T + t]; if (r && r.mode === M.QUEUE) for (const e of r.P) set.add(e); }
    n.consumers = Int32Array.from([...set].sort((a, b) => a - b));
  } else n.consumers = null;
  let cap = n.cap1;
  if (n.el.id === 'event-stream') n.capPerUnitMax = n.partitions > 0 ? n.partitions * PARTITION_MS : Infinity;
  else n.capPerUnitMax = Infinity;
  if (n.fifo) cap = Math.min(cap, 3000); // ordered queues run about 300 to 3,000 messages per second per group, approx.
  n.capUnit = cap;
}

const capacityCache = new WeakMap();

// Capacity a neighbour can really take for type t, in requests of that type a second: a part that only passes requests
// on is limited by what lies behind it, so a wide filter or balancer in front of a small helper does not attract more than
// that helper can serve. Each part counts in its own cost of the type (a store that writes cheaply takes more writes
// than reads; a database whose writes are dear takes fewer).
function computeEffCap(S) {
  const { model, T, activeT, nActiveT } = S;
  const { nodes, topo, route, edges, N } = model;
  if (!S.effCap || S.effCap.length !== N * T) S.effCap = new Float64Array(N * T);
  const E = S.effCap;
  let cached = capacityCache.get(S);
  let changed = !cached || cached.model !== model || cached.output !== E;
  let sameTypes = cached && cached.types.length === nActiveT;
  if (sameTypes) for (let a = 0; a < nActiveT; a++) {
    if (cached.types[a] !== activeT[a]) { sameTypes = false; break; }
  }
  if (!sameTypes) { changed = true; E.fill(0); }
  if (changed) {
    cached = { model, output: E, capacities: new Float64Array(N), types: activeT.slice(0, nActiveT) };
    capacityCache.set(S, cached);
  }
  for (let v = 0; v < N; v++) {
    const own = nodes[v].isDns ? S.capNom[v] : S.cap[v];
    if (cached.capacities[v] !== own) changed = true;
    cached.capacities[v] = own;
  }
  if (!changed) return;
  for (let oi = N - 1; oi >= 0; oi--) {
    const v = topo[oi];
    const own = nodes[v].isDns ? S.capNom[v] : S.cap[v];
    for (let a = 0; a < nActiveT; a++) {
      const t = activeT[a];
      const r = route[v * T + t];
      let c = own / costT(S, v, t);
      if (r && r.mode === M.FORWARD && r.P.length) {
        let down = 0;
        for (let k = 0; k < r.P.length; k++) down += E[edges[r.P[k]].ti * T + t];
        if (down < c) c = down;
      }
      E[v * T + t] = c;
    }
  }
}
const effCap = (S, v, t) => (S.effCap ? S.effCap[v * S.T + t] : S.cap[v] / costT(S, v, t));

function costT(S, v, t) {
  return t === S.attackT ? 1 : (S.isWrite[t] ? S.model.nodes[v].wCost : 1);
}

// Round trip added by each edge for users in each region, recomputed once per tick (locations move with failover).
export function computeEdgeRtt(S) {
  const { edges, E } = S.model;
  const R = S.R;
  if (!S.rttE || S.rttE.length < E * R) S.rttE = new Float64Array(Math.max(1, E * R));
  for (let i = 0; i < E; i++) {
    const e = edges[i];
    const lv = S.loc[e.ti], lu = S.loc[e.fi];
    for (let r = 0; r < R; r++) {
      S.rttE[i * R + r] = lv < 0 ? 0 : (lu < 0 ? S.rtt[r * R + lv] : S.rtt[lu * R + lv]);
    }
  }
}

function blocked(S, e) {
  if (!S.partition) return false;
  const lu = S.loc[e.fi], lv = S.loc[e.ti];
  return lu >= 0 && lv >= 0 && lu !== lv;
}

function routerHealthy(S, v, failSec) {
  const since = S.unhealthySince[v];
  return !(since >= 0 && S.clock - since >= failSec * 1000);
}

// Writes normalised weights for lane L over the edge list into S.W; returns 0 when nothing can take traffic.
function weights(S, u, list, L, t) {
  if (list.length === 1) {
    const e = S.model.edges[list[0]];
    const ok = blocked(S, e) ? 0 : 1;
    S.W[list[0] * S.LN + L] = ok;
    return ok;
  }
  return branchWeights(S, u, list, L, t);
}

function branchWeights(S, u, list, L, t) {
  const { model, LN, W } = S;
  const edges = model.edges;
  const n = model.nodes[u];
  const len = list.length;
  let sum = 0;
  if (n.isGeo) {
    const r = S.laneR[L];
    const failSec = n.el.params?.failoverSec || 60;
    let best = Infinity, anyHealthy = false;
    for (let k = 0; k < len; k++) {
      const e = edges[list[k]];
      if (blocked(S, e)) continue;
      if (!routerHealthy(S, e.ti, failSec)) continue;
      anyHealthy = true;
      const lv = S.loc[e.ti];
      const d = lv < 0 ? 0 : S.rtt[r * S.R + lv];
      if (d < best) best = d;
    }
    let first = true;
    for (let k = 0; k < len; k++) {
      const ei = list[k];
      const e = edges[ei];
      let w = 0;
      if (!blocked(S, e) && (!anyHealthy || routerHealthy(S, e.ti, failSec))) {
        const lv = S.loc[e.ti];
        const d = lv < 0 ? 0 : S.rtt[r * S.R + lv];
        if (!anyHealthy || d <= best + 0.5) w = Math.max(effCap(S, e.ti, t), 1);
        if (n.mode === 'failover') { if (w > 0 && first) first = false; else w = 0; }
      }
      W[ei * LN + L] = w;
      sum += w;
    }
  } else {
    for (let k = 0; k < len; k++) {
      const ei = list[k];
      const e = edges[ei];
      if (blocked(S, e)) { W[ei * LN + L] = 0; continue; }
      const v = e.ti;
      let w = n.isDns ? S.capNom[v] : effCap(S, v, t);
      if (n.healthRoute) { const h = S.health[v] > 0.02 ? S.health[v] : 0.02; w *= h * h; }
      W[ei * LN + L] = w;
      sum += w;
    }
    if (sum <= 0) {
      for (let k = 0; k < len; k++) {
        const ei = list[k];
        if (!blocked(S, edges[ei])) { W[ei * LN + L] = 1; sum += 1; }
      }
    }
  }
  if (sum <= 0) return 0;
  for (let k = 0; k < len; k++) W[list[k] * LN + L] /= sum;
  return 1;
}

// Lanes: parts next to users keep one lane per (user region, type); parts inside a region use one merged lane per type,
// because routing and success there do not depend on where the user is. Region round trips are added on the crossing edge.
export function laneOn(S, e, L) {
  return e.keep ? L : S.laneT[L];
}

function send(S, ei, L, amt, rinShare, pu) {
  const LN = S.LN;
  const e = S.model.edges[ei];
  const j = e.ti * LN + (e.keep ? L : S.laneT[L]);
  S.IN[j] += amt;
  S.ER[ei * LN + L] += amt;
  if (S.model.nodes[e.fi].batcher && S.isWrite[S.laneT[L]]) S.BIN[e.ti] += amt;
  if (rinShare > 0) S.RIN[j] += amt * rinShare;
  if (pu > 0) S.PUa[j] += amt * pu;
}

function split(S, u, list, L, t, amount, rinShare, pu) {
  if (!weights(S, u, list, L, t)) { S.FAILR[u * S.LN + L] += amount; return; }
  if (amount <= 0) return;
  const LN = S.LN, W = S.W;
  for (let k = 0; k < list.length; k++) {
    const ei = list[k];
    const w = W[ei * LN + L];
    if (w > 0) send(S, ei, L, amount * w, rinShare, pu);
  }
}

export function hitShare(S, c, t) {
  if (!S.cacheable[t]) return 0;
  const n = S.model.nodes[c];
  if (S.cap[c] <= 0) return 0;
  let hr = n.hitRate * S.flush[c];
  const hot = S.hot[c];
  if (hot > 0) hr = hot * 0.99 + (1 - hot) * hr;
  if (n.edgeCache && S.readLike[t]) hr *= 1 - S.privateReads;
  return hr;
}

// Stale share of a cache hit for read-your-writes: only reads of one's own recent change can be stale. They are stale
// when the copy behind the cache lags by more than a second, or when an edge copy predates the change.
function staleHit(S, n, u) {
  const lag = S.cacheLag[u] > 1 ? S.readBack : 0;
  const edge = n.ttlStale * S.readBackEdge;
  const own = n.ttlStaleData * S.readBack;
  const m = lag > edge ? lag : edge;
  return m > own ? m : own;
}

// Share of BATCHED writes in a node's load: writes that arrive through batching workers barely touch one hot key.
const BATCH_RELIEF = 0.9;
function servedShare(S, n, u, loadEq, cap) {
  const batched = loadEq > 0 && S.BIN[u] > 0 ? Math.min(1, (S.BIN[u] * n.wCost) / loadEq) : 0;
  const hot = S.hot[u] * (1 - BATCH_RELIEF * batched);
  const units = S.unitsCur[u];
  if (hot > 0 && n.keyed) {
    if (n.el.params?.perKeyReadRps) {
      const hotLoad = loadEq * hot;
      const hotServed = Math.min(hotLoad, n.el.params.perKeyReadRps);
      const rest = loadEq - hotLoad;
      const restServed = Math.min(rest, cap);
      S.rho[u] = Math.max(hotLoad / n.el.params.perKeyReadRps, rest / cap);
      return (hotServed + restServed) / loadEq;
    }
    if (units > 1) {
      const c = cap / units;
      const lh = loadEq * (hot + (1 - hot) / units);
      const lo = loadEq - lh;
      const served = Math.min(lh, c) + Math.min(lo, c * (units - 1));
      S.rho[u] = Math.max(lh / c, lo / (c * (units - 1)));
      return served / loadEq;
    }
  }
  const util = loadEq / cap;
  S.rho[u] = util;
  return util > 1 ? 1 / util : 1;
}

// ---------------------------------------------------------------------------------------------
export function forwardPass(S) {
  const { model, LN, T, attackT, laneT, laneR, IN, RIN, OKS, FAILR, DONE, HITS, PUa } = S;
  const { nodes, topo, route, edges, tapOut, N } = model;
  const dt = S.dt;
  const aR = S.attackMask ? attackRoute(model, S.attackMask) : null;
  computeEffCap(S);

  for (let oi = 0; oi < N; oi++) {
    const u = topo[oi];
    const n = nodes[u];
    const b = u * LN;
    const active = n.laneNear ? S.active : S.activeT;
    const nActive = n.laneNear ? S.nActive : S.nActiveT;

    if (S.fan[u] > 1) {
      for (let a = 0; a < nActive; a++) { const L = active[a]; if (S.fanTypes[laneT[L]]) IN[b + L] *= S.fan[u]; }
    }

    let loadEq = 0, realIn = 0, atkIn = 0;
    for (let a = 0; a < nActive; a++) {
      const L = active[a];
      const x = IN[b + L];
      if (x === 0) continue;
      const t = laneT[L];
      if (t === attackT) { atkIn += x; if (n.hAtk) loadEq += x; }
      else { loadEq += S.isWrite[t] ? x * n.wCost : x; realIn += x; }
    }
    S.loadEq[u] = loadEq;
    S.atkIn[u] = atkIn;
    S.realIn[u] = realIn;

    let s = 1;
    S.rho[u] = 0;
    if (n.hasCap && n.k !== KIND.source) {
      const cap = S.cap[u];
      if (cap <= 0) { s = 0; S.rho[u] = loadEq > 0 ? 9.99 : 0; }
      else if (loadEq > 0) s = servedShare(S, n, u, loadEq, cap);
    }
    S.sv[u] = s;
    const okBase = s * (1 - S.err[u]) * (1 - S.connErr[u]);
    const softK = 1 - S.errSoft[u];
    const isSource = n.k === KIND.source;
    const isQueue = n.k === KIND.queue;
    let sFail = 0, sReq = 0, sKb = 0, sInKb = 0, sWKb = 0;

    for (let a = 0; a < nActive; a++) {
      const L = active[a];
      const t = laneT[L];
      const j = b + L;
      const x = IN[j];
      if (x === 0) continue;
      const atk = t === attackT;
      let oks;
      if (isSource) oks = 1;
      else if (atk) oks = n.hAtk ? s : 1;
      else if (n.failOpen) oks = 1;
      else {
        oks = okBase * softK;
        if (S.blockW[u] && S.isWrite[t]) oks = 0;
      }
      OKS[j] = oks;
      const r = atk ? (aR ? aR[u] : null) : route[u * T + t];
      if (!r || r.mode === M.NONE) {
        FAILR[j] += x;
        if (!atk) sFail += x;
        continue;
      }
      const ok = x * oks;
      FAILR[j] += x - ok;
      const rinShare = atk ? 0 : (RIN[j] > 0 ? RIN[j] / x : 0);
      let pu = 0;
      if (!atk) {
        pu = PUa[j] > 0 ? Math.min(1, PUa[j] / x) : 0;
        if (model.ownProt[u * T + t]) pu = 1;
        S.PQ[j] = pu;
      }

      switch (r.mode) {
        case M.FORWARD: {
          let pass = ok;
          let rs = rinShare;
          if (n.filterish) {
            const p = n.el.params;
            if (atk) {
              let bsh = p.blockAttackShare ?? p.absorbsAttackShare ?? 0;
              if (n.el.id === 'ddos-shield' || n.el.id === 'firewall') bsh = bsh * (1 - S.attackApp) + bsh * 0.2 * S.attackApp;
              if (n.isRL && n.limitRps > 0) bsh = 1 - (1 - bsh) * Math.min(1, Math.sqrt(n.limitRps / 100));
              const drop = pass * bsh;
              FAILR[j] += drop;
              S.attackDropped += drop * dt;
              pass -= drop;
            } else {
              if (p.falsePositiveShare) { const d = pass * p.falsePositiveShare; FAILR[j] += d; pass -= d; }
              if (p.blockShare) { const c = pass * p.blockShare; DONE[j] += c; pass -= c; }
              if (n.isRL && rs > 0) {
                const d = pass * rs * (p.capsRetryShare || 0);
                FAILR[j] += d;
                const rinLeft = pass * rs - d;
                pass -= d;
                rs = pass > 0 ? Math.max(0, rinLeft / pass) : 0;
              }
              if (n.isCB && S.cbOpen[u]) { const d = pass * (1 - PROBE_SHARE); FAILR[j] += d; pass -= d; }
            }
          }
          if (!atk) {
            const calls = r.calls;
            for (let k = 0; k < calls.length; k++) send(S, calls[k], L, ok * r.callShare[k], 0, 0);
            const taps = tapOut[u];
            for (let k = 0; k < taps.length; k++) {
              const ei = taps[k];
              if (model.hm[edges[ei].ti * T + t]) send(S, ei, L, ok, 0, 0);
            }
          }
          if (r.side) {
            weights(S, u, r.P, L, t);
            let hitEst = 0;
            for (let k = 0; k < r.P.length; k++) {
              const ei = r.P[k];
              const w = S.W[ei * LN + L];
              if (w <= 0) continue;
              const c = edges[ei].ti;
              hitEst += w * hitShare(S, c, t) * S.sPrev[c];
              send(S, ei, L, pass * w, 0, 0);
            }
            const missAmt = pass * (1 - hitEst);
            if (r.miss.length) split(S, u, r.miss, L, t, missAmt, rs, pu);
            else FAILR[j] += missAmt;
          } else {
            split(S, u, r.P, L, t, pass, rs, pu);
          }
          break;
        }
        case M.CACHE: {
          const h = hitShare(S, u, t) * (n.failOpen ? s : 1);
          const hits = ok * h;
          HITS[j] += hits;
          if (S.readLike[t]) S.staleNow += hits * staleHit(S, n, u);
          const miss = ok - hits;
          const coalescing = (n.coalesce || n.alwaysCoalesce) && S.flush[u] < 1;
          const fwd = coalescing ? miss * 0.1 : miss;
          HITS[j] += miss - fwd;
          split(S, u, r.P, L, t, fwd, rinShare, pu);
          break;
        }
        case M.SIDECACHE: {
          const hits = ok * hitShare(S, u, t) * (n.failOpen ? s : 1);
          HITS[j] += hits;
          if (S.readLike[t]) S.staleNow += hits * staleHit(S, n, u);
          break;
        }
        case M.QUEUE: {
          if (n.fanoutQ) {
            for (let k = 0; k < r.P.length; k++) S.BACKE[r.P[k] * LN + L] += ok * dt;
          } else S.BACK[j] += ok * dt;
          break;
        }
        case M.COMPLETE: {
          DONE[j] += ok;
          if (!atk) {
            const calls = r.calls;
            for (let k = 0; k < calls.length; k++) send(S, calls[k], L, ok * r.callShare[k], 0, 0);
            const taps = tapOut[u];
            for (let k = 0; k < taps.length; k++) {
              const ei = taps[k];
              if (model.hm[edges[ei].ti * T + t]) send(S, ei, L, ok, 0, 0);
            }
            if (n.staleShare > 0 && S.readLike[t] && S.lag[u] > 1) S.staleNow += ok * n.staleShare * S.readBack;
            if (S.durableWrite[t]) {
              S.wrRate[u] += ok;
              if (S.partition && S.multiRegionWriters && S.loc[u] >= 0 && S.loc[u] !== model.homeIdx) S.conflictsNow += ok;
            }
            if (n.emitsWebhooks && t === S.paymentT && S.webhookT >= 0) S.WNEXT[b + laneR[L] * T + S.webhookT] += ok;
          }
          break;
        }
        case M.CALLED: {
          DONE[j] += ok;
          const calls = r.calls;
          for (let k = 0; k < calls.length; k++) send(S, calls[k], L, ok * r.callShare[k], 0, 0);
          break;
        }
        case M.TAPEND:
          DONE[j] += ok;
          break;
        case M.ABSORB:
          FAILR[j] += ok;
          break;
        default:
          FAILR[j] += ok;
      }
      // per-node totals for stats and the bill (only this node writes these cells); refused calls are not billed
      if (!atk) sFail += FAILR[j];
      sReq += isSource ? x : x * oks;
      sInKb += x * S.sizeKb[t];
      sKb += n.passThrough ? x * oks * S.respKb[t] : (DONE[j] + HITS[j]) * S.respKb[t];
      if (S.durableWrite[t]) sWKb += DONE[j] * S.sizeKb[t];
    }
    S.failedNow[u] = sFail;
    S.nodeReq[u] = sReq;
    S.nodeKb[u] = sKb;
    S.nodeInKb[u] = sInKb;
    S.nodeWKb[u] = sWKb;

    if (isQueue) drainQueue(S, u, n);
  }
}

function avail(S, v) {
  const other = S.rhoPrev[v] - S.rhoQPrev[v];
  return Math.max(0.05, 1 - (other > 0 ? other : 0)) * 0.95;
}

// Rate a queue consumer really pulls at for type t: its spare share of what the chain behind it can serve
// (a rate-limited provider caps the workers in front of it), slowed while most of its recent work failed,
// as consumers back off and redeliveries wait out the visibility timeout. A failing chain gets a trickle of probes.
const PULL_PROBE = 0.05;
const backOf = (S, v) => { const h = S.health[v]; return h >= 0.5 ? 1 : Math.max(PULL_PROBE, 2 * h - 0.05); };
const pullFull = (S, v, t) => avail(S, v) * effCap(S, v, t);
const pullRate = (S, v, t) => pullFull(S, v, t) * backOf(S, v);

function drainQueue(S, u, n) {
  const { model, LN, T, laneT, dt } = S;
  const active = n.laneNear ? S.active : S.activeT;
  const nActive = n.laneNear ? S.nActive : S.nActiveT;
  const edges = model.edges;
  const b = u * LN;
  const poisoned = S.poison[u] === 1;
  const dupShare = n.fifo ? 0 : S.dup[u];
  if (n.fanoutQ) {
    const cons = n.consumers;
    for (let k = 0; k < cons.length; k++) {
      const ei = cons[k];
      const v = edges[ei].ti;
      let use = 0, any = false;
      const bf = backOf(S, v);
      for (let a = 0; a < nActive; a++) {
        const L = active[a];
        const back = S.BACKE[ei * LN + L];
        if (!(back > 0)) continue;
        const K = pullRate(S, v, laneT[L]);
        if (K > 0) { use += (back / dt) * bf / K; any = true; }
      }
      const scale = poisoned || !any ? 0 : bf * (use > 1 ? 1 / use : 1);
      for (let a = 0; a < nActive; a++) {
        const L = active[a];
        const jb = ei * LN + L;
        const back = S.BACKE[jb];
        S.DRAINE[jb] = 0;
        if (back <= 0 || scale <= 0) continue;
        const t = laneT[L];
        const dr = (back / dt) * scale;
        S.BACKE[jb] = back - dr * dt;
        S.DRAINE[jb] = dr;
        const dup = dupShare > 0 ? dr * dupShare : 0;
        if (dup > 0 && S.nonIdem[t]) S.dupQueue += dup * (1 - protectQ(S, u, L, v, laneOn(S, edges[ei], L))) * dt;
        S.W[jb] = 1;
        send(S, ei, L, dr + dup, 0, 0);
        S.rhoQacc[v] += (dr + dup) * costT(S, v, t) / Math.max(S.cap[v], 1e-9);
      }
    }
    return;
  }
  let use = 0;
  for (let a = 0; a < nActive; a++) {
    const L = active[a];
    const j = b + L;
    S.DRAIN[j] = 0;
    const back = S.BACK[j];
    if (back <= 0) continue;
    const t = laneT[L];
    const r = model.route[u * T + t];
    if (!r || r.mode !== M.QUEUE) continue;
    let K = 0, Kfull = 0;
    for (let k = 0; k < r.P.length; k++) { const v = edges[r.P[k]].ti; const f = pullFull(S, v, t); Kfull += f; K += f * backOf(S, v); }
    if (K <= 0) continue;
    // while consumers back off, only part of the backlog is tried again this tick
    const d = (back / dt) * (K / Kfull);
    S.DRAIN[j] = d;
    use += d / K;
  }
  const scale = poisoned ? 0 : (use > 1 ? 1 / use : 1);
  for (let a = 0; a < nActive; a++) {
    const L = active[a];
    const j = b + L;
    const d = S.DRAIN[j];
    if (d <= 0) continue;
    const t = laneT[L];
    const dr = d * scale;
    S.DRAIN[j] = dr;
    if (dr <= 0) continue;
    S.BACK[j] -= dr * dt;
    const r = model.route[u * T + t];
    const dup = dupShare > 0 ? dr * dupShare : 0;
    // weights by available consumer capacity
    let sum = 0;
    for (let k = 0; k < r.P.length; k++) {
      const ei = r.P[k];
      const w = pullRate(S, edges[ei].ti, t);
      S.W[ei * LN + L] = w;
      sum += w;
    }
    if (sum <= 0) continue;
    let downProt = 0;
    for (let k = 0; k < r.P.length; k++) {
      const ei = r.P[k];
      const w = S.W[ei * LN + L] / sum;
      S.W[ei * LN + L] = w;
      if (w <= 0) continue;
      const v = edges[ei].ti;
      const amt = (dr + dup) * w;
      downProt += w * S.PD[v * LN + laneOn(S, edges[ei], L)];
      send(S, ei, L, amt, 0, S.PQ[j]);
      S.rhoQacc[v] += amt * costT(S, v, t) / Math.max(S.cap[v], 1e-9);
    }
    if (dup > 0 && S.nonIdem[t]) {
      const prot = 1 - (1 - S.PQ[j]) * (1 - Math.min(1, downProt));
      S.dupQueue += dup * (1 - prot) * dt;
    }
  }
}

function protectQ(S, u, L, v, Lv) {
  const up = S.PQ[u * S.LN + L] || 0;
  const down = S.PD[v * S.LN + Lv] || 0;
  return 1 - (1 - up) * (1 - down);
}

// ---------------------------------------------------------------------------------------------
export function backwardPass(S) {
  const { model, LN, T, attackT, laneR, laneT, IN, OKS, SUCC, SOFT, LAT, TM, TV, EXTRA, PD, TMO, DD, W } = S;
  const { nodes, topo, route, edges, N } = model;
  const cap = S.queueCap;
  const rttE = S.rttE, R = S.R;

  for (let oi = N - 1; oi >= 0; oi--) {
    const u = topo[oi];
    const n = nodes[u];
    const b = u * LN;
    const active = n.laneNear ? S.active : S.activeT;
    const nActive = n.laneNear ? S.nActive : S.nActiveT;
    // the user's own last mile is not part of the system's latency; region round trips are added on edges
    const isSrc = n.k === KIND.source;
    const q = isSrc ? 1 : queueFactor(S.rho[u], cap);
    const base50 = isSrc ? 0 : n.p50 * q * n.modeFactor + S.addLat[u];
    const base99 = isSrc ? 0 : n.p99 * q * n.modeFactor + S.addLat[u] + S.cold[u];
    S.hop50[u] = base50;
    S.hop99[u] = base99;
    const softK = 1 - S.errSoft[u];
    let wIn = 0, wSucc = 0, wExtra = 0, wD = 0, wLat = 0, anyTmo = 0;

    for (let a = 0; a < nActive; a++) {
      const L = active[a];
      const t = laneT[L];
      if (t === attackT) continue;
      const j = b + L;
      const x = IN[j];
      if (x === 0 && n.k !== KIND.source) continue;
      const r = route[u * T + t];
      let oks = OKS[j];
      let ownSoft = softK > 0 && !n.failOpen && n.k !== KIND.source ? oks / softK : oks;
      if (S.blockW[u] && S.isWrite[t] && !n.failOpen) ownSoft = 0;
      const h50 = base50 + (S.isWrite[t] ? n.writeAdd : 0);
      let h99 = base99 + (S.isWrite[t] ? n.writeAdd * 2.5 : 0);
      if (!r) {
        SUCC[j] = 0; SOFT[j] = 0; LAT[j] = h50; TM[j] = h50; TV[j] = 0; EXTRA[j] = 0; PD[j] = 0; DD[j] = 0; TMO[j] = 0;
        wIn += x;
        continue;
      }
      let d = 1, dS = 1, dl = 0, tm = 0, tv = 0, ex = 0, pd = model.ownProt[u * T + t];
      const mode = r.mode;
      if (mode === M.FORWARD || mode === M.CACHE) {
        let ad = 0, adS = 0, adl = 0, aex = 0, apd = 0, best = -1, btm = 0, btv = 0, wsum = 0;
        const list = r.side ? r.miss : r.P;
        for (let k = 0; k < list.length; k++) {
          const ei = list[k];
          const w = W[ei * LN + L];
          if (!(w > 0)) continue;
          const e = edges[ei];
          const vb = e.ti * LN + (e.keep ? L : laneT[L]);
          const rtt = rttE[ei * R + laneR[L]];
          wsum += w;
          ad += w * SUCC[vb]; adS += w * SOFT[vb]; adl += w * (LAT[vb] + rtt); aex += w * EXTRA[vb]; apd += w * PD[vb];
          if (w >= 0.01) {
            const sc = TM[vb] + rtt + Math.sqrt(TV[vb]);
            if (sc > best) { best = sc; btm = TM[vb] + rtt; btv = TV[vb]; }
          }
        }
        if (wsum <= 0) { ad = 0; adS = 0; }
        if (r.side) {
          let hit = 0, c50 = 0, ctm = 0, ctv = 0;
          for (let k = 0; k < r.P.length; k++) {
            const ei = r.P[k];
            const w = W[ei * LN + L];
            if (!(w > 0)) continue;
            const c = edges[ei].ti;
            const cn = nodes[c];
            const rtt = rttE[ei * R + laneR[L]];
            hit += w * hitShare(S, c, t) * (cn.failOpen ? S.sv[c] : OKS[c * LN + laneOn(S, edges[ei], L)]);
            const c5 = S.hop50[c] + rtt;
            c50 += w * c5;
            if (w >= 0.01 && c5 + (S.hop99[c] - S.hop50[c]) > ctm + Math.sqrt(ctv)) { ctm = c5; ctv = (S.hop99[c] - S.hop50[c]) ** 2; }
          }
          const m = 1 - hit;
          d = hit + m * ad; dS = hit + m * adS;
          dl = c50 + m * adl;
          if (m >= 0.01 && best >= 0) { tm = ctm + btm; tv = ctv + btv; } else { tm = ctm; tv = ctv; }
          ex = m * aex; pd = pd || apd;
        } else if (mode === M.CACHE) {
          const h = hitShare(S, u, t) * (n.failOpen ? S.sv[u] : 1);
          const m = 1 - h;
          d = h + m * ad; dS = h + m * adS;
          dl = m * adl;
          if (m >= 0.01 && best >= 0) { tm = btm; tv = btv; }
          ex = m * aex; pd = pd || apd;
        } else {
          d = ad; dS = adS; dl = adl; ex = aex;
          if (best >= 0) { tm = btm; tv = btv; }
          pd = pd || apd;
        }
        if (n.filterish) {
          const p = n.el.params;
          if (p.falsePositiveShare) d *= 1 - p.falsePositiveShare;
          if (p.blockShare) { d = p.blockShare + (1 - p.blockShare) * d; dS = p.blockShare + (1 - p.blockShare) * dS; dl *= 1 - p.blockShare; }
          if (n.isCB) {
            S.cbDown[u] += x * d;
            S.cbLat[u] += x * dl;
            if (S.cbOpen[u]) { d *= PROBE_SHARE; dS *= PROBE_SHARE; ex *= PROBE_SHARE; }
          }
        }
      } else if (mode === M.QUEUE) {
        let apd = 0, ws = 0;
        for (let k = 0; k < r.P.length; k++) {
          const ei = r.P[k];
          const w = W[ei * LN + L];
          if (!(w > 0)) continue;
          ws += w; apd += w * PD[edges[ei].ti * LN + laneOn(S, edges[ei], L)];
        }
        pd = pd || (ws > 0 ? apd / ws : 0);
      }
      // lookaside calls
      const calls = r.calls;
      for (let k = 0; k < calls.length; k++) {
        const e = edges[calls[k]];
        const v = e.ti;
        const c = r.callShare[k];
        const vb = v * LN + (e.keep ? L : laneT[L]);
        const lf = OKS[vb];
        const sk = 1 - S.errSoft[v];
        const lfS = sk > 0 ? Math.min(1, lf / sk) : lf;
        d *= 1 - c * (1 - lf);
        dS *= 1 - c * (1 - lfS);
        const rtt = rttE[e.i * R + laneR[L]];
        const v50 = S.hop50[v] + rtt;
        dl += c * v50;
        if (c >= 0.01) { tm += v50; tv += (S.hop99[v] - S.hop50[v]) ** 2; }
        ex += c * S.addLat[v];
      }
      // DD keeps the single-attempt success (retry load); retries then recover soft (random) errors
      DD[j] = d;
      if (n.retries > 0 && n.k !== KIND.external && dS > 0 && d < dS) {
        const qq = 1 - d / dS;
        d = dS * (1 - qq ** (n.retries + 1));
      }
      if (n.k === KIND.external && n.retries > 0 && S.errSoft[u] > 0 && softK > 0) {
        oks = ownSoft * (1 - S.errSoft[u] ** (n.retries + 1));
      }
      let pT = 0;
      // a timeout five times above the p99 cuts off a negligible tail, so skip the lognormal maths
      if (n.timeoutMs > 0) {
        if (n.k === KIND.external) {
          pT = n.timeoutMs >= 5 * h99 ? 0 : tailBeyond(h50, h99, n.timeoutMs);
          if (pT > 0) { oks *= 1 - pT; ownSoft *= 1 - pT; if (h99 > n.timeoutMs) h99 = n.timeoutMs; }
        } else if (dl > 0) {
          const p99d = tm + Math.sqrt(tv);
          pT = n.timeoutMs >= 5 * p99d ? 0 : tailBeyond(dl, p99d, n.timeoutMs);
          if (pT > 0) {
            d *= 1 - pT; dS *= 1 - pT;
            if (p99d > n.timeoutMs) { tm = Math.min(tm, n.timeoutMs); tv = Math.max(0, n.timeoutMs - tm) ** 2; }
            if (dl > n.timeoutMs) dl = n.timeoutMs;
          }
        }
      }
      TMO[j] = pT;
      if (pT > 0) anyTmo = 1;
      SUCC[j] = oks * d;
      SOFT[j] = ownSoft * dS;
      LAT[j] = h50 + dl;
      TM[j] = h50 + tm;
      TV[j] = (h99 - h50) * (h99 - h50) + tv;
      EXTRA[j] = S.addLat[u] + ex;
      PD[j] = pd ? (pd > 1 ? 1 : pd) : 0;
      wIn += x; wSucc += x * SUCC[j]; wExtra += x * ex; wD += x * d; wLat += x * dl;
    }
    S.tmoAny[u] = anyTmo;
    if (wIn > 0) {
      const h = wSucc / wIn;
      S.health[u] = 0.5 * S.health[u] + 0.5 * h;
      S.extraNow[u] = wExtra / wIn;
      S.dNow[u] = wD / wIn;
    } else if ((S.cap[u] <= 0 && n.hasCap && n.k !== KIND.source) || S.err[u] >= 0.5) {
      // with no traffic a health check still probes the part: a dead or erroring part stays unhealthy
      S.health[u] = 0.5 * S.health[u];
    } else {
      S.health[u] = 0.5 * S.health[u] + 0.5;
      S.extraNow[u] = 0;
      S.dNow[u] = 1;
    }
    if (n.isCB) {
      if (wIn > 0) { S.cbDown[u] /= wIn; S.cbLat[u] /= wIn; } else { S.cbDown[u] = 1; S.cbLat[u] = 0; }
    }
  }
}

// Messages that consumers failed to process go back into the queue.
export function queueReturns(S) {
  const { model, LN, T, laneT, dt } = S;
  const edges = model.edges;
  for (const u of S.queueNodes) {
    const n = model.nodes[u];
    const b = u * LN;
    const active = n.laneNear ? S.active : S.activeT;
    const nActive = n.laneNear ? S.nActive : S.nActiveT;
    if (n.fanoutQ) {
      const cons = n.consumers;
      for (let k = 0; k < cons.length; k++) {
        const ei = cons[k];
        const e = edges[ei];
        const v = e.ti;
        for (let a = 0; a < nActive; a++) {
          const L = active[a];
          const dr = S.DRAINE[ei * LN + L];
          if (dr > 0 && laneT[L] !== S.attackT) S.BACKE[ei * LN + L] += dr * (1 - S.SUCC[v * LN + laneOn(S, e, L)]) * dt;
        }
      }
      continue;
    }
    for (let a = 0; a < nActive; a++) {
      const L = active[a];
      const dr = S.DRAIN[b + L];
      if (!(dr > 0)) continue;
      const t = laneT[L];
      const r = model.route[u * T + t];
      if (!r) continue;
      let ok = 0;
      for (let k = 0; k < r.P.length; k++) {
        const ei = r.P[k];
        const w = S.W[ei * LN + L];
        if (w > 0) ok += w * S.SUCC[edges[ei].ti * LN + laneOn(S, edges[ei], L)];
      }
      S.BACK[b + L] += dr * (1 - ok) * dt;
    }
  }
}
