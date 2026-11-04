// End-of-day debrief: verdict, SLO cards, timeline, one story per event, trade-offs and one thing to try next.
import { scoreAll, passOf, passChecks, starsOf, safetyPoints, latencyBar, PASS_TYPE_SHARE, STALE_MAX } from './score.js';
import { fmtNum, fmtClock, withCommas, joinNames } from './util.js';
import { nodeLabel } from './cost.js';
import { responseSec } from './events.js';
import { validateModel } from './validate.js';

const NOTHING = 'Nothing in your design';
const autoOn = (n) => n.kind === 'compute' && !!(n.autoscaleKnob || n.autoscaler >= 0);

// Request sources (clients) with no path out: everything they send fails all day, whatever else happens.
function deadSources(S) {
  const m = S.model;
  return m.nodes.filter((n) => n.kind === 'source' && !m.outAll[n.i].some((e) => e.kind === 'flow'));
}
// Share of all request volume that comes from those sources.
function deadShare(S) {
  const dead = deadSources(S);
  if (!dead.length) return 0;
  let tot = 0, d = 0;
  for (let t = 0; t < S.T; t++) {
    if (t === S.model.attackT || !(S.mixArr[t] > 0)) continue;
    tot += S.mixArr[t];
    for (const n of dead) d += S.mixArr[t] * (S.srcShare[n.i * S.T + t] || 0);
  }
  return tot > 0 ? Math.min(1, d / tot) : 0;
}
function deadNames(S) {
  const names = [...new Set(deadSources(S).map((n) => nodeLabel(n)))];
  return { names: joinNames(names), many: names.length > 1 };
}
const pct = (x) => {
  const v = x * 100;
  if (v >= 99) return (Math.floor(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return String(Math.round(v * 10) / 10);
};

function knobNodes(S, knob, inst) {
  const out = [];
  for (const n of S.model.nodes) {
    let ok = false;
    switch (knob) {
      case 'coalesce': ok = n.kind === 'cache' && (n.coalesce || n.alwaysCoalesce); break;
      case 'zones': ok = (n.kind === 'store' || n.kind === 'cache' || n.kind === 'compute') && n.zones >= 2; break;
      case 'replication': ok = n.kind === 'store' && (n.replication === 'sync' || n.replication === 'quorum'); break;
      case 'backoff': ok = n.backoff === 'exponential' || n.backoff === 'exponential-jitter'; break;
      case 'retries': ok = n.hasRetries && n.retries <= 2; break;
      case 'timeoutMs': ok = n.hasTimeout && n.timeoutMs <= 1000; break;
      case 'readFrom': ok = n.el.id === 'document-db' && n.readFrom === 'primary'; break;
      case 'autoscale': ok = !!(n.autoscaleKnob || n.autoscaler >= 0); break;
      case 'ttlSec': ok = n.el.id === 'dns' && n.ttlSec != null && n.ttlSec <= 60; break;
      case 'retentionDays': ok = n.kind === 'store' && n.retentionDays && n.retentionDays < 7; break;
      case 'warmPool': ok = n.warmPool > 0; break;
      case 'units': {
        const st = inst && inst.stats;
        ok = !!(st && st.N === S.model.N && n.kind === 'compute' && S.unitsCur[n.i] > 1 && st.maxRho[n.i] > 0 && st.maxRho[n.i] < 0.9)
          && !(inst && inst.id === 'zone-outage' && !(n.zones >= 2));
        break;
      }
      default: break;
    }
    if (ok) out.push(n.i);
  }
  return out;
}

// Parts an event could touch: what it targeted or hurt, everything in front of those, and their direct neighbours.
// Null means the event hit all traffic, so every part counts.
function eventReach(S, inst, hurtIdx) {
  const m = S.model;
  const seeds = [...new Set([...inst.effects.flatMap((e) => e.targets || []), ...hurtIdx])];
  if (!seeds.length) return null;
  const near = new Set(seeds), up = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const u = stack.pop();
    for (const e of m.inAll[u]) {
      if (e.kind !== 'flow' && e.kind !== 'tap') continue;
      if (!up.has(e.fi) && !near.has(e.fi)) { up.add(e.fi); stack.push(e.fi); }
    }
  }
  for (const u of seeds) { for (const e of m.outAll[u]) near.add(e.ti); for (const e of m.inAll[u]) near.add(e.fi); }
  // a repeated message is handled by whatever consumes it: the workers behind a queue and the stores they write to
  if (inst.id === 'duplicate-delivery') {
    const seen = new Set(seeds);
    let frontier = [...seeds];
    for (let d = 0; d < 3; d++) {
      const nx = [];
      for (const u of frontier) for (const e of m.outAll[u]) if (e.kind !== 'replication' && !seen.has(e.ti)) { seen.add(e.ti); near.add(e.ti); nx.push(e.ti); }
      frontier = nx;
    }
  }
  return { seeds: new Set(seeds), up, near };
}

// Where a knob setting must sit to act on an event: on the callers ('up'), on the hit part itself ('seed'), or anywhere on its path.
const KNOB_SCOPE = { retries: 'up', backoff: 'up', timeoutMs: 'up', zones: 'seed', replication: 'seed', retentionDays: 'seed', warmPool: 'seed' };

// A deadline climb in reads and sign-ins is not helped by a line for submissions: skip that counter then.
const SUBMIT_TYPES = new Set(['write', 'upload', 'payment', 'batch', 'sync', 'webhook']);
function surgeTypesOf(inst) {
  const e = inst.effects.find((x) => x.op === 'traffic');
  return e && e.params && Array.isArray(e.params.types) && e.params.types.length ? e.params.types : null;
}
function counterApplies(inst, c) {
  if (inst.id === 'deadline-surge' && c.element === 'queue') { const t = surgeTypesOf(inst); return !t || t.some((x) => SUBMIT_TYPES.has(x)); }
  return true;
}

// Helpers are counters (from events.json) present in the design that act on this event: elements on the hit path
// (or watching it, like alerting), and knob settings on the parts concerned. Retry settings count only on callers.
function helpersFor(S, inst, hurtIdx) {
  const { model } = S;
  const reach = eventReach(S, inst, hurtIdx);
  // A crowd hits the requests people are waiting on: a part that only carries background work (reminders, exports)
  // never saw that rush, so it is not listed as having helped.
  const T = S.T;
  const st0 = inst.stats && inst.stats.N === model.N ? inst.stats : null;
  const onRushPath = (u) => {
    const k = model.nodes[u].kind;
    if (k === 'observer' || k === 'control' || k === 'source') return true;
    if (st0 && !(st0.maxLoad[u] > 0)) return false;
    for (let t = 0; t < T; t++) if (S.interactive[t] && t !== model.attackT && S.mixArr[t] > 0 && model.route[u * T + t]) return true;
    return false;
  };
  const inReach = (u, scope = 'any') => {
    if (inst.id === 'duplicate-delivery') return true; // a repeat is caught wherever the design keeps its keys or unique ids
    if (!reach) return inst.def.group !== 'traffic' || onRushPath(u);
    const k = model.nodes[u].kind;
    if (k === 'observer' || k === 'control') return true;
    if (scope === 'up') return (reach.up.has(u) || k === 'source') && !reach.seeds.has(u);
    if (scope === 'seed') return reach.seeds.has(u);
    return reach.up.has(u) || reach.near.has(u) || reach.seeds.has(u);
  };
  const list = [];
  const seen = new Set();
  const add = (elId, how, knob) => { if (!seen.has(elId)) { seen.add(elId); list.push({ id: elId, how, knob }); } };
  for (const c of inst.def.counters || []) {
    if (!counterApplies(inst, c)) continue;
    if (c.element && model.present.has(c.element) && model.present.get(c.element).some((u) => inReach(u))) add(c.element, c.how);
    else if (c.element === 'autoscaler' && model.nodes.some((n) => autoOn(n) && inReach(model.nodes.indexOf(n)))) add(c.element, c.how);
    if (c.knob) {
      const scope = KNOB_SCOPE[c.knob] || 'any';
      for (const u of knobNodes(S, c.knob, inst)) if (inReach(u, scope)) add(model.nodes[u].el.id, c.how, c.knob);
    }
  }
  for (const id of inst.helperIds || []) add(id, (inst.def.counters || []).find((c) => c.element === id)?.how || '');
  return list;
}

// Counters this design lacks for the event (an element not present, or a knob setting found nowhere useful).
function missingCounters(inst, helpers) {
  const have = new Set(helpers.flatMap((x) => [x.id, x.knob].filter(Boolean)));
  return (inst.def.counters || []).filter((c) => counterApplies(inst, c) && (c.element ? !have.has(c.element) : !have.has(c.knob)));
}

function hurtNodes(S, st) {
  if (!st || st.N !== S.model.N) return [];
  const list = [];
  for (const n of S.model.nodes) {
    if (n.kind === 'source') continue;
    const f = st.nodeFail[n.i], o = st.nodeOver[n.i];
    // ignore the steady trickle some parts always drop (a WAF's false positives, for example)
    if (o > 0 || (f >= 1 && f >= 0.005 * (st.nodeIn ? st.nodeIn[n.i] : 0))) list.push({ i: n.i, f, o });
  }
  list.sort((a, b) => b.f - a.f || b.o - a.o || a.i - b.i);
  return list.slice(0, 3).map((x) => x.i);
}

function placeholders(def) {
  const set = new Set();
  for (const s of Object.values(def.debrief || {})) for (const m of String(s).matchAll(/\{(\w+)\}/g)) set.add(m[1]);
  return set;
}

const fmtCount = (n) => (n < 10 ? String(Math.round(n)) : fmtNum(n));
// "servers", "nodes", "workers": what one unit of this part is called, in the plural
export function unitsWord(n) {
  const l = (n && n.el && n.el.units && n.el.units.label) || 'unit';
  return /s$/.test(l) ? l : l + 's';
}

// Queues that fell behind: the one whose late work counts most, with what arrived and what its consumers finished.
function worstQueue(S) {
  let best = null;
  for (const u of S.queueNodes || []) {
    const n = S.model.nodes[u];
    const q = S.qHist && S.qHist.get(n.id);
    if (!q || !(q.late > 0)) continue;
    if (!best || q.late > best.q.late) best = { n, q };
  }
  if (!best) return null;
  const cons = Array.from(best.n.consumers || [], (ei) => S.model.nodes[S.model.edges[ei].ti]);
  return { ...best, cons };
}
const lim2 = (q) => Math.round(q.limitSec / 60);
function queueAdvice(S, wq) {
  const { n, q, cons } = wq;
  const c = cons.find((x) => x.kind === 'compute') || cons[0];
  const lim = Math.round(q.limitSec / 60);
  const arrived = fmtNum(q.peakIn);
  if (!c) return { text: `${nodeLabel(n)} fell behind: nothing reads from it fast enough. Connect workers to it.`, nodeId: n.id, elementId: 'worker-pool' };
  const units = Math.max(1, Math.round(S.unitsCur[c.i]));
  // the consumers had room: what sits behind them set the pace
  if (q.capAtPeak * 0.95 >= q.peakIn) {
    let lim = null, lu = 0;
    const seen = new Set([c.i]);
    const stack = [c.i];
    while (stack.length) {
      const u = stack.pop();
      for (const e of S.model.outAll[u]) {
        if (e.kind !== 'flow' || seen.has(e.ti)) continue;
        seen.add(e.ti); stack.push(e.ti);
        const x = S.model.nodes[e.ti];
        if (x.hasCap && S.peakUtil[e.ti] > lu) { lu = S.peakUtil[e.ti]; lim = x; }
      }
    }
    if (!lim || lu < 0.9) {
      // nothing was full: the consumers stopped for a while (an outage or a failing dependency) and the line grew
      const oneZone = c.hasZonesKnob && !c.elastic && c.zones < 2 && S.instances.some((i) => i.id === 'zone-outage' && i.started);
      const fix = oneZone ? `Spread ${nodeLabel(c)} over 2 or 3 zones so a zone failure does not stop it.` : `Give ${nodeLabel(c)} spare ${unitsWord(c)} and a dead-letter queue, so work keeps moving when part of it fails.`;
      return { text: `${nodeLabel(n)} fell behind while ${nodeLabel(c)} could not finish its work for a while, so work waited more than ${lim2(q)} minutes in line. ${fix}`, nodeId: c.id, knob: oneZone ? 'zones' : (c.el.knobs || []).includes('units') ? 'units' : undefined };
    }
    if (lim && lu >= 0.9) {
      const lead = `${nodeLabel(n)} fell behind: ${nodeLabel(c)} had room, but ${nodeLabel(lim)} behind it was full (≈ ${busyPct(lu)} percent busy at its peak), so work waited more than ${lim2(q)} minutes in line.`;
      const lk = lim.el.knobs || [];
      if (lk.includes('units')) return { text: `${lead} Add ${unitsWord(lim)} to ${nodeLabel(lim)}.`, nodeId: lim.id, knob: 'units' };
      if (lk.includes('tier')) return { text: `${lead} Give ${nodeLabel(lim)} a bigger size.`, nodeId: lim.id, knob: 'tier' };
      return { text: `${lead} ${fixedFix(lim)}`, nodeId: lim.id, elementId: lim.el.id };
    }
  }
  const finished = q.capAtPeak > 0 ? fmtNum(q.capAtPeak * 0.95) : null;
  const need = q.capAtPeak > 0 && !c.elastic ? Math.ceil((units * q.peakIn) / (q.capAtPeak * 0.95 * 0.7)) : 0;
  const more = need > units ? ` About ${withCommas(need)} ${unitsWord(c)} would keep up with about 30 percent spare.` : '';
  const pace = finished ? `about ${arrived} messages a second arrived at peak and ${nodeLabel(c)} could finish about ${finished}` : `about ${arrived} messages a second arrived at peak, faster than ${nodeLabel(c)} could finish them`;
  return { text: `${nodeLabel(n)} fell behind: ${pace}, so the line kept growing and work waited more than ${lim} minutes. Add ${unitsWord(c)} to ${nodeLabel(c)}.${more}`, nodeId: c.id, knob: (c.el.knobs || []).includes('units') ? 'units' : undefined };
}

export const busyPct = (u) => (u > 5 ? 'more than 500' : String(Math.round(u * 100)));

function varsFor(S, inst, hurtIdx, helpers) {
  const { catalog, model } = S;
  const nodes = model.nodes;
  const st = inst.stats || { failed: 0, peakOffered: 0, ticks: 0, lowTicks: 0, nodeOver: [], maxP99: 0, stale: 0, dup: 0, lost: inst.pendingLost || 0, costExtra: 0, maxBacklog: 0, maxWait: 0, maxInfP99: 0, capLost: 0, attackOff0: 0, attackDrop0: 0 };
  const p = {};
  for (const ef of inst.effects) Object.assign(p, ef.params);
  const primaryEf = inst.effects[0];
  const targetIdx = inst.effects.flatMap((e) => e.targets || []);
  let mainIdx = targetIdx.length && inst.def.group !== 'traffic' ? (hurtIdx.find((u) => targetIdx.includes(u)) ?? targetIdx[0]) : (hurtIdx.length ? hurtIdx[0] : (targetIdx[0] ?? -1));
  if (inst.id === 'cache-stampede' && inst.stats && inst.stats.baseLoad) {
    // the story is about what sits behind the cache: pick the part whose load jumped the most
    let best = -1, br = 0;
    for (const c of targetIdx) {
      for (const s of [...model.behind[c], ...model.nodes[c].callers.flatMap((u) => model.outFlow[u].map((e) => e.ti))]) {
        if (nodes[s].kind !== 'store') continue;
        const b = inst.stats.baseLoad[s], m = inst.stats.maxLoad[s];
        const ratio = b > 0 ? m / b : 0;
        if (ratio > br) { br = ratio; best = s; }
      }
    }
    if (best >= 0) mainIdx = best;
  }
  if ((inst.def.group === 'security') && inst.stats && inst.stats.wasteNode >= 0 && !hurtIdx.length) mainIdx = inst.stats.wasteNode;
  // a hot item that overloads a part in front of the keyed stores is that part's story
  if (inst.id === 'hot-key' && hurtIdx.length && !hurtIdx.some((u) => targetIdx.includes(u))) mainIdx = hurtIdx[0];
  const durMin = Math.max(1, Math.round((inst.endMs - inst.atMs) / 60000));
  const overMin = mainIdx >= 0 && st.nodeOver && st.nodeOver[mainIdx] ? Math.round((st.nodeOver[mainIdx] * S.dt) / 60) : 0;
  const badMin = Math.round(((st.badTicks || 0) * S.dt) / 60);
  const typesHit = new Set();
  for (const ef of inst.effects) for (const t of ef.params.types || []) typesHit.add(t);
  if (!typesHit.size) {
    for (const u of targetIdx) for (const c of nodes[u].el.completes || []) if (S.problem.requirements.mix[c]) typesHit.add(c);
  }
  const typeNames = [...typesHit].map((t) => catalog.requestById.get(t)?.plural || t);
  const attackOff = (S.attackOffered || 0) - (st.attackOff0 || 0);
  const attackDrop = (S.attackDropped || 0) - (st.attackDrop0 || 0);
  const wastePct = Math.round(Math.min(100, (st.maxWaste || 0) * 100));
  let factor = p.factor ?? p.factorOfPeak;
  if (inst.id === 'retry-storm' && mainIdx >= 0 && st.baseLoad) {
    const b = st.baseLoad[mainIdx], m = st.maxLoad[mainIdx];
    factor = b > 0 ? Math.max(1, Math.round((m / b) * 10) / 10) : 1;
  }
  if (inst.id === 'cache-stampede' && mainIdx >= 0 && st.baseLoad) {
    const b = st.baseLoad[mainIdx], m = st.maxLoad[mainIdx];
    factor = b > 0 ? Math.max(1, Math.round((m / b) * 10) / 10) : 1;
  }
  const ef0 = primaryEf || { st: {} };
  const resp = inst.effects.find((e) => e.st && e.st.response)?.st.response;
  const minutesByOp = () => {
    switch (inst.def.group) {
      case 'traffic': {
        if (inst.id !== 'retry-storm') return Math.max(overMin, badMin);
        const blip = inst.effects.find((e) => e.op === 'fail');
        return Math.max(0, overMin - Math.round(((blip ? blip.endMs - blip.startMs : 120000) / 60000)));
      }
      default: break;
    }
    if (inst.id === 'memory-leak') return resp ? Math.round(resp.detect / 60) : durMin;
    if (inst.id === 'poison-message') return durMin;
    if (inst.id === 'data-corruption') {
      const ef = inst.effects.find((e) => e.op === 'corrupt');
      if (ef && ef.st.prevented) return 0;
      if (ef && ef.st.restoreSec) return Math.round(ef.st.restoreSec / 60);
      return Math.round(responseSec(S, 'corrupt', false).total / 60);
    }
    return durMin;
  };
  const callers = mainIdx >= 0 ? model.inAll[mainIdx].map((e) => nodes[e.fi]).filter((n) => n.hasTimeout) : [];
  const timeoutMs = callers.length ? Math.max(...callers.map((n) => n.timeoutMs)) : 30000;
  const limitEf = inst.effects.find((e) => e.op === 'limit');
  const cap = limitEf && limitEf.st.cap && limitEf.st.cap.size ? [...limitEf.st.cap.values()][0] : 0;
  const zoneEf = inst.effects.find((e) => e.op === 'zoneDown');
  const regionEf = inst.effects.find((e) => e.op === 'regionDown' || e.op === 'regionShift');
  const regionIdx = regionEf ? regionEf.st.region : model.homeIdx;
  const audit = inst.audit || { passed: [], failed: [], total: 0 };
  const checkName = (id) => (S.world.complianceChecks.find((c) => c.id === id)?.name || id).toLowerCase();
  const failEf = inst.effects.find((e) => e.op === 'fail');
  const bag = {
    factor: fmtNum(Number(factor) || 1),
    peakRps: fmtNum(st.peakOffered || 0),
    node: mainIdx >= 0 ? nodeLabel(nodes[mainIdx]) : 'your system',
    minutes: String(minutesByOp()),
    failed: fmtCount(Math.max(0, st.failed || 0)),
    helper: helpers.length ? joinNames(helpers.map((x) => catalog.elementById.get(x.id)?.name || x.id)) : NOTHING,
    rampSec: String(p.rampSec ?? 0),
    rampHours: String(Math.round(((p.rampSec || 0) / 3600) * 10) / 10),
    share: String(Math.round((p.share ?? 0) * 1000) / 10),
    lagMinutes: String(Math.round((st.maxWait || 0) / 60)),
    seconds: String(Math.round(failEf?.st.downSec ?? (p.durationSec || 0))),
    lostWrites: fmtCount(st.lost || 0),
    lagSec: String(p.lagSec ?? 0),
    stale: fmtCount(st.stale || 0),
    zone: zoneEf ? ['a', 'b', 'c'][zoneEf.st.zone] : 'a',
    region: S.world.regions[regionIdx]?.name || 'your region',
    downMinutes: String(Math.round((st.lowTicks || 0) * S.dt / 60)),
    addLatencyMs: fmtNum(p.addLatencyMs || 0),
    timeoutMs: fmtNum(timeoutMs),
    capacityLostPct: String(Math.round((st.capLost || 0) * 100)),
    types: typeNames.length ? joinNames(typeNames) : 'requests',
    passed: String(audit.passed.length),
    total: String(audit.total),
    missing: audit.failed.length ? joinNames(audit.failed.map(checkName)) : 'nothing',
    blockedPct: String(attackOff > 0 ? Math.round((attackDrop / attackOff) * 100) : 0),
    wastePct: String(wastePct),
    errorPct: String(Math.round(((inst.effects.find((e) => e.st && e.st.rate != null)?.st.rate) ?? p.errorRate ?? 0) * 100)),
    pct: String(Math.round((p.perHour || 0) * 100)),
    p99: fmtNum(Math.round(st.maxP99 || 0)),
    addMs: fmtNum(p.addMs || 0),
    backlog: fmtNum(st.maxBacklog || 0),
    duplicates: fmtCount(st.dup || 0),
    conflicts: fmtNum(S.conflicts || 0),
    cap: fmtNum(cap),
    costDelta: withCommas((st.costExtra || 0) * 30),
    hours: String(Math.round(((inst.endMs - inst.atMs) / 3600000) * 10) / 10),
    waitSec: String(Math.round((st.maxInfP99 || 0) / 1000)),
  };
  inst.mainIdx = mainIdx;
  inst.bag = bag;
  const want = placeholders(inst.def);
  const vars = {};
  for (const k of want) vars[k] = bag[k] ?? '0';
  return vars;
}


// ---- event stories: the template sentences from events.json, chosen and corrected by what was measured
const fillT = (t, vars) => (t ? String(t).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')) : '');
const SINGULAR = { requests: 'request', writes: 'write', calls: 'call', minutes: 'minute', records: 'record', messages: 'message', seconds: 'second', hours: 'hour', reads: 'read', submissions: 'submission' };
function tidy(text) {
  if (!text) return text;
  return text
    .replace(/\bfor 0 minutes\b/g, 'for under a minute')
    .replace(/\bin the first 0 minutes\b/g, 'in the first minute')
    .replace(/\bover 0 minutes\b/g, 'within a minute')
    .replace(/\b0 minutes\b/g, 'under a minute')
    .replace(/\b(?<![.\d])1 (requests|writes|calls|minutes|records|messages|seconds|hours|reads|submissions)\b/g, (_, w) => '1 ' + SINGULAR[w]);
}

function damageOf(S, inst, hurtIdx) {
  const st = inst.stats;
  if (!st) return { any: false, failShare: 0 };
  const rawShare = st.offered > 0 ? st.failed / st.offered : 0;
  // requests from a client with no path fail all day: they are not this event's doing
  const dead = deadShare(S);
  const failShare = Math.max(0, rawShare - dead * 1.05);
  const lat = Object.values(S.problem.requirements.latencyP99Ms || {});
  const latTarget = lat.length ? Math.min(...lat) : 200;
  const audit = inst.audit;
  const cost = ((st.costExtra || 0) * 30) >= 25; // a few dollars on a monthly bill teaches nothing
  const any = failShare > 0.001 || (st.lost || 0) >= 1 || (st.dup || 0) >= 1 || (st.stale || 0) >= 1
    || (audit && audit.failed.length > 0) || (inst.def.group === 'cost' && cost)
    || ((inst.id === 'poison-message' || inst.id === 'celebrity-fanout') && (st.maxWait || 0) > 120)
    || ((inst.id === 'cold-start' || inst.id === 'overseas-launch' || inst.id === 'noisy-neighbor' || inst.id === 'slow-dependency') && st.maxP99 > latTarget);
  return { any, failShare, rawShare, dead };
}

function storyFor(S, inst, varsIn, hurtIdx, helpers) {
  let vars = varsIn;
  const { catalog, model } = S;
  const def = inst.def;
  const t = def.debrief || {};
  const dmg = damageOf(S, inst, hurtIdx);
  vars = { ...(inst.bag || {}), ...vars };
  const ef = (op) => inst.effects.find((e) => e.op === op);
  const targeted = inst.effects.some((e) => e.sel && e.sel !== 'traffic');
  const anyTarget = inst.effects.some((e) => (e.targets || []).length);
  let headline = fillT(t.headline, vars);
  let hurt = fillT(t.hurt, vars);
  let helped = null;
  let fix = fillT(t.fix, vars);
  const name = (x) => catalog.elementById.get(x.id)?.name || x.id;
  const hows = helpers.map((x) => `${name(x)}: ${x.how}`.trim()).join(' ');

  // An event aimed at a kind of part the design does not have changes nothing.
  if (targeted && !anyTarget && def.group !== 'traffic' && def.group !== 'compliance' && inst.id !== 'zone-outage' && inst.id !== 'region-outage') {
    return { headline: `${def.name}: nothing in your design was exposed to it.`, hurt: null, helped: null, fix: null, none: true };
  }

  // a climb in some request types is told in those words, and its advice fits them
  if (inst.id === 'deadline-surge') {
    const types = surgeTypesOf(inst);
    if (types) {
      const names = joinNames(types.map((x) => catalog.requestById.get(x)?.plural || x));
      headline = headline && headline.replace(/traffic rose/, `${names} rose`);
      hurt = hurt && hurt.replace(/ submissions /, ' requests ');
      if (!types.some((x) => SUBMIT_TYPES.has(x))) {
        const parts = [];
        if (types.some((x) => x === 'read' || x === 'search' || x === 'report')) parts.push('serve the repeated reads from a cache or a CDN');
        if (types.includes('login')) parts.push('give the sign-in step room before the climb');
        if (parts.length) fix = `${parts.join(' and ').replace(/^./, (c) => c.toUpperCase())}, and scale on a schedule: new servers take minutes to start.`;
      }
    }
  }
  const mainNode = inst.mainIdx >= 0 ? model.nodes[inst.mainIdx] : (hurtIdx.length ? model.nodes[hurtIdx[0]] : null);
  // A leaked key does its harm while it still works: the time to rotate it is the exposure, whatever the load did.
  if (inst.id === 'key-leak') {
    const kl = ef('keyLeak');
    if (kl && kl.st.none) {
      return { headline: tidy(headline), hurt: 'The secrets manager rotated the key in about 2 minutes with no redeploy (approx.), so the leaked copy stopped working almost at once.', helped: tidy(hows) || null, fix: null };
    }
    const mins = kl ? Math.max(1, Math.round((kl.endMs - kl.startMs) / 60000)) : 20;
    const failed = dmg.failShare > 0.001 ? `, and ${vars.failed} requests failed while capacity was halved` : ', and capacity was halved meanwhile';
    const kms = S.model.ops.kms ? ' Key management let you disable the old key quickly, which halved the window.' : '';
    return {
      headline: tidy(headline),
      hurt: tidy(`The leaked key stayed usable for about ${mins} minutes while every service was redeployed with a new one${failed}. Anyone who copied it in that window could act as your service.${kms}`),
      helped: helpers.length ? tidy(`In place, but not enough on its own here. ${hows}`) : null,
      fix: 'Keep keys in a secrets manager, so a rotation takes minutes and needs no redeploy.',
    };
  }
  if (dmg.any) {
    switch (inst.id) {
      case 'zone-outage': {
        const z = ef('zoneDown');
        const rec = z && z.st.perNode && mainNode ? z.st.perNode.get(mainNode.i) : null;
        if (!rec || !(rec.until > inst.atMs)) hurt = `${vars.node} lost its units in zone ${vars.zone} and ${vars.failed} requests failed.`;
        break;
      }
      case 'hot-key':
        if (!mainNode || !mainNode.keyed || S.unitsCur[mainNode.i] <= 1) hurt = `${vars.node} overloaded on the hot item and ${vars.failed} requests failed.`;
        break;
      case 'thundering-herd':
        hurt = `${vars.node} was overwhelmed by the reconnect wave and ${vars.failed} requests failed.`;
        break;
      case 'retry-storm':
        if (vars.minutes === '0') hurt = `Retries hit ${vars.node} hard and ${vars.failed} requests failed.`;
        break;
      case 'viral-spike':
        if (vars.minutes === '0') hurt = `${vars.node} could not keep up and ${vars.failed} requests failed.`;
        break;
      case 'flash-crowd':
        if (vars.minutes === '0') hurt = `${vars.failed} requests failed while ${vars.node} was overwhelmed.`;
        break;
      case 'network-partition': {
        const refused = Number(String(vars.failed).replace(/[^\d.]/g, '')) > 0, conflicts = Number(String(vars.conflicts || '0').replace(/[^\d.]/g, '')) > 0;
        if (refused && conflicts) hurt = `${vars.failed} requests were refused, and ${vars.conflicts} writes made on both sides conflict and need fixing.`;
        else if (conflicts) hurt = `${vars.conflicts} writes made on both sides of the split conflict and need fixing.`;
        else hurt = `${vars.failed} requests were refused while the regions could not talk. No conflicting writes were made.`;
        break;
      }
      default: break;
    }
  } else {
    const calm = {
      'zone-outage': 'Nothing went dark: every part carried on from the other zones.',
      'region-outage': 'Users kept being served and no write was lost.',
      'compliance-audit': 'Nothing was missing.',
      'duplicate-delivery': 'No duplicate went through.',
      'replication-lag': 'No one saw old data.',
      'cost-blowout': 'The bill barely moved.',
      'cardinality-explosion': 'The bill barely moved.',
    };
    if (inst.id === 'zone-outage' && !S.model.nodes.some((n) => n.zones >= 2 && n.kind !== 'source')) calm['zone-outage'] = 'Nothing went dark: the parts in your design are managed services that already span zones.';
    if (!S.problem.requirements.readYourWrites) calm['replication-lag'] = 'Copies fell behind for a while, which this product allows: nobody here needs to see their own change at once.';
    hurt = calm[inst.id] || 'No visible damage: almost every request succeeded.';
    const fo = inst.id === 'db-failover' ? inst.effects.find((e) => e.op === 'fail') : null;
    if (fo && fo.st.failover) hurt = `No visible damage: ${fo.st.failover === 'consensus' ? 'the cluster re-elected a leader and kept serving' : fo.st.failover === 'shard' ? "the shard's standby took over while the other shards kept serving" : 'the standby took over quickly'}.`;
    fix = null;
  }

  // A crowd that did not overload the part that failed is not what failed it: an outage that overlapped did.
  let overlapOk = false;
  if (dmg.any && def.group === 'traffic' && inst.id !== 'retry-storm' && hurtIdx.length && inst.stats && inst.stats.N === model.N && inst.stats.maxRho && hurtIdx.every((u) => !(inst.stats.maxRho[u] > 1))) {
    const hn = hurtIdx[0];
    const other = S.instances.find((o) => o !== inst && o.started && o.def.group !== 'traffic' && o.atMs < inst.endMs && o.endMs > inst.atMs
      && o.effects.some((e) => (e.op === 'zoneDown' || e.op === 'regionDown' || e.op === 'fail') && (e.targets || []).some((u) => hurtIdx.includes(u))));
    if (other) {
      hurt = `${vars.failed} requests failed in this window, but ${vars.node} was not overloaded by the crowd. They failed because of the ${other.def.name.toLowerCase()} at ${fmtClock(other.atMs)}, told below.`;
      fix = null;
      overlapOk = true;
    }
  }

  // Event-specific facts that the general templates cannot express.
  if (inst.id === 'retry-storm') {
    const st = inst.stats;
    const peak = st && inst.mainIdx >= 0 && st.maxRho ? st.maxRho[inst.mainIdx] : 0;
    if (Number(vars.factor) < 1.15 || peak <= 1) {
      headline = Number(vars.factor) < 1.15 ? `Retry storm: a short blip hit ${vars.node}, and retries added almost no load.`
        : `Retry storm: a short blip at ${vars.node} drew ${vars.factor} times the load, and it had the room to take it.`;
      hurt = Number(vars.failed.replace(/[^\d.]/g, '')) > 0 ? `Only the blip's own errors failed: ${vars.failed} requests. Retries did not pile on.` : 'No visible damage: retries did not pile on.';
      fix = null;
      if (helpers.length) return { headline: tidy(headline), hurt: tidy(hurt), helped: tidy(hows), fix: null };
      return { headline: tidy(headline), hurt: tidy(hurt), helped: null, fix: null };
    }
  }
  if (inst.id === 'retry-storm' && fix && mainNode) {
    // with no server tier in front of the part that failed, the retrying is done by the users' apps
    const callers = model.inAll[mainNode.i].map((e) => model.nodes[e.fi]);
    const direct = callers.length && callers.every((c) => c.kind === 'source' || ((c.kind === 'router' || c.kind === 'filter') && model.inAll[c.i].every((e) => model.nodes[e.fi].kind === 'source')));
    if (direct) {
      const srcs = joinNames([...new Set(model.nodes.filter((n) => n.kind === 'source').map((n) => nodeLabel(n)))]);
      fix = `Here the retrying is done by your users' apps, which call ${nodeLabel(mainNode)} directly. Select ${srcs} and set their backoff to exponential with jitter and at most 2 retries; a rate limiter in front caps what still arrives.`;
    }
  }
  const corrupt = ef('corrupt');
  if (corrupt) {
    if (corrupt.st.prevented) {
      headline = 'A bad migration was stopped before it ran.';
      hurt = 'Migration checks in the release pipeline caught it. No records were damaged.';
      fix = null;
    } else if (corrupt.st.restoring) {
      hurt = `About ${vars.share} percent of the rows in ${vars.node} were wrong until the restore from backup finished ${vars.minutes} minutes later (about an hour per terabyte, approx.). Writes waited while it ran.`;
    } else {
      hurt = `${fmtCount(corrupt.st.atRisk || 0)} rows were wrong, and with no backup there was nothing to restore them from.`;
    }
  }
  const failEf = ef('fail');
  if (failEf && failEf.st.failover === 'consensus') {
    headline = `Database failover: one node of ${vars.node} died; its share of leaders was re-elected in about ${vars.seconds} seconds.`;
  }
  if (failEf && failEf.st.failover === 'shard') {
    headline = `Database failover: one shard of ${vars.node} was down for ${vars.seconds} seconds while its standby took over.`;
  }
  const limit = ef('limit');
  if (limit && !(limit.st.cap && limit.st.cap.size)) return { headline: `${def.name}: nothing in your design calls an outside service.`, hurt: null, helped: null, fix: null, none: true };
  if (inst.id === 'compliance-audit' && inst.audit && !inst.audit.failed.length) fix = null;

  if (helpers.length) helped = dmg.any && dmg.failShare > 0.01 ? `In place, but not enough on its own here. ${hows}` : hows;
  // a standby plan only brings back the parts wired to it
  if (inst.id === 'region-outage' && dmg.any && model.nodes.some((n) => n.el.id === 'disaster-recovery')) {
    const left = (ef('regionDown')?.targets || []).map((u) => model.nodes[u]).filter((n) => n.drFrom < 0 && n.kind !== 'observer' && n.kind !== 'control');
    if (left.length) helped = `${helped ? helped + ' ' : ''}The disaster-recovery plan only brings back the parts connected to it; ${joinNames(left.slice(0, 4).map((n) => nodeLabel(n)))} stayed down for the whole outage.`;
  }
  else if (dmg.any && inst.id === 'db-failover' && failEf && failEf.st.failover) {
    helped = failEf.st.failover === 'consensus' ? 'The cluster re-elected a leader on its own, so the other nodes kept serving while it did.'
      : failEf.st.failover === 'shard' ? 'The standby of that shard took over on its own, and the other shards kept serving.'
        : 'The standby took over on its own after the switchover wait.';
  }
  else if (dmg.any && !helped) helped = `${NOTHING} softened it.`;
  if (overlapOk) helped = helpers.length ? hows : null;

  // a problem about hot keys gets the hot-key idea, not only the general counter
  if (fix && inst.id === 'hot-key' && (S.problem.concepts || []).includes('hot-keys')) fix = `${fix} For a ranked table, keep a sorted set in memory so the top board is one cheap read, and keep a very popular item's counter in several copies that are added up when read.`;
  // "What would help" only lists counters the design lacks, and stays quiet when what is there kept the damage small.
  if (fix && !missingCounters(inst, helpers).length) fix = null;
  const st = inst.stats || {};
  if (fix && helpers.length && dmg.failShare < 0.05 && !((st.lost || 0) >= 1) && !((st.dup || 0) >= 1)) fix = null;
  // the failures of a client with no path belong to that client, not to the event
  if (dmg.dead > 0 && dmg.rawShare > 0.001 && def.group !== 'cost') {
    const dn = deadNames(S);
    const note = dmg.any ? ` Part of what failed in this window came from ${dn.names} having no path out, which fails all day whatever the event does.` : ` The requests that failed here came from ${dn.names} having no path out, not from this event.`;
    hurt = (hurt ? hurt + ' ' : '') + note.trim();
  }
  // advice reads the actual settings: autoscaling that is already on is not asked for again
  if (fix && /autoscal/i.test(fix) && model.nodes.some(autoOn)) {
    fix = fix.replace(/,? and turn on autoscaling\./i, '. Autoscaling is already on, but new servers take minutes to start, so keep spare units for the first minutes.').replace(/turn on autoscaling/gi, 'raise the autoscaling ceiling');
  }
  // a bill that rose by $0 is no damage: leave the cost line out
  const zeroCost = (x) => typeof x === 'string' && /\$0(?![\d,.])/.test(x);
  if (zeroCost(hurt)) hurt = 'No visible damage: the bill barely moved.';
  if (zeroCost(helped)) helped = null;
  if (zeroCost(fix)) fix = null;
  // no part of the design is a listed counter, yet nothing was hurt: credit what really absorbed it, the room to spare
  if (!helped && !dmg.any && (def.counters || []).length) {
    const mr = inst.stats && inst.stats.N === model.N ? inst.stats.maxRho : null;
    let top = -1, tr = 0;
    if (mr) for (const n of model.nodes) { if (n.kind === 'source' || !n.hasCap) continue; if (mr[n.i] > tr) { tr = mr[n.i]; top = n.i; } }
    helped = top >= 0 && tr > 0 ? (tr <= 0.8 ? `Room to spare: ${nodeLabel(model.nodes[top])} peaked near ${busyPct(tr)} percent busy while this happened.` : `Sized for it: ${nodeLabel(model.nodes[top])} carried it, peaking near ${busyPct(tr)} percent busy.`) : 'Nothing in your design came close to a limit while this happened.';
  }
  return { headline: tidy(headline), hurt: tidy(hurt), helped: tidy(helped), fix: tidy(fix) };
}

// Request types that can never finish (a missing part on their path) and their share of all failed requests.
function blockedOf(S) {
  if (S._blocked) return S._blocked;
  const { model, catalog } = S;
  let failAll = 0;
  const typeFail = new Map();
  for (let t = 0; t < S.T; t++) {
    if (t === model.attackT || !(S.typeOff[t] > 0)) continue;
    const f = Math.max(0, S.typeOff[t] - S.typeSucc[t]);
    failAll += f;
    typeFail.set(catalog.requests[t].id, f);
  }
  let issues = [];
  try { issues = validateModel(S); } catch { issues = []; }
  const blocking = issues.filter((i) => i.level === 'error' && i.type && (i.code === 'type-unserved' || i.code === 'requires-missing' || i.code === 'no-source-type'));
  const types = [...new Set(blocking.map((i) => i.type))];
  const share = failAll > 0 ? types.reduce((a, t) => a + (typeFail.get(t) || 0), 0) / failAll : 0;
  const top = blocking.slice().sort((a, b) => (typeFail.get(b.type) || 0) - (typeFail.get(a.type) || 0))[0] || null;
  S._blocked = { failAll, share, top, types };
  return S._blocked;
}

// Lessons a problem teaches → the events they are about, so the debrief's advice leans on what the problem is for.
const CONCEPT_EVENTS = {
  'hot-keys': ['hot-key'], sharding: ['hot-key'], caching: ['cache-stampede', 'hot-key'], 'rate-limiting': ['retry-storm'],
  'idempotency-retries': ['retry-storm', 'duplicate-delivery'], 'replication-lag': ['replication-lag'], fanout: ['celebrity-fanout'],
  'circuit-breakers': ['slow-dependency'], 'queues-backpressure': ['poison-message'], 'multi-region': ['region-outage'],
};

// A part with no size or count to turn up (a payment processor account, say): name what can be done instead.
function fixedFix(n) {
  const nm = n.el.name ? n.el.name.toLowerCase() : 'it';
  return `It has a fixed size, so add a second ${nm} beside it to share the work, put a bigger queue in front of it, or add rate limiting ahead of it.`;
}

function nextStepCore(S, score, metrics, nodesOut, eventsOut) {
  const { model, catalog, problem } = S;
  const req = problem.requirements;
  const losses = [
    ['reliability', 400 - score.reliability],
    ['latency', 200 - score.latency],
    ['safety', 200 - score.safety],
    ['cost', 200 - score.cost],
  ].sort((a, b) => b[1] - a[1]);
  const [kind, loss] = losses[0];
  const nodes = model.nodes;
  const name = (n) => nodeLabel(n);
  if (loss <= 0) return { text: 'Everything held. Try the daily challenge, or see how low you can take the monthly cost.' };
  if (metrics.availability <= 0.001) return { text: 'Nothing was served. Connect your request sources through servers to a part that finishes each request type, such as a database.' };
  if (kind === 'reliability') {
    // 0. A client with no path out fails everything it sends: that comes before any load or event advice.
    const ds = deadShare(S);
    if (ds >= 0.01) {
      const dn = deadNames(S);
      return { text: `${dn.names} ${dn.many ? 'are' : 'is'} not connected to anything, so about ${Math.round(ds * 100)} percent of requests failed all day. Connect ${dn.many ? 'them' : 'it'} to your servers (drag from its dot).`, nodeId: deadSources(S)[0].id };
    }
    // 1. Request types that can never finish come first: no amount of capacity fixes a missing part.
    const bl = blockedOf(S);
    const failAll = bl.failAll;
    if (bl.top && bl.share >= 0.25) {
      const part = bl.share >= 0.95 ? 'almost all' : `about ${Math.round(bl.share * 100)} percent`;
      return { text: `${bl.top.message} That caused ${part} of the failed requests.`, nodeId: bl.top.nodeId, elementId: bl.top.elementId };
    }
    // 2. Work that waited in a queue past its limit: the consumers behind it are too few.
    const wq = worstQueue(S);
    if (wq && failAll > 0 && (S.lateDay || 0) >= 0.3 * failAll) return { ...queueAdvice(S, wq), lesson: 'queues-backpressure' };
    // 3. One event that caused most of the failures: the advice is about that event and the part it hit.
    let worstInst = null, wFail = 0;
    for (const inst of S.instances) { const f = inst.started && inst.stats ? inst.stats.failed || 0 : 0; if (f > wFail) { wFail = f; worstInst = inst; } }
    // the problem's own lessons rank the advice: an event the problem is about wins when it caused a fair share of the failures
    const taught = new Set((problem.concepts || []).flatMap((c) => CONCEPT_EVENTS[c] || []));
    if (worstInst && !taught.has(worstInst.id)) {
      let tf = 0, ti = null;
      for (const inst of S.instances) { const f = inst.started && inst.stats && taught.has(inst.id) ? inst.stats.failed || 0 : 0; if (f > tf) { tf = f; ti = inst; } }
      if (ti && tf >= 0.1 * failAll) { worstInst = ti; wFail = tf; }
    }
    // ...unless the design was already failing well before that event arrived: then capacity comes first
    const brokeEarlier = worstInst && S.firstBreak && S.firstBreak.atMs < worstInst.atMs - 1800000;
    if (worstInst && failAll > 0 && wFail >= 0.5 * failAll && !brokeEarlier) {
      const ev = (eventsOut || []).find((e) => e.id === worstInst.id && e.atMs === worstInst.atMs);
      const hitIdx = worstInst.mainIdx >= 0 ? worstInst.mainIdx : -1;
      const hn = hitIdx >= 0 ? nodes[hitIdx] : null;
      if (worstInst.id === 'zone-outage' && hn && hn.hasZonesKnob && hn.zones < 2) return { text: `${name(hn)} lived in one zone and went dark when that zone failed. Spread it across 2 or 3 zones.`, nodeId: hn.id, knob: 'zones', eventId: worstInst.id };
      const fix = ev && ev.story && ev.story.fix;
      if (fix) return { text: `The ${worstInst.def.name.toLowerCase()} caused most of the failures. ${fix}`, nodeId: hn ? hn.id : undefined, eventId: worstInst.id };
    }
    // 3. Otherwise the part that failed the most requests over the whole day.
    let worst = -1, wf = 0;
    for (const n of nodes) {
      if (n.kind === 'source') continue;
      // a pass-through part with room to spare fails requests because of what sits behind it
      if ((n.kind === 'router' || n.kind === 'filter') && S.peakUtil[n.i] < 0.9) continue;
      if (S.failedSum[n.i] > wf) { wf = S.failedSum[n.i]; worst = n.i; }
    }
    if (worst < 0) for (const n of nodes) if (n.kind !== 'source' && S.failedSum[n.i] > wf) { wf = S.failedSum[n.i]; worst = n.i; }
    // among the parts that failed a material share, the most overloaded one is the bottleneck to name
    if (worst >= 0) {
      let best = worst;
      for (const n of nodes) {
        if (n.kind === 'source' || n.i === best) continue;
        if ((n.kind === 'router' || n.kind === 'filter') && S.peakUtil[n.i] < 0.9) continue;
        if (S.failedSum[n.i] >= 0.4 * wf && S.peakUtil[n.i] > 1 && S.peakUtil[n.i] > S.peakUtil[best] * 1.1) best = n.i;
      }
      worst = best;
    }
    if (worst < 0) {
      if (worstInst && wFail > 0) return { text: `Most failures came during the ${worstInst.def.name.toLowerCase()}. Read its story above for what would soften it.`, eventId: worstInst.id };
      return { text: 'Requests failed a little everywhere: every part you add can fail on its own. Spread the busiest parts across 2 zones, and keep the chain short.' };
    }
    const n = nodes[worst];
    const overMin = Math.round((S.overTicks[worst] * S.dt) / 60);
    if (overMin >= 1 && (n.kind === 'compute' || n.kind === 'store' || n.kind === 'cache' || n.kind === 'router')) {
      const units = Math.round(S.unitsCur[worst]);
      const peak = S.peakUtil[worst];
      const need = n.elastic || !(peak > 1) ? 0 : Math.ceil((units * peak) / 0.7);
      const busy = peak > 1 ? ` (peak ≈ ${busyPct(peak)} percent busy, overloaded for ≈ ${withCommas(overMin)} minutes of the day)` : '';
      if (n.kind === 'compute') {
        const more = need > units ? (peak < 3 ? ` About ${withCommas(need)} units would peak near 70 percent.` : ' Peak load is several times what this part can do. Count the units you need from the peak, keep about 30 percent spare, and let autoscaling cover spikes.') : '';
        const more2 = more.replace(' units ', ` ${unitsWord(n)} `);
        if (!n.autoscaleKnob && n.autoscaler < 0 && (n.el.knobs || []).includes('autoscale')) return { text: `${name(n)} ran out of room${busy}. Add ${unitsWord(n)} and turn on autoscaling.${more2}`, nodeId: n.id, knob: 'autoscale' };
        return { text: `${name(n)} ran out of room${busy}. Add ${unitsWord(n)} so it peaks under about 70 percent busy.${more2}`, nodeId: n.id, knob: 'units' };
      }
    }
    if (n.kind === 'lookaside' && (n.el.knobs || []).includes('units')) {
      const peak = S.peakUtil[n.i];
      const units = Math.round(S.unitsCur[n.i]);
      const need = peak > 1 ? Math.min(n.el.units.max, Math.ceil((units * peak) / 0.7)) : 0;
      const busy = peak > 1 ? ` (peak ≈ ${busyPct(peak)} percent busy, overloaded for ≈ ${withCommas(Math.max(1, overMin))} minutes of the day)` : '';
      return { text: `${name(n)} ran out of room${busy}. Raise its ${unitsWord(n)} so it peaks under about 70 percent busy.${need > units ? ` About ${withCommas(need)} ${unitsWord(n)} would do it.` : ''}`, nodeId: n.id, knob: 'units' };
    }
    if (n.kind === 'external') return { text: `Calls to ${name(n)} failed. Put a queue in front so work waits instead of failing, and add a circuit breaker.`, nodeId: n.id, elementId: 'queue' };
    if (n.isCB) {
      const dep = model.outFlow[n.i].map((e) => nodes[e.ti]).find((x) => x.kind === 'external' || x.kind === 'store');
      return { text: `${name(n)} failed calls fast while ${dep ? name(dep) : 'what it guards'} was slow or down. Put a queue in front so that work waits and finishes later instead of failing.`, nodeId: n.id, elementId: 'queue' };
    }
    if (n.kind === 'store') {
      const reads = (req.mix.read || 0) + (req.mix.search || 0);
      if (reads >= 0.6 && !model.present.has('cache') && !model.present.has('distributed-cache')) return { text: `${name(n)} ran out of room. Most traffic is reads: put a cache in front of it.`, nodeId: n.id, elementId: 'cache' };
      if ((n.el.knobs || []).includes('units')) return { text: `${name(n)} ran out of room. Add ${unitsWord(n)} so it peaks under about 70 percent busy.`, nodeId: n.id, knob: 'units' };
      if (n.role === 'primary' && reads >= 0.5) return { text: `${name(n)} ran out of room. Add read replicas, or a bigger size.`, nodeId: n.id, elementId: 'sql-replica' };
      if (!(n.el.knobs || []).includes('tier')) return { text: `${name(n)} ran out of room. ${fixedFix(n)}`, nodeId: n.id, elementId: n.el.id };
      return { text: `${name(n)} ran out of room. Use a bigger size, or put a queue in front of its writes.`, nodeId: n.id, knob: 'tier' };
    }
    if (n.kind === 'compute') {
      if (!n.autoscaleKnob && n.autoscaler < 0 && (n.el.knobs || []).includes('autoscale')) return { text: `${name(n)} ran out of room. Add ${unitsWord(n)} for headroom and turn on autoscaling.`, nodeId: n.id, knob: 'autoscale' };
      return { text: `${name(n)} ran out of room. Add ${unitsWord(n)} so it peaks under about 70 percent busy.`, nodeId: n.id, knob: 'units' };
    }
    if (n.kind === 'queue') { const w = worstQueue(S); if (w) return { ...queueAdvice(S, w), lesson: 'queues-backpressure' }; return { text: `${name(n)} could not keep up. Add more consumers behind it.`, nodeId: n.id }; }
    return { text: `${name(n)} dropped the most requests. Give it more room or put something in front of it.`, nodeId: n.id, knob: (n.el.knobs || []).includes('units') ? 'units' : undefined };
  }
  if (kind === 'latency') {
    const far = Object.keys(req.userRegions).length > 1 && !model.present.has('cdn');
    let worst = -1, wu = 0;
    for (const n of nodes) if (n.hasCap && n.kind !== 'source' && S.peakUtil[n.i] > wu) { wu = S.peakUtil[n.i]; worst = n.i; }
    if (worst >= 0 && wu > 0.7) {
      const n = nodes[worst];
      const units = Math.round(S.unitsHi[n.i] || S.unitsCur[n.i]);
      const need = !n.elastic && (n.el.knobs || []).includes('units') ? Math.ceil((units * wu) / 0.7) : 0;
      const how = need > units ? ` About ${withCommas(need)} ${unitsWord(n)} would peak near 70 percent.` : '';
      const shrunk = n.kind === 'compute' && S.unitsLo[n.i] < n.units ? ` Autoscaling cut it from ${n.units} to ${Math.round(S.unitsLo[n.i])} ${unitsWord(n)} when it was quiet, and new ones take 2 to 4 minutes to start: set its fewest ${unitsWord(n)} to what the peak needs (at least ${n.units}).` : '';
      const nk = n.el.knobs || [];
      if (!nk.includes('units') && !nk.includes('tier')) return { text: `${name(n)} got busy enough to slow requests (≈ ${busyPct(wu)} percent at its busiest). ${fixedFix(n)}`, nodeId: n.id, elementId: n.el.id };
      const lever = nk.includes('units') ? `Add ${unitsWord(n)}` : 'Use a bigger size';
      return { text: `${name(n)} got busy enough to slow requests (≈ ${busyPct(wu)} percent at its busiest). ${lever} so it stays under about 70 percent.${how}${shrunk}${!shrunk && n.autoscaleKnob && n.kind === 'compute' ? ` Autoscaling needs 2 to 4 minutes to add ${unitsWord(n)}, so raise its fewest to be ready before the spike.` : ''}`, nodeId: n.id, knob: shrunk ? 'autoscale' : nk.includes('units') ? 'units' : 'tier' };
    }
    const priv = req.privateReads || 0;
    if (far && priv >= 0.5) return { text: `Users far from your servers waited on long round trips. About ${Math.round(priv * 100)} percent of reads are personal (a balance, a record, an inbox), and a shared CDN copy cannot answer those, so add a second region close to them.`, elementId: 'global-lb' };
    if (far) return { text: 'Users far from your servers waited on long round trips. Put a CDN in front, or add a second region.', elementId: 'cdn' };
    if ((req.privateReads || 0) >= 0.5) return { text: 'The slow 1 in 100 requests missed the target. Many reads are personal, so keep them in a cache beside your servers (cleared on every write), not in a shared CDN copy, and cut hops on the busy path.', elementId: 'cache' };
    return { text: 'The slow 1 in 100 requests missed the target. Cache hot reads and cut hops on the busy path.', elementId: 'cache' };
  }
  if (kind === 'safety') {
    const L = metrics.ledger;
    if (L.lostWrites >= 1 && req.dataSafety !== 'best-effort') {
      const st = nodes.find((n) => n.kind === 'store' && n.role !== 'replica' && n.customerData) || nodes.find((n) => n.kind === 'store');
      return st ? { text: `Acknowledged writes were lost. Run ${name(st)} across 2 zones with sync replication, and back it up.`, nodeId: st.id, knob: 'replication' } : { text: 'Acknowledged writes were lost. Use sync replication across 2 zones.' };
    }
    if (L.duplicates >= 1) {
      const c = nodes.find((n) => n.kind === 'compute');
      return { text: 'Some payments or messages went through twice. Check an idempotency key before every side effect.', elementId: 'idempotency-store', nodeId: c?.id };
    }
    if (L.complianceFailed.length) {
      const names = L.complianceFailed.map((id) => S.world.complianceChecks.find((c) => c.id === id)).filter(Boolean);
      const els = [...new Set(names.flatMap((c) => c.satisfiedBy.slice(0, 1)))];
      return { text: `The audit found gaps: ${joinNames(names.map((c) => c.name.toLowerCase()))}. Add ${joinNames(els.map((id) => catalog.elementById.get(id)?.name || id))}.`, elementId: els[0] };
    }
    if (L.staleReads > 0) return { text: 'People saw old data, even their own changes. Read recent changes from the primary.', knob: 'readFrom' };
  }
  if (kind === 'cost') {
    let top = -1, usd = 0;
    for (const n of nodesOut) if (n.usd > usd) { usd = n.usd; top = n.id; }
    const n = top != null ? nodes[model.idx.get(top)] : null;
    if (n) {
      const knob = (n.el.knobs || []).includes('units') && S.unitsCur[n.i] > n.el.units.min ? 'units' : ((n.el.knobs || []).includes('tier') ? 'tier' : undefined);
      return { text: `${name(n)} is the biggest line on the bill (≈ $${withCommas(usd)} a month). Trim units or size where the peak allows it.`, nodeId: n.id, knob };
    }
  }
  return { text: 'Retry with one change at a time and compare the debriefs.' };
}

// Which lesson fits the advice: from the part and the lever it names (an event cause is mapped by the caller).
function lessonOfStep(S, step) {
  if (step.lesson || step.eventId) return step.lesson || null;
  const n = step.nodeId != null ? S.model.nodes[S.model.idx.get(step.nodeId)] : null;
  const byEl = { cache: 'caching', cdn: 'cdn', 'global-lb': 'multi-region', queue: 'queues-backpressure', 'sql-replica': 'replication-lag', 'idempotency-store': 'idempotency-retries', 'search-index': 'search-indexing', 'object-storage': 'storage-tiers', 'payment-processor': 'idempotency-retries' };
  if (step.elementId && byEl[step.elementId]) return byEl[step.elementId];
  if (step.knob === 'zones') return 'multi-region';
  if (step.knob === 'autoscale') return 'autoscaling';
  if (step.knob === 'replication' || step.knob === 'readFrom') return 'replication-lag';
  if (n && (step.knob === 'units' || step.knob === 'tier')) return n.kind === 'compute' ? 'autoscaling' : n.kind === 'store' ? 'sharding' : 'back-of-envelope';
  return null;
}

function nextStepOf(S, score, metrics, nodesOut, eventsOut) {
  const step = nextStepCore(S, score, metrics, nodesOut, eventsOut);
  const kind = [['reliability', 400 - score.reliability], ['latency', 200 - score.latency], ['safety', 200 - score.safety], ['cost', 200 - score.cost]].sort((a, b) => b[1] - a[1])[0][0];
  step.kind = kind;
  const lesson = lessonOfStep(S, step);
  if (lesson) step.lesson = lesson;
  // name the other parts that ran over too, so the biggest bottleneck is not read as the only one
  if (kind === 'reliability' && step.nodeId != null && /ran out of room/.test(step.text)) {
    const own = S.model.idx.get(step.nodeId);
    const more = S.model.nodes.filter((n) => n.kind !== 'source' && n.i !== own && S.peakUtil[n.i] > 1 && Math.round((S.overTicks[n.i] * S.dt) / 60) >= 5)
      .sort((a, b) => S.peakUtil[b.i] - S.peakUtil[a.i]).slice(0, 2);
    if (more.length) step.text += ` ${joinNames(more.map((n) => nodeLabel(n)))} also ran over (peak ≈ ${joinNames(more.map((n) => busyPct(S.peakUtil[n.i])))} percent busy).`;
  }
  return step;
}

// A day can hold while a side part (a copy, a report store, an audit tap) is badly overloaded: its losses do not
// fail user requests, so they are listed here instead of hiding behind a green verdict.
// A CDN is one copy shared by everyone, so it can only answer reads that are the same for every user (a price list, a
// product page). Balances, records and sign-in state belong to one person, so they always travel on to your servers.
function privateCacheWarnings(S) {
  const priv = S.privateReads || 0;
  if (!(priv >= 0.2)) return [];
  const out = [];
  for (const n of S.model.nodes) {
    if (!n.edgeCache) continue;
    out.push({ nodeId: n.id, text: `${nodeLabel(n)} is one copy shared by everyone. About ${Math.round(priv * 100)} percent of reads here are personal (a balance, a record, a sign-in state), so it cannot answer them and they still reach your servers. Cache only the public reads there, and keep personal data in a cache beside your servers, kept apart per user and cleared on every write.` });
    break;
  }
  return out;
}

function sideWarnings(S, passed) {
  if (!passed) return [];
  const out = [];
  for (const u of S.queueNodes || []) {
    const n = S.model.nodes[u];
    const q = S.qHist && S.qHist.get(n.id);
    if (!q || n.isDLQ || !(q.maxAge >= q.limitSec / 3)) continue;
    const mins = Math.max(1, Math.round(q.maxAge / 60));
    const left = q.endBack >= 1 ? ` ${fmtNum(q.endBack)} messages were still waiting at 24:00.` : '';
    const past = q.late >= 1 ? `, and ${fmtNum(q.late)} messages waited past its ${Math.round(q.limitSec / 60)} minute limit` : `, close to its ${Math.round(q.limitSec / 60)} minute limit`;
    out.push({ nodeId: n.id, text: `${nodeLabel(n)} held work for up to ${withCommas(mins)} minutes at its worst${past}.${left} Add consumers so the line clears faster than it fills.` });
  }
  for (const n of S.model.nodes) {
    if (n.kind === 'source') continue;
    const over = Math.round((S.overTicks[n.i] * S.dt) / 60);
    const lost = S.failedSum[n.i];
    if (over < 30 || !(lost >= 1)) continue;
    const what = n.kind === 'tap' ? 'copies' : 'requests';
    out.push({ nodeId: n.id, text: `${nodeLabel(n)} was overloaded for about ${withCommas(over)} minutes and dropped about ${fmtNum(lost)} ${what} sent to it. They did not fail a user request, but whatever is built from them falls behind. Give it more ${unitsWord(n)}, or send it less.` });
  }
  return out.slice(0, 3);
}

function tradeoffsOf(S, perNode) {
  const { model } = S;
  const list = [];
  for (const n of model.nodes) {
    if (n.kind === 'source') continue;
    const usd = perNode[n.i] || 0;
    const util = S.peakUtil[n.i];
    if (usd < 1 && util < 0.7) continue;
    list.push({ n, usd, util });
  }
  list.sort((a, b) => b.usd - a.usd || b.util - a.util);
  const picked = list.slice(0, 6);
  for (const x of list.slice(6)) if (x.util > 1 && !picked.includes(x)) picked.push(x);
  return picked.map(({ n, usd, util }) => {
    const units = n.elastic ? 1 : Math.round(S.unitsCur[n.i]);
    const lo = Math.round(S.unitsLo ? S.unitsLo[n.i] : units), hi = Math.round(S.unitsHi ? S.unitsHi[n.i] : units);
    const label = !n.elastic && hi > lo ? `${lo} to ${hi} × ${nodeLabel(n)} (autoscaled)` : units > 1 ? `${units} × ${nodeLabel(n)}` : nodeLabel(n);
    const q = n.kind === 'queue' && S.qHist ? S.qHist.get(n.id) : null;
    const busy = q ? (q.maxAge >= 60 ? `, longest wait ≈ ${withCommas(Math.round(q.maxAge / 60))} minutes` : ', work never waited a minute') : n.hasCap ? `, peak ≈ ${busyPct(util)} percent busy` : '';
    const lag = n.role === 'replica' ? ` They can be up to ≈ ${Math.max(0.1, Math.round(S.lag[n.i] * 10) / 10)} s behind.` : '';
    return { nodeId: n.id, type: n.el.id, text: `${label}: ≈ $${withCommas(usd)} a month${busy}. ${n.el.tradeoff}${lag}` };
  });
}

// Where the slow minutes came from: the event during which most of them fell, and the busiest part then.
const n0 = (v) => withCommas(Math.round(v));
function slowCause(S) {
  const badDay = Math.max(0, (S.latW || 0) - (S.latOk || 0));
  if (!(badDay > 0)) return '';
  let best = null, bb = 0;
  for (const inst of S.instances) { const b = (inst.stats && inst.stats.latBad) || 0; if (b > bb) { bb = b; best = inst; } }
  const nodes = S.model.nodes;
  const shrink = nodes.find((n) => n.kind === 'compute' && S.unitsLo[n.i] < n.units);
  const shrinkTxt = shrink ? ` Autoscaling had cut ${nodeLabel(shrink)} from ${n0(shrink.units)} to ${n0(S.unitsLo[shrink.i])} ${unitsWord(shrink)} when it was quiet, and new ones take 2 to 4 minutes to start.` : '';
  if (best && bb >= 0.4 * badDay && best.stats.N === S.model.N) {
    let top = -1, tr = 0;
    for (const n of nodes) { if (n.kind === 'source' || !n.hasCap) continue; const r = best.stats.maxRho[n.i]; if (r > tr) { tr = r; top = n.i; } }
    const share = Math.round((bb / badDay) * 100);
    const who = top >= 0 && tr > 0.7 ? `, when ${nodeLabel(nodes[top])} reached about ${busyPct(tr)} percent busy` : '';
    return ` About ${share} percent of the slow minutes came during the ${best.def.name.toLowerCase()} at ${fmtClock(best.atMs)}${who}.${shrinkTxt}`;
  }
  let top = -1, tr = 0;
  for (const n of nodes) { if (n.kind === 'source' || !n.hasCap) continue; if (S.peakUtil[n.i] > tr) { tr = S.peakUtil[n.i]; top = n.i; } }
  if (top >= 0 && tr > 0.7) return ` ${nodeLabel(nodes[top])} was the busiest part, at about ${busyPct(tr)} percent at its peak.${shrinkTxt}`;
  return shrinkTxt || ' Requests far from your servers spent most of their time on long round trips.';
}

function verdictOf(S, metrics, score, passed, eventsOut, checks) {
  const req = S.problem.requirements;
  const a = metrics.availability;
  if (passed) return `Held. ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
  if (a <= 0.001) return 'Nothing was served: no request reached a part that can finish it.';
  if (!checks.availability && deadShare(S) >= 0.01) {
    const dn = deadNames(S);
    return `Broke from the start: ${dn.names} ${dn.many ? 'are' : 'is'} not connected to anything, so about ${Math.round(deadShare(S) * 100)} percent of requests could never be served. ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
  }
  if (!checks.availability) {
    const bl = blockedOf(S);
    if (bl.top && bl.share >= 0.5) {
      const names = joinNames(bl.types.map((t) => S.catalog.requestById.get(t)?.plural || t));
      return `Broke from the start: ${names} could not finish anywhere in this design. ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
    }
    const at = S.firstBreak ? (S.firstBreak.atMs < 60000 ? 'from the start of the day' : 'at ' + fmtClock(S.firstBreak.atMs)) : null;
    const failAll = Math.max(0, (S.offeredDay || 0) - (S.successDay || 0));
    const wq = worstQueue(S);
    if (wq && failAll > 0 && (S.lateDay || 0) >= 0.5 * failAll) {
      const left = wq.q.endBack >= 1 ? `; ${fmtNum(wq.q.endBack)} messages were still waiting at 24:00` : '';
      return `Broke${at ? ' ' + at : ''}: ${nodeLabel(wq.n)} fell behind. Work waited more than ${Math.round(wq.q.limitSec / 60)} minutes in line, so ${fmtNum(S.lateDay)} requests count as failed${left}. ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
    }
    let worst = null, wf = 0;
    for (const e of eventsOut) { const inst = S.instances.find((i) => i.id === e.id && i.atMs === e.atMs); const f = inst?.stats?.failed || 0; if (f > wf) { wf = f; worst = e; } }
    if (worst && wf > 0 && (!S.firstBreak || S.firstBreak.atMs >= worst.atMs - 60000)) {
      const def = S.catalog.eventById.get(worst.id);
      const node = worst.hurt.length ? nodeLabel(S.model.nodes[S.model.idx.get(worst.hurt[0])]) : 'your design';
      return `Broke at ${fmtClock(worst.atMs)} when the ${def.name.toLowerCase()} hit ${node}. ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
    }
    return `Broke${at ? ' ' + at : ''}: ${pct(a)} percent of requests succeeded against a ${pct(req.availability)} percent target.`;
  }
  if (!checks.latency) {
    if (metrics.latencyShare < latencyBar(req)) return `Too slow. The p99 met its target in ${Math.round(metrics.latencyShare * 100)} percent of the day; the bar is ${Math.round(latencyBar(req) * 100)} percent.${slowCause(S)}`;
    const slow = Object.entries(metrics.typeShares || {}).filter(([, v]) => v < PASS_TYPE_SHARE).map(([k]) => S.catalog.requestById.get(k)?.plural || k);
    return `Too slow for ${joinNames(slow)}: they met their speed target in under ${Math.round(PASS_TYPE_SHARE * 100)} percent of the day.`;
  }
  if (!checks.safety) {
    const L = metrics.ledger;
    const why = [];
    if (Math.round(L.lostWrites) >= 1 && req.dataSafety !== 'best-effort') why.push(`${withCommas(L.lostWrites)} acknowledged writes were lost`);
    if (Math.round(L.duplicates) >= 1) why.push(`${withCommas(L.duplicates)} duplicates went through`);
    if ((L.complianceFailed || []).length) why.push(`the audit found ${L.complianceFailed.length} missing ${L.complianceFailed.length === 1 ? 'control' : 'controls'}`);
    if (req.readYourWrites && L.readsServed > 0 && L.staleReads / L.readsServed > STALE_MAX) why.push('people saw stale copies of their own changes');
    return `Data was not safe: ${why.length ? joinNames(why) : 'the day put data at risk'}.`;
  }
  return `Over budget: ≈ $${withCommas(metrics.perMonth)} a month against $${withCommas(req.budgetPerMonth)}.`;
}

export function buildResult(S, { cost, metrics, seed, mode, graph }) {
  const { catalog, world, problem, model } = S;
  S._blocked = null;
  const req = problem.requirements;
  const score = scoreAll(world, req, metrics);
  const checks = passChecks(world, req, metrics, score);
  const passed = passOf(world, req, metrics, score);
  const stars = starsOf(passed, score.total);
  const safety = safetyPoints(world, req, metrics.ledger);

  const byType = {};
  let firstTarget = null, headTarget = null, headOff = -1;
  for (let t = 0; t < S.T; t++) {
    if (!(S.typeOff[t] > 0) || !S.interactive[t]) continue;
    const id = catalog.requests[t].id;
    if (firstTarget == null) firstTarget = S.latTarget[t];
    if (S.typeOff[t] > headOff) { headOff = S.typeOff[t]; headTarget = S.latTarget[t]; }
    byType[id] = {
      p99Ms: S.typeLatW[t] > 0 ? Math.round(S.typeP99Sum[t] / S.typeLatW[t]) : 0,
      worstP99Ms: Math.round(S.typeWorst[t]),
      targetMs: S.latTarget[t],
      shareOk: S.typeLatW[t] > 0 ? Math.round((S.typeLatOk[t] / S.typeLatW[t]) * 10000) / 10000 : 1,
    };
  }

  const timeline = [];
  for (let h = 0; h < 24; h++) {
    const sec = 3600;
    timeline.push({
      hour: h,
      offeredRps: Math.round(S.hourOff[h] / sec),
      successRps: Math.round(S.hourSucc[h] / sec),
      failRps: Math.round(Math.max(0, S.hourOff[h] - S.hourSucc[h]) / sec),
      p99Ms: S.hourW[h] > 0 ? Math.round(S.hourP99[h] / S.hourW[h]) : 0,
    });
  }
  const minuteSuccess = new Array(1440);
  for (let m = 0; m < 1440; m++) minuteSuccess[m] = S.minOff[m] > 0 ? Math.round((S.minSucc[m] / S.minOff[m]) * 10000) / 10000 : 1;

  const eventsAll = S.instances.filter((i) => i.started).map((inst) => {
    const hurt = hurtNodes(S, inst.stats);
    const helpers = helpersFor(S, inst, hurt);
    const vars = varsFor(S, inst, hurt, helpers);
    return {
      id: inst.id, name: inst.name, severity: inst.severity, atMs: inst.atMs, endMs: inst.endMs,
      nodeIds: inst.nodeIds,
      helpers: helpers.map((x) => x.id),
      hurt: hurt.map((u) => model.nodes[u].id),
      vars,
      story: storyFor(S, inst, vars, hurt, helpers),
    };
  });
  // an event that had nothing to hit is not a story worth telling
  const eventsOut = eventsAll.filter((e) => !(e.story && e.story.none));

  const nodesOut = model.nodes.map((n) => ({
    id: n.id, type: n.el.id,
    peakUtil: Math.round(Math.min(S.peakUtil[n.i], 10) * 1000) / 1000,
    minutesOverloaded: Math.round((S.overTicks[n.i] * S.dt) / 60),
    failed: Math.round(S.failedSum[n.i]),
    usd: Math.round((cost.perNode[n.i] || 0) * 100) / 100,
  }));

  const passedChecks = [], failedChecks = [];
  for (const [id, ok] of S.complianceChecked) (ok ? passedChecks : failedChecks).push(id);

  return {
    problemId: problem.id, seed, mode, passed, stars, checks,
    verdict: verdictOf(S, metrics, score, passed, eventsOut, checks),
    score,
    slo: {
      availability: { target: req.availability, actual: Math.round(metrics.availability * 1e6) / 1e6 },
      latency: { targetMs: headTarget ?? firstTarget ?? req.latencyP99Ms.default ?? 200, shareOk: Math.round(metrics.latencyShare * 10000) / 10000, worstP99Ms: Math.round(S.worstP99), byType },
      safety: {
        lostWrites: Math.round(metrics.ledger.lostWrites),
        duplicates: Math.round(metrics.ledger.duplicates),
        staleReads: Math.round(metrics.ledger.staleReads),
        staleShare: Math.round(safety.staleShare * 10000) / 10000,
        compliance: { passed: passedChecks, failed: failedChecks },
      },
      cost: { perMonth: cost.perMonth, budget: cost.budget, lines: cost.lines },
    },
    timeline,
    minuteSuccess,
    events: eventsOut,
    nodes: nodesOut,
    tradeoffs: tradeoffsOf(S, cost.perNode),
    nextStep: nextStepOf(S, score, metrics, nodesOut, eventsOut),
    warnings: privateCacheWarnings(S).concat(sideWarnings(S, passed)).slice(0, 4),
    queues: (S.queueNodes || []).map((u) => {
      const n = model.nodes[u];
      const q = S.qHist && S.qHist.get(n.id);
      return q ? { id: n.id, maxWaitSec: Math.round(q.maxAge), lateMessages: Math.round(q.late), backlogEnd: Math.round(q.endBack), peakInRps: Math.round(q.peakIn), limitSec: q.limitSec } : null;
    }).filter(Boolean),
    lateRequests: Math.round(S.lateDay || 0),
    interventions: S.interventions.slice(),
    graph,
  };
}
