// The simulation engine: createSim() holds one design, runs a seeded traffic day in fixed 10 s ticks and scores it.
import { hashSeed, mulberry32 } from './rng.js';
import { SimError, connectRule, coerceKnob, makeNode, normalizeGraphInput } from './graph.js';
import { compile, refreshKnobs, KIND, M } from './route.js';
import { sourceWeights } from './sources.js';
import { traceRoute } from './trace.js';
import { prepareNode, forwardPass, backwardPass, queueReturns, computeEdgeRtt } from './flow.js';
import { makeInstance, startEvent, applyEffects, checkCompliance } from './events.js';
import { newCounters, computeCost, nodeLabel } from './cost.js';
import { scoreAll, passOf, starsOf, PASS_LATENCY_SHARE, PASS_LATENCY_SHARE_EASY } from './score.js';
import { validateModel, blockedTypes } from './validate.js';
import { buildResult } from './debrief.js';
import { queueFactor, geomRetries, fmtClock, parseClock } from './util.js';

export { SimError };

const EVENT_GRACE_MS = 600000; // event stories keep counting 10 minutes after the event ends
const UTIL_SHOW_MAX = 10; // utilisation shown to players and the renderer stops at 1,000 percent
const FREE_EDIT = new Set(['sandbox', 'lesson', 'intro']); // modes where parts can change while the day runs

const DEFAULT_REQ = {
  users: '', monthlyUsers: 1000000, peakRps: 1000, mix: { read: 0.9, write: 0.1 }, latencyP99Ms: { default: 200 },
  availability: 0.999, dataSafety: 'best-effort', readYourWrites: false, compliance: [], budgetPerMonth: 0,
  storageTb: 1, userRegions: { us: 1 }, homeRegion: 'us', notes: [], privateReads: 0,
};

export function normalizeProblem(problem, catalog, mode = 'practice') {
  const p = problem || {};
  const regionIds = catalog.world.regions.map((r) => r.id);
  const req = { ...DEFAULT_REQ, ...(p.requirements || {}) };
  const mix = {};
  let sum = 0;
  for (const [k, v] of Object.entries(req.mix || {})) if (catalog.typeIndex.has(k) && k !== 'attack' && v > 0) { mix[k] = Number(v); sum += Number(v); }
  if (!(sum > 0)) { mix.read = 1; sum = 1; }
  for (const k of Object.keys(mix)) mix[k] /= sum;
  req.mix = mix;
  const regs = {};
  let rs = 0;
  for (const [k, v] of Object.entries(req.userRegions || {})) if (regionIds.includes(k) && v > 0) { regs[k] = Number(v); rs += Number(v); }
  if (!(rs > 0)) { regs[regionIds.includes(req.homeRegion) ? req.homeRegion : 'us'] = 1; rs = 1; }
  for (const k of Object.keys(regs)) regs[k] /= rs;
  req.userRegions = regs;
  if (!regionIds.includes(req.homeRegion)) req.homeRegion = Object.keys(regs)[0] || regionIds[0];
  req.latencyP99Ms = { ...(typeof req.latencyP99Ms === 'number' ? { default: req.latencyP99Ms } : req.latencyP99Ms || {}) };
  req.compliance = Array.isArray(req.compliance) ? req.compliance.slice() : [];
  req.peakRps = Math.max(0, Number(req.peakRps) || 0);
  if (!(req.latencyBar > 0)) req.latencyBar = p.difficulty === 'Easy' ? PASS_LATENCY_SHARE_EASY : PASS_LATENCY_SHARE;
  const traffic = { curve: 'flat', sources: {}, params: {}, ...(p.traffic || {}) };
  return {
    id: p.id || mode, title: p.title || '', mode,
    requirements: req, traffic,
    events: Array.isArray(p.events) ? p.events.slice() : [],
    requires: p.requires || {},
    starter: p.starter || null,
    palette: p.palette || null,
    concepts: Array.isArray(p.concepts) ? p.concepts.slice() : [],
  };
}

// A problem's stated target is the one judged. Only types that are slow by nature (a sign-in through an identity
// provider, a card payment, an upload, a model reply: a natural budget of a second or more) keep that longer budget.
export const SLOW_BY_NATURE_MS = 1000;
export function latencyTarget(lat, r) {
  if (lat[r.id] != null) return lat[r.id];
  const nat = r.defaultLatencyBudgetMs || 0;
  if (lat.default != null) return nat >= SLOW_BY_NATURE_MS ? Math.max(lat.default, nat) : lat.default;
  return nat;
}

// Work in a queue that waits longer than its limit has missed its purpose and counts as a failed request (approx.):
// 15 minutes for work a person is waiting on (a message, a notification, a sync), an hour for back-office work
// (settling a payment, converting an upload, loading analytics), or the type's own budget when that is longer.
// A problem can set its own limit in minutes (requirements.queueLimitMin).
export const QUEUE_LATE_SEC = 900;
const QUEUE_BACKOFFICE_SEC = 3600;
const PERSON_WAITS = new Set(['message', 'notify', 'sync', 'location', 'login', 'read', 'search', 'inference', 'live', 'stream']);
function queueLimitFor(req, r) {
  if (req.queueLimitMin > 0) return req.queueLimitMin * 60;
  const base = PERSON_WAITS.has(r.id) ? QUEUE_LATE_SEC : QUEUE_BACKOFFICE_SEC;
  return Math.max(base, (r.defaultLatencyBudgetMs || 0) / 1000);
}
const DAY_TICKS = 8640;
// Share of reads that can be someone reading back their own change, at most (approx.).
const READ_BACK_MAX = 0.25;

function buildCurve(world, traffic) {
  const out = new Float64Array(1440);
  const id = traffic.curve;
  const params = traffic.params || {};
  const hourly = (arr, m) => {
    const h = m / 60;
    const h0 = Math.floor(h) % 24, h1 = (h0 + 1) % 24, f = h - Math.floor(h);
    return arr[h0] * (1 - f) + arr[h1] * f;
  };
  if (Array.isArray(world.curves[id])) {
    for (let m = 0; m < 1440; m++) out[m] = hourly(world.curves[id], m);
  } else if (id === 'deadline') {
    const base = world.curves['consumer-evening'];
    const dl = Math.min(1439, Math.floor(parseClock(params.deadlineAt || '23:59') / 60000));
    const climb = Math.max(1, Math.round((params.climbHours || 6) * 60));
    const start = Math.max(0, dl - climb);
    const b0 = hourly(base, start) * 0.4;
    for (let m = 0; m < 1440; m++) {
      if (m < start) out[m] = hourly(base, m) * 0.4;
      else if (m <= dl) out[m] = b0 + (1 - b0) * ((m - start) / Math.max(1, dl - start));
      else out[m] = 0.1;
    }
  } else if (id === 'drop') {
    out.fill(0.1);
  } else {
    for (let m = 0; m < 1440; m++) out[m] = hourly(world.curves.flat, m);
  }
  return out;
}

function statusOf(util, down, bands) {
  if (down) return 4;
  if (util >= bands.hot) return 3;
  if (util >= bands.warn) return 2;
  if (util >= bands.ok) return 1;
  return 0;
}

const N_F64 = ['cap', 'capNom', 'rho', 'sv', 'sPrev', 'rhoPrev', 'rhoQacc', 'rhoQPrev', 'health', 'unhealthySince', 'extraNow', 'extraPrev', 'dNow',
  'hop50', 'hop99', 'err', 'errSoft', 'addLat', 'cold', 'hot', 'flush', 'dup', 'lagEv', 'lag', 'cacheLag', 'capFactor', 'aliveFactor', 'fan', 'limitCap',
  'connErr', 'nodeCostMul', 'unitsCur', 'cbOpenUntil', 'cbDown', 'cbLat', 'loadEq', 'realIn', 'realInPrev', 'wrRate', 'wrRatePrev',
  'writesSoFar', 'peakUtil', 'overTicks', 'failedSum', 'failedNow', 'llLoss', 'highSince', 'lowSince', 'nodeReq', 'nodeKb', 'nodeInKb', 'nodeWKb', 'atkIn', 'BIN',
  'qAge', 'qOver', 'lateNow', 'unitsLo', 'unitsHi', 'peakUnits', 'peakInstalledUnits', 'peakCapacity', 'peakRequests'];
const N_U8 = ['down', 'blockW', 'poison', 'scaleBlocked', 'cbOpen', 'status', 'tmoAny'];
const NL = ['IN', 'RIN', 'INJ', 'OKS', 'FAILR', 'DONE', 'HITS', 'PUa', 'SUCC', 'SOFT', 'LAT', 'TM', 'TV', 'EXTRA', 'PD', 'TMO', 'DD', 'BACK', 'DRAIN', 'RNEXT', 'RPEND', 'WNEXT', 'PQ'];
const EL = ['W', 'ER', 'BACKE', 'DRAINE'];
const PERSIST_N = ['unitsCur', 'sPrev', 'rhoPrev', 'rhoQPrev', 'health', 'unhealthySince', 'extraPrev', 'cbOpenUntil', 'cbDown', 'cbLat', 'realInPrev',
  'wrRatePrev', 'writesSoFar', 'peakUtil', 'overTicks', 'failedSum', 'highSince', 'lowSince', 'status', 'unitsLo', 'unitsHi', 'peakUnits', 'peakInstalledUnits', 'peakCapacity', 'peakRequests'];
const PERSIST_NL = ['BACK', 'RPEND', 'RNEXT', 'WNEXT', 'PQ'];
const PERSIST_EL = ['BACKE'];
// Every field the engine state ever holds, declared up front so the object keeps one fast shape in V8.
// Fractional numbers start as -0 so V8 stores them as doubles from the first object on (no shape changes later).
function blankState() {
  const s = {
    catalog: null, world: null, problem: null, regionIds: null, R: 0, T: 0, LN: 0, dt: 10, dayMs: 0, mode: '',
    attackT: -1, paymentT: -1, webhookT: -1, queueCap: 20,
    isWrite: null, durableWrite: null, nonIdem: null, readLike: null, cacheable: null, interactive: null, sizeKb: null, respKb: null,
    rtt: null, laneT: null, laneR: null, active: null, nActive: 0, activeT: null, nActiveT: 0,
    trafficMul: null, fanTypes: null, noise: null, regShare: null, latTarget: null, mixArr: null, regShareBase: null,
    curve: null, curveCum: null, peakMinute: 0, peakRps: -0,
    backupsParams: null, ciCdParams: null, configParams: null, proxyParams: null, storageTbOf: null, addLost: null,
    activeEffects: null, instances: null, clock: 0, model: null, version: 0, rng: null, acc: -0,
    srcShare: null, srcAny: null, requiresOk: null, queueNodes: null, retryNodes: null, timeoutNodes: null, webhookNodes: null, cbNodes: null,
    srcRetries: 0, multiRegionWriters: false, storeOrder: null, frame: null, asPending: null,
    staleNow: -0, conflictsNow: -0, attackRate: -0, attackMask: 0, attackAppRate: -0, attackApp: -0, usageMul: -0, partition: false, retryAmp: false,
    shiftShare: -0, shiftRegion: -1, usdTickExtra: -0, forceAttackLanes: false,
    lostWrites: -0, duplicates: -0, staleReads: -0, readsServed: -0, conflicts: -0, dupQueue: -0, attackDropped: -0, attackOffered: -0,
    offeredDay: -0, successDay: -0, latOk: -0, latW: -0, writesDay: -0, worstP99: -0,
    typeOff: null, typeSucc: null, typeLatOk: null, typeLatW: null, typeP99Sum: null, typeWorst: null, typeSlowHop: null,
    minOff: null, minSucc: null, hourOff: null, hourSucc: null, hourP99: null, hourW: null,
    complianceChecked: null, interventions: null, result: null, counters: null, firstBreak: null, tickNow: null,
    laneOff: null, laneSucc: null, laneP99: null, lastStorageGb: null, stateObj: null, frameDirty: false, rttE: null,
    loc: null, effCap: null,
    qHist: null, lateCarry: null, lateType: null, lateDay: -0, readBack: -0, readBackEdge: -0, privateReads: -0, typeP99Now: null, typeWNow: null, latWorstT: -1,
    // per node (N)
    cap: null, capNom: null, rho: null, sv: null, sPrev: null, rhoPrev: null, rhoQacc: null, rhoQPrev: null, health: null, unhealthySince: null,
    extraNow: null, extraPrev: null, dNow: null, hop50: null, hop99: null, err: null, errSoft: null, addLat: null, cold: null, hot: null, flush: null,
    dup: null, lagEv: null, lag: null, cacheLag: null, capFactor: null, aliveFactor: null, fan: null, limitCap: null, connErr: null, nodeCostMul: null, unitsCur: null,
    cbOpenUntil: null, cbDown: null, cbLat: null, loadEq: null, realIn: null, realInPrev: null, wrRate: null, wrRatePrev: null, writesSoFar: null,
    peakUtil: null, overTicks: null, failedSum: null, failedNow: null, llLoss: null, highSince: null, lowSince: null,
    nodeReq: null, nodeKb: null, nodeInKb: null, nodeWKb: null, atkIn: null, BIN: null, qAge: null, qOver: null, lateNow: null, unitsLo: null, unitsHi: null, peakUnits: null, peakInstalledUnits: null, peakCapacity: null, peakRequests: null,
    down: null, blockW: null, poison: null, scaleBlocked: null, cbOpen: null, status: null, tmoAny: null,
    // per node and lane (N x LN)
    IN: null, RIN: null, INJ: null, OKS: null, FAILR: null, DONE: null, HITS: null, PUa: null, SUCC: null, SOFT: null, LAT: null, TM: null, TV: null,
    EXTRA: null, PD: null, TMO: null, DD: null, BACK: null, DRAIN: null, RNEXT: null, RPEND: null, WNEXT: null, PQ: null,
    // per edge and lane (E x LN)
    W: null, ER: null, BACKE: null, DRAINE: null,
  };
  return s;
}

