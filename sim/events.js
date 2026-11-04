// Traffic-day events: builds the schedule, resolves target selectors and applies every op in events.json.
import { parseClock } from './util.js';

const AUDIT_SHOW_SEC = 60; // how long an instant event (audit, bad migration) stays on the banner
const ELECTION_SEC = 5; // a consensus database elects new leaders for a lost node's shards in seconds, approx.

export function makeInstance(catalog, entry, n, dayMs) {
  const def = catalog.eventById.get(entry.id);
  if (!def) return null;
  const atMs = Math.max(0, Math.min(dayMs - 1, typeof entry.atMs === 'number' ? entry.atMs : parseClock(entry.at)));
  const params = entry.params || {};
  const { target, ...rest } = params;
  const effects = def.effects.map((ef) => ({
    op: ef.op,
    sel: target != null ? (String(target).includes(':') || target === 'traffic' || target === 'all' || target === 'keyed' ? String(target) : 'ref:' + target) : ef.target,
    params: { ...ef.params, ...rest },
    targets: [],
    startMs: atMs,
    endMs: atMs,
    st: {},
  }));
  const inst = {
    n, id: def.id, def, name: def.name, severity: def.severity, atMs,
    endMs: atMs + estimateSec(effects) * 1000,
    params, effects, started: false, ended: false, nodeIds: [],
    stats: null,
  };
  return inst;
}

