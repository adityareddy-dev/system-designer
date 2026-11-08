// Prompt-specific, deterministic counterexamples replay the candidate's graph and workload.
import { createSim } from '../../sim/engine.js';
export function claimsFor(question, problem, graph, catalog, result) {
  const fleetCost = n => {
    const measured = result?.nodes?.find(row => row.id === n.id)?.usd;
    if (Number.isFinite(measured)) return measured;
    const el = catalog.elementById.get(n.type);
    const tier = el.knobs.includes('tier') ? (catalog.world.tiers[n.tier] || catalog.world.tiers.M).cost : 1;
    return (el.cost.base || 0) + (n.units || 1) * el.cost.perUnit * tier;
  };
  const paid = graph.nodes.filter(n => catalog.elementById.get(n.type)?.units.max > 1 && catalog.elementById.get(n.type)?.cost?.perUnit).sort((a,b) => fleetCost(b) - fleetCost(a))[0];
  const paidName = paid ? `${paid.label || catalog.elementById.get(paid.type).name} (${paid.id})` : 'the largest paid fleet';
  const target = graph.nodes.find(n => n.id === question.nodeId) || paid || graph.nodes.find(n => !n.locked);
  const nodeId = target?.id;
  const cases = {
    cache: ['cold', 'retry'], pool: ['replica', 'retry'], partition: ['hot', 'retry'],
    event: ['retry', 'replica'], capacity: ['replica', 'growth'], cost: ['cut', 'saving'],
    route: ['route', 'retry'], latency: ['distance', 'growth']
  };
  const names = {
    cold: 'Bypassing this cache preserves the served and latency targets for the full day',
    replica: 'Losing one unit at this boundary preserves the served and latency targets',
    retry: 'A lost-reply retry burst preserves the served and latency targets',
    hot: 'Concentrating 60% of keyed traffic on one item preserves the served and latency targets',
    growth: 'Doubling arrivals preserves the served and latency targets',
    cut: `Removing 30% of ${paidName} preserves the required service and data guarantees`,
    saving: `Cutting 30% of ${paidName} saves 30% of the whole bill while preserving service and data guarantees`,
    route: 'Losing an active delivery connection still leaves a usable service path',
    distance: 'Moving this dependency to a distant region preserves the latency and served targets'
  };
  return (cases[question.kind] || ['replica','retry']).map(kind => ({ id: `${question.kind}:${kind}`, kind, nodeId: ['cut','saving'].includes(kind) ? paid?.id : nodeId, text: names[kind] }));
}
export function checkClaim(claim, { problem, graph, result, catalog }) {
  const position = claim.position === 'fail' ? 'fail' : 'hold';
  const label = id => {
    const placed = graph.nodes.find(n => n.id === id);
    return `${placed?.label || catalog.elementById.get(placed?.type)?.name || 'Part'} (${id})`;
  };
  const sim = createSim({ catalog, problem, seed: result.seed || 'practice' }); sim.loadGraph(graph);
  const candidate = sim.getGraph();
  const active = id => result.nodes?.some(n => n.id === id && n.peakRequests > 0);
  let node = candidate.nodes.find(n => n.id === claim.nodeId);
  let applied = false;
  const steps = [`Start with your ${graph.nodes.length} parts and this problem's stated workload. Baseline: ${(result.slo.availability.actual * 100).toFixed(2)}% served, ≈ $${Math.round(result.slo.cost.perMonth)}/month.`];
  let events = [...problem.events], requirements = { ...problem.requirements };
  const addEvent = (id, params = {}) => { events.push({ id, at: '12:00', params }); };
  if (claim.kind === 'replica' && node) {
    applied = !!catalog.elementById.get(node.type)?.capacity && active(node.id);
    const before = node.units, factor = (before - 1) / before;
    if (node.knobs.autoscale) node.knobs.autoscale = { ...node.knobs.autoscale, on: false };
    events.push({ id: 'noisy-neighbor', at: '00:00', params: { target: node.id, factor, durationSec: 86400 } });
    steps.push(`Crash one unit of ${label(node.id)}: ${before} → ${before - 1} serving units. Model this as ≈ ${factor.toFixed(4)} of aggregate capacity for the day; keep paying for installed units and freeze autoscaling. Health routing within the aggregate pool is assumed.`);
  } else if (claim.kind === 'cold' && node) {
    applied = catalog.elementById.get(node.type)?.kind === 'cache' && active(node.id);
    const incoming = candidate.edges.filter(e => e.to === node.id && e.kind === 'flow');
    const outgoing = candidate.edges.filter(e => e.from === node.id && e.kind === 'flow');
    candidate.nodes = candidate.nodes.filter(n => n !== node);
    candidate.edges = candidate.edges.filter(e => e.from !== node.id && e.to !== node.id);
    for (const a of incoming) for (const b of outgoing) candidate.edges.push({ from: a.from, to: b.to });
    steps.push(`Remove ${label(node.id)} and connect each upstream delivery path to its origin. Replay cold traffic for the day. A refused bypass is a missing route, never a successful fallback.`);
  } else if (['cut','saving'].includes(claim.kind) && node) {
    const before = node.units; node.units = Math.max(catalog.elementById.get(node.type).units.min, node.zones || 1, Math.floor(before * .7));
    applied = node.units < before && node.units <= Math.floor(before * .7) && active(node.id);
    if (node.knobs.autoscale) node.knobs.autoscale = { ...node.knobs.autoscale, on: false };
    steps.push(`Cut ${label(node.id)} from ${before} to ${node.units} paid units, bounded by its catalog and zone floors. Disable autoscaling so it cannot undo the saving.`);
    if (node.units === before || node.units > Math.floor(before * .7)) steps.push('The minimum fleet prevents this cut. Keeping the original unit count does not support a claim about removing 30%.');
  } else if (claim.kind === 'retry') {
    addEvent('retry-storm'); steps.push('At 12:00 schedule a 30-second error burst at the busiest compute part. The configured retry count and backoff drive the subsequent retry load. This checks throughput and deadlines, not exactly-once business effects.');
  } else if (claim.kind === 'hot') {
    addEvent('hot-key', { share: .6 }); steps.push('At 12:00 direct 60% of keyed traffic to one item for an hour. The engine uses one keyed unit and any upstream cache; it does not model a tenant isolation policy.');
  } else if (claim.kind === 'growth') {
    applied = requirements.peakRps > 0 && (result.timeline?.some(row => row.offeredRps > 0) || Object.keys(result.slo.latency.byType || {}).length > 0);
    requirements.peakRps *= 2; steps.push(`Double arrivals to ${requirements.peakRps}/s; keep the request mix, deadlines and dependency quotas.`);
  } else if (claim.kind === 'route') {
    // Sample baseline flow before changing the graph. Do not claim an idle edge was tested.
    sim.start(); sim.tick();
    const baseline = sim.flows();
    const edge = candidate.edges.find(e => {
      if (e.kind !== 'flow') return false;
      const i = baseline.edgeIds.indexOf(e.id);
      return i >= 0 && baseline.edgeRps.subarray(i * baseline.typeIds.length, (i + 1) * baseline.typeIds.length).some(rps => rps > 0);
    });
    applied = !!edge;
    if (edge) candidate.edges = candidate.edges.filter(e => e !== edge);
    steps.push(edge ? `Disconnect ${label(edge.from)} → ${label(edge.to)}, observed carrying requests in the baseline sample. Test the remaining delivery routes.` : 'No delivery connection carried requests in the baseline sample. No active route was selected to fail.');
  } else if (claim.kind === 'distance' && node) {
    const region = problem.requirements.homeRegion === 'eu' ? 'apac' : 'eu';
    applied = node.region !== region && active(node.id);
    node.region = region; steps.push(`Move ${label(node.id)} to ${node.region}. Keep its callers in place; replay synchronous travel and service time.`);
  }
  const replay = createSim({ catalog, problem: { ...problem, events, requirements }, seed: result.seed || 'practice' });
  replay.loadGraph(candidate); replay.start();
  if (['hot', 'retry'].includes(claim.kind)) {
    replay.advance(12 * 3600000);
    // Observe the intervention tick: disconnected and idle boundaries cannot test the claim.
    replay.tick();
    const state = replay.state();
    const flows = replay.flows();
    const eventId = claim.kind === 'hot' ? 'hot-key' : 'retry-storm';
    const targets = new Set(state.events.findLast(e => e.id === eventId && e.atMs === 12 * 3600000)?.nodeIds || []);
    applied = candidate.nodes.some(n => {
      if (!targets.has(n.id)) return false;
      const el = catalog.elementById.get(n.type);
      if (claim.kind === 'retry') {
        const offset = flows.nodeIds.indexOf(n.id) * flows.typeIds.length;
        return el.kind === 'compute' && flows.nodeFailRps.subarray(offset, offset + flows.typeIds.length).some(rps => rps > 0);
      }
      const cachedTraffic = el.kind === 'cache' && flows.typeIds.some((type, t) => catalog.requestById.get(type)?.cacheable && candidate.edges.some(edge => edge.to === n.id && flows.edgeRps[flows.edgeIds.indexOf(edge.id) * flows.typeIds.length + t] > 0));
      const modeled = el.params?.keyed && (n.units > 1 || el.params.perKeyReadRps) || cachedTraffic;
      if (!modeled) return false;
      return state.nodes.find(s => s.id === n.id)?.incomingRps > 0;
    });
    if (claim.kind === 'retry') steps.push(applied
      ? `At the intervention tick, the error burst lost replies at ${[...targets].map(label).join(', ')}.`
      : 'At the intervention tick, the error burst reached no compute part carrying requests.');
  }
  replay.advance(86400000);
  const checked = replay.result(), slo = checked.slo;
  const service = checked.checks.availability && checked.checks.latency;
  const guarantees = service && checked.checks.safety;
  const held = applied && (claim.kind === 'saving' ? guarantees && slo.cost.perMonth <= result.slo.cost.perMonth * .7 : claim.kind === 'cut' ? guarantees : service);
  if (!applied) {
    steps.push('Not tested by this replay. The intervention did not change an applicable boundary carrying this workload.');
    const retry = ['cut', 'saving'].includes(claim.kind)
      ? 'a fleet large enough to remove 30% while respecting its minimum and zone count'
      : claim.kind === 'hot' ? 'a connected keyed store with multiple units or a per-key limit, or a cache carrying cacheable traffic at noon'
      : claim.kind === 'retry' ? 'a connected compute part carrying requests at noon'
      : claim.kind === 'cold' ? 'a cache on a live delivery path'
      : claim.kind === 'route' ? 'a delivery connection carrying requests at the start of the baseline replay'
      : claim.kind === 'growth' ? 'a workload with an active request source and positive offered traffic'
      : claim.kind === 'distance' ? 'a connected dependency in a different starting region'
      : 'a connected part with modeled capacity';
    steps.push(`Try ${retry} before replaying this intervention.`);
  }
  const first = checked.firstFailure;
  const latency = slo.availability.actual > 0 ? `worst p99 about ${Math.round(slo.latency.worstP99Ms)} ms for completed requests` : 'p99 unmeasured: no requests completed';
  steps.push(`Replay the full day: ${(slo.availability.actual * 100).toFixed(2)}% served against ${(slo.availability.target * 100).toFixed(2)}%; ${latency}; ≈ $${Math.round(slo.cost.perMonth)}/month. Service ${service ? 'held' : 'broke'}; data checks ${checked.checks.safety ? 'held' : 'broke'}.`);
  if (first) steps.push(`First material failure at ${Math.floor(first.atMs / 60000)} minutes: ${first.kind} at ${label(first.nodeId)}.`);
  const matched = applied ? held === (position === 'hold') : null;
  const outcome = !applied ? 'untested' : held ? 'held' : 'failed';
  steps.push(`${!applied ? 'Not tested by this replay' : held ? 'Claim held' : 'Claim failed'}. ${applied ? `Your prediction that the claim would ${position} ${matched ? 'matched' : 'did not match'} the measured result. ` : 'Neither prediction receives credit or a failure. '}A passing rate-model replay does not prove transactions, per-tenant quotas or external exactly-once effects.`);
  return { claimId: claim.id, position, matched, outcome, held: !!held, applied, steps, checks: checked.checks, score: checked.score.total, cost: slo.cost.perMonth };
}

export function summarizeClaims(outcomes) {
  const tested = outcomes.filter(c => c.applied !== false && c.outcome !== 'untested');
  return {
    covered: tested.filter(c => c.matched ?? (c.held === (c.position !== 'fail'))).length,
    total: tested.length,
    held: tested.filter(c => c.held).length,
    failed: tested.filter(c => !c.held).length,
    untested: outcomes.length - tested.length,
  };
}