// The state is one static literal (fast properties); fields are only ever overwritten, never added.
function fastState(fields) {
  const out = blankState();
  if (fields) for (const k of Object.keys(fields)) if (k in out) out[k] = fields[k];
  return out;
}

function allocArrays(S, N, E) {
  const LN = S.LN;
  for (const k of N_F64) S[k] = new Float64Array(N);
  for (const k of N_U8) S[k] = new Uint8Array(N);
  S.loc = new Int8Array(N);
  for (const k of NL) S[k] = new Float64Array(N * LN);
  for (const k of EL) S[k] = new Float64Array(Math.max(1, E) * LN);
}

function initNodeRuntime(S) {
  const { nodes } = S.model;
  for (const n of nodes) {
    S.unitsCur[n.i] = n.units;
    S.unitsLo[n.i] = n.units;
    S.unitsHi[n.i] = n.units;
    S.sPrev[n.i] = 1;
    S.health[n.i] = 1;
    S.unhealthySince[n.i] = -1;
    S.highSince[n.i] = -1;
    S.lowSince[n.i] = -1;
    S.cbDown[n.i] = 1;
    S.loc[n.i] = n.loc0;
  }
  S.asPending = new Map();
}

export function createSim({ catalog, problem, seed = 'practice', mode = 'practice' } = {}) {
  if (!catalog) throw new SimError('no-catalog', 'createSim needs a catalog.');
  const world = catalog.world;
  const regionIds = world.regions.map((r) => r.id);
  const T = catalog.requests.length;
  const R = regionIds.length;
  const LN = R * T;
  let prob = normalizeProblem(problem, catalog, mode);
  const env = { homeRegion: prob.requirements.homeRegion, regionIds, ttlAdjust: world.ttlHitAdjust };
  const tickMs = world.sim.tickMs;
  const dayMs = world.sim.dayMs;
  const bands = world.sim.utilBands;
  const typeOf = (id) => catalog.typeIndex.get(id);

  // ---- static type tables
  const S = fastState({
    catalog, world, problem: prob, regionIds, R, T, LN, dt: tickMs / 1000, dayMs, mode,
    attackT: typeOf('attack'), paymentT: typeOf('payment') ?? -1, webhookT: typeOf('webhook') ?? -1,
    queueCap: world.sim.queueingLatencyCap,
    isWrite: new Uint8Array(T), durableWrite: new Uint8Array(T), nonIdem: new Uint8Array(T), readLike: new Uint8Array(T),
    cacheable: new Uint8Array(T), interactive: new Uint8Array(T), sizeKb: new Float64Array(T), respKb: new Float64Array(T),
    rtt: new Float64Array(R * R), laneT: new Int32Array(LN), laneR: new Int32Array(LN), active: new Int32Array(LN), nActive: 0, activeT: new Int32Array(T), nActiveT: 0,
    trafficMul: new Float64Array(T), fanTypes: new Uint8Array(T), noise: new Float64Array(T),
    regShare: new Float64Array(R), latTarget: new Float64Array(T), mixArr: new Float64Array(T),
    activeEffects: [], instances: [], complianceChecked: new Map(), interventions: [],
    laneOff: new Float64Array(LN), laneSucc: new Float64Array(LN), laneP99: new Float64Array(LN),
    lateCarry: new Float64Array(T), lateType: new Float64Array(T), typeP99Now: new Float64Array(T), typeWNow: new Float64Array(T), qHist: new Map(),
  });
  catalog.requests.forEach((r, t) => {
    S.isWrite[t] = r.isWrite ? 1 : 0;
    S.durableWrite[t] = r.isWrite && r.durable ? 1 : 0;
    S.nonIdem[t] = r.idempotent ? 0 : 1;
    // stale-read checks cover records people read back; search results are expected to trail by a second or so
    S.readLike[t] = r.id === 'read' ? 1 : 0;
    S.cacheable[t] = r.cacheable ? 1 : 0;
    S.interactive[t] = r.interactive ? 1 : 0;
    S.sizeKb[t] = r.sizeKb;
    S.respKb[t] = r.isWrite ? 1 : r.sizeKb;
  });
  for (let a = 0; a < R; a++) for (let b = 0; b < R; b++) S.rtt[a * R + b] = world.rttMs[regionIds[a]][regionIds[b]];
  for (let L = 0; L < LN; L++) { S.laneT[L] = L % T; S.laneR[L] = Math.floor(L / T); }
  const elParams = (id) => catalog.elementById.get(id)?.params || {};
  S.backupsParams = elParams('backups');
  S.ciCdParams = elParams('ci-cd');
  S.configParams = elParams('config-service');
  S.proxyParams = elParams('db-proxy');
  S.storageTbOf = (u) => (S.lastStorageGb ? S.lastStorageGb[u] / 1000 : prob.requirements.storageTb || 1);
  S.addLost = (n, inst) => {
    if (!(n > 0)) return;
    S.lostWrites += n;
    if (inst && inst.stats) inst.stats.lost += n;
    else if (inst) inst.pendingLost = (inst.pendingLost || 0) + n;
  };

  function applyProblem() {
    S.problem = prob;
    S.curve = buildCurve(world, prob.traffic);
    S.curveCum = new Float64Array(1441);
    for (let m = 0; m < 1440; m++) S.curveCum[m + 1] = S.curveCum[m] + S.curve[m];
    let peakM = 0;
    for (let m = 1; m < 1440; m++) if (S.curve[m] > S.curve[peakM]) peakM = m;
    S.peakMinute = peakM;
    S.peakRps = prob.requirements.peakRps;
    S.mixArr.fill(0);
    for (const [k, v] of Object.entries(prob.requirements.mix)) S.mixArr[typeOf(k)] = v;
    const lat = prob.requirements.latencyP99Ms || {};
    // A problem's default target never makes a type stricter than its own natural budget (sign-in through an
    // identity provider or a card payment takes longer than a page read); a per-type target always wins.
    catalog.requests.forEach((r, t) => { S.latTarget[t] = latencyTarget(lat, r); });
    // Share of reads that are someone reading back their own change: about one read-back per durable write (approx.).
    let wShare = 0;
    catalog.requests.forEach((r, t) => { if (r.isWrite && r.durable) wShare += S.mixArr[t]; });
    // At most about one read in four is someone checking their own change, even where writes outnumber reads.
    const rShare = S.mixArr[typeOf('read')] || 0;
    S.readBack = rShare > 0 ? Math.min(READ_BACK_MAX, wShare / rShare) : 0;
    // Share of reads that are personal (a balance, a chart, an inbox): a shared edge copy cannot answer them.
    S.privateReads = Math.max(0, Math.min(1, Number(prob.requirements.privateReads) || 0));
    // Read-backs are mostly of one's own, personal data, so they come out of the private share first; only the rest
    // can land on a shared edge copy.
    S.readBackEdge = S.privateReads < 1 ? Math.max(0, Math.min(1, (S.readBack - S.privateReads) / (1 - S.privateReads))) : 0;
    S.regShareBase = new Float64Array(R);
    for (const [k, v] of Object.entries(prob.requirements.userRegions)) S.regShareBase[regionIds.indexOf(k)] = v;
    env.homeRegion = prob.requirements.homeRegion;
  }
  applyProblem();

  // ---- graph
  let graph = { nodes: [], edges: [] };
  let counter = 1;
  let dirty = true;
  let phase = 'build';
  const listeners = new Map();
  const emit = (name, payload) => { const l = listeners.get(name); if (l) for (const fn of [...l]) fn(payload); };

  const nodeById = (id) => graph.nodes.find((n) => n.id === id);
  const nextId = () => { let id; do { id = 'n' + counter++; } while (nodeById(id)); return id; };

  function markDirty() { dirty = true; S.version++; }

  function ensureModel() {
    if (!dirty && S.model) return;
    const old = S.model ? { model: S.model, arrays: snapshotPersist() } : null;
    const model = compile(catalog, graph, env);
    for (const n of model.nodes) prepareNode(n, model);
    S.model = model;
    allocArrays(S, model.N, model.E);
    initNodeRuntime(S);
    if (old && phase !== 'build') restorePersist(old);
    prepareModel();
    allocFrame();
    dirty = false;
  }

  function snapshotPersist() {
    const out = { N: {}, NL: {}, EL: {}, pending: S.asPending };
    for (const k of PERSIST_N) out.N[k] = S[k];
    for (const k of PERSIST_NL) out.NL[k] = S[k];
    for (const k of PERSIST_EL) out.EL[k] = S[k];
    return out;
  }

  function restorePersist(old) {
    const om = old.model;
    const m = S.model;
    for (const n of m.nodes) {
      const oi = om.idx.get(n.id);
      if (oi == null) continue;
      for (const k of PERSIST_N) S[k][n.i] = old.arrays.N[k][oi];
      for (const k of PERSIST_NL) S[k].set(old.arrays.NL[k].subarray(oi * LN, oi * LN + LN), n.i * LN);
      if (!om.nodes[oi] || om.nodes[oi].units !== n.units) S.unitsCur[n.i] = n.units;
    }
    const oe = new Map(om.edges.map((e) => [e.id, e.i]));
    for (const e of m.edges) {
      const oi = oe.get(e.id);
      if (oi == null) continue;
      for (const k of PERSIST_EL) S[k].set(old.arrays.EL[k].subarray(oi * LN, oi * LN + LN), e.i * LN);
    }
    S.asPending = new Map([...old.arrays.pending].filter(([id]) => m.idx.has(id)));
  }

  function prepareModel() {
    const m = S.model;
    const { nodes, N } = m;
    // source shares per type
    S.srcShare = new Float64Array(N * T);
    S.srcAny = new Float64Array(N);
    const srcMap = prob.traffic.sources || {};
    for (let t = 0; t < T; t++) {
      if (t === S.attackT) continue;
      const weights = sourceWeights(prob, m, t, catalog.requests[t].id);
      for (const [u, share] of weights) S.srcShare[u * T + t] = share;
    }
    let anySum = 0;
    for (const n of nodes) if (n.kind === 'source') { S.srcAny[n.i] = (srcMap[n.el.id] || 0) + 1e-6; anySum += S.srcAny[n.i]; }
    for (const n of nodes) if (anySum > 0) S.srcAny[n.i] /= anySum;
    S.requiresOk = blockedTypes(S);
    S.queueNodes = nodes.filter((n) => n.kind === 'queue').map((n) => n.i);
    S.retryNodes = nodes.filter((n) => (n.retries > 0 || n.el.params?.refreshOnErrorShare) && [KIND.source, KIND.compute, KIND.external, KIND.router].includes(n.k)).map((n) => n.i);
    S.timeoutNodes = nodes.filter((n) => n.timeoutMs > 0).map((n) => n.i);
    S.webhookNodes = nodes.filter((n) => m.reentry[n.i].length).map((n) => n.i);
    S.cbNodes = nodes.filter((n) => n.isCB).map((n) => n.i);
    S.srcRetries = Math.max(0, ...nodes.filter((n) => n.kind === 'source').map((n) => n.retries));
    const writerLocs = new Set(nodes.filter((n) => n.kind === 'store' && n.loc0 >= 0 && n.role !== 'replica' && (n.el.completes || []).some((t) => catalog.requests[typeOf(t)]?.isWrite)).map((n) => n.loc0));
    S.multiRegionWriters = writerLocs.size > 1;
    S.storeOrder = nodes.filter((n) => n.kind === 'store').sort((a, b) => (a.role === 'replica') - (b.role === 'replica')).map((n) => n.i);
    computeLanes();
  }

  function computeLanes() {
    const regs = new Set();
    for (let r = 0; r < R; r++) if (S.regShareBase[r] > 0) regs.add(r);
    const types = new Set();
    for (let t = 0; t < T; t++) if (S.mixArr[t] > 0) types.add(t);
    const evs = S.instances.length ? S.instances : prob.events.map((e) => ({ def: catalog.eventById.get(e.id), params: e.params || {} }));
    for (const inst of evs) {
      if (!inst.def) continue;
      for (const ef of inst.def.effects) {
        if (ef.op === 'attack') types.add(S.attackT);
        if (ef.op === 'regionShift') {
          const reg = (inst.params && inst.params.region) || ef.params.region;
          const ri = regionIds.indexOf(reg);
          if (ri >= 0) regs.add(ri);
        }
      }
    }
    if (S.model && S.model.nodes.some((n) => n.emitsWebhooks && S.model.reentry[n.i].length) && S.webhookT >= 0) types.add(S.webhookT);
    if (S.forceAttackLanes) types.add(S.attackT);
    let k = 0;
    const ts = [...types].sort((a, b) => a - b);
    for (const r of [...regs].sort((a, b) => a - b)) for (const t of ts) S.active[k++] = r * T + t;
    S.nActive = k;
    for (let i = 0; i < ts.length; i++) S.activeT[i] = ts[i];
    S.nActiveT = ts.length;
  }

  function allocFrame() {
    const m = S.model;
    S.frame = {
      version: S.version,
      nodeIds: m.nodes.map((n) => n.id),
      edgeIds: m.edges.map((e) => e.id),
      typeIds: catalog.requests.map((r) => r.id),
      edgeRps: new Float32Array(Math.max(1, m.E) * T),
      nodeFailRps: new Float32Array(Math.max(1, m.N) * T),
      nodeHitRps: new Float32Array(Math.max(1, m.N) * T),
      nodeUtil: new Float32Array(Math.max(1, m.N)),
      nodeStatus: new Uint8Array(Math.max(1, m.N)),
      nodeQueue: new Float32Array(Math.max(1, m.N)),
      activeEvents: [],
    };
  }

  // ---- run state
  function resetRun() {
    S.rng = mulberry32(hashSeed(`${seed}|${prob.id}`));
    S.clock = 0;
    S.noise.fill(0);
    S.instances = [];
    prob.events.forEach((e, i) => { const inst = makeInstance(catalog, e, i, dayMs); if (inst) S.instances.push(inst); });
    S.instances.sort((a, b) => a.atMs - b.atMs || a.n - b.n);
    S.activeEffects = [];
    S.lostWrites = 0; S.duplicates = 0; S.staleReads = 0; S.readsServed = 0; S.conflicts = 0;
    S.dupQueue = 0; S.attackDropped = 0; S.attackOffered = 0;
    S.offeredDay = 0; S.successDay = 0; S.latOk = 0; S.latW = 0; S.writesDay = 0;
    S.typeOff = new Float64Array(T); S.typeSucc = new Float64Array(T);
    S.typeLatOk = new Float64Array(T); S.typeLatW = new Float64Array(T); S.typeP99Sum = new Float64Array(T); S.typeWorst = new Float64Array(T); S.typeSlowHop = Array.from({ length: T }, () => ({ nodeId: null, p99Ms: 0 }));
    S.minOff = new Float64Array(1440); S.minSucc = new Float64Array(1440);
    S.hourOff = new Float64Array(24); S.hourSucc = new Float64Array(24); S.hourP99 = new Float64Array(24); S.hourW = new Float64Array(24);
    S.worstP99 = 0;
    S.qHist = new Map(); S.lateCarry.fill(0); S.lateDay = 0; S.latWorstT = -1;
    S.complianceChecked = new Map();
    S.interventions = [];
    S.result = null;
    S.tickNow = { offered: 0, success: 0, p99: 0, latBad: 0, byType: new Float64Array(T * 3) };
    S.counters = null;
    S.firstBreak = null;
    S.forceAttackLanes = mode === 'sandbox';
    dirty = true;
    ensureModel();
    initNodeRuntime(S);
    S.counters = newCounters(S.model.N);
    computeLanes();
  }

  // ---- per tick pieces (shared with the estimate)
  function resetMods(X) {
    const N = X.model.N;
    X.err.fill(0); X.errSoft.fill(0); X.addLat.fill(0); X.cold.fill(0); X.hot.fill(0); X.dup.fill(0); X.lagEv.fill(0);
    X.flush.fill(1); X.capFactor.fill(1); X.aliveFactor.fill(1); X.fan.fill(1); X.limitCap.fill(Infinity); X.connErr.fill(0); X.nodeCostMul.fill(1);
    X.down.fill(0); X.blockW.fill(0); X.poison.fill(0); X.scaleBlocked.fill(0);
    X.trafficMul.fill(1); X.fanTypes.fill(0);
    X.attackRate = 0; X.attackMask = 0; X.attackAppRate = 0; X.attackApp = 0; X.usageMul = 1; X.partition = false; X.retryAmp = false;
    X.shiftShare = 0; X.shiftRegion = -1;
    for (let u = 0; u < N; u++) X.loc[u] = X.model.nodes[u].loc0;
    X.rhoQacc.fill(0);
  }

  function updateAutoscale(X) {
    const { nodes } = X.model;
    for (const n of nodes) {
      if (n.kind !== 'compute' || n.elastic) continue;
      const u = n.i;
      const asEl = n.autoscaler >= 0 ? nodes[n.autoscaler].el.params : null;
      const pol = n.autoscaleKnob || (asEl ? { on: true, min: n.units, max: n.el.units.max, targetUtil: asEl.targetUtil ?? 0.6 } : null);
      let pending = X.asPending.get(n.id);
      if (pending) {
        let keep = [];
        for (const p of pending) { if (X.clock >= p.at) X.unitsCur[u] += p.n; else keep.push(p); }
        pending = keep;
        X.asPending.set(n.id, pending);
      }
      if (!pol) continue;
      const react = (asEl?.reactSec ?? 60) * 1000;
      const boot = (n.el.params?.scaleDelaySec ?? 120) * 1000;
      const scaleIn = (asEl?.scaleInDelaySec ?? 600) * 1000;
      const cur = X.unitsCur[u];
      const pend = pending ? pending.reduce((a, p) => a + p.n, 0) : 0;
      const util = Math.min(X.rhoPrev[u], 5);
      const desired = Math.min(pol.max, Math.max(pol.min, Math.ceil((cur * util) / pol.targetUtil)));
      if (desired > cur + pend) {
        if (X.highSince[u] < 0) X.highSince[u] = X.clock;
        if (X.clock - X.highSince[u] >= react && !X.scaleBlocked[u]) {
          const add = desired - cur - pend;
          if (add > 0) {
            if (!pending) { pending = []; X.asPending.set(n.id, pending); }
            pending.push({ at: X.clock + boot, n: add });
          }
          X.highSince[u] = -1;
        }
      } else X.highSince[u] = -1;
      if (pend === 0 && util < pol.targetUtil * 0.5 && cur > pol.min) {
        if (X.lowSince[u] < 0) X.lowSince[u] = X.clock;
        if (X.clock - X.lowSince[u] >= scaleIn) {
          X.unitsCur[u] = Math.max(pol.min, Math.ceil((cur * Math.max(util, 0.01)) / pol.targetUtil));
          X.lowSince[u] = -1;
        }
      } else X.lowSince[u] = -1;
      if (X.unitsCur[u] < pol.min) X.unitsCur[u] = pol.min;
    }
  }

  function updateLagAndBreakers(X) {
    const { nodes } = X.model;
    // copies lag their source: replicas, internal secondaries and search indexes; a lone primary has no copy to lag
    for (const u of X.storeOrder) {
      const n = nodes[u];
      const hasCopies = n.replicas.length > 0 || n.staleShare > 0;
      let lag = hasCopies && n.baseLagSec > 0 ? n.baseLagSec * queueFactor(X.rhoPrev[u], X.queueCap) : 0;
      lag += X.lagEv[u];
      if (n.primaryOf >= 0) lag = Math.max(lag, X.lag[n.primaryOf] + X.lagEv[u]);
      X.lag[u] = lag;
    }
    for (const n of nodes) {
      if (n.kind !== 'cache') continue;
      let lag = 0;
      // a cache is only as stale as the copy it reads from; one in front of the primary sees every write at once
      if (!n.cdcFed) for (const s of X.model.behind[n.i]) {
        const l = nodes[s].role === 'replica' ? X.lag[s] : (nodes[s].staleShare > 0 ? X.lagEv[s] : 0);
        if (l > lag) lag = l;
      }
      X.cacheLag[n.i] = lag;
    }
    for (const u of X.cbNodes) {
      const p = nodes[u].el.params;
      if (X.clock < X.cbOpenUntil[u]) { X.cbOpen[u] = 1; continue; }
      const failShare = 1 - X.cbDown[u];
      const slow = X.cbLat[u] >= (p.slowThresholdMs ?? 1000);
      if (failShare >= (p.errorThreshold ?? 0.5) || slow) { X.cbOpen[u] = 1; X.cbOpenUntil[u] = X.clock + (p.openSec ?? 30) * 1000; }
      else X.cbOpen[u] = 0;
    }
  }

  function computeCaps(X) {
    const { nodes } = X.model;
    for (const n of nodes) {
      const u = n.i;
      if (!n.hasCap) { X.cap[u] = 0; X.capNom[u] = 0; continue; }
      const units = n.elastic ? 1 : Math.max(1, X.unitsCur[u]);
      let base = units * n.capUnit * n.tierCap;
      if (base > n.capPerUnitMax) base = n.capPerUnitMax;
      X.capNom[u] = base;
      let c = base * X.capFactor[u];
      if (n.kind === 'compute' && X.extraPrev[u] > 0 && n.p50 > 0) {
        const wait = n.timeoutMs > 0 ? Math.min(X.extraPrev[u], n.timeoutMs) : X.extraPrev[u];
        const f = n.p50 / (n.p50 + wait);
        X.llLoss[u] = 1 - f;
        c *= f;
      } else X.llLoss[u] = 0;
      if (X.down[u]) c = 0;
      if (c > X.limitCap[u]) c = X.limitCap[u];
      X.cap[u] = c;
      if (n.connLimit) {
        let conns = 0;
        for (const ci of n.callers) {
          const cn = nodes[ci];
          if (cn.kind !== 'compute') continue;
          conns += cn.el.id === 'serverless-fn' ? X.realInPrev[ci] * 0.05 : X.unitsCur[ci] * 10;
        }
        X.connErr[u] = conns > n.connLimit ? 1 - n.connLimit / conns : 0;
      }
    }
  }

  function zeroWork(X) {
    const { N, E, nodes, edges } = X.model;
    for (let u = 0; u < N; u++) {
      const b = u * LN;
      const near = nodes[u].laneNear;
      const a = near ? X.active : X.activeT, na = near ? X.nActive : X.nActiveT;
      for (let k = 0; k < na; k++) {
        const j = b + a[k];
        X.IN[j] = 0; X.RIN[j] = 0; X.INJ[j] = 0; X.FAILR[j] = 0; X.DONE[j] = 0; X.HITS[j] = 0; X.PUa[j] = 0;
      }
    }
    for (let e = 0; e < E; e++) {
      const b = e * LN;
      const near = nodes[edges[e].fi].laneNear;
      const a = near ? X.active : X.activeT, na = near ? X.nActive : X.nActiveT;
      for (let k = 0; k < na; k++) { X.ER[b + a[k]] = 0; X.DRAINE[b + a[k]] = 0; }
    }
    X.wrRate.fill(0);
    X.BIN.fill(0);
    X.cbDown.fill(0); X.cbLat.fill(0);
    X.staleNow = 0; X.conflictsNow = 0;
  }

  function regionShares(X) {
    for (let r = 0; r < R; r++) X.regShare[r] = X.regShareBase[r];
    if (X.shiftShare > 0 && X.shiftRegion >= 0) {
      const s = Math.min(1, X.shiftShare);
      for (let r = 0; r < R; r++) X.regShare[r] *= 1 - s;
      X.regShare[X.shiftRegion] += s;
    }
  }

  function inject(X, level, withNoise) {
    const m = X.model;
    const { sources } = m;
    regionShares(X);
    if (withNoise) {
      for (let t = 0; t < T; t++) if (X.mixArr[t] > 0) X.noise[t] = 0.85 * X.noise[t] + 0.15 * (X.rng() * 2 - 1) * 0.05;
    }
    X.laneOff = X.laneOff || new Float64Array(LN);
    const a = X.active, na = X.nActive;
    for (let k = 0; k < na; k++) {
      const L = a[k];
      const t = X.laneT[L], r = X.laneR[L];
      X.laneOff[L] = 0;
      if (t === X.attackT) {
        const rate = X.attackRate * X.regShare[r];
        if (rate <= 0) continue;
        for (let s = 0; s < sources.length; s++) { const u = sources[s]; X.IN[u * LN + L] += rate * X.srcAny[u]; }
        continue;
      }
      const rate = X.peakRps * level * X.mixArr[t] * X.trafficMul[t] * (withNoise ? 1 + X.noise[t] : 1) * X.regShare[r];
      if (!(rate > 0)) continue;
      X.laneOff[L] = rate;
      for (let s = 0; s < sources.length; s++) {
        const u = sources[s];
        const sh = X.srcShare[u * T + t];
        if (!sh) continue;
        const j = u * LN + L;
        X.INJ[j] = rate * sh;
        X.IN[j] += rate * sh;
      }
    }
    // retries scheduled last tick
    for (const u of X.retryNodes) {
      const b = u * LN;
      const near = m.nodes[u].laneNear;
      const la = near ? X.active : X.activeT, ln = near ? X.nActive : X.nActiveT;
      for (let k = 0; k < ln; k++) {
        const j = b + la[k];
        const x = X.RNEXT[j];
        if (x > 0) { X.IN[j] += x; X.RIN[j] += x; X.PUa[j] += x * X.PQ[j]; X.RNEXT[j] = 0; }
      }
    }
    // webhooks back from outside services
    for (const u of X.webhookNodes) {
      const b = u * LN;
      const list = m.reentry[u];
      const near = m.nodes[u].laneNear;
      const la = near ? X.active : X.activeT, ln = near ? X.nActive : X.nActiveT;
      for (let k = 0; k < ln; k++) {
        const L = la[k];
        const x = X.WNEXT[b + L];
        if (!(x > 0)) continue;
        X.WNEXT[b + L] = 0;
        const t = X.laneT[L];
        let sum = 0;
        for (const ei of list) { const v = m.edges[ei].ti; if (m.canServe[v * T + t]) sum += Math.max(X.cap[v], 1); }
        if (sum <= 0) continue;
        for (const ei of list) {
          const e = m.edges[ei];
          const v = e.ti;
          if (!m.canServe[v * T + t]) continue;
          const amt = (x * Math.max(X.cap[v], 1)) / sum;
          X.IN[v * LN + (e.keep ? L : t)] += amt;
          X.ER[ei * LN + L] += amt;
        }
      }
    }
  }

  function scheduleRetries(X) {
    const { nodes } = X.model;
    for (const u of X.retryNodes) {
      const n = nodes[u];
      const b = u * LN;
      const a = n.laneNear ? X.active : X.activeT, na = n.laneNear ? X.nActive : X.nActiveT;
      const r = n.retries;
      const refresh = n.el.params?.refreshOnErrorShare || 0;
      // Outside a retry storm not every client retries at once (about half, approx.); during one, callers without
      // backoff retry in lockstep. Either way a request is tried at most 1 + retries times, so load is bounded.
      const lockstep = X.retryAmp && n.backoff === 'none';
      const geomMul = n.backoff === 'exponential' ? 0.3 : n.backoff === 'exponential-jitter' ? 0.15 : lockstep ? 1 : 0.5;
      for (let k = 0; k < na; k++) {
        const L = a[k];
        if (X.laneT[L] === X.attackT) continue;
        const j = b + L;
        const x = X.IN[j];
        let extra = 0;
        if (x > 0) {
          const base = Math.max(0, x - X.RIN[j]);
          const p = n.k === KIND.external ? 1 - X.SUCC[j] : 1 - X.DD[j] * (1 - X.TMO[j]);
          if (p > 1e-6) {
            if (r > 0) extra = base * geomMul * geomRetries(p, r);
            if (refresh) extra += base * p * refresh;
          }
        }
        if (n.backoff === 'exponential-jitter') {
          X.RPEND[j] += extra;
          const rel = X.RPEND[j] / 6;
          X.RPEND[j] -= rel;
          X.RNEXT[j] = rel;
        } else X.RNEXT[j] = extra;
      }
    }
  }

  // ---- queues that fall behind
  // FIFO from cumulative counts: A(k) is every message that ever arrived by tick k, and what is still waiting is the
  // backlog B, so the processed count is A - B. The message that arrived at tick k - L is late if it is still in line
  // now. Late work counts as failed requests of its type (normalised to requests when one request makes several
  // messages), charged against that type's successes as they happen.
  function newQHist() {
    return { A: new Float64Array(DAY_TICKS + 1), Acum: 0, typeArr: new Float64Array(T), late: 0, maxAge: 0, endBack: 0,
      peakIn: 0, procAvg: 0, Dprev: 0, limitSec: QUEUE_LATE_SEC, side: false, lastK: -1, peakDemand: 0, capAtPeak: 0, effAtPeak: 0, dom: -1 };
  }
  function queueComposition(X, n, u, out) {
    const b = u * LN;
    const la = n.laneNear ? X.active : X.activeT, ln = n.laneNear ? X.nActive : X.nActiveT;
    out.fill(0);
    let B = 0;
    if (n.fanoutQ) {
      // the slowest subscriber decides how late the work is
      let best = -1, bs = 0;
      for (const ei of n.consumers) { let s = 0; for (let i = 0; i < ln; i++) s += X.BACKE[ei * LN + la[i]]; if (s > bs) { bs = s; best = ei; } }
      if (best >= 0) for (let i = 0; i < ln; i++) { const L = la[i]; const v = X.BACKE[best * LN + L]; if (v > 0) out[X.laneT[L]] += v; }
      B = bs;
    } else {
      for (let i = 0; i < ln; i++) { const L = la[i]; const v = X.BACK[b + L]; if (v > 0) { out[X.laneT[L]] += v; B += v; } }
    }
    return B;
  }
  const compBuf = new Float64Array(T);
  function queueLateness(X, tn, dt) {
    const m = X.model;
    if (!X.queueNodes.length) return 0;
    X.lateType.fill(0);
    X.qAge.fill(0); X.qOver.fill(0); X.lateNow.fill(0);
    const k = Math.max(0, Math.min(DAY_TICKS - 1, Math.round(X.clock / tickMs)));
    for (const u of X.queueNodes) {
      const n = m.nodes[u];
      if (n.isDLQ) continue;
      let q = X.qHist.get(n.id);
      if (!q) {
        q = newQHist();
        q.side = m.inAll[u].length > 0 && m.inAll[u].every((e) => e.kind === 'tap');
        X.qHist.set(n.id, q);
      }
      const b = u * LN;
      const la = n.laneNear ? X.active : X.activeT, ln = n.laneNear ? X.nActive : X.nActiveT;
      let arr = 0;
      for (let i = 0; i < ln; i++) {
        const L = la[i];
        const t = X.laneT[L];
        if (t === X.attackT) continue;
        const r = m.route[u * T + t];
        if (!r || r.mode !== M.QUEUE) continue;
        const j = b + L;
        const x = X.IN[j];
        if (!(x > 0)) continue;
        const a = x * X.OKS[j] * dt;
        arr += a;
        q.typeArr[t] += a;
      }
      const B = queueComposition(X, n, u, compBuf);
      q.Acum += arr;
      for (let i = q.lastK + 2; i <= k; i++) q.A[i] = q.A[i - 1];
      q.A[k + 1] = q.Acum;
      q.lastK = k;
      const D = q.Acum - B;
      const rate = arr / dt;
      if (rate > q.peakIn) q.peakIn = rate;
      const proc = Math.max(0, D - q.Dprev) / dt;
      q.Dprev = D;
      q.procAvg = 0.9 * q.procAvg + 0.1 * proc;
      // the limit follows the main type in the line: a nightly batch job may wait longer than a notification
      if (q.dom < 0 || k % 30 === 0) {
        let dom = -1, dv = 0;
        for (let t = 0; t < T; t++) if (q.typeArr[t] > dv) { dv = q.typeArr[t]; dom = t; }
        q.dom = dom;
        q.limitSec = dom >= 0 ? queueLimitFor(X.problem.requirements, catalog.requests[dom]) : QUEUE_LATE_SEC;
      }
      const dom = q.dom;
      const Lt = Math.max(1, Math.round(q.limitSec / X.dt));
      // age of the message at the head of the line
      let age = 0;
      if (B > 1e-6) {
        let lo = 0, hi = k + 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (q.A[mid] > D) hi = mid; else lo = mid + 1; }
        age = Math.max(0, (k + 1 - lo) * X.dt);
      }
      X.qAge[u] = age;
      if (age > q.maxAge) q.maxAge = age;
      q.endBack = B;
      // work that reaches its limit now while still waiting
      const k0 = k - Lt + 1;
      let lateMsgs = 0;
      if (k0 >= 0) {
        const lo = k0 === 0 ? 0 : q.A[k0], hi = q.A[k0 + 1];
        lateMsgs = Math.max(0, hi - Math.max(lo, D));
      }
      if (age >= q.limitSec * 0.5) {
        // the consumers are asked for more than they can do: show it on them (busy share = demand over capacity).
        // When they had room, the limit sits behind them (a full database), which shows its own overload.
        let capSum = 0, effSum = 0;
        const cons = n.consumers || [];
        for (const ei of cons) {
          const v = m.edges[ei].ti;
          capSum += Math.max(0, X.cap[v]);
          effSum += Math.max(0, dom >= 0 && X.effCap ? X.effCap[v * T + dom] : X.cap[v]);
        }
        const demand = Math.max(rate, q.procAvg);
        for (const ei of cons) {
          const v = m.edges[ei].ti;
          const c = n.fanoutQ ? X.cap[v] : capSum;
          const ratio = c > 0 ? demand / (c * 0.95) : 9.99;
          if (ratio >= 1 && ratio > X.qOver[v]) X.qOver[v] = ratio;
        }
        if (demand > q.peakDemand) { q.peakDemand = demand; q.capAtPeak = capSum; q.effAtPeak = effSum; }
      }
      if (!(lateMsgs > 0) || !(B > 0)) continue;
      q.late += lateMsgs;
      X.lateNow[u] += lateMsgs / dt;
      if (q.side) continue;
      for (let t = 0; t < T; t++) {
        const share = compBuf[t] / B;
        if (!(share > 0)) continue;
        const perReq = q.typeArr[t] > 0 ? Math.min(1, X.typeOff[t] / q.typeArr[t]) : 1;
        const v = lateMsgs * share * perReq;
        if (v > X.lateType[t]) X.lateType[t] = v;
      }
    }
    let ded = 0;
    for (let t = 0; t < T; t++) {
      if (X.lateType[t] > 0) X.lateCarry[t] += X.lateType[t];
      if (!(X.lateCarry[t] > 0)) continue;
      const okNow = tn.byType[t * 3 + 1] * dt;
      const apply = Math.min(X.lateCarry[t], okNow);
      if (!(apply > 0)) continue;
      X.lateCarry[t] -= apply;
      X.typeSucc[t] -= apply;
      tn.byType[t * 3 + 1] -= apply / dt;
      tn.byType[t * 3 + 2] += apply / dt;
      X.lateDay += apply;
      ded += apply / dt;
    }
    if (ded > 0) {
      // the queue that made the work late carries the failures in the per-part stats
      let tot = 0;
      for (const u of X.queueNodes) tot += X.lateNow[u];
      if (tot > 0) for (const u of X.queueNodes) if (X.lateNow[u] > 0) X.failedNow[u] += ded * (X.lateNow[u] / tot);
    }
    return ded;
  }

  // At the end of the day: work still waiting that will pass its limit before the line clears, and late work
  // not yet charged, counts against the day.
  function settleLate() {
    const X = S;
    if (!X.queueNodes || !X.qHist) return;
    const m = X.model;
    for (const u of X.queueNodes) {
      const n = m.nodes[u];
      const q = X.qHist.get(n.id);
      if (!q || n.isDLQ) continue;
      const B = queueComposition(X, n, u, compBuf);
      if (!(B > 1)) continue;
      const Lt = Math.max(1, Math.round(q.limitSec / X.dt));
      const k = Math.min(DAY_TICKS - 1, q.lastK);
      const young = q.Acum - q.A[Math.max(0, k + 1 - Lt)];
      const lateEnd = Math.max(0, Math.min(young, B - q.procAvg * q.limitSec));
      if (!(lateEnd > 0)) continue;
      q.late += lateEnd;
      if (q.side) continue;
      for (let t = 0; t < T; t++) {
        const share = compBuf[t] / B;
        if (!(share > 0)) continue;
        const perReq = q.typeArr[t] > 0 ? Math.min(1, X.typeOff[t] / q.typeArr[t]) : 1;
        X.lateCarry[t] += lateEnd * share * perReq;
      }
    }
    for (let t = 0; t < T; t++) {
      const apply = Math.min(X.lateCarry[t], Math.max(0, X.typeSucc[t]));
      X.lateCarry[t] = 0;
      if (!(apply > 0)) continue;
      X.typeSucc[t] -= apply;
      X.successDay -= apply;
      X.hourSucc[23] = Math.max(0, X.hourSucc[23] - apply);
      X.minSucc[1439] = Math.max(0, X.minSucc[1439] - apply);
      X.lateDay += apply;
    }
  }

  // ---- accounting after the flows
  function account() {
    const X = S;
    const m = X.model;
    const { nodes, sources, N, edges } = m;
    const a = X.active, na = X.nActive;
    const dt = X.dt;
    const tn = X.tickNow;
    tn.byType.fill(0);
    tn.latBad = 0;
    let off = 0, succ = 0, p99Now = 0;
    X.typeP99Now.fill(0);
    X.typeWNow.fill(0);
    const laneSucc = X.laneSucc;
    const laneP99 = X.laneP99;
    for (let k = 0; k < na; k++) { laneSucc[a[k]] = 0; laneP99[a[k]] = 0; }
    for (let s = 0; s < sources.length; s++) {
      const u = sources[s];
      const b = u * LN;
      for (let k = 0; k < na; k++) {
        const L = a[k];
        const t = X.laneT[L];
        if (t === X.attackT) continue;
        const j = b + L;
        const inj = X.INJ[j];
        if (!(inj > 0)) continue;
        const sc = X.requiresOk[t] ? X.SUCC[j] : 0;
        laneSucc[L] += inj * sc;
        if (inj >= 0.01 * X.laneOff[L]) {
          const p = X.TM[j] + Math.sqrt(X.TV[j]);
          if (p > laneP99[L]) laneP99[L] = p;
        }
      }
    }
    const minute = Math.min(1439, Math.floor(X.clock / 60000));
    const hour = Math.min(23, Math.floor(X.clock / 3600000));
    for (let k = 0; k < na; k++) {
      const L = a[k];
      const t = X.laneT[L];
      if (t === X.attackT) { X.attackOffered += X.attackRate * X.regShare[X.laneR[L]] * dt; continue; }
      const o = X.laneOff[L];
      if (!(o > 0)) continue;
      const sc = Math.min(o, laneSucc[L]);
      off += o; succ += sc;
      tn.byType[t * 3] += o; tn.byType[t * 3 + 1] += sc; tn.byType[t * 3 + 2] += o - sc;
      X.typeOff[t] += o * dt; X.typeSucc[t] += sc * dt;
      if (X.readLike[t]) X.readsServed += sc * dt;
      if (X.interactive[t] && sc > 0) {
        const p = laneP99[L];
        const w = sc * dt;
        X.latW += w; X.typeLatW[t] += w; X.typeP99Sum[t] += p * w;
        if (p <= X.latTarget[t]) { X.latOk += w; X.typeLatOk[t] += w; } else tn.latBad += w;
        if (p > X.typeWorst[t]) {
          X.typeWorst[t] = p;
          const hop = X.typeSlowHop[t];
          hop.nodeId = null; hop.p99Ms = 0;
          for (const n of nodes) {
            if (n.kind === 'source' || !(X.IN[n.i * LN + L] > 0)) continue;
            const ms = X.hop99[n.i] + (X.isWrite[t] ? n.writeAdd * 2.5 : 0);
            if (hop.nodeId == null || ms > hop.p99Ms) { hop.nodeId = n.id; hop.p99Ms = ms; }
          }
        }
        if (p > p99Now) p99Now = p;
        // the type's p99 now, averaged over user regions by traffic (the same figure the debrief reports per type)
        X.typeP99Now[t] += p * w;
        X.typeWNow[t] += w;
      }
    }
    for (let t = 0; t < T; t++) if (X.typeWNow[t] > 0) X.typeP99Now[t] /= X.typeWNow[t];
    // the live speed meter follows the type furthest from its own target
    let wr = 0;
    X.latWorstT = -1;
    for (let t = 0; t < T; t++) if (X.typeP99Now[t] > 0 && X.latTarget[t] > 0 && X.typeP99Now[t] / X.latTarget[t] > wr) { wr = X.typeP99Now[t] / X.latTarget[t]; X.latWorstT = t; }
    succ -= queueLateness(X, tn, dt);
    if (succ < 0) succ = 0;
    tn.offered = off; tn.success = succ; tn.p99 = p99Now;
    X.offeredDay += off * dt; X.successDay += succ * dt;
    X.minOff[minute] += off * dt; X.minSucc[minute] += succ * dt;
    X.hourOff[hour] += off * dt; X.hourSucc[hour] += succ * dt;
    if (p99Now > 0) { X.hourP99[hour] += p99Now * off * dt; X.hourW[hour] += off * dt; }
    if (p99Now > X.worstP99) X.worstP99 = p99Now;
    if (!X.firstBreak && off > 0 && succ / off < 0.95) {
      const gap = validateModel(X).find(i => i.level === 'error' && i.type);
      const limiting = m.nodes.filter(n => n.kind !== 'source' && !X.down[n.i] && X.cap[n.i] > 0 && X.rho[n.i] > 1 && X.failedNow[n.i] > 0)
        .sort((a,b) => X.rho[b.i] - X.rho[a.i])[0];
      const failed = limiting || m.nodes.filter(n => n.kind !== 'source' && X.failedNow[n.i] > 0).sort((a,b) => X.failedNow[b.i] - X.failedNow[a.i])[0];
      X.firstBreak = { atMs: X.clock, nodeId: gap?.nodeId || failed?.id || null,
        kind: gap ? 'routing' : limiting ? 'capacity' : 'dependency', util: gap?.nodeId ? Math.round(X.rho[m.idx.get(gap.nodeId)] * 1000) / 1000 : failed ? Math.round(X.rho[failed.i] * 1000) / 1000 : 0 };
    }

    // safety ledger
    // stale read-backs only matter where people must see their own change at once
    if (!X.problem.requirements.readYourWrites) X.staleNow = 0;
    X.staleReads += X.staleNow * dt;
    let dupsNow = X.dupQueue; X.dupQueue = 0;
    for (const u of X.timeoutNodes) {
      const n = nodes[u];
      const retried = n.retries > 0 || (!n.hasRetries && X.srcRetries > 0);
      if (!retried || !X.tmoAny[u]) continue;
      const b = u * LN;
      const la = n.laneNear ? a : X.activeT, ln = n.laneNear ? na : X.nActiveT;
      for (let k = 0; k < ln; k++) {
        const L = la[k];
        const t = X.laneT[L];
        if (!X.nonIdem[t]) continue;
        const j = b + L;
        const pT = X.TMO[j];
        const x = X.IN[j];
        if (!(pT > 0) || !(x > 0)) continue;
        const amb = n.k === KIND.external ? x * X.OKS[j] * pT : x * X.OKS[j] * X.DD[j] * pT;
        const up = X.PUa[j] > 0 ? X.PUa[j] / x : 0;
        const prot = 1 - (1 - Math.min(1, up)) * (1 - X.PD[j]);
        dupsNow += amb * (1 - prot) * dt;
      }
    }
    X.duplicates += dupsNow;
    if (X.conflictsNow > 0) { X.conflicts += X.conflictsNow * dt; X.lostWrites += X.conflictsNow * dt; }

    // nodes: stats, status, writes, cost counters
    const C = X.counters;
    const changed = [];
    let usdTick = 0;
    const userKb = (() => { let s = 0; for (let k = 0; k < na; k++) { const L = a[k]; const t = X.laneT[L]; if (t !== X.attackT) s += Math.min(X.laneOff[L], laneSucc[L]) * X.respKb[t]; } return s; })();
    C.userKbDay += userKb * dt;
    for (let u = 0; u < N; u++) {
      const n = nodes[u];
      const failReal = X.failedNow[u], req = X.nodeReq[u], kb = X.nodeKb[u], inKb = X.nodeInKb[u], wKb = X.nodeWKb[u];
      X.failedSum[u] += failReal * dt;
      const util = X.rho[u];
      const down = n.hasCap && n.k !== KIND.source && X.cap[u] <= 0;
      if (!down && util > X.peakUtil[u]) {
        X.peakUtil[u] = util;
        X.peakUnits[u] = Math.round(X.unitsCur[u] * X.aliveFactor[u] * 1e6) / 1e6;
        X.peakInstalledUnits[u] = X.unitsCur[u];
        X.peakCapacity[u] = X.cap[u];
        X.peakRequests[u] = X.realIn[u];
      }
      const behind = X.qOver[u] > 0;
      if (behind && X.qOver[u] > X.peakUtil[u]) X.peakUtil[u] = Math.min(X.qOver[u], 10);
      if (util > 1 || (down && X.realIn[u] > 0) || behind) X.overTicks[u] += 1;
      let st = n.hasCap && n.k !== KIND.source ? statusOf(util, down, bands) : 0;
      if (st < 3 && X.err[u] >= 0.5) st = 3;
      else if (st < 1 && X.errSoft[u] >= 0.1) st = 1;
      if (behind && st < 3) st = 3;
      if (n.kind === 'queue' && X.qAge[u] > 0) {
        // a line is healthy while it clears within a few minutes; it turns red once work waits past its limit
        const q = X.qHist.get(n.id);
        const lim = q ? q.limitSec : QUEUE_LATE_SEC;
        const a = X.qAge[u];
        const qs = a >= lim ? 3 : a >= lim / 3 ? 2 : a >= 120 ? 1 : 0;
        if (qs > st) st = qs;
        if (a >= lim) X.overTicks[u] += 1;
      }
      if (n.kind === 'compute' && !n.elastic) {
        if (X.unitsCur[u] < X.unitsLo[u]) X.unitsLo[u] = X.unitsCur[u];
        if (X.unitsCur[u] > X.unitsHi[u]) X.unitsHi[u] = X.unitsCur[u];
      }
      if (st !== X.status[u]) { X.status[u] = st; changed.push(u); }
      X.wrRatePrev[u] = X.wrRate[u];
      X.writesSoFar[u] += X.wrRate[u] * dt;
      X.writesDay += X.wrRate[u] * dt;
      X.rhoPrev[u] = util;
      X.rhoQPrev[u] = X.rhoQacc[u];
      X.sPrev[u] = X.sv[u];
      X.realInPrev[u] = X.realIn[u];
      X.extraPrev[u] = 0.5 * X.extraPrev[u] + 0.5 * X.extraNow[u];
      if (X.health[u] < 0.5 || down) { if (X.unhealthySince[u] < 0) X.unhealthySince[u] = X.clock; }
      else X.unhealthySince[u] = -1;
      const c = n.el.cost;
      if (c && n.kind !== 'source') {
        C.reqDay[u] += req * dt * X.usageMul;
        C.gbDay[u] += (kb * dt / 1e6) * X.usageMul;
        C.unitSec[u] += (n.elastic ? 1 : X.unitsCur[u]) * dt;
        C.extraFixedSec[u] += (X.nodeCostMul[u] - 1) * dt;
        C.inKbDay[u] += inKb * dt;
        C.writeKbDay[u] += wKb * dt;
        usdTick += ((c.perMillion || 0) * req / 1e6 + (c.perGB || 0) * kb / 1e6) * dt;
        if (n.el.id === 'cdn' || n.el.id === 'object-storage') C.edgeKbDay += kb * dt;
      }
    }
    // traffic between regions
    for (const e of edges) {
      if (e.kind !== 'flow' || !e.dag) continue;
      const lu = X.loc[e.fi], lv = X.loc[e.ti];
      if (lu < 0 || lv < 0 || lu === lv) continue;
      const b = e.i * LN;
      let kb = 0;
      const near = nodes[e.fi].laneNear;
      const la = near ? a : X.activeT, ln = near ? na : X.nActiveT;
      for (let k = 0; k < ln; k++) { const L = la[k]; kb += X.ER[b + L] * X.respKb[X.laneT[L]]; }
      C.crossKbDay += kb * dt;
    }
    C.elapsedSec += dt;
    X.usdTickExtra = X.usageMul > 1 ? usdTick * (1 - 1 / X.usageMul) : 0;
    for (let u = 0; u < N; u++) if (X.nodeCostMul[u] > 1) {
      const c = nodes[u].el.cost || {};
      const fixedPerSec = ((c.base || 0) + (c.perUnit || 0) * X.unitsCur[u] * nodes[u].tierCost) / (30 * 86400);
      X.usdTickExtra += fixedPerSec * (X.nodeCostMul[u] - 1) * dt;
    }
    for (const u of changed) emit('status', { nodeId: nodes[u].id, status: ['ok', 'warn', 'hot', 'overload', 'down'][X.status[u]] });
    return dupsNow;
  }

  function eventStats(dupsNow) {
    const X = S;
    const { nodes, N } = X.model;
    for (const inst of X.instances) {
      if (!inst.started || X.clock >= inst.endMs + EVENT_GRACE_MS) continue;
      let st = inst.stats;
      if (!st) {
        st = inst.stats = { failed: 0, offered: 0, peakOffered: 0, ticks: 0, lowTicks: 0, badTicks: 0, nodeFail: new Float64Array(N), nodeOver: new Float64Array(N), maxRho: new Float64Array(N),
          maxP99: 0, stale: 0, dup: 0, lost: inst.pendingLost || 0, attackOff0: X.attackOffered, attackDrop0: X.attackDropped, costExtra: 0, maxBacklog: 0, maxWait: 0,
          maxInfP99: 0, capLost: 0, timedOut: new Uint8Array(N), baseLoad: new Float64Array(N), maxLoad: new Float64Array(N), nodeIn: new Float64Array(N), maxWaste: 0, wasteNode: -1, N, latBad: 0 };
        for (let u = 0; u < N; u++) st.baseLoad[u] = inst.baseLoad && inst.baseLoad.length === N ? inst.baseLoad[u] : X.realInPrev[u];
      }
      if (st.N !== N) continue;
      const tn = X.tickNow;
      st.failed += (tn.offered - tn.success) * X.dt;
      st.offered += tn.offered * X.dt;
      if (tn.offered > st.peakOffered) st.peakOffered = tn.offered;
      st.ticks++;
      if (tn.offered > 0 && tn.success / tn.offered < 0.5) st.lowTicks++;
      if (tn.offered > 0 && tn.success / tn.offered < 0.99) st.badTicks++;
      if (tn.p99 > st.maxP99) st.maxP99 = tn.p99;
      st.stale += X.staleNow * X.dt;
      st.dup += dupsNow;
      st.latBad += tn.latBad || 0;
      if (X.clock < inst.endMs) st.costExtra += X.usdTickExtra || 0;
      for (let u = 0; u < N; u++) {
        if (X.failedNow[u] > 0) st.nodeFail[u] += X.failedNow[u] * X.dt;
        st.nodeIn[u] += X.realIn[u] * X.dt;
        if (X.rho[u] > 1 || nodes[u].hasCap && nodes[u].k !== KIND.source && X.cap[u] <= 0 && X.realIn[u] > 0 || X.qOver[u] > 0 || X.lateNow[u] > 0) st.nodeOver[u] += 1;
        if (X.cap[u] > 0 && X.rho[u] > st.maxRho[u]) st.maxRho[u] = X.rho[u];
        if (X.realIn[u] > st.maxLoad[u]) st.maxLoad[u] = X.realIn[u];
        if (X.llLoss[u] > st.capLost) st.capLost = X.llLoss[u];
        if (X.realIn[u] > 0 && X.tmoAny[u]) st.timedOut[u] = 1;
        const ak = X.atkIn[u];
        if (ak > 0 && nodes[u].hAtk && nodes[u].kind !== 'filter' && nodes[u].kind !== 'source' && !nodes[u].el.params?.absorbsAttackShare) {
          const w = ak / (ak + X.realIn[u]);
          if (w > st.maxWaste) { st.maxWaste = w; st.wasteNode = u; }
        }
      }
      for (const q of X.queueNodes) {
        let back = 0, drain = 0;
        const b = q * LN;
        const n = nodes[q];
        const la = n.laneNear ? X.active : X.activeT, ln = n.laneNear ? X.nActive : X.nActiveT;
        for (let k = 0; k < ln; k++) { const L = la[k]; back += X.BACK[b + L]; drain += X.DRAIN[b + L]; }
        if (n.fanoutQ) for (const ei of n.consumers) for (let k = 0; k < ln; k++) { const L = la[k]; back += X.BACKE[ei * LN + L]; drain += X.DRAINE[ei * LN + L]; }
        if (back > st.maxBacklog) st.maxBacklog = back;
        const wait = drain > 0 ? back / drain : (back > 1 ? (X.clock - inst.atMs) / 1000 : 0);
        if (wait > st.maxWait) st.maxWait = wait;
      }
      const inf = catalog.typeIndex.get('inference');
      if (inf != null && X.tickNow.byType[inf * 3] > 0) {
        for (let k = 0; k < X.nActive; k++) {
          const L = X.active[k];
          if (X.laneT[L] !== inf) continue;
          for (const s of X.model.sources) { const j = s * LN + L; if (X.INJ[j] > 0) st.maxInfP99 = Math.max(st.maxInfP99, X.TM[j] + Math.sqrt(X.TV[j])); }
        }
      }
    }
  }

  function updateFrame() {
    const F = S.frame;
    const m = S.model;
    const { N, E, edges, nodes } = m;
    F.version = S.version;
    F.edgeRps.fill(0); F.nodeFailRps.fill(0); F.nodeHitRps.fill(0);
    for (let e = 0; e < E; e++) {
      const ed = edges[e];
      const b = e * LN;
      const vb = ed.ti * LN;
      const near = nodes[ed.fi].laneNear;
      const a = near ? S.active : S.activeT, na = near ? S.nActive : S.nActiveT;
      const open = nodes[ed.ti].failOpen;
      for (let k = 0; k < na; k++) {
        const L = a[k];
        const x = S.ER[b + L];
        if (x > 0) F.edgeRps[e * T + S.laneT[L]] += x * (open ? 1 : S.OKS[vb + (ed.keep ? L : S.laneT[L])]);
      }
    }
    for (let u = 0; u < N; u++) {
      const b = u * LN;
      let q = 0;
      const near = nodes[u].laneNear;
      const a = near ? S.active : S.activeT, na = near ? S.nActive : S.nActiveT;
      for (let k = 0; k < na; k++) {
        const L = a[k];
        const t = S.laneT[L];
        F.nodeFailRps[u * T + t] += S.FAILR[b + L];
        F.nodeHitRps[u * T + t] += S.HITS[b + L];
        q += S.BACK[b + L];
      }
      const n = nodes[u];
      if (n.fanoutQ) {
        let mx = 0;
        for (const ei of n.consumers) { let s = 0; for (let k = 0; k < na; k++) s += S.BACKE[ei * LN + a[k]]; if (s > mx) mx = s; }
        q += mx;
      }
      F.nodeUtil[u] = Math.min(S.rho[u], UTIL_SHOW_MAX);
      F.nodeStatus[u] = S.status[u];
      F.nodeQueue[u] = q;
    }
    F.activeEvents = S.instances.filter((i) => i.started && !i.ended).map((i) => i.id);
  }

  function runFlows(X) {
    forwardPass(X);
    backwardPass(X);
    queueReturns(X);
  }

  // ---- one tick
  function tickOnce() {
    if (phase !== 'running' && phase !== 'paused') return false;
    ensureModel();
    if (S.clock >= dayMs) {
      if (mode === 'sandbox') wrapDay(); else return false;
    }
    // events
    for (const inst of S.instances) {
      if (!inst.started && inst.atMs <= S.clock) {
        inst.baseLoad = Float64Array.from(S.realInPrev);
        startEvent(S, inst);
        if (inst.def.effects.some((e) => e.op === 'attack' || e.op === 'regionShift')) computeLanes();
        emit('event', { eventId: inst.id, phase: 'start', nodeIds: inst.nodeIds });
      }
    }
    resetMods(S);
    applyEffects(S);
    S.attackApp = S.attackRate > 0 ? S.attackAppRate / S.attackRate : 0;
    for (const inst of S.instances) {
      if (inst.started && !inst.ended && S.clock >= inst.endMs) {
        inst.ended = true;
        emit('event', { eventId: inst.id, phase: 'end', nodeIds: inst.nodeIds });
      }
    }
    updateAutoscale(S);
    updateLagAndBreakers(S);
    computeEdgeRtt(S);
    computeCaps(S);
    zeroWork(S);
    const minute = Math.floor((S.clock % dayMs) / 60000);
    inject(S, S.curve[minute], true);
    runFlows(S);
    scheduleRetries(S);
    const dupsNow = account();
    eventStats(dupsNow);
    S.frameDirty = true;
    S.clock += tickMs;
    emit('tick', { clockMs: S.clock });
    if (S.clock >= dayMs && mode !== 'sandbox') finish();
    return true;
  }

  function wrapDay() {
    S.clock = 0;
    S.offeredDay = 0; S.successDay = 0; S.latOk = 0; S.latW = 0;
    S.minOff.fill(0); S.minSucc.fill(0); S.hourOff.fill(0); S.hourSucc.fill(0); S.hourP99.fill(0); S.hourW.fill(0);
    S.counters = newCounters(S.model.N);
    for (const inst of S.instances) if (inst.ended) inst.stats = null;
    S.instances = S.instances.filter((i) => !i.ended);
    // a sandbox day wraps: what is still in line counts as having arrived at midnight
    for (const q of S.qHist.values()) { q.A.fill(0); q.Acum = q.endBack; q.A[0] = q.endBack; q.lastK = -1; q.Dprev = 0; }
    S.lateCarry.fill(0);
  }

  function finish() {
    phase = 'done';
    settleLate();
    const cost = liveCost(true);
    S.lastStorageGb = cost.storageGb;
    S.result = buildResult(S, { cost, metrics: metricsNow(cost), seed, mode, graph: api.getGraph() });
    emit('done', { result: S.result });
  }

  // ---- metrics and cost
  function liveCost(final = false) {
    if (!S.counters || S.counters.elapsedSec <= 0) return estimateCost();
    const C = S.counters;
    const m = Math.min(1440, Math.round(C.elapsedSec / 60));
    const frac = final ? 1 : Math.max(1e-6, S.curveCum[m] / S.curveCum[1440]);
    C.scale = final ? 1 : 1 / frac;
    const out = computeCost(S, C);
    C.scale = 1;
    return out;
  }

  function metricsNow(cost) {
    const availability = S.offeredDay > 0 ? S.successDay / S.offeredDay : 1;
    const latencyShare = S.latW > 0 ? S.latOk / S.latW : 1;
    const failed = [];
    for (const [id, ok] of S.complianceChecked || []) if (!ok) failed.push(id);
    if (phase === 'done' || S.clock >= dayMs) {
      for (const c of prob.requirements.compliance || []) {
        if (!S.complianceChecked.has(c)) {
          const ok = checkComplianceSafe(c);
          S.complianceChecked.set(c, ok);
          if (!ok) failed.push(c);
        }
      }
    }
    const writesPerSec = S.counters && S.counters.elapsedSec > 0 ? S.writesDay / S.counters.elapsedSec : 0;
    const typeShares = {};
    if (S.typeLatW) for (let t = 0; t < T; t++) if (S.typeLatW[t] > 0) typeShares[catalog.requests[t].id] = S.typeLatOk[t] / S.typeLatW[t];
    return {
      availability, latencyShare, perMonth: cost.perMonth, typeShares,
      ledger: { lostWrites: S.lostWrites, duplicates: S.duplicates, staleReads: S.staleReads, readsServed: S.readsServed, complianceFailed: [...new Set(failed)], writesPerSec },
      lateWork: S.lateDay || 0,
    };
  }

  function checkComplianceSafe(c) {
    try { ensureModel(); return checkCompliance(S, c); } catch { return false; }
  }

  // ---- estimate (build phase)
  let est = null;
  function estimateState() {
    const m = S.model;
    if (est && est.model === m && est.version === S.version) return est;
    const X = fastState(null);
    for (const k of Object.keys(S)) X[k] = S[k];
    X.model = m;
    X.laneSucc = new Float64Array(LN); X.laneP99 = new Float64Array(LN); X.rttE = null; X.frame = null; X.stateObj = null;
    X.version = S.version;
    X.noise = new Float64Array(T);
    X.trafficMul = new Float64Array(T); X.fanTypes = new Uint8Array(T); X.regShare = new Float64Array(R);
    X.active = new Int32Array(LN);
    allocArrays(X, m.N, m.E);
    X.clock = S.peakMinute * 60000;
    initNodeRuntime(X);
    // lanes: base regions and mix only
    let k = 0;
    const wantT = (t) => S.mixArr[t] > 0 || (t === S.webhookT && m.nodes.some((n) => n.emitsWebhooks && m.reentry[n.i].length));
    for (let r = 0; r < R; r++) if (S.regShareBase[r] > 0) for (let t = 0; t < T; t++) if (wantT(t)) X.active[k++] = r * T + t;
    X.nActive = k;
    X.activeT = new Int32Array(T);
    let kt = 0;
    for (let t = 0; t < T; t++) if (wantT(t)) X.activeT[kt++] = t;
    X.nActiveT = kt;
    X.laneOff = new Float64Array(LN);
    X.counters = newCounters(m.N);
    X.instances = []; X.activeEffects = [];
    est = X;
    return X;
  }

  function steadyPass(X, level, passes, mulTypes = null, mul = 1) {
    for (let p = 0; p < passes; p++) {
      resetMods(X);
      if (mulTypes) for (const t of mulTypes) X.trafficMul[t] = mul;
      X.BACK.fill(0); X.BACKE.fill(0); X.RNEXT.fill(0); X.WNEXT.fill(0);
      updateLagAndBreakers(X);
      computeEdgeRtt(X);
      computeCaps(X);
      zeroWork(X);
      inject(X, level, false);
      runFlows(X);
      for (let u = 0; u < X.model.N; u++) { X.rhoPrev[u] = X.rho[u]; X.sPrev[u] = X.sv[u]; X.rhoQPrev[u] = X.rhoQacc[u]; }
    }
  }

  function estimateCost() {
    ensureModel();
    const X = estimateState();
    const m = X.model;
    let mean = 0;
    for (let i = 0; i < 1440; i++) mean += S.curve[i];
    mean /= 1440;
    steadyPass(X, mean, 2);
    const C = newCounters(m.N);
    const day = 86400;
    let userKb = 0, edgeKb = 0, crossKb = 0;
    const a = X.active, na = X.nActive;
    for (const n of m.nodes) {
      const u = n.i;
      C.reqDay[u] = X.nodeReq[u] * day; C.gbDay[u] = X.nodeKb[u] * day / 1e6; C.inKbDay[u] = X.nodeInKb[u] * day; C.writeKbDay[u] = X.nodeWKb[u] * day;
      if (n.el.id === 'cdn' || n.el.id === 'object-storage') edgeKb += X.nodeKb[u] * day;
    }
    for (const s of m.sources) for (let k = 0; k < na; k++) { const L = a[k]; const j = s * LN + L; if (X.INJ[j] > 0) userKb += X.INJ[j] * X.SUCC[j] * X.respKb[X.laneT[L]] * day; }
    for (const e of m.edges) {
      if (e.kind !== 'flow' || !e.dag) continue;
      const lu = X.loc[e.fi], lv = X.loc[e.ti];
      if (lu < 0 || lv < 0 || lu === lv) continue;
      const near = m.nodes[e.fi].laneNear;
      const la = near ? a : X.activeT, ln = near ? na : X.nActiveT;
      for (let k = 0; k < ln; k++) { const L = la[k]; crossKb += X.ER[e.i * LN + L] * X.respKb[X.laneT[L]] * day; }
    }
    C.userKbDay = userKb; C.edgeKbDay = edgeKb; C.crossKbDay = crossKb;
    C.elapsedSec = 0;
    return computeCost(X, C, { units: Float64Array.from(m.nodes.map((n) => n.units)) });
  }

  function estimate() {
    ensureModel();
    const cost = estimateCost();
    const X = estimateState();
    const m = X.model;
    steadyPass(X, S.curve[S.peakMinute] || 1, 3);
    const nodes = m.nodes.map((n) => {
      const util = n.hasCap && n.kind !== 'source' ? X.rho[n.i] : 0;
      const status = ['ok', 'warn', 'hot', 'overload', 'down'][statusOf(util, false, bands)];
      return { id: n.id, type: n.el.id, util: Math.round(util * 1000) / 1000, status, holds: util < 1 };
    });
    let off = 0, succ = 0;
    const p99 = {};
    for (const s of m.sources) {
      for (let k = 0; k < X.nActive; k++) {
        const L = X.active[k]; const j = s * LN + L; const t = X.laneT[L];
        const inj = X.INJ[j];
        if (!(inj > 0)) continue;
        off += inj; succ += inj * (S.requiresOk[t] ? X.SUCC[j] : 0);
        const id = catalog.requests[t].id;
        const p = X.TM[j] + Math.sqrt(X.TV[j]);
        if (!(id in p99) || p > p99[id]) p99[id] = Math.round(p);
      }
    }
    let bottleneck = null, worst = 0;
    for (const nd of nodes) if (nd.util > worst) { worst = nd.util; bottleneck = nd.id; }
    const spike = estimateSpike(X);
    return {
      spike,
      perMonth: cost.perMonth, budget: cost.budget, lines: cost.lines,
      peakRps: Math.round(S.peakRps * (S.curve[S.peakMinute] || 1)),
      successAtPeak: off > 0 ? Math.min(1, succ / off) : 1,
      p99AtPeak: p99,
      holdsAtPeak: nodes.every((nd) => nd.holds) && (off <= 0 || succ / off >= 0.999),
      bottleneck: worst >= 0.7 ? bottleneck : null,
      nodes,
    };
  }

  // The biggest traffic event in the problem's day, as a level relative to the normal peak (a viral spike of 3 times
  // at 19:30 on an evening curve is about 2.9 times the peak).
  function spikeEvent() {
    let best = null;
    for (const e of prob.events || []) {
      const def = catalog.eventById.get(e.id);
      if (!def) continue;
      for (const ef of def.effects) {
        if (ef.op !== 'traffic') continue;
        const p = { ...ef.params, ...(e.params || {}) };
        const f = Number(p.factor) || 1;
        if (f <= 1.05) continue;
        const types = Array.isArray(p.types) ? p.types.map((id) => typeOf(id)).filter((t) => t != null && S.mixArr[t] > 0) : null;
        if (types && !types.length) continue;
        const m = Math.min(1439, Math.floor(parseClock(e.at || '00:00') / 60000 + (Number(p.rampSec) || 0) / 60));
        const base = S.curve[m] || 0;
        const level = types ? base : base * f;
        const weight = types ? base * (1 + (f - 1) * types.reduce((a, t) => a + S.mixArr[t], 0)) : level;
        if (!best || weight > best.weight) best = { id: e.id, name: def.name, factor: f, level, types, weight, rampSec: Number(p.rampSec) || 0 };
      }
    }
    return best;
  }

  // Would the design hold that event? Autoscaled servers reach their ceiling in time for a spike that builds over
  // minutes, not for one that arrives in seconds.
  function estimateSpike(X) {
    const sp = spikeEvent();
    if (!sp) return null;
    const m = X.model;
    const grow = sp.rampSec >= 300;
    for (const n of m.nodes) {
      if (n.kind !== 'compute' || n.elastic) continue;
      const pol = n.autoscaleKnob || (n.autoscaler >= 0 ? { max: n.el.units.max } : null);
      if (pol && grow) X.unitsCur[n.i] = Math.max(n.units, Math.min(pol.max, Math.ceil(n.units * sp.factor * 1.2)));
    }
    steadyPass(X, sp.level, 3, sp.types, sp.factor);
    const risky = [];
    for (const n of m.nodes) {
      if (!n.hasCap || n.kind === 'source') continue;
      const u = X.rho[n.i];
      if (u >= 1) risky.push({ id: n.id, type: n.el.id, util: Math.round(u * 1000) / 1000 });
    }
    let off = 0, succ = 0;
    for (const s of m.sources) for (let k = 0; k < X.nActive; k++) {
      const L = X.active[k]; const j = s * LN + L; const t = X.laneT[L];
      if (X.INJ[j] > 0) { off += X.INJ[j]; succ += X.INJ[j] * (S.requiresOk[t] ? X.SUCC[j] : 0); }
    }
    // leave the estimate state as the normal peak found it (health, breakers and sizes)
    initNodeRuntime(X);
    X.cbOpenUntil.fill(0); X.cbOpen.fill(0); X.rhoPrev.fill(0); X.rhoQPrev.fill(0); X.extraPrev.fill(0);
    return { eventId: sp.id, name: sp.name, factor: sp.factor, holds: !risky.length && (off <= 0 || succ / off >= 0.99), nodes: risky, successShare: off > 0 ? Math.min(1, succ / off) : 1 };
  }

  function stateNow() {
    ensureModel();
    const st = S.stateObj || (S.stateObj = { phase, clockMs: 0, clockLabel: '00:00', nodes: [], edges: [], traffic: {}, slo: {}, cost: {}, scoreLive: {}, events: [] });
    const m = S.model;
    if (S.frameDirty) { updateFrame(); S.frameDirty = false; }
    st.phase = phase;
    st.clockMs = S.clock;
    st.clockLabel = fmtClock(Math.min(S.clock, dayMs - 1));
    if (S.clock >= dayMs) st.clockLabel = '24:00';
    st.nodes = m.nodes.map((n) => ({
      id: n.id, type: n.el.id,
      incomingRps: Math.round(S.realIn[n.i]),
      availableUnits: phase === 'build' || S.clock === 0 ? Math.round(S.unitsCur[n.i]) : Math.max(0, Math.round(S.unitsCur[n.i] * (S.down[n.i] ? 0 : S.aliveFactor[n.i]))),
      util: Math.round(Math.min(S.rho[n.i], UTIL_SHOW_MAX) * 1000) / 1000,
      status: ['ok', 'warn', 'hot', 'overload', 'down'][S.status[n.i]],
      p99Ms: Math.round(S.hop99[n.i] * 10) / 10,
      failRps: Math.round(S.failedNow[n.i] * 10) / 10,
      queueDepth: S.frame ? Math.round(S.frame.nodeQueue[n.i]) : 0,
      ...(n.kind === 'queue' ? {
        oldestJobAgeSec: S.qAge[n.i] || 0,
        queueDrainRps: S.qHist.get(n.id)?.procAvg || 0,
        queueAcceptedRps: (() => { const q = S.qHist.get(n.id); return q && q.lastK >= 0 ? (q.A[q.lastK + 1] - q.A[q.lastK]) / S.dt : 0; })(),
        queueLimitSec: S.qHist.get(n.id)?.limitSec || QUEUE_LATE_SEC,
      } : {}),
      units: n.elastic ? 1 : Math.round(S.unitsCur[n.i]),
    }));
    st.edges = m.edges.map((e) => {
      let rps = 0;
      for (let t = 0; t < T; t++) rps += S.frame.edgeRps[e.i * T + t];
      return { id: e.id, rps: Math.round(rps * 10) / 10 };
    });
    const tn = S.tickNow || { offered: 0, success: 0, p99: 0, byType: new Float64Array(T * 3) };
    const byType = {};
    for (let t = 0; t < T; t++) if (tn.byType[t * 3] > 0) byType[catalog.requests[t].id] = { offered: tn.byType[t * 3], success: tn.byType[t * 3 + 1], failed: tn.byType[t * 3 + 2] };
    st.traffic = { offeredRps: tn.offered, successRps: tn.success, failRps: Math.max(0, tn.offered - tn.success), byType };
    const cost = phase === 'build' ? estimateCost() : liveCost(phase === 'done');
    const mt = metricsNow(cost);
    const req = prob.requirements;
    st.slo = {
      availability: { target: req.availability, actual: mt.availability },
      // the type furthest from its own target this moment, against that target (a sign-in keeps its longer budget)
      latency: S.latWorstT >= 0 && phase !== 'build'
        ? { targetMs: S.latTarget[S.latWorstT], p99Ms: Math.round(S.typeP99Now[S.latWorstT]), shareOk: mt.latencyShare, typeId: catalog.requests[S.latWorstT].id }
        : { targetMs: interactiveTarget(), p99Ms: Math.round(tn.p99), shareOk: mt.latencyShare, typeId: null },
      safety: { lostWrites: Math.round(S.lostWrites || 0), duplicates: Math.round(S.duplicates || 0), staleReads: Math.round(S.staleReads || 0), complianceFailed: mt.ledger.complianceFailed },
    };
    st.cost = { perMonth: cost.perMonth, budget: cost.budget, lines: cost.lines };
    st.scoreLive = scoreAll(world, req, mt);
    st.events = S.instances.map((i) => ({ id: i.id, name: i.name, atMs: i.atMs, endMs: i.endMs, active: i.started && !i.ended, done: i.ended, nodeIds: i.nodeIds }));
    if (!S.instances.length && phase === 'build') st.events = prob.events.map((e) => { const d = catalog.eventById.get(e.id); return d ? { id: e.id, name: d.name, atMs: parseClock(e.at), endMs: parseClock(e.at), active: false, done: false, nodeIds: [] } : null; }).filter(Boolean);
    return st;
  }

  function interactiveTarget() {
    // the headline target is the one judged for the busiest interactive type, never the unused default
    let best = -1, tgt = 200;
    for (const [k, v] of Object.entries(prob.requirements.mix)) if (v > best && catalog.requestById.get(k)?.interactive) { best = v; tgt = S.latTarget[typeOf(k)]; }
    return tgt;
  }

  // ---- public API
  const env2 = env;
  function addNodeImpl(type, x, y, opts = {}) {
    const el = catalog.elementById.get(type);
    if (!el) throw new SimError('unknown-type', `Unknown part "${type}".`);
    const id = opts.id != null ? String(opts.id) : nextId();
    if (nodeById(id)) throw new SimError('exists', `A part with id "${id}" already exists.`);
    const node = makeNode(catalog, el, id, x, y, opts, env2);
    graph.nodes.push(node);
    markDirty();
    return id;
  }

  function buildAllowed() {
    if (phase !== 'build' && !FREE_EDIT.has(mode)) throw new SimError('not-allowed', 'Parts can only be added or removed before the day starts.');
  }

  function rebuildNow() {
    markDirty();
    if (phase !== 'build') ensureModel();
  }

  const api = {
    addNode(type, x, y, opts = {}) {
      buildAllowed();
      if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) throw new SimError('bad-position', 'A part needs a position on the canvas.');
      const id = addNodeImpl(type, x, y, opts);
      rebuildNow();
      return id;
    },
    removeNode(id) {
      buildAllowed();
      const n = nodeById(id);
      if (!n) throw new SimError('unknown-node', `No part "${id}".`);
      if (n.locked) throw new SimError('locked', 'This part is part of the problem and cannot be removed.');
      graph.nodes = graph.nodes.filter((x) => x.id !== id);
      graph.edges = graph.edges.filter((e) => e.from !== id && e.to !== id);
      rebuildNow();
    },
    moveNode(id, x, y) {
      const n = nodeById(id);
      if (!n) throw new SimError('unknown-node', `No part "${id}".`);
      if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) throw new SimError('bad-position', 'A part needs a position on the canvas.');
      n.x = Math.round(Number(x) || 0);
      n.y = Math.round(Number(y) || 0);
    },
    connect(fromId, toId) {
      buildAllowed();
      if (fromId === toId) throw new SimError('self', 'A part cannot connect to itself.');
      const a = nodeById(fromId), b = nodeById(toId);
      if (!a || !b) throw new SimError('unknown-node', 'Both parts must be on the canvas.');
      const rule = connectRule(catalog.elementById.get(a.type), catalog.elementById.get(b.type));
      if (!rule.ok) throw new SimError('not-allowed', rule.reason);
      const from = rule.swap ? toId : fromId, to = rule.swap ? fromId : toId;
      const id = `${from}>${to}`;
      if (graph.edges.some((e) => e.id === id)) throw new SimError('exists', 'These parts are already connected.');
      graph.edges.push({ id, from, to, kind: rule.kind });
      rebuildNow();
      return id;
    },
    disconnect(edgeId) {
      buildAllowed();
      const before = graph.edges.length;
      graph.edges = graph.edges.filter((e) => e.id !== edgeId);
      if (graph.edges.length === before) throw new SimError('unknown-edge', `No connection "${edgeId}".`);
      rebuildNow();
    },
    setKnob(nodeId, knob, value) {
      const n = nodeById(nodeId);
      if (!n) throw new SimError('unknown-node', `No part "${nodeId}".`);
      if (phase !== 'build' && (mode === 'challenge' || mode === 'beat')) throw new SimError('locked', 'In a challenge the design is fixed once the day starts.');
      const el = catalog.elementById.get(n.type);
      // switching autoscaling on keeps the servers already there as its floor, unless a floor is given
      if (knob === 'autoscale' && (typeof value === 'boolean' || (value && (value.min == null || value.min <= 1) && value.on !== false))) {
        const base = typeof value === 'boolean' ? { on: value } : { ...value };
        const prev = n.knobs.autoscale || {};
        const units = Math.max(1, n.units || 1);
        base.min = units;
        base.max = Math.max(base.max ?? prev.max ?? 0, units * 3, 20);
        value = base;
      }
      const v = coerceKnob(catalog, el, knob, value, regionIds);
      // the autoscaling floor follows the player's server count unless they set a different floor on purpose
      if (knob === 'units' && n.knobs.autoscale?.on) {
        const a = n.knobs.autoscale, was = Math.max(1, n.units || 1);
        if (a.min === was || a.min > v) n.knobs.autoscale = { ...a, min: v, max: Math.max(a.max ?? v, v) };
      }
      if (['units', 'zones', 'region', 'tier'].includes(knob)) n[knob] = v;
      else n.knobs[knob] = v;
      if (phase === 'running' || phase === 'paused') {
        S.interventions.push({ atMs: S.clock, nodeId, knob, value: v });
        if (knob === 'units' && S.model && S.model.idx.has(nodeId)) S.unitsCur[S.model.idx.get(nodeId)] = v;
      }
      rebuildNow();
      return v;
    },
    canConnect(fromType, toType) {
      const r = connectRule(catalog.elementById.get(fromType), catalog.elementById.get(toType));
      return { ok: r.ok, kind: r.kind, reason: r.reason, swap: r.swap };
    },
    getGraph() {
      return {
        nodes: graph.nodes.map((n) => {
          const o = { id: n.id, type: n.type, x: n.x, y: n.y, units: n.units, zones: n.zones, region: n.region, tier: n.tier, knobs: JSON.parse(JSON.stringify(n.knobs)) };
          if (n.label) o.label = n.label;
          if (n.locked) o.locked = true;
          return o;
        }),
        edges: graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
      };
    },
    loadGraph(input) {
      if (phase !== 'build') api.reset();
      const g = normalizeGraphInput(input);
      graph = { nodes: [], edges: [] };
      counter = 1;
      for (const n of g.nodes) {
        const el = catalog.elementById.get(n.type);
        if (!el || graph.nodes.some((x) => x.id === n.id)) continue;
        graph.nodes.push(makeNode(catalog, el, n.id, n.x, n.y, n, env2));
      }
      for (const e of g.edges) {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b || a === b) continue;
        const rule = connectRule(catalog.elementById.get(a.type), catalog.elementById.get(b.type));
        if (!rule.ok) continue;
        const from = rule.swap ? e.to : e.from, to = rule.swap ? e.from : e.to;
        const id = `${from}>${to}`;
        if (graph.edges.some((x) => x.id === id)) continue;
        graph.edges.push({ id, from, to, kind: rule.kind });
      }
      markDirty();
    },
    validate() {
      ensureModel();
      return validateModel(S);
    },
    estimate,
    trace(type) { ensureModel(); return traceRoute(S.model, type); },
    start() {
      if (phase === 'running') return;
      if (phase === 'done' || phase === 'paused') api.reset();
      resetRun();
      phase = 'running';
      updateFrame();
    },
    pause() { if (phase === 'running') phase = 'paused'; },
    resume() { if (phase === 'paused') phase = 'running'; },
    reset() {
      phase = 'build';
      S.clock = 0;
      S.instances = [];
      S.activeEffects = [];
      S.result = null;
      S.tickNow = null;
      S.counters = null;
      S.complianceChecked = new Map();
      S.lostWrites = 0; S.duplicates = 0; S.staleReads = 0;
      S.latOk = 0; S.latW = 0; S.offeredDay = 0; S.successDay = 0;
      markDirty();
      ensureModel();
      updateFrame();
    },
    tick() { return tickOnce() ? 1 : 0; },
    advance(simMs) {
      let n = 0;
      S.acc = (S.acc || 0) + Math.max(0, Number(simMs) || 0);
      while (S.acc >= tickMs) {
        S.acc -= tickMs;
        if (!tickOnce()) { S.acc = 0; break; }
        n++;
      }
      return n;
    },
    get phase() { return phase; },
    get clockMs() { return S.clock; },
    get mode() { return mode; },
    get seed() { return seed; },
    get problem() { return prob; },
    state: stateNow,
    flows() {
      ensureModel();
      if (!S.frame) allocFrame();
      if (S.frameDirty) { updateFrame(); S.frameDirty = false; }
      return S.frame;
    },
    result() { return S.result; },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    // ---- extras for sandbox, lessons and tools
    setTraffic(spec = {}) {
      const req = { ...prob.requirements };
      if (spec.rpsByType) {
        const entries = Object.entries(spec.rpsByType).filter(([k, v]) => catalog.typeIndex.has(k) && k !== 'attack' && v > 0);
        const total = entries.reduce((s, [, v]) => s + Number(v), 0);
        req.peakRps = total;
        req.mix = total > 0 ? Object.fromEntries(entries.map(([k, v]) => [k, v / total])) : { read: 1 };
      }
      if (spec.peakRps != null) req.peakRps = Number(spec.peakRps);
      if (spec.mix) req.mix = spec.mix;
      if (spec.userRegions) req.userRegions = spec.userRegions;
      const traffic = { ...prob.traffic };
      if (spec.curve) traffic.curve = spec.curve;
      if (spec.sources) traffic.sources = spec.sources;
      prob = normalizeProblem({ ...prob, requirements: req, traffic }, catalog, mode);
      applyProblem();
      markDirty();
      ensureModel();
    },
    setRequirements(patch = {}) {
      prob = normalizeProblem({ ...prob, requirements: { ...prob.requirements, ...patch } }, catalog, mode);
      applyProblem();
      markDirty();
    },
    fireEvent(eventId, params = {}) {
      if (!catalog.eventById.has(eventId)) throw new SimError('unknown-event', `Unknown event "${eventId}".`);
      const entry = { id: eventId, atMs: S.clock, params };
      const inst = makeInstance(catalog, entry, S.instances.length + 1000, dayMs);
      if (phase === 'build') { prob.events.push({ id: eventId, at: fmtClock(0), params }); return null; }
      S.instances.push(inst);
      computeLanes();
      return inst.id;
    },
    schedule() {
      return (S.instances.length ? S.instances : prob.events.map((e, i) => makeInstance(catalog, e, i, dayMs)).filter(Boolean))
        .map((i) => ({ id: i.id, name: i.name, severity: i.severity, atMs: i.atMs, endMs: i.endMs, started: !!i.started, ended: !!i.ended }));
    },
    debug() { return S; },
  };

  if (prob.starter) api.loadGraph(prob.starter);
  ensureModel();
  updateFrame();
  return api;
}
