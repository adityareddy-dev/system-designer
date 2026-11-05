// Build-phase checks: plain-words validation issues and the "will it hold at peak?" estimate.
import { sourceWeights } from './sources.js';
import { M } from './route.js';
import { nodeLabel } from './cost.js';
import { joinNames } from './util.js';
import { checkCompliance } from './events.js';
import { traceRoute } from './trace.js';

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerName = (s) => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const article = (w) => ((/^[aeiou]/i.test(w) && !/^(uni|use|one|eu)/i.test(w)) || /^[AEFHILMNORSX][A-Z]/.test(w) ? 'an ' : 'a ') + w;

// Plain first choices for a part that finishes each request type, used when the problem's own reference designs
// do not name one. Order matters: the first is the usual answer.
const FINISHERS = {
  read: ['sql-primary', 'kv-store'], write: ['sql-primary', 'kv-store'], upload: ['object-storage'], stream: ['cdn', 'object-storage'],
  live: ['cdn', 'object-storage'], search: ['search-index'], report: ['sql-replica', 'data-warehouse'], payment: ['payment-processor', 'ledger-db'],
  login: ['identity-provider', 'sql-primary'], inference: ['model-server', 'hosted-llm-api'], message: ['wide-column', 'kv-store'],
  location: ['kv-store', 'timeseries-db'], notify: ['push-service', 'email-provider', 'sms-provider'], sync: ['document-db', 'sql-primary'],
  telemetry: ['timeseries-db', 'data-lake'], event: ['stream-processor', 'data-warehouse'], batch: ['object-storage', 'data-warehouse'],
  webhook: ['payment-processor', 'third-party-api'],
};

// Which parts would finish type t here: the problem's reference designs first, then the plain defaults.
function finishersFor(S, t) {
  const { catalog, problem } = S;
  const tid = catalog.requests[t].id;
  const done = (id) => (catalog.elementById.get(id)?.completes || []).includes(tid);
  const seen = new Map();
  for (const d of problem.editorial?.designs || []) {
    for (const n of d.graph?.nodes || []) { const k = catalog.elementById.get(n.type)?.kind; if (done(n.type) && k !== 'source' && k !== 'cache') seen.set(n.type, (seen.get(n.type) || 0) + 1); }
  }
  const list = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  for (const id of FINISHERS[tid] || []) if (!list.includes(id) && catalog.elementById.has(id)) list.push(id);
  const allowed = problem.palette && problem.palette.length ? new Set(problem.palette) : null;
  const ok = allowed ? list.filter((id) => allowed.has(id)) : list;
  return (ok.length ? ok : list).slice(0, tid === 'notify' ? 3 : 2);
}

