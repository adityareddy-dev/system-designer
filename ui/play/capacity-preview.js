// A capacity preview states its limits and checks simple deadline arithmetic separately.
import { queueLimitFor } from '../../sim/engine.js';

export function previewLimits(problem, graph, estimate, catalog) {
  const notes = ['Rough capacity check. It does not test retries, event recovery or a full day.'];
  const queues = graph.nodes.filter(n => catalog.elementById.get(n.type)?.kind === 'queue');
  if (queues.length) notes.push('Queue acceptance is not completion. Waiting deadlines and backlog growth need a full run.');
  if ((problem.events || []).length) notes.push('The traffic multiplier is only a snapshot; overlapping events and outages are unchecked.');
  for (const [type, ms] of Object.entries(estimate?.p99AtPeak || {})) {
    const target = problem.requirements?.latencyP99Ms?.[type] ?? problem.requirements?.latencyP99Ms?.default;
    if (target && ms > target) notes.push(`Estimated ${type} p99 is ≈ ${ms} ms, already above the ${target} ms target.`);
  }
  // One directly attached consumer pool permits a transparent constant-rate calculation.
  for (const queue of queues) {
    const consumers = graph.edges.filter(e => e.from === queue.id && e.kind === 'flow').map(e => graph.nodes.find(n => n.id === e.to)).filter(n => n && catalog.elementById.get(n.type)?.kind === 'compute');
    if (consumers.length !== 1) continue;
    const worker = consumers[0], el = catalog.elementById.get(worker.type);
    if (el?.kind !== 'compute' || !el.capacity?.rps || worker.knobs?.autoscale?.on) continue;
    const capacity = el.capacity.rps * worker.units * (catalog.world.tiers?.[worker.tier]?.capacity || 1);
    for (const event of problem.events || []) {
      const effect = catalog.eventById.get(event.id)?.effects.find(e => e.op === 'traffic');
      if (!effect) continue;
      const params = { ...effect.params, ...event.params };
      const types = Object.entries(problem.requirements.mix).filter(([t, share]) => share > 0 && (el.handles.includes('*') || el.handles.includes(t)) && (!params.types || params.types.includes(t)));
      const rate = problem.requirements.peakRps * types.reduce((s, [,share]) => s + share, 0) * (params.factor || 1);
      const duration = params.holdSec || 0;
      const deadline = Math.min(...types.map(([t]) => queueLimitFor(problem.requirements, catalog.requestById.get(t))));
      const wait = (rate - capacity) * duration / capacity;
      if (wait > deadline) notes.push(`At the stated peak × ${params.factor}, ≈ ${Math.round(rate)} jobs/s against ${capacity}/s for ${duration} seconds would build ≈ ${Math.round(wait)} seconds of waiting, above the ${deadline}-second deadline. This assumes all that work reaches this queue; check routing and event timing in the day.`);
    }
  }
  return notes.join(' ');
}
