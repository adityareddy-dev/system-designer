// Declarative product limits checked against active data paths rather than decorative parts.
import { sourceFlow } from './paths.js';

export function obligationFailures(S) {
  const r = S.problem.requirements, failures = [], reached = new Set();
  for (let t = 0; t < S.T; t++) if (S.mixArr[t] > 0) for (const u of sourceFlow(S, t).reached) reached.add(u);
  if (r.retentionDays > 0) {
    const stores = S.model.nodes.filter(n => reached.has(n.i) && n.kind === 'store' && n.role !== 'replica' && !n.el.params?.isCopy && n.el.knobs?.includes('retentionDays'));
    for (const n of stores) if (n.retentionDays < r.retentionDays) failures.push({ code: 'retention', nodeId: n.id, knob: 'retentionDays', message: `${n.g.label || n.el.name} keeps data for ${n.retentionDays} days; this problem requires at least ${r.retentionDays} days. Increase Keep for (days) or provide a durable archival path before shortening retention.` });
  }
  if (r.maxRetentionDays > 0) for (const n of S.model.nodes) {
    if (reached.has(n.i) && n.kind === 'store' && n.el.knobs?.includes('retentionDays') && n.retentionDays > r.maxRetentionDays) failures.push({ code: 'expiry', nodeId: n.id, knob: 'retentionDays', message: `${n.g.label || n.el.name} keeps data for ${n.retentionDays} days; this problem permits at most ${r.maxRetentionDays} day. Set Keep for (days) within that limit and check expiry on the read path.` });
  }
  return failures;
}
