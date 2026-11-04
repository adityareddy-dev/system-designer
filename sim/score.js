// Score out of 1,000 from world.json "scoring": reliability, latency, data safety and cost, plus pass and stars.
import { clamp } from './util.js';

export const PASS_LATENCY_SHARE = 0.95; // share of the day the p99 must meet its target
export const PASS_LATENCY_SHARE_EASY = 0.9; // Easy problems allow a few more slow minutes while the player learns sizing
export const latencyBar = (req) => (req && req.latencyBar > 0 ? req.latencyBar : PASS_LATENCY_SHARE);
export const PASS_TYPE_SHARE = 0.8; // and no single request type may meet it less often than this
export const STALE_MAX = 0.001; // read-your-writes: at most 1 in 1,000 reads may show someone an old copy of their own change

export function reliabilityPoints(world, actual, target) {
  const W = world.scoring.weights.reliability;
  if (!(target > 0) || actual >= target) return W;
  const miss = Math.max(0, Math.log10(Math.max(1e-12, 1 - actual) / Math.max(1e-12, 1 - target)));
  return W * clamp(1 - miss / 2, 0, 1);
}

export function latencyPoints(world, share) {
  return world.scoring.weights.latency * clamp(share, 0, 1);
}

export function costPoints(world, perMonth, budget) {
  const W = world.scoring.weights.cost;
  if (!(budget > 0) || perMonth <= budget) return W;
  return W * clamp(1 - (perMonth - budget) / budget, 0, 1);
}

function lossAllowed(req, ledger) {
  const lost = Math.round(ledger.lostWrites);
  if (req.dataSafety === 'no-loss') return lost < 1;
  if (req.dataSafety === 'rpo-1m') return lost <= Math.max(1, ledger.writesPerSec * 60);
  return true;
}

// ledger: { lostWrites, duplicates, staleReads, readsServed, complianceFailed: [], writesPerSec }
export function safetyPoints(world, req, ledger) {
  const W = world.scoring.weights.safety;
  let pts = W;
  const parts = [];
  const lost = Math.round(ledger.lostWrites);
  if (req.dataSafety === 'no-loss' && lost >= 1) { pts -= 100; parts.push('lost'); }
  if (req.dataSafety === 'rpo-1m' && !lossAllowed(req, ledger)) { pts -= 40; parts.push('lost'); }
  if (Math.round(ledger.duplicates) >= 1) { pts -= 50; parts.push('duplicates'); }
  const staleShare = ledger.readsServed > 0 ? ledger.staleReads / ledger.readsServed : 0;
  if (req.readYourWrites && staleShare > STALE_MAX) { pts -= 30; parts.push('stale'); }
  pts -= 40 * (ledger.complianceFailed || []).length;
  if ((ledger.complianceFailed || []).length) parts.push('compliance');
  return { points: Math.max(0, pts), parts, staleShare };
}

// Speed, safety and cost points count only for the share of requests the design actually served:
// a design that answers nothing has no speed, keeps no data and saves no money worth scoring.
export function scoreAll(world, req, m) {
  const served = clamp(m.availability, 0, 1);
  const reliability = reliabilityPoints(world, m.availability, req.availability);
  const latency = latencyPoints(world, m.latencyShare) * served;
  const safety = safetyPoints(world, req, m.ledger).points * served;
  const cost = costPoints(world, m.perMonth, req.budgetPerMonth) * served;
  const r = (x) => Math.round(x);
  return { total: r(reliability) + r(latency) + r(safety) + r(cost), reliability: r(reliability), latency: r(latency), safety: r(safety), cost: r(cost) };
}

// Each pass condition on its own, so the verdict and the score cards can say exactly which one missed.
export function passChecks(world, req, m, score) {
  const L = m.ledger;
  const budget = req.budgetPerMonth;
  const shares = Object.values(m.typeShares || {});
  const staleShare = L.readsServed > 0 ? L.staleReads / L.readsServed : 0;
  return {
    availability: m.availability >= req.availability,
    latency: m.latencyShare >= latencyBar(req) && shares.every((s) => s >= PASS_TYPE_SHARE),
    // judged on the ledger itself: the served-share scaling already counts against reliability
    safety: safetyPoints(world, req, L).points >= 150 && lossAllowed(req, L) && Math.round(L.duplicates) < 1
      && !(L.complianceFailed || []).length && !(req.readYourWrites && staleShare > STALE_MAX),
    cost: !(budget > 0) || m.perMonth <= budget,
  };
}

export function passOf(world, req, m, score) {
  const c = passChecks(world, req, m, score);
  return c.availability && c.latency && c.safety && c.cost;
}

export function starsOf(passed, total) {
  if (!passed) return 0;
  if (total >= 920) return 3;
  if (total >= 800) return 2;
  return 1;
}
