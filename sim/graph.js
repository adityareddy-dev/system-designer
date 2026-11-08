// Graph rules: connection rules (canConnect), knob values and normalising graphs from content or share links.

export class SimError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SimError';
    this.code = code;
  }
}

// Elements that sit next to the user (edge networks, DNS); everything else lives in a region.
export const NEAR_USER = new Set(['dns', 'geo-dns', 'cdn', 'global-lb', 'ddos-shield', 'waf', 'edge-fn']);

const TOP_LEVEL_KNOBS = new Set(['units', 'zones', 'region', 'tier']);

export function inRequestPath(el) {
  return el.capacity != null;
}

function governs(ctrl, target) {
  switch (ctrl.id) {
    case 'autoscaler': return target.kind === 'compute';
    case 'backups': return target.kind === 'store';
    case 'ci-cd':
    case 'feature-flags':
    case 'config-service':
    case 'secrets-manager': return target.kind === 'compute';
    case 'disaster-recovery': return inRequestPath(target);
    default: return false;
  }
}

function flowAllowed(a, b) {
  const fk = a.kind, tk = b.kind;
  switch (fk) {
    case 'source':
      if (tk === 'lookaside') return b.id === 'identity-provider' ? 'flow' : null;
      return ['router', 'filter', 'cache', 'compute', 'queue'].includes(tk) ? 'flow' : null;
    case 'router':
    case 'filter':
    case 'cache':
    case 'compute':
      if (tk === 'tap') return b.id === 'audit-log' ? 'tap' : null;
      return ['router', 'filter', 'cache', 'compute', 'store', 'queue', 'lookaside', 'external'].includes(tk) ? 'flow' : null;
    case 'queue':
      return ['compute', 'queue', 'store'].includes(tk) ? 'flow' : null;
    case 'store':
      if (tk === 'tap') return 'tap';
      if (tk === 'store' && a.params?.role === 'primary' && b.params?.role === 'replica' && a.params?.family && a.params.family === b.params?.family) return 'replication';
      return null;
    case 'tap':
      return ['queue', 'store', 'cache', 'compute'].includes(tk) ? 'flow' : null;
    case 'lookaside':
      return tk === 'external' ? 'flow' : null;
    case 'external':
      return ['compute', 'router', 'queue'].includes(tk) && (a.handles || []).includes('webhook') ? 'flow' : null;
    default:
      return null;
  }
}

function refuseReason(a, b) {
  const A = a.name, B = b.name;
  const attempt = `${A} → ${B} is not supported. `;
  const explain = advice => attempt + advice;
  if (a.kind === 'observer' || b.kind === 'observer') {
    const observer = a.kind === 'observer' ? a : b;
    const advice = observer.id === 'pager' ? 'Connect Alerting → On-call pager.'
      : ['alerting', 'dashboards'].includes(observer.id) ? `Connect Metrics → ${observer.name}.`
      : `Connect a request-handling part such as App servers → ${observer.name}. Metrics → Alerting → On-call pager and Metrics → Dashboards are the supported links between monitoring parts.`;
    return explain(advice);
  }
  if (a.kind === 'control' || b.kind === 'control') {
    const ctrl = a.kind === 'control' ? a : b;
    if (ctrl.id === 'backups') return explain('Backups protects stored data. Connect Backups → a storage part such as Object storage or SQL database.');
    return explain(`${ctrl.name} manages ${ctrl.id === 'disaster-recovery' ? 'parts that carry requests' : 'compute capacity'}. Connect ${ctrl.name} → App servers.`);
  }
  if (b.kind === 'source') return explain(`${B} is where requests start. ${flowAllowed(b, a) ? `Connect ${B} → ${A} instead.` : `Start with ${B} → App servers, then connect the service the servers need.`}`);
  if (flowAllowed(b, a)) return explain(`This link runs in the other direction. Connect ${B} → ${A} instead.`);
  if (a.kind === 'store' && b.kind === 'store') {
    if (b.params?.role === 'replica') return explain(`${B} copies a primary of the same family. Connect its matching primary → ${B}, and App servers → ${B} for reads.`);
    return explain(`These storage parts do not call each other. Connect App servers → ${A} and App servers → ${B}.`);
  }
  if (a.kind === 'store') return explain(`${A} stores data and does not initiate this call. Connect App servers → ${A} and App servers → ${B}.`);
  if (b.id === 'cdc-connector') return explain(`Change data capture receives a copy from storage. Connect a storage part → ${B}, then ${B} → a queue or destination store.`);
  if (a.kind === 'external') {
    if (!(a.handles || []).includes('webhook')) return explain(`${A} answers calls from your system. Connect App servers → ${A}; connect App servers → ${B} separately.`);
    return explain(`${A} sends webhooks into compute, routers or queues. Connect ${A} → App servers, then App servers → ${B}.`);
  }
  if (a.kind === 'source') return explain(`Put App servers between these parts: ${A} → App servers → ${B}.`);
  if (a.kind === 'queue') return explain(`${A} holds messages for a consumer. Connect ${A} → Background workers → ${B}.`);
  if (a.kind === 'lookaside') return explain(`${A} is a side service called by servers. Connect App servers → ${A} and App servers → ${B} separately.`);
  if (a.kind === 'tap') return explain(`${A} sends copied work to compute, queues, caches or storage. Connect ${A} → Background workers → ${B}.`);
  return explain(`Use App servers to call each service, and keep monitoring and control links beside the request path.`);
}

