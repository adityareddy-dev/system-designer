// How close a submitted design is to the designs the game ships (each problem's editorial designs and its starter).
// Leaderboards list designs a player made. The shipped design itself is not listed, and neither is a near copy: the same
// wiring shape whatever the sizes, zones, tiers and settings, a part swapped for one that does the same job, extra parts
// that connect to nothing, or a few parts taken out. Positions and names never matter.
// Pure module: the service uses it, and the headless checks load it in the browser.

export const COPY_THRESHOLD = 0.85;   // overlap at or above this is a copy
export const SHAPE_THRESHOLD = 0.85; // the same wiring shape (sizes, settings and monitoring ignored) at or above this is a copy
export const SUBSET_OVERLAP = 0.6;    // ...and so is a design made mostly of a shipped one's parts (inside >= SUBSET_INSIDE)
export const SUBSET_INSIDE = 0.9;     // with at least half of its sized parts sized exactly as shipped (exact >= SUBSET_EXACT)
export const SUBSET_EXACT = 0.5;
const SAME_JOB = 0.5;                 // a part of another type with the same job counts half

const DEFAULT_TIER = 'M';

function knobDefaults(catalog) {
  const out = Object.create(null);
  const k = catalog?.knobs;
  if (k && typeof k === 'object') for (const [name, def] of Object.entries(k)) if (def && def.default !== undefined && def.default !== null) out[name] = def.default;
  return out;
}

// The job a type does: its category and kind in the catalog (a VM fleet and a container cluster both run code).
function jobs(catalog) {
  const m = new Map();
  const list = Array.isArray(catalog?.elements) ? catalog.elements : catalog?.elements && typeof catalog.elements === 'object' ? Object.values(catalog.elements) : [];
  for (const e of list) if (e && typeof e.id === 'string') m.set(e.id, `${e.category || '?'}/${e.kind || '?'}`);
  return m;
}

function edgeEnds(e) {
  if (Array.isArray(e)) return [e[0], e[1]];
  if (typeof e === 'string') { const i = e.indexOf('>'); return i > 0 ? [e.slice(0, i), e.slice(i + 1)] : [null, null]; }
  if (e && typeof e === 'object') return [e.from, e.to];
  return [null, null];
}

// A design as plain parts and wiring. The locked starter parts count only as wiring ends, and parts with no connection
// are left out (they carry no traffic, so adding them changes nothing about the architecture).
// home: the problem's home region, where parts land when no region is chosen.
export function normalize(graph, catalog, home = null) {
  const defs = knobDefaults(catalog);
  const jobOf = jobs(catalog);
  const job = (t) => jobOf.get(t) || 'type:' + t;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const idOf = (n) => String(n?.id ?? n?.ref ?? '');
  const byId = new Map();
  for (const n of nodes) if (n && typeof n.type === 'string') byId.set(idOf(n), n);
  const wired = new Set();
  const links = [];
  const shape = [];
  for (const e of edges) {
    const [a, b] = edgeEnds(e);
    const na = byId.get(String(a)), nb = byId.get(String(b));
    if (!na || !nb || na === nb) continue;
    wired.add(na); wired.add(nb);
    // wiring is compared by job, so swapping a part for a same-job one keeps the same wiring
    links.push(`${na.locked ? na.type : job(na.type)}>${nb.locked ? nb.type : job(nb.type)}`);
    shape.push([na.locked ? na.type : job(na.type), nb.locked ? nb.type : job(nb.type)]);
  }
  const parts = [];
  for (const n of byId.values()) {
    if (n.locked || !wired.has(n)) continue;
    const knobs = {};
    for (const [k, v] of Object.entries(n.knobs && typeof n.knobs === 'object' ? n.knobs : {})) {
      if (v === undefined || v === null) continue;
      if (k in defs && JSON.stringify(defs[k]) === JSON.stringify(v)) continue;
      knobs[k] = v;
    }
    parts.push({
      type: n.type,
      job: job(n.type),
      units: Number.isFinite(n.units) ? n.units : 1,
      zones: Number.isFinite(n.zones) ? n.zones : 1,
      tier: typeof n.tier === 'string' ? n.tier : DEFAULT_TIER,
      region: typeof n.region === 'string' && n.region !== home ? n.region : 'home',
      knobs,
    });
  }
  // The wiring shape: which jobs connect to which, with no sizes, zones, tiers or settings, and without the monitoring parts
  // (adding or removing those never changes the architecture). Scaling every size or dropping and adding monitoring keeps it.
  const watch = (j) => typeof j === 'string' && j.startsWith('ops/observer');
  const shapeParts = parts.map((p) => p.job).filter((j) => !watch(j));
  const shapeLinks = shape.filter(([a, b]) => !watch(a) && !watch(b)).map(([a, b]) => `${a}>${b}`);
  return { parts, links, defs, shapeParts, shapeLinks };
}

// 0 when two setting values are the same, 1 when they have nothing in common.
function valueGap(a, b) {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    const m = Math.max(Math.abs(a), Math.abs(b));
    return m === 0 ? 0 : Math.min(1, Math.abs(a - b) / m);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    if (!keys.size) return 0;
    let s = 0;
    for (const k of keys) s += k in a && k in b ? valueGap(a[k], b[k]) : 1;
    return s / keys.size;
  }
  return 1;
}

