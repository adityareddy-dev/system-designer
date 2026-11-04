// Monthly cost model: fixed per-element prices, usage projected from the simulated day, storage, egress and disaster recovery.

const SAMPLING_COST = { 0.01: 0.3, 0.1: 1, 1: 4 }; // logs and traces bills scale with how much is kept, approx.

export function nodeLabel(n) {
  return n.g.label || n.el.name;
}

// Counters C hold one full day's worth of usage (or the day so far with C.scale projecting it to a full day).
export function newCounters(N) {
  return {
    reqDay: new Float64Array(N),
    gbDay: new Float64Array(N),
    unitSec: new Float64Array(N),
    extraFixedSec: new Float64Array(N),
    writeKbDay: new Float64Array(N),
    inKbDay: new Float64Array(N),
    userKbDay: 0,
    edgeKbDay: 0,
    crossKbDay: 0,
    elapsedSec: 0,
    scale: 1,
  };
}

function storageAlloc(model, problem, C) {
  const { nodes } = model;
  const totalGb = Math.max(0, (problem.requirements.storageTb || 0) * 1000);
  const gb = new Float64Array(nodes.length);
  const stores = nodes.filter((n) => n.kind === 'store' && n.el.cost && n.el.cost.perGBMonth && n.role !== 'replica');
  let sum = 0;
  for (const n of stores) sum += C.writeKbDay[n.i];
  if (sum > 0) for (const n of stores) gb[n.i] = (totalGb * C.writeKbDay[n.i]) / sum;
  else if (stores.length) {
    const main = stores.filter((n) => n.customerData || ['object-storage', 'data-lake', 'timeseries-db', 'ledger-db'].includes(n.el.id));
    const list = main.length ? main : stores;
    for (const n of list) gb[n.i] = totalGb / list.length;
  }
  // logs of messages kept for their retention (event streams, audit logs)
  for (const n of nodes) {
    if ((n.kind === 'queue' || n.kind === 'tap') && n.el.cost && n.el.cost.perGBMonth) {
      const days = Math.max(1, n.retentionDays || 7);
      const rf = n.el.params?.replicationFactor || 1;
      gb[n.i] = (C.inKbDay[n.i] * C.scale * days * rf) / 1e6;
    }
  }
  return gb;
}

export function computeCost(S, C, opts = {}) {
  const { model, world, problem } = S;
  const { nodes } = model;
  const lines = [];
  const perNode = new Float64Array(nodes.length);
  const gb = storageAlloc(model, problem, C);
  const monthlyUsers = problem.requirements.monthlyUsers || 0;
  const days = 30;
  const elapsed = Math.max(C.elapsedSec, 1e-9);

  for (const n of nodes) {
    const c = n.el.cost;
    if (!c || n.kind === 'source') continue;
    const unitsAvg = C.elapsedSec > 0 ? C.unitSec[n.i] / elapsed : (opts.units ? opts.units[n.i] : n.units);
    let fixed = (c.base || 0) + (c.perUnit || 0) * unitsAvg * n.tierCost;
    if (n.el.id === 'logs' || n.el.id === 'traces') fixed *= SAMPLING_COST[n.sampling] ?? 1;
    if (n.warmPool > 0 && n.el.params?.warmPoolCostPerMonth) fixed += n.warmPool * n.el.params.warmPoolCostPerMonth;
    const extraShare = C.elapsedSec > 0 ? C.extraFixedSec[n.i] / elapsed : 0;
    fixed *= 1 + extraShare;
    const storage = (c.perGBMonth || 0) * gb[n.i];
    // DNS is billed per lookup, and resolvers cache answers, so only a small share of requests causes one.
    const lookups = n.el.params?.lookupShare ?? 1;
    let usage = ((c.perMillion || 0) * lookups * C.reqDay[n.i] / 1e6 + (c.perGB || 0) * C.gbDay[n.i]) * C.scale * days;
    if (c.perThousandUsers) usage += c.perThousandUsers * monthlyUsers / 1000;
    if (n.el.id === 'backups') {
      let protectedGb = 0;
      for (const m of nodes) if (m.backedUp) protectedGb += gb[m.i];
      fixed = (c.base || 0);
      usage = 0;
      const st = (c.perGBMonth || 0) * protectedGb;
      perNode[n.i] = fixed + st;
      if (fixed + st > 0) lines.push({ id: n.id, label: nodeLabel(n), usd: fixed + st, kind: 'fixed' });
      continue;
    }
    perNode[n.i] = fixed + storage + usage;
    const label = nodeLabel(n) + (unitsAvg > 1.05 && !n.elastic ? ` x${Math.round(unitsAvg * 10) / 10}` : '');
    if (fixed + storage > 0.005) lines.push({ id: n.id, label, usd: fixed + storage, kind: 'fixed' });
    if (usage > 0.005) lines.push({ id: n.id + ':usage', label: nodeLabel(n) + ' usage', usd: usage, kind: 'usage' });
  }

  // disaster recovery keeps a standby worth a share of what it protects
  for (const n of nodes) {
    if (n.el.id !== 'disaster-recovery') continue;
    const share = n.el.params?.costShare?.[n.mode || 'backup-restore'] ?? 0.05;
    let protectedUsd = 0;
    for (const m of nodes) if (m.drFrom === n.i) protectedUsd += perNode[m.i];
    const usd = protectedUsd * share;
    perNode[n.i] = usd;
    if (usd > 0.005) lines.push({ id: n.id, label: `${nodeLabel(n)} (${n.mode || 'backup-restore'})`, usd, kind: 'fixed' });
  }

  const eg = world.egress;
  const egressGb = Math.max(0, C.userKbDay - C.edgeKbDay) / 1e6 * C.scale * days;
  const egress = egressGb * eg.internetPerGB;
  if (egress > 0.5) lines.push({ id: 'egress', label: 'Data sent to users', usd: egress, kind: 'usage' });
  const cross = (C.crossKbDay / 1e6) * C.scale * days * eg.crossRegionPerGB;
  if (cross > 0.5) lines.push({ id: 'cross-region', label: 'Traffic between regions', usd: cross, kind: 'usage' });

  let perMonth = 0;
  for (const l of lines) perMonth += l.usd;
  for (const l of lines) l.usd = Math.round(l.usd * 100) / 100;
  return { perMonth: Math.round(perMonth * 100) / 100, budget: problem.requirements.budgetPerMonth || 0, lines, perNode, storageGb: gb };
}