// Connection rule check on element objects. Returns { ok, kind, reason, swap }.
export function connectRule(a, b) {
  if (!a || !b) return { ok: false, kind: null, reason: 'Unknown part.', swap: false };
  const fk = a.kind, tk = b.kind;
  // observers: any request-path part feeds an observer; metrics → alerting → pager; metrics → dashboards
  if (tk === 'observer' && fk !== 'observer') {
    if (inRequestPath(a)) return { ok: true, kind: 'observe', reason: '', swap: false };
    return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
  }
  if (fk === 'observer' && tk !== 'observer') {
    if (inRequestPath(b)) return { ok: true, kind: 'observe', reason: '', swap: true };
    return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
  }
  if (fk === 'observer' && tk === 'observer') {
    if ((b.params?.needs || []).includes(a.id)) return { ok: true, kind: 'observe', reason: '', swap: false };
    if ((a.params?.needs || []).includes(b.id)) return { ok: true, kind: 'observe', reason: '', swap: true };
    return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
  }
  if (fk === 'control') {
    if (governs(a, b)) return { ok: true, kind: 'control', reason: '', swap: false };
    return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
  }
  if (tk === 'control') {
    if (governs(b, a)) return { ok: true, kind: 'control', reason: '', swap: true };
    return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
  }
  const kind = flowAllowed(a, b);
  if (kind) return { ok: true, kind, reason: '', swap: false };
  if (fk === 'store' && tk === 'store') {
    const rev = flowAllowed(b, a);
    if (rev === 'replication') return { ok: true, kind: 'replication', reason: '', swap: true };
  }
  return { ok: false, kind: null, reason: refuseReason(a, b), swap: false };
}

export function knobValue(catalog, node, knob) {
  if (TOP_LEVEL_KNOBS.has(knob)) return node[knob];
  const v = node.knobs ? node.knobs[knob] : undefined;
  if (v !== undefined) return v;
  const el = catalog.elementById.get(node.type);
  if (knob === 'mode') return el?.params?.modes ? el.params.modes[0] : undefined;
  if (knob === 'retentionDays' && el?.params?.retentionDays != null) return el.params.retentionDays;
  if (knob === 'ttlSec' && el?.params?.ttlSec != null) return el.params.ttlSec;
  if (knob === 'replication' && el?.params?.replication) return el.params.replication;
  const def = catalog.knobs[knob];
  return def ? structuredCloneSafe(def.default) : undefined;
}

function structuredCloneSafe(v) {
  return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
}

