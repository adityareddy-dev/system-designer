// Describe the check that passed at the held lesson moment.
export function goalPassed(goal, value, nodeName = 'The part', state) {
  const percent = x => `${Math.round(x * 1000) / 10}%`;
  const format = ['util', 'availability', 'hitRate', 'errors', 'compliance'].includes(goal.metric) ? percent :
    goal.metric === 'p99' ? x => `${Math.round(x)} ms` :
    goal.metric === 'cost' ? x => `$${Math.round(x).toLocaleString('en-US')} a month` : x => String(x);
  const label = { util: `${nodeName} busy`, availability: 'Requests served', hitRate: 'Cache hit rate',
    errors: 'Failed requests', compliance: 'Compliance checks passed', duplicates: 'New duplicates',
    p99: 'Request latency (p99)', cost: 'Cost' }[goal.metric];
  const op = { '<=': 'at most', '<': 'under', '>=': 'at least', '>': 'over', '==': 'exactly' }[goal.op];
  let text = `Check passed now: ${label} ${format(value)}, goal ${op} ${format(goal.value)}.`;
  if (state && goal.holdSec) text += ` Held for ${goal.holdSec} seconds.`;
  const latency = state?.slo?.latency;
  if (goal.metric === 'availability' && latency?.p99Ms != null && latency?.targetMs != null) {
    text += ` Speed is a separate check: p99 ${Math.round(latency.p99Ms)} ms ${latency.p99Ms <= latency.targetMs ? 'meets' : 'misses'} its ${Math.round(latency.targetMs)} ms target. Requests can complete and still be slow.`;
  }
  if (state) text += ' Since-start history includes earlier minutes.';
  return text;
}
