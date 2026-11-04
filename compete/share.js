// "Beat my design" links: encode and decode an architecture and score into a URL-safe string, and replay it to verify.
import { elementList, knobDefs, regionIds, tierIds, cleanName } from './util.js';
import { dailyFor, applyVariant } from './daily.js';

export class ShareError extends Error {
  constructor(message) { super(message); this.name = 'ShareError'; }
}

const MODES = new Set(['practice', 'challenge', 'beat', 'sandbox']);
const EDGE_KIND_TO_CODE = { replication: 'r', tap: 't', observe: 'o', control: 'c' };
const CODE_TO_EDGE_KIND = { r: 'replication', t: 'tap', o: 'observe', c: 'control', f: 'flow' };
const MAX_NODES = 120;
const MAX_EDGES = 400;
const MAX_PAYLOAD = 24000;
const MAX_JSON = 300000;
const GRID = 20;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new ShareError('This link has characters that do not belong in a design link.');
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream, max = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { reader.cancel().catch(() => {}); throw new ShareError('This link is too large to be a design link.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function codeMaps(catalog) {
  const byId = new Map();
  const byCode = new Map();
  for (const e of elementList(catalog)) { byId.set(e.id, e.code); byCode.set(e.code, e.id); }
  return { byId, byCode };
}

// Score summary stored in the link. Accepts a DebriefData and returns { total, availability, p99Ms, costPerMonth }.
export function scoreOf(result) {
  const s = result?.score || {};
  const slo = result?.slo || {};
  return {
    total: Math.round(s.total ?? 0),
    availability: slo.availability?.actual ?? 0,
    p99Ms: Math.round(slo.latency?.worstP99Ms ?? 0),
    costPerMonth: Math.round(slo.cost?.perMonth ?? 0),
  };
}

export async function encodeShare({ mode, problemId, seed, graph, score, name }, catalog) {
  if (!MODES.has(mode)) mode = 'practice';
  const { byId } = codeMaps(catalog);
  const defs = knobDefs(catalog);
  const regions = regionIds(catalog);
  const tiers = tierIds(catalog);
  const nodes = graph?.nodes || [];
  const index = new Map();
  const n = nodes.map((nd, i) => {
    index.set(nd.id, i);
    const code = byId.get(nd.type);
    if (!code) throw new ShareError(`Unknown element "${nd.type}" cannot be shared.`);
    const knobs = {};
    for (const [k, v] of Object.entries(nd.knobs || {})) {
      if (v === undefined) continue;
      const d = defs[k]?.default;
      if (d !== undefined && JSON.stringify(d) === JSON.stringify(v)) continue;
      knobs[k] = v;
    }
    const ri = nd.region ? regions.indexOf(nd.region) : -1;
    const ti = nd.tier ? tiers.indexOf(nd.tier) : -1;
    const row = [code, Math.round(nd.x / GRID), Math.round(nd.y / GRID), nd.units ?? 1, nd.zones ?? 1, ri, ti, knobs, nd.id];
    if (nd.locked) row.push(1);
    return row;
  });
  const e = [];
  for (const ed of graph?.edges || []) {
    const i = index.get(ed.from), j = index.get(ed.to);
    if (i === undefined || j === undefined) continue;
    const k = EDGE_KIND_TO_CODE[ed.kind];
    e.push(k ? [i, j, k] : [i, j]);
  }
  const sc = score || {};
  const obj = {
    v: 1, m: mode, p: problemId, s: seed, n, e,
    r: {
      t: Math.round(sc.total ?? 0),
      a: Math.round((sc.availability ?? 0) * 1e5) / 1e5,
      l: Math.round(sc.p99Ms ?? 0),
      c: Math.round(sc.costPerMonth ?? 0),
    },
    by: cleanName(name),
  };
  const raw = enc.encode(JSON.stringify(obj));
  const plain = 'j' + toB64u(raw);
  if (!canCompress()) return plain;
  const z = 'z' + toB64u(await pipe(raw, new CompressionStream('deflate-raw')));
  return z.length < plain.length ? z : plain;
}

const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const isNum = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;

function checkKnobs(raw, defs) {
  if (raw == null || raw === 0) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ShareError('A setting in this link is not valid.');
  const known = Object.keys(defs).length > 0;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (known && !Object.prototype.hasOwnProperty.call(defs, k)) throw new ShareError(`This link uses a setting ("${String(k).slice(0, 20)}") this version does not know.`);
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(k)) throw new ShareError('A setting name in this link is not valid.');
    const prim = (x) => typeof x === 'boolean' || (typeof x === 'number' && isFinite(x)) || (typeof x === 'string' && x.length <= 32);
    if (prim(v)) out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(prim) && Object.keys(v).length <= 8) out[k] = { ...v };
    else throw new ShareError('A setting value in this link is not valid.');
  }
  return out;
}