function numDur(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function estimateSec(effects) {
  let m = AUDIT_SHOW_SEC;
  for (const ef of effects) {
    const p = ef.params;
    let d;
    switch (ef.op) {
      case 'traffic': d = numDur(p.rampSec, 0) + numDur(p.holdSec, 0) + numDur(p.decaySec, 0); break;
      case 'regionShift': d = numDur(p.rampSec, 600); break;
      case 'cacheFlush': d = numDur(p.recoverSec, 300); break;
      case 'keyLeak': d = numDur(p.restartSec, 1200); break;
      case 'audit': case 'corrupt': d = AUDIT_SHOW_SEC; break;
      default: d = numDur(p.durationSec, 1800);
    }
    if (d > m) m = d;
  }
  return m;
}

// ---- selectors -------------------------------------------------------------------------------
function group(S, sel) {
  const { nodes } = S.model;
  if (sel === 'all') return nodes.filter((n) => n.hasCap || n.kind === 'store').map((n) => n.i);
  if (sel === 'keyed') return nodes.filter((n) => n.keyed || n.kind === 'cache').map((n) => n.i);
  const [k, v] = [sel.slice(0, sel.indexOf(':')), sel.slice(sel.indexOf(':') + 1)];
  switch (k) {
    case 'kind': return nodes.filter((n) => n.kind === v).map((n) => n.i);
    case 'el': return nodes.filter((n) => n.el.id === v).map((n) => n.i);
    case 'cat': return nodes.filter((n) => n.cat === v).map((n) => n.i);
    case 'ref': return S.model.idx.has(v) ? [S.model.idx.get(v)] : [];
    default: return [];
  }
}

export function resolveTargets(S, sel) {
  if (!sel || sel === 'traffic') return [];
  if (sel.startsWith('busiest:')) {
    const g = group(S, sel.slice(8));
    let best = -1, bu = -Infinity;
    for (const u of g) if (S.rhoPrev[u] > bu) { bu = S.rhoPrev[u]; best = u; }
    return best >= 0 ? [best] : [];
  }
  if (sel.startsWith('random:')) {
    const g = group(S, sel.slice(7));
    if (!g.length) return [];
    return [g[Math.floor(S.rng() * g.length) % g.length]];
  }
  return group(S, sel);
}

// ---- incident response -----------------------------------------------------------------------
export function responseSec(S, op, total) {
  const R = S.world.response;
  const ops = S.model.ops;
  let detect = R.detectSec.none;
  if (ops.metrics) detect = R.detectSec.metricsOnly;
  if (ops.alerting) detect = Math.min(detect, R.detectSec.metricsAndAlerting);
  if (ops.synthetic && total) detect = Math.min(detect, R.detectSec.syntheticForTotalOutage);
  const ack = ops.pager ? R.ackSec.withPager : R.ackSec.withoutPager;
  let repair = R.repairSec.base;
  const opts = [];
  if (op === 'deploy') { if (ops.ciCd) opts.push(R.repairSec.rollbackWithCiCd); if (ops.flags) opts.push(R.repairSec.killSwitchWithFlags); }
  if (op === 'configPush') { if (ops.config) opts.push(R.repairSec.configRevertWithConfigService); if (ops.flags) opts.push(R.repairSec.killSwitchWithFlags); }
  if (op === 'capacityDecay' && ops.autoscaler) opts.push(R.repairSec.restartUnhealthyWithAutoscaler);
  if (opts.length) repair = Math.min(...opts);
  const sp = R.repairSpeedupFrom;
  if (ops.logs) repair *= 1 - sp.logs;
  if (ops.traces) repair *= 1 - sp.traces;
  if (ops.dashboards) repair *= 1 - sp.dashboards;
  return { detect, ack, repair, total: detect + ack + repair };
}

function durOf(S, ef, total) {
  const p = ef.params;
  if (p.durationSec === 'untilFixed') { const r = responseSec(S, ef.op, total); ef.st.response = r; return r.total; }
  return numDur(p.durationSec, 1800);
}

// ---- start ---------------------------------------------------------------------------------
export function startEvent(S, inst) {
  inst.started = true;
  const now = S.clock;
  const ids = new Set();
  let end = now + AUDIT_SHOW_SEC * 1000;
  for (const ef of inst.effects) {
    ef.startMs = now;
    ef.targets = resolveTargets(S, ef.sel);
    startEffect(S, inst, ef);
    for (const u of ef.targets) ids.add(S.model.nodes[u].id);
    if (ef.endMs > end && ef.op !== 'regionShift') end = ef.endMs;
    if (ef.op === 'regionShift') end = Math.max(end, now + numDur(ef.params.rampSec, 600) * 1000);
    if (ef.endMs > now) S.activeEffects.push(ef);
  }
  inst.endMs = Math.min(end, S.dayMs);
  inst.nodeIds = [...ids];
}

function startEffect(S, inst, ef) {
  const p = ef.params;
  const now = ef.startMs;
  const nodes = S.model.nodes;
  const st = ef.st;
  const sec = (x) => now + x * 1000;
  switch (ef.op) {
    case 'traffic':
      if (inst.id === 'thundering-herd') spreadReconnects(S, ef);
      ef.endMs = sec(numDur(ef.params.rampSec, 0) + numDur(ef.params.holdSec, 0) + numDur(ef.params.decaySec, 0));
      st.mask = typesMask(S, p.types);
      break;
    case 'attack':
      ef.endMs = sec(numDur(p.durationSec, 1800));
      st.mask = typesMask(S, p.types || ['read']);
      break;
    case 'regionShift':
      ef.endMs = S.dayMs + 1;
      st.region = Math.max(0, S.regionIds.indexOf(p.region));
      break;
    case 'hotKey': case 'lag': case 'duplicate': case 'partition': case 'scaleBlock': case 'coldStart': case 'retryAmplify':
      ef.endMs = sec(numDur(p.durationSec, 1800));
      break;
    case 'fanout': {
      ef.endMs = sec(numDur(p.durationSec, 900));
      st.mask = typesMask(S, p.types);
      // apply the fan-out where it first lands: a queue in front of the store if there is one
      const set = new Set();
      for (const u of ef.targets) {
        const q = upstreamQueue(S, u);
        set.add(q >= 0 ? q : u);
      }
      st.apply = [...set];
      break;
    }
    case 'cacheFlush':
      ef.endMs = sec(numDur(p.recoverSec, 300));
      break;
    case 'costMultiplier':
      ef.endMs = sec(numDur(p.durationSec, 21600));
      if (S.model.ops.alerting) {
        const r = responseSec(S, 'costMultiplier', false);
        ef.endMs = Math.min(ef.endMs, sec(r.total));
        st.cutShort = true;
      }
      st.line = p.line || 'usage';
      st.nodes = st.line === 'usage' ? null : group(S, st.line.startsWith('el:') ? st.line : 'el:' + st.line);
      break;
    case 'audit':
      ef.endMs = now;
      runAudit(S, inst, p.checks);
      break;
    case 'capacity':
      ef.endMs = sec(durOf(S, ef, false));
      break;
    case 'capacityDecay':
      ef.endMs = sec(durOf(S, ef, false));
      break;
    case 'poison': {
      const q = ef.targets[0];
      const hasDlq = q != null && S.model.outAll[q].some((e) => nodes[e.ti].isDLQ);
      if (hasDlq) {
        const dlq = S.model.outAll[q].find((e) => nodes[e.ti].isDLQ);
        const maxR = nodes[dlq.ti].el.params?.maxReceives || 5;
        const vis = nodes[q].el.params?.visibilityTimeoutSec || 30;
        ef.endMs = sec(maxR * vis);
        st.helper = 'dead-letter-queue';
      } else ef.endMs = sec(durOf(S, ef, false));
      break;
    }
    case 'limit': {
      ef.endMs = sec(numDur(p.durationSec, 3600));
      st.cap = new Map();
      for (const u of ef.targets) {
        const load = Math.max(1, S.realInPrev[u]);
        st.cap.set(u, Math.max(1, numDur(p.rpsCapFactor, 0.5) * load));
      }
      break;
    }
    case 'corrupt': {
      ef.endMs = now;
      if (S.model.ops.ciCd) { st.prevented = true; inst.helperIds = ['ci-cd']; break; }
      const share = numDur(p.share, 0.05);
      for (const u of ef.targets) {
        const n = nodes[u];
        st.atRisk = (st.atRisk || 0) + share * S.writesSoFar[u];
        st.tb = storedTb(S, u);
        if (n.backedUp) {
          const r = responseSec(S, 'corrupt', false);
          const restore = (S.backupsParams?.restoreSecPerTb || 3600) * Math.max(0.05, st.tb);
          ef.endMs = Math.max(ef.endMs, sec(r.detect + r.ack + restore));
          st.restoring = true;
          st.restoreSec = r.detect + r.ack + restore;
        } else {
          const lost = share * S.writesSoFar[u];
          S.addLost(lost, inst);
        }
      }
      break;
    }
    case 'blockWrites':
      ef.endMs = sec(durOf(S, ef, false));
      break;
    case 'deploy':
      ef.endMs = sec(durOf(S, ef, false));
      st.rate = numDur(p.errorRate, 0.3) * (S.model.ops.ciCd ? (S.ciCdParams?.canaryShare ?? 0.05) : 1);
      break;
    case 'configPush': {
      const rate = numDur(p.errorRate, 0.9) * (S.model.ops.config ? (S.configParams?.stagedShare ?? 0.1) : 1);
      st.rate = rate;
      ef.endMs = sec(durOf(S, ef, rate >= 0.9));
      break;
    }
    case 'keyLeak':
      ef.endMs = sec(numDur(p.restartSec, 1200) * (S.model.ops.kms ? 0.5 : 1));
      st.none = S.model.ops.secrets;
      break;
    case 'fail':
      startFail(S, inst, ef);
      break;
    case 'zoneDown':
      startZone(S, inst, ef);
      break;
    case 'regionDown':
      startRegion(S, inst, ef);
      break;
    default:
      ef.endMs = sec(numDur(p.durationSec, 600));
  }
}

// Terabytes held by store u: the problem's data at rest, split over the stores that keep customer records
// in proportion to the writes each took so far (an even split before any writes).
function storedTb(S, u) {
  const total = S.problem.requirements.storageTb || 1;
  const stores = S.model.nodes.filter((n) => n.kind === 'store' && n.role !== 'replica' && (n.customerData || n.i === u));
  let sum = 0;
  for (const n of stores) sum += S.writesSoFar[n.i];
  if (sum > 0) return total * S.writesSoFar[u] / sum;
  return total / Math.max(1, stores.length);
}

// Clients that reconnect with random jitter spread a reconnect wave over about a minute instead of seconds:
// the wave is lower and longer in proportion to the traffic coming from such clients.
function spreadReconnects(S, ef) {
  const p = ef.params;
  let share = 0;
  for (const u of S.model.sources) if (S.model.nodes[u].backoff === 'exponential-jitter') share += S.srcAny[u];
  if (!(share > 0)) return;
  const F = numDur(p.factor, 10);
  const ramp = numDur(p.rampSec, 10);
  const spread = Math.max(1, 60 / Math.max(1, ramp));
  ef.params = { ...p, factor: 1 + (F - 1) * (1 - share + share / spread), rampSec: ramp + (60 - ramp) * share };
  ef.st.spread = share;
}

function typesMask(S, types) {
  if (!types || !types.length) return 0;
  let m = 0;
  for (const id of types) { const t = S.catalog.typeIndex.get(id); if (t != null) m |= 2 ** t; }
  return m;
}

function upstreamQueue(S, u) {
  const { inAll, nodes } = S.model;
  const seen = new Set([u]);
  let frontier = [u];
  for (let d = 0; d < 3; d++) {
    const next = [];
    for (const x of frontier) {
      for (const e of inAll[x]) {
        if (e.kind !== 'flow') continue;
        const v = e.fi;
        if (seen.has(v)) continue;
        seen.add(v);
        if (nodes[v].kind === 'queue' && !nodes[v].isDLQ) return v;
        next.push(v);
      }
    }
    frontier = next;
  }
  return -1;
}

function lagSecOf(S, u) {
  return Math.max(S.lag[u] || 0, S.model.nodes[u].baseLagSec || 0.1);
}

function startFail(S, inst, ef) {
  const p = ef.params;
  const now = ef.startMs;
  const nodes = S.model.nodes;
  const mode = p.mode || 'errors';
  const total = mode === 'down' || numDur(p.errorRate, 0) >= 0.9;
  const base = durOf(S, ef, total);
  ef.st.mode = mode;
  ef.st.perNode = new Map();
  let end = now + base * 1000;
  for (const u of ef.targets) {
    const n = nodes[u];
    let downSec = base;
    if (mode === 'down' && n.kind === 'store' && !n.el.params?.consensus && n.keyed && !n.elastic && Math.round(S.unitsCur[u]) > 1 && n.failoverSec != null) {
      // A sharded store fails over one shard at a time: only that unit's share of keys is unavailable.
      const units = Math.round(S.unitsCur[u]);
      const share = 1 / units;
      const standby = n.zones >= 2 && n.replication !== 'none';
      const proxy = n.proxied ? (S.proxyParams?.failoverSpeedup ?? 0.5) : 1;
      const sec = standby ? n.failoverSec * proxy : Math.max(base, responseSec(S, 'fail', false).total);
      if (n.replication === 'async') S.addLost(S.wrRatePrev[u] * share * lagSecOf(S, u), inst);
      ef.st.perNode.set(u, { until: now + sec * 1000, shard: true, share });
      ef.st.downSec = Math.max(ef.st.downSec || 0, sec);
      ef.st.failover = 'shard';
      end = Math.max(end, now + sec * 1000);
      continue;
    }
    if (mode === 'down' && n.kind === 'store' && n.el.params?.consensus) {
      // One node of a consensus cluster dies: its share of shard leaders is re-elected within seconds,
      // and the cluster runs one node short until a replacement joins. Majority writes lose nothing.
      const units = Math.max(1, Math.round(S.unitsCur[u]));
      const share = 1 / units;
      ef.st.perNode.set(u, { until: now + base * 1000, consensus: true, share, electUntil: now + ELECTION_SEC * 1000 });
      ef.st.downSec = Math.max(ef.st.downSec || 0, ELECTION_SEC);
      ef.st.failover = 'consensus';
      end = Math.max(end, now + base * 1000);
      continue;
    }
    if (mode === 'down' && n.kind === 'store' && n.failoverSec != null) {
      const standby = n.zones >= 2 && n.replication !== 'none';
      const promotable = n.replicas.some((r) => nodes[r].el.params?.promotable);
      const proxy = n.proxied ? (S.proxyParams?.failoverSpeedup ?? 0.5) : 1;
      if (standby) {
        downSec = n.failoverSec * proxy;
        if (n.replication === 'async') S.addLost(S.wrRatePrev[u] * lagSecOf(S, u), inst);
        ef.st.failover = 'standby';
      } else if (promotable) {
        downSec = n.failoverSec * proxy + 60;
        S.addLost(S.wrRatePrev[u] * lagSecOf(S, u), inst);
        ef.st.failover = 'replica';
      } else {
        const r = responseSec(S, 'fail', true);
        downSec = Math.max(base, r.total);
        ef.st.response = r;
        ef.st.failover = 'rebuild';
      }
    }
    ef.st.perNode.set(u, { until: now + downSec * 1000 });
    ef.st.downSec = Math.max(ef.st.downSec || 0, downSec);
    end = Math.max(end, now + downSec * 1000);
  }
  ef.endMs = end;
}

function startZone(S, inst, ef) {
  const p = ef.params;
  const now = ef.startMs;
  const dur = numDur(p.durationSec, 3600);
  // Single-zone parts all live in zone a, so the outage always takes zone a: luck never decides whether a
  // one-zone design is exposed. The draw is still taken so later random draws stay the same.
  S.rng();
  const z = 0;
  ef.st.zone = z;
  ef.st.perNode = new Map();
  ef.endMs = now + dur * 1000;
  const nodes = S.model.nodes;
  for (const u of ef.targets) {
    const n = nodes[u];
    if (n.near || n.multiZone || !(n.hasCap || n.kind === 'store')) continue;
    const zones = n.zones;
    if (z >= zones) continue;
    const units = Math.max(1, Math.round(S.unitsCur[u]));
    let inZone = 0;
    for (let i = 0; i < units; i++) if (i % zones === z) inZone++;
    const rec = { alive: 1, until: 0, errShare: 0, errUntil: 0 };
    const proxy = n.proxied ? (S.proxyParams?.failoverSpeedup ?? 0.5) : 1;
    const fo = (n.failoverSec ?? 30) * proxy;
    if (n.managed && n.kind !== 'store' && n.kind !== 'cache') {
      // a managed service spread over zones loses only that zone's share; in one zone it goes dark
      if (zones >= 2) rec.alive = (zones - 1) / zones; else rec.until = ef.endMs;
    } else if (n.el.params?.consensus) {
      const left = units - inZone;
      if (left > units / 2) rec.alive = left / units; else rec.until = ef.endMs;
    } else if (n.el.params?.replicationFactor) {
      const rf = n.el.params.replicationFactor;
      let aliveR = 0;
      for (let i = 0; i < rf; i++) if (i % zones !== z) aliveR++;
      const need = n.mode === 'ALL' ? rf : n.mode === 'QUORUM' ? Math.floor(rf / 2) + 1 : 1;
      if (aliveR < need) rec.until = ef.endMs; else rec.alive = (units - inZone) / units;
    } else if (n.kind === 'store' || n.kind === 'cache') {
      const standby = zones >= 2 && n.replication !== 'none';
      if (units === 1 || n.elastic) {
        if (z === 0) {
          if (standby) {
            rec.until = now + fo * 1000;
            if (n.replication === 'async') S.addLost(S.wrRatePrev[u] * lagSecOf(S, u), inst);
          } else {
            rec.until = ef.endMs;
            if (n.replication === 'none' && n.kind === 'store') {
              const rpo = n.backedUp ? (S.backupsParams?.rpoSec ?? 300) : Infinity;
              S.addLost(Math.min(S.writesSoFar[u], S.wrRatePrev[u] * rpo), inst);
            }
          }
        }
      } else {
        rec.alive = (units - inZone) / units;
        if (standby) { rec.errShare = inZone / units; rec.errUntil = now + fo * 1000; if (n.replication === 'async') S.addLost(S.wrRatePrev[u] * lagSecOf(S, u) * inZone / units, inst); }
        else {
          rec.errShare = inZone / units; rec.errUntil = ef.endMs;
          if (n.replication === 'none') S.addLost(S.writesSoFar[u] * inZone / units * (n.backedUp ? 0 : 1), inst);
        }
      }
    } else {
      rec.alive = (units - inZone) / units;
      if (rec.alive <= 0) rec.until = ef.endMs;
    }
    if (rec.alive < 1 || rec.until > now || rec.errShare > 0) {
      ef.st.perNode.set(u, rec);
      ef.targetsHit = (ef.targetsHit || 0) + 1;
    }
  }
  ef.targets = [...ef.st.perNode.keys()];
}

function startRegion(S, inst, ef) {
  const p = ef.params;
  const now = ef.startMs;
  const dur = numDur(p.durationSec, 7200);
  const nodes = S.model.nodes;
  const reg = p.region === 'primary' || p.region == null ? S.model.homeIdx : Math.max(0, S.regionIds.indexOf(p.region));
  ef.st.region = reg;
  ef.st.perNode = new Map();
  ef.endMs = now + dur * 1000;
  for (const n of nodes) {
    // outside providers (push, email, card networks) run outside your cloud region and outlive its outage
    if (n.near || n.kind === 'external' || n.loc0 !== reg || !(n.hasCap || n.kind === 'store')) continue;
    const rec = { until: ef.endMs, drAt: 0, drLoc: -1 };
    if (n.drFrom >= 0) {
      const dr = nodes[n.drFrom];
      const mode = dr.mode || 'backup-restore';
      const drLoc = Math.max(0, S.regionIds.indexOf(dr.region));
      if (drLoc !== reg) {
        rec.drAt = now + (dr.el.params.rtoSec?.[mode] ?? 3600) * 1000;
        rec.drLoc = drLoc;
        // A store copied synchronously to a hot second region loses nothing when it fails over.
        const syncHot = mode === 'active-active' && (n.replication === 'sync' || n.replication === 'quorum');
        if (n.kind === 'store' && !syncHot) S.addLost(S.wrRatePrev[n.i] * (dr.el.params.rpoSec?.[mode] ?? 3600), inst);
      }
    }
    ef.st.perNode.set(n.i, rec);
  }
  ef.targets = [...ef.st.perNode.keys()];
}

// ---- audit -------------------------------------------------------------------------------------
export function checkCompliance(S, id) {
  const def = S.world.complianceChecks.find((c) => c.id === id);
  if (!def) return true;
  const { nodes, outAll, inAll } = S.model;
  const connected = (n) => outAll[n.i].length + inAll[n.i].length > 0;
  const present = nodes.filter((n) => def.satisfiedBy.includes(n.el.id) && connected(n));
  if (!present.length) return false;
  if (id === 'backups') {
    const data = nodes.filter((n) => n.customerData);
    return data.every((n) => n.backedUp);
  }
  if (id === 'audit-log') return present.some((n) => n.el.id !== 'audit-log' || inAll[n.i].some((e) => e.kind === 'tap'));
  return true;
}

function runAudit(S, inst, checksParam) {
  const req = S.problem.requirements.compliance || [];
  const userParams = inst.params && inst.params.checks;
  const checks = userParams || (req.length ? req : (checksParam || []));
  const passed = [], failed = [];
  for (const c of checks) {
    if (checkCompliance(S, c)) passed.push(c); else failed.push(c);
    S.complianceChecked.set(c, !failed.includes(c));
  }
  inst.audit = { passed, failed, total: checks.length };
}

// ---- per tick ----------------------------------------------------------------------------------
function envelope(ef, now) {
  const p = ef.params;
  const F = numDur(p.factor, 1);
  const ramp = numDur(p.rampSec, 0) * 1000, hold = numDur(p.holdSec, 0) * 1000, decay = numDur(p.decaySec, 0) * 1000;
  const e = now - ef.startMs;
  if (e < ramp) return 1 + (F - 1) * (e / ramp);
  if (e < ramp + hold) return F;
  if (e < ramp + hold + decay) return F - (F - 1) * ((e - ramp - hold) / decay);
  return 1;
}

export function applyEffects(S) {
  const now = S.clock;
  const list = S.activeEffects;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const ef = list[i];
    if (now >= ef.endMs) { endEffect(S, ef); continue; }
    list[w++] = ef;
    applyEffect(S, ef, now);
  }
  list.length = w;
}