// How alike two parts with the same job are: 1 for the same type with identical sizes and settings.
function partLikeness(a, b, defs) {
  const gaps = [valueGap(a.units, b.units), valueGap(a.zones, b.zones), a.tier === b.tier ? 0 : 1, a.region === b.region ? 0 : 1];
  const keys = new Set([...Object.keys(a.knobs), ...Object.keys(b.knobs)]);
  for (const k of keys) {
    const va = k in a.knobs ? a.knobs[k] : defs[k];
    const vb = k in b.knobs ? b.knobs[k] : defs[k];
    gaps.push(va === undefined || vb === undefined ? 1 : valueGap(va, vb));
  }
  const alike = 1 - gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return a.type === b.type ? alike : alike * SAME_JOB;
}

// A part someone chose a size or setting for (more than one unit or zone, a setting, a tier or a region).
const sized = (p) => p.units > 1 || p.zones > 1 || p.tier !== DEFAULT_TIER || p.region !== 'home' || Object.keys(p.knobs).length > 0;

// How much two designs overlap. Returns { overlap, inside, exact }, all 0..1:
// overlap: what they share over everything in either (adding or removing parts lowers it);
// inside: how much of design A is found in B (A made by deleting parts of B scores 1);
// exact: the share of A's sized parts that have a twin in B of the same type, size and settings (1 when A has none).
// Someone who drew the textbook design on their own picks their own sizes; someone who trimmed the editorial keeps its sizes.
export function similarity(A, B) {
  const defs = A.defs || B.defs || {};
  const group = (parts) => { const m = new Map(); for (const p of parts) { if (!m.has(p.job)) m.set(p.job, []); m.get(p.job).push(p); } return m; };
  const ga = group(A.parts), gb = group(B.parts);
  let matched = 0;
  let twins = 0;
  for (const [j, as] of ga) {
    const bs = gb.get(j);
    if (!bs) continue;
    const pairs = [];
    for (let i = 0; i < as.length; i++) for (let k = 0; k < bs.length; k++) pairs.push([partLikeness(as[i], bs[k], defs), i, k]);
    pairs.sort((x, y) => y[0] - x[0]);
    const usedA = new Set(), usedB = new Set();
    for (const [s, i, k] of pairs) {
      if (usedA.has(i) || usedB.has(k)) continue;
      usedA.add(i); usedB.add(k);
      matched += s;
      if (s >= 0.999 && sized(as[i])) twins += 1;
    }
  }
  const sizedA = A.parts.filter(sized).length;
  const nA = A.parts.length, nB = B.parts.length;
  const count = (list) => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return m; };
  const ca = count(A.links), cb = count(B.links);
  let shared = 0;
  for (const [x, n] of ca) shared += Math.min(n, cb.get(x) || 0);
  const eA = A.links.length, eB = B.links.length;
  const overlap = ((nA + nB === 0 ? 1 : matched / (nA + nB - matched)) + (eA + eB === 0 ? 1 : shared / (eA + eB - shared))) / 2;
  const inside = ((nA ? matched / nA : 1) + (eA ? shared / eA : 1)) / 2;
  return { overlap, inside, exact: sizedA ? twins / sizedA : 1 };
}

// How much two designs share in wiring shape alone (0..1): the same jobs joined the same ways, whatever the sizes.
export function shapeOverlap(A, B) {
  const count = (list) => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return m; };
  const share = (a, b) => {
    const ca = count(a), cb = count(b);
    let shared = 0;
    for (const [x, n] of ca) shared += Math.min(n, cb.get(x) || 0);
    const total = a.length + b.length - shared;
    return total === 0 ? 1 : shared / total;
  };
  if (!A.shapeLinks || !B.shapeLinks) return 0;
  return Math.min(share(A.shapeParts, B.shapeParts), share(A.shapeLinks, B.shapeLinks));
}

export const isCopy = ({ overlap, inside, exact, shape = 0 }) => shape >= SHAPE_THRESHOLD || overlap >= COPY_THRESHOLD || (overlap >= SUBSET_OVERLAP && inside >= SUBSET_INSIDE && exact >= SUBSET_EXACT);

// The shipped design a submission is closest to: { kind: 'editorial' | 'starter' | null, index, overlap, inside, exact, copy }.
// cache: an optional Map to keep each problem's shipped designs ready between calls.
export function closestShipped(graph, problem, catalog, cache = null) {
  const home = problem.requirements?.homeRegion || 'us';
  let shipped = cache?.get(problem.id);
  if (!shipped) {
    shipped = [];
    if (problem.starter) shipped.push({ kind: 'starter', index: 0, design: normalize(problem.starter, catalog, home) });
    (problem.editorial?.designs || []).forEach((d, index) => { if (d?.graph) shipped.push({ kind: 'editorial', index, design: normalize(d.graph, catalog, home) }); });
    cache?.set(problem.id, shipped);
  }
  const mine = normalize(graph, catalog, home);
  let best = { kind: null, index: -1, overlap: 0, inside: 0, exact: 0, copy: false };
  for (const s of shipped) {
    const sim = { ...similarity(mine, s.design), shape: shapeOverlap(mine, s.design) };
    const copy = isCopy(sim);
    if ((copy && !best.copy) || (copy === best.copy && sim.overlap > best.overlap)) best = { kind: s.kind, index: s.index, ...sim, copy };
  }
  return best;
}