// Why type t never finishes: where it stops, and what would finish it.
function unservedMessage(S, t) {
  const { model, catalog } = S;
  const { nodes, outAll, H, C } = model;
  const type = catalog.requests[t];
  const plural = type.plural;
  const label = (u) => nodeLabel(nodes[u]);
  // follow every connection whose far end accepts this type; the last parts reached are where it stops
  const seen = new Uint8Array(nodes.length);
  const stack = [];
  for (const s of model.sources) if (H(s, t)) stack.push(s);
  const stops = [];
  while (stack.length) {
    const u = stack.pop();
    if (seen[u]) continue;
    seen[u] = 1;
    const next = outAll[u].filter((e) => e.kind === 'flow' && H(e.ti, t)).map((e) => e.ti);
    if (!next.length && nodes[u].kind !== 'source') stops.push(u);
    for (const v of next) stack.push(v);
  }
  // a cache never finishes anything on its own: it needs a store behind it
  const finishersHere = nodes.filter((n) => n.kind !== 'source' && n.kind !== 'cache' && C(n.i, t)).map((n) => n.i);
  const stop = stops.find((u) => nodes[u].kind === 'compute') ?? stops[0];
  const required = (S.problem.requires || {})[type.id] || [];
  if (required.length && required.some(group => !nodes.some(n => seen[n.i] && group.includes(n.el.id)))) {
    const path = required.map((group) => group.map((id) => lowerName(catalog.elementById.get(id)?.name || id)).join(' or ')).join(' and ');
    const from = stop != null ? label(stop) : 'your servers';
    const elsewhere = nodes.some((n) => required.some((g) => g.includes(n.el.id)) && !seen[n.i]);
    return { msg: `${cap1(plural)} stop at ${from}. Complete their path from ${from} through ${path}.${elsewhere ? ' The required part on another branch does not receive these requests.' : ''}`, nodeId: stop != null ? nodes[stop].id : undefined, elementId: required[0][0] };
  }
  const limiter = stops.find(u => nodes[u].el.id === 'rate-limiter');
  if (limiter != null && ['read', 'write'].includes(type.id)) {
    return { msg: `${cap1(plural)} reach ${label(limiter)}, but no data store sits behind it. It admits or rejects requests and cannot finish a read or write. Connect ${label(limiter)} to Key-value store on this path. A limit shared across servers also needs shared, atomic per-key counter updates.`, nodeId: nodes[limiter].id, elementId: 'kv-store' };
  }
  if (finishersHere.length && stop != null) {
    const trace = traceRoute(model, type.id);
    const hop = trace.rejected.find((h) => h.from === trace.repair?.from && /side call|does not handle|parking/i.test(h.reason))
      || trace.rejected.find((h) => /Side calls return|does not handle|parking/.test(h.reason)) || trace.rejected[0];
    const name = (id) => label(nodes.findIndex((n) => n.id === id));
    const rejected = hop ? `${name(hop.from)} → ${name(hop.to)} is rejected: ${hop.reason} ` : '';
    if (trace.repair) return { msg: `${cap1(plural)} have no usable route. ${rejected}Connect ${name(trace.repair.from)} to ${name(trace.repair.to)}. Complete path: ${trace.repair.path.map(name).join(' → ')}.`, nodeId: trace.repair.from };
    return { msg: `${cap1(plural)} have no usable route. ${rejected}Trace a request to check each hop before adding a delivery connection.`, nodeId: hop?.from };
  }
  const ids = finishersFor(S, t);
  const names = ids.map((id) => catalog.elementById.get(id)?.name || id);
  const need = names.length > 1 ? `one of these to finish them: ${names.length > 2 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names.join(' or ')}` : names.length ? `${article(names[0])} to finish them` : 'a part that finishes them';
  // connect the new part from the servers on the path, not from a database that only passed the request on
  let fromIdx = stop != null && nodes[stop].kind === 'compute' ? stop : -1;
  if (fromIdx < 0) for (let u = 0; u < nodes.length; u++) if (seen[u] && nodes[u].kind === 'compute') fromIdx = u;
  const from = fromIdx >= 0 ? label(fromIdx) : 'your servers';
  return { msg: `${cap1(plural)} need ${need}. Add one and connect ${from} to it.`, nodeId: stop != null ? nodes[stop].id : undefined, elementId: ids[0] };
}

