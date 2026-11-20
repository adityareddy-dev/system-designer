// The homepage lab runs the same engine and workload as the playable URL shortener.
import { createSim } from './engine.js';

export const TRAFFIC_PROBLEM = 'url-shortener';
export const TRAFFIC_DESIGNS = [
  { id: 'baseline', label: 'Six servers', units: 6, edge: false },
  { id: 'scale', label: 'Twelve servers', units: 12, edge: false },
  { id: 'edge', label: 'Six + CDN', units: 6, edge: true },
];

const minute = 60_000;
const from = (19 * 60 + 20) * minute;
const until = 22 * 60 * minute;

export function runTrafficLab(catalog, problem, designId) {
  const design = TRAFFIC_DESIGNS.find(({ id }) => id === designId);
  if (!design) throw new RangeError('Unknown traffic lab design');
  const sim = createSim({ catalog, problem, seed: 'traffic-lab' });
  sim.addNode('regional-lb', -120, 0, { id: 'lb', units: 2, zones: 2 });
  sim.addNode('vm-fleet', 60, 0, { id: 'api', units: design.units, zones: 2 });
  sim.addNode('distributed-cache', 240, 0, { id: 'cache', units: 3, knobs: { ttlSec: 86400 } });
  sim.addNode('kv-store', 420, 0, { id: 'db' });
  if (design.edge) {
    sim.addNode('cdn', -300, 0, { id: 'cdn', knobs: { ttlSec: 3600, coalesce: true } });
    sim.connect('users', 'cdn');
    sim.connect('app', 'cdn');
    sim.connect('cdn', 'lb');
  }
  // The direct connections also carry writes that must bypass the CDN.
  sim.connect('users', 'lb');
  sim.connect('app', 'lb');
  sim.connect('lb', 'api');
  sim.connect('api', 'cache');
  sim.connect('cache', 'db');

  const tick = catalog.world.sim.tickMs;
  const samples = [];
  let spikeOffered = 0;
  let spikeDropped = 0;
  let peakApp = 0;
  sim.start();
  sim.advance(from);
  while (sim.clockMs < until && sim.tick()) {
    const state = sim.state();
    const { offeredRps, successRps, failRps } = state.traffic;
    const active = state.events.some(e => e.id === 'viral-spike' && e.active);
    if (active) {
      spikeOffered += offeredRps * tick / 1000;
      spikeDropped += failRps * tick / 1000;
      peakApp = Math.max(peakApp, state.nodes.find(n => n.id === 'api').incomingRps);
    }
    if ((state.clockMs - from - tick) % minute !== 0) continue;
    samples.push({
      clock: state.clockLabel, active, offeredRps, successRps, failRps,
      nodes: Object.fromEntries(state.nodes.map(n => [n.id, { rps: n.incomingRps, util: n.util, status: n.status }])),
    });
  }
  sim.advance(catalog.world.sim.dayMs - sim.clockMs);
  const { slo } = sim.result();
  return {
    samples, spikeOffered: Math.round(spikeOffered), spikeDropped: Math.round(spikeDropped), peakApp,
    availability: slo.availability.actual, p99: slo.latency.worstP99Ms, cost: slo.cost.perMonth,
  };
}
