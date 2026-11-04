// Describe the check that passed at the held lesson moment.
export function goalPassed(goal, value, nodeName = 'The part') {
  const percent = x => `${Math.round(x * 1000) / 10}%`;
  const format = ['util', 'availability', 'hitRate', 'errors', 'compliance'].includes(goal.metric) ? percent :
    goal.metric === 'p99' ? x => `${Math.round(x)} ms` :
    goal.metric === 'cost' ? x => `$${Math.round(x).toLocaleString('en-US')} a month` : x => String(x);
  const label = { util: `${nodeName} busy`, availability: 'Requests served', hitRate: 'Cache hit rate',
    errors: 'Failed requests', compliance: 'Compliance checks passed', duplicates: 'New duplicates',
    p99: 'Request latency (p99)', cost: 'Cost' }[goal.metric];
  const op = { '<=': 'at most', '<': 'under', '>=': 'at least', '>': 'over', '==': 'exactly' }[goal.op];
  return `Check passed now: ${label} ${format(value)}, goal ${op} ${format(goal.value)}.`;
}