function endEffect(S, ef) {
  if (ef.op === 'regionDown' || ef.op === 'zoneDown') {
    for (const u of ef.targets) S.loc[u] = S.model.nodes[u].loc0;
  }
}

function addErr(S, u, rate) {
  if (!(rate > 0)) return;
  if (rate < 0.5) S.errSoft[u] = 1 - (1 - S.errSoft[u]) * (1 - rate);
  else S.err[u] = 1 - (1 - S.err[u]) * (1 - Math.min(1, rate));
}

function applyEffect(S, ef, now) {
  const p = ef.params;
  const st = ef.st;
  const T = S.T;
  switch (ef.op) {
    case 'traffic': {
      const f = envelope(ef, now);
      if (st.mask) { for (let t = 0; t < T; t++) if (st.mask & (2 ** t)) S.trafficMul[t] *= f; }
      else for (let t = 0; t < T; t++) S.trafficMul[t] *= f;
      break;
    }
    case 'attack': {
      const e = (now - ef.startMs) / 60000;
      const rate = numDur(p.factorOfPeak, 1) * S.peakRps * Math.min(1, e + 0.2);
      S.attackRate += rate;
      S.attackMask |= st.mask;
      if (p.layer === 'app') S.attackAppRate += rate;
      break;
    }
    case 'regionShift': {
      const ramp = numDur(p.rampSec, 600) * 1000;
      const prog = ramp > 0 ? Math.min(1, (now - ef.startMs) / ramp) : 1;
      S.shiftRegion = st.region;
      S.shiftShare = Math.max(S.shiftShare, numDur(p.share, 0.3) * prog);
      break;
    }
    case 'hotKey':
      for (const u of ef.targets) S.hot[u] = Math.max(S.hot[u], numDur(p.share, 0.3));
      break;
    case 'fanout':
      for (const u of st.apply) S.fan[u] = Math.max(S.fan[u], numDur(p.factor, 10));
      if (st.mask) for (let t = 0; t < T; t++) if (st.mask & (2 ** t)) S.fanTypes[t] = 1;
      break;
    case 'cacheFlush': {
      const rec = numDur(p.recoverSec, 300) * 1000;
      const prog = rec > 0 ? Math.min(1, (now - ef.startMs) / rec) : 1;
      for (const u of ef.targets) S.flush[u] = Math.min(S.flush[u], prog);
      break;
    }
    case 'fail': {
      for (const u of ef.targets) {
        const rec = st.perNode.get(u);
        if (rec && now >= rec.until) continue;
        // keys on the failing shard get no answer until its standby takes over; a quick retry hits the same shard
        if (rec && rec.shard) { S.err[u] = 1 - (1 - S.err[u]) * (1 - rec.share); continue; }
        if (rec && rec.consensus) {
          S.capFactor[u] *= 1 - rec.share;
          // leaders on the lost node answer "try again" during the election; callers retry those
          if (now < rec.electUntil) addErr(S, u, Math.min(0.49, rec.share * Math.min(1, ELECTION_SEC / S.dt)));
          continue;
        }
        if (st.mode === 'down') S.down[u] = 1;
        else if (st.mode === 'slow') S.addLat[u] += numDur(p.addLatencyMs, 1000);
        else addErr(S, u, numDur(p.errorRate, 1));
      }
      break;
    }
    case 'zoneDown': {
      for (const [u, rec] of st.perNode) {
        if (now < rec.until) S.down[u] = 1;
        else S.capFactor[u] *= rec.alive;
        if (now < rec.errUntil) S.err[u] = 1 - (1 - S.err[u]) * (1 - rec.errShare);
      }
      break;
    }
    case 'regionDown': {
      for (const [u, rec] of st.perNode) {
        if (rec.drAt && now >= rec.drAt) { S.loc[u] = rec.drLoc; continue; }
        S.down[u] = 1;
      }
      break;
    }
    case 'lag':
      for (const u of ef.targets) S.lagEv[u] = Math.max(S.lagEv[u], numDur(p.lagSec, 30));
      break;
    case 'retryAmplify':
      S.retryAmp = true;
      break;
    case 'costMultiplier':
      if (!st.nodes) S.usageMul *= numDur(p.factor, 2);
      else for (const u of st.nodes) S.nodeCostMul[u] *= numDur(p.factor, 2);
      break;
    case 'capacity':
      for (const u of ef.targets) S.capFactor[u] *= numDur(p.factor, 0.5);
      break;
    case 'capacityDecay': {
      const hours = (now - ef.startMs) / 3600000;
      const f = Math.max(0.05, 1 - numDur(p.perHour, 0.15) * hours);
      for (const u of ef.targets) S.capFactor[u] *= f;
      break;
    }
    case 'coldStart':
      for (const u of ef.targets) {
        const n = S.model.nodes[u];
        const warm = n.warmPool > 0 ? Math.min(1, (n.warmPool * 50) / Math.max(1, S.realInPrev[u])) : 0;
        S.cold[u] = Math.max(S.cold[u], numDur(p.addMs, 800) * (1 - warm));
      }
      break;
    case 'poison':
      for (const u of ef.targets) S.poison[u] = 1;
      break;
    case 'duplicate':
      for (const u of ef.targets) S.dup[u] = Math.max(S.dup[u], numDur(p.share, 0.01));
      break;
    case 'partition':
      S.partition = true;
      break;
    case 'limit':
      for (const [u, cap] of st.cap) S.limitCap[u] = Math.min(S.limitCap[u], cap);
      break;
    case 'corrupt':
      break;
    case 'blockWrites':
      for (const u of ef.targets) S.blockW[u] = 1;
      break;
    case 'scaleBlock':
      for (const u of ef.targets) S.scaleBlocked[u] = 1;
      break;
    case 'deploy':
      for (const u of ef.targets) addErr(S, u, st.rate);
      break;
    case 'configPush':
      for (const u of ef.targets) addErr(S, u, st.rate);
      break;
    case 'keyLeak':
      if (!st.none) for (const u of ef.targets) S.capFactor[u] *= 0.5;
      break;
    default:
      break;
  }
  if (ef.op === 'corrupt' && st.restoring) for (const u of ef.targets) S.blockW[u] = 1;
}