export async function decodeShare(payload, catalog) {
  if (typeof payload !== 'string' || payload.length < 2) throw new ShareError('This link is empty.');
  if (payload.length > MAX_PAYLOAD) throw new ShareError('This link is too long to be a design link.');
  let obj;
  try {
    const body = fromB64u(payload.slice(1));
    const kind = payload[0];
    let bytes;
    if (kind === 'z') {
      if (!canCompress()) throw new ShareError('This browser cannot open compressed design links.');
      bytes = await pipe(body, new DecompressionStream('deflate-raw'), MAX_JSON);
    } else if (kind === 'j') bytes = body;
    else throw new ShareError('This is not a design link.');
    obj = JSON.parse(dec.decode(bytes));
  } catch (err) {
    if (err instanceof ShareError) throw err;
    throw new ShareError('This link is damaged or cut short. Ask your friend to send it again.');
  }
  if (!obj || typeof obj !== 'object' || obj.v !== 1) throw new ShareError('This link was made by a different version of the game.');
  if (!MODES.has(obj.m)) throw new ShareError('This link names a game mode that does not exist.');
  if (typeof obj.p !== 'string' || !/^[a-z0-9-]{1,64}$/.test(obj.p)) throw new ShareError('This link names a problem that is not valid.');
  if (typeof obj.s !== 'string' || obj.s.length < 1 || obj.s.length > 64) throw new ShareError('This link has a scenario seed that is not valid.');
  if (!Array.isArray(obj.n) || !Array.isArray(obj.e)) throw new ShareError('This link has no design in it.');
  if (obj.n.length > MAX_NODES) throw new ShareError(`This design has more than ${MAX_NODES} elements, which is more than a design link can carry.`);
  if (obj.e.length > MAX_EDGES) throw new ShareError(`This design has more than ${MAX_EDGES} connections, which is more than a design link can carry.`);

  const { byCode } = codeMaps(catalog);
  const defs = knobDefs(catalog);
  const regions = regionIds(catalog);
  const tiers = tierIds(catalog);
  const ids = new Set();
  const nodes = obj.n.map((row, i) => {
    if (!Array.isArray(row) || row.length < 8) throw new ShareError('An element in this link is malformed.');
    const [code, gx, gy, units, zones, ri, ti, knobs, rawId, locked] = row;
    const type = byCode.get(code);
    if (!type) throw new ShareError(`This link uses an element ("${String(code).slice(0, 8)}") this version does not know.`);
    if (!isNum(gx, -2000, 2000) || !isNum(gy, -2000, 2000)) throw new ShareError('An element in this link sits outside the board.');
    if (!isInt(units, 1, 1000) || !isInt(zones, 1, 3)) throw new ShareError('An element in this link has a size that is not valid.');
    if (!isInt(ri, -1, regions.length - 1) || !isInt(ti, -1, tiers.length - 1)) throw new ShareError('An element in this link has a region or size that is not valid.');
    const id = rawId === undefined || rawId === 0 ? 'n' + (i + 1) : rawId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id) || ids.has(id)) throw new ShareError('An element in this link has a name that is not valid.');
    ids.add(id);
    const nd = { id, type, x: Math.round(gx) * GRID, y: Math.round(gy) * GRID, units, zones, knobs: checkKnobs(knobs, defs) };
    if (ri >= 0) nd.region = regions[ri];
    if (ti >= 0) nd.tier = tiers[ti];
    if (locked === 1) nd.locked = true;
    return nd;
  });
  const seen = new Set();
  const edges = obj.e.map((row) => {
    if (!Array.isArray(row)) throw new ShareError('A connection in this link is malformed.');
    const [i, j, k] = row;
    if (!isInt(i, 0, nodes.length - 1) || !isInt(j, 0, nodes.length - 1) || i === j) throw new ShareError('A connection in this link points at an element that is not there.');
    const kind = k === undefined ? 'flow' : CODE_TO_EDGE_KIND[k];
    if (!kind) throw new ShareError('A connection in this link has a kind this version does not know.');
    const id = `${nodes[i].id}>${nodes[j].id}`;
    if (seen.has(id)) throw new ShareError('This link has the same connection twice.');
    seen.add(id);
    return { id, from: nodes[i].id, to: nodes[j].id, kind };
  });
  const r = obj.r || {};
  if (!isNum(r.t, 0, 1000) || !isNum(r.a ?? 0, 0, 1) || !isNum(r.l ?? 0, 0, 1e7) || !isNum(r.c ?? 0, 0, 1e10)) throw new ShareError('The score in this link is not valid.');
  return {
    mode: obj.m,
    problemId: obj.p,
    seed: obj.s,
    graph: { nodes, edges },
    score: { total: r.t, availability: r.a ?? 0, p99Ms: r.l ?? 0, costPerMonth: r.c ?? 0 },
    name: cleanName(obj.by),
  };
}