// Validates and normalises a knob value; throws SimError on a bad value.
export function coerceKnob(catalog, el, knob, value, regionIds) {
  const def = catalog.knobs[knob];
  if (!def) throw new SimError('bad-knob', `Unknown setting "${knob}".`);
  if (!(el.knobs || []).includes(knob)) throw new SimError('bad-knob', `${el.name} has no "${def.label}" setting.`);
  switch (knob) {
    case 'units': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) throw new SimError('bad-knob', 'Units must be a number.');
      return Math.max(el.units.min, Math.min(el.units.max, n));
    }
    case 'zones': {
      const n = Math.round(Number(value));
      if (![1, 2, 3].includes(n)) throw new SimError('bad-knob', 'Zones must be 1, 2 or 3.');
      return n;
    }
    case 'region':
      if (!regionIds.includes(value)) throw new SimError('bad-knob', `Unknown region "${value}".`);
      return value;
    case 'tier':
      if (!def.options.includes(value)) throw new SimError('bad-knob', 'Size must be S, M, L or XL.');
      return value;
    case 'autoscale': {
      const base = { on: false, min: 1, max: 20, targetUtil: 0.6 };
      const v = typeof value === 'boolean' ? { on: value } : (value || {});
      const out = { ...base, ...v };
      out.on = !!out.on;
      out.min = Math.max(el.units.min, Math.round(Number(out.min) || 1));
      out.max = Math.min(el.units.max, Math.max(out.min, Math.round(Number(out.max) || out.min)));
      out.targetUtil = Math.max(0.2, Math.min(0.95, Number(out.targetUtil) || 0.6));
      return out;
    }
    case 'coalesce':
      return !!value;
    case 'partitions':
    case 'limitRps':
    case 'warmPool': {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 0) throw new SimError('bad-knob', `${def.label} must be a positive number.`);
      return knob === 'warmPool' ? Math.min(n, 1000) : Math.max(1, Math.min(n, 1e7));
    }
    case 'mode': {
      const opts = el.params?.modes || [];
      if (!opts.includes(value)) throw new SimError('bad-knob', `${el.name} mode must be one of ${opts.join(', ')}.`);
      return value;
    }
    default: {
      if (Array.isArray(def.options)) {
        const match = def.options.find((o) => o === value || String(o) === String(value));
        if (match === undefined) throw new SimError('bad-knob', `${def.label} must be one of ${def.options.join(', ')}.`);
        return match;
      }
      return value;
    }
  }
}

export function makeNode(catalog, el, id, x, y, opts, env) {
  const node = {
    id,
    type: el.id,
    x: Math.round(Number(x) || 0),
    y: Math.round(Number(y) || 0),
    units: el.units?.default ?? 1,
    zones: 1,
    region: env.homeRegion,
    tier: 'M',
    knobs: {},
  };
  if (opts) {
    for (const k of ['units', 'zones', 'region', 'tier']) {
      if (opts[k] == null) continue;
      try {
        node[k] = (el.knobs || []).includes(k) ? coerceKnob(catalog, el, k, opts[k], env.regionIds) : sanitizeTop(k, opts[k], el, env);
      } catch { /* keep default */ }
    }
    if (opts.knobs && typeof opts.knobs === 'object') {
      for (const [k, v] of Object.entries(opts.knobs)) {
        if (TOP_LEVEL_KNOBS.has(k)) continue;
        try { node.knobs[k] = coerceKnob(catalog, el, k, v, env.regionIds); } catch { /* ignore bad knob */ }
      }
    }
    if (opts.label) node.label = String(opts.label).slice(0, 40);
    if (opts.locked) node.locked = true;
  }
  return node;
}

function sanitizeTop(k, v, el, env) {
  if (k === 'region') return env.regionIds.includes(v) ? v : env.homeRegion;
  if (k === 'units') return Math.max(el.units.min, Math.min(el.units.max, Math.round(Number(v) || el.units.default)));
  if (k === 'zones') return [1, 2, 3].includes(Number(v)) ? Number(v) : 1;
  if (k === 'tier') return ['S', 'M', 'L', 'XL'].includes(v) ? v : 'M';
  return v;
}

// Accepts Graph ({nodes:[{id|ref,...}], edges:[{from,to}|[from,to]]}) from content, drafts or share links.
export function normalizeGraphInput(input) {
  const nodes = [];
  const edges = [];
  if (!input) return { nodes, edges };
  for (const n of input.nodes || []) {
    const id = n.id ?? n.ref;
    if (!id || !n.type) continue;
    nodes.push({ ...n, id: String(id) });
  }
  for (const e of input.edges || []) {
    if (Array.isArray(e)) edges.push({ from: String(e[0]), to: String(e[1]) });
    else if (e && e.from != null && e.to != null) edges.push({ from: String(e.from), to: String(e.to) });
  }
  return { nodes, edges };
}