export function validateModel(S) {
  const { model, catalog, problem } = S;
  const { nodes, T, outAll, inAll } = model;
  const req = problem.requirements;
  const issues = [];
  const add = (level, code, message, nodeId, extra) => issues.push({ level, code, message, ...(nodeId ? { nodeId } : {}), ...(extra || {}) });

  if (!model.sources.length) add('error', 'no-source', 'Add where requests come from: users, devices or partners.');

  for (const [tid, share] of Object.entries(req.mix)) {
    if (!(share > 0)) continue;
    const t = catalog.typeIndex.get(tid);
    const type = catalog.requests[t];
    const weights = sourceWeights(problem, model, t, tid);
    for (const [u, share] of weights) {
      if (share > 0 && !model.route[u * T + t]) {
        add('error', 'source-type-unserved', `${nodeLabel(nodes[u])} sends ${type.plural}, but this source has no route to a part that finishes them. ${unservedMessage(S, t).msg}`, nodes[u].id, { type: tid });
      }
    }
    if (model.sources.length && !weights.length) {
      add('error', 'no-source-type', `No source is assigned to send ${type.plural}. Check the traffic sources.`, undefined, { type: tid });
      continue;
    }
    if (model.sources.length && !nodes.some((n) => n.kind === 'source' && model.H(n.i, t))) {
      add('error', 'no-source-type', `None of your request sources send ${type.plural}. Add a source that does.`, undefined, { type: tid });
      continue;
    }
    if (model.sources.length && !model.typeServed[t]) {
      const why = unservedMessage(S, t);
      add('error', 'type-unserved', why.msg, why.nodeId, { type: tid, ...(why.elementId ? { elementId: why.elementId } : {}) });
      continue;
    }
    const groups = (problem.requires || {})[tid];
    if (groups && model.typeServed[t]) {
      for (const g of groups) {
        if (!g.some((el) => model.pathEls[t].has(el))) {
          const names = g.map((el) => lowerName(catalog.elementById.get(el)?.name || el));
          const present = g.some((el) => model.present.has(el));
          add('error', 'requires-missing', `${cap1(type.plural)} never reach ${names.map(article).join(' or ')}. ${present ? 'Put it on their path.' : 'Add one on their path.'}`, undefined, { type: tid, elementId: g[0] });
        }
      }
    }
  }

  for (const n of nodes) {
    const label = nodeLabel(n);
    const deg = outAll[n.i].length + inAll[n.i].length;
    if (deg === 0) { add('warn', 'disconnected', n.kind === 'source' ? `${label} is not connected to anything, so its requests have nowhere to go.` : `${label} is not connected to anything.`, n.id, n.kind === 'source' ? { source: true } : undefined); continue; }
    if (n.hasZonesKnob && !n.elastic && n.units < n.zones) add('warn', 'zones-units', `${label} spans ${n.zones} zones but has only ${n.units} unit${n.units > 1 ? 's' : ''}. Units must be at least the zone count.`, n.id);
    if (n.kind === 'queue' && !n.isDLQ && (!n.consumers || !n.consumers.length) && inAll[n.i].some((e) => e.kind === 'flow')) add('warn', 'queue-no-consumer', `${label} has nothing reading from it. Connect it to workers or a store.`, n.id);
    if (n.role === 'replica' && n.primaryOf < 0) add('warn', 'replica-unattached', `${label} copies nothing yet. Connect a primary database to it.`, n.id);
    if (n.kind === 'observer') {
      for (const need of n.el.params?.needs || []) {
        const linked = outAll[n.i].some((e) => nodes[e.ti].el.id === need) || inAll[n.i].some((e) => nodes[e.fi].el.id === need);
        if (!linked) add('warn', 'observer-needs', `${label} needs ${catalog.elementById.get(need)?.name || need} connected to it to work.`, n.id);
      }
    }
    if (n.kind === 'store' && n.zones >= 2 && n.replication === 'none') add('info', 'no-standby', `${label} has no replication, so its second zone has no copy to take over.`, n.id);
    if (n.connLimit) {
      let conns = 0;
      for (const c of n.callers) { const cn = nodes[c]; if (cn.kind === 'compute') conns += cn.el.id === 'serverless-fn' ? 250 * cn.units : cn.units * 10; }
      if (conns > n.connLimit) add('warn', 'db-connections', `${label} allows about ${n.connLimit} connections; your servers may open about ${conns}. Put a connection pooler (database proxy) in front.`, n.id);
    }
    if (n.el.id === 'disaster-recovery') {
      const drLoc = S.regionIds.indexOf(n.region);
      if (nodes.some((m) => m.drFrom === n.i && m.loc0 === drLoc)) add('warn', 'dr-same-region', `${label} keeps its standby in the same region it protects. Pick another region.`, n.id);
    }
    if (n.kind === 'cache') {
      for (let t = 0; t < T; t++) {
        if (!(S.mixArr[t] > 0)) continue;
        for (const c of n.callers) {
          const r = model.route[c * T + t];
          if (r && r.side && !r.miss.length && r.P.some((ei) => model.edges[ei].ti === n.i)) {
            add('warn', 'cache-no-origin', `${label} has nothing behind it: on a miss there is no database to ask.`, n.id);
            t = T; break;
          }
        }
      }
    }
  }

  for (const c of req.compliance || []) {
    if (!checkCompliance(S, c)) {
      const def = S.world.complianceChecks.find((x) => x.id === c);
      // a "Must prove" line the design cannot show yet: the audit will mark it missing and Data safety loses points
      if (def) add('warn', 'compliance-missing', `Missing proof for "${def.name}": ${def.text} Add ${joinNames(def.satisfiedBy.map((id) => catalog.elementById.get(id)?.name || id), 'or')}.`, undefined, { elementId: def.satisfiedBy[0] });
    }
  }
  return issues;
}

export function blockedTypes(S) {
  const { model, catalog, problem } = S;
  const ok = new Uint8Array(model.T).fill(1);
  for (const [tid, groups] of Object.entries(problem.requires || {})) {
    const t = catalog.typeIndex.get(tid);
    if (t == null) continue;
    for (const g of groups) if (!g.some((el) => model.pathEls[t].has(el))) ok[t] = 0;
  }
  return ok;
}

export { M };