// A daily design goes through the static page for its date (d/<date>/), which has its own preview tags, and the design
// stays in the fragment. A Practice design goes through p/<problem>/ the same way.
export function shareUrl(payload, seed, problemId) {
  const base = String(globalThis.location?.href || 'https://example.invalid/').split('#')[0];
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(seed || ''));
  if (m) {
    try { return new URL('d/' + m[1] + '/', new URL('./', base)).href + '#/beat/' + payload; } catch { /* plain link below */ }
  }
  if (problemId && /^[a-z0-9-]+$/.test(String(problemId))) {
    try { return new URL('p/' + problemId + '/', new URL('./', base)).href + '#/beat/' + payload; } catch { /* plain link below */ }
  }
  return base + '#/beat/' + payload;
}

// Replays the shared design with the same seed. problem must be the base problem; a daily seed re-applies its variant.
export async function verify(shareData, catalog, problem) {
  try {
    let p = problem;
    const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(shareData.seed);
    if (m && problem) {
      const variant = shareData.variant;
      if (variant && !problem.dailyVariant) p = applyVariant(problem, variant, catalog);
    }
    const { createSim } = await import('../sim/engine.js');
    const sim = createSim({ catalog, problem: p, seed: shareData.seed, mode: shareData.mode });
    sim.loadGraph(shareData.graph);
    sim.start();
    sim.advance(86400000);
    const res = sim.result();
    const replayScore = Math.round(res?.score?.total ?? NaN);
    const verified = Number.isFinite(replayScore) && Math.abs(replayScore - shareData.score.total) <= 1;
    return { verified, replayScore: Number.isFinite(replayScore) ? replayScore : null, replay: Number.isFinite(replayScore) ? scoreOf(res) : null };
  } catch (err) {
    return { verified: false, replayScore: null, replay: null, error: String(err?.message || err) };
  }
}

// Catalog-bound API with the contract signatures. Daily variants are resolved here from the problem list.
export function createShare(catalog, getProblems) {
  const list = () => (typeof getProblems === 'function' ? getProblems() : getProblems) || [];
  return {
    encodeShare: (data) => encodeShare(data, catalog),
    decodeShare: (payload) => decodeShare(payload, catalog),
    shareUrl: (payload, seed, problemId) => shareUrl(payload, seed, problemId),
    scoreOf,
    async verify(shareData, _catalog, problem) {
      const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(shareData.seed);
      const data = m ? { ...shareData, variant: dailyFor(m[1], list()).variant } : shareData;
      return verify(data, catalog, problem);
    },
  };
}
