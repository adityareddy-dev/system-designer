// Event guidance names controls that change this model, and labels preventive production practices separately.
const FIX = {
  'disk-full': 'Put a queue before the write path so writes can wait while the disk is repaired. Connected metrics and alerting shorten detection; logs, traces and dashboards shorten diagnosis. Retention is preventive planning, not an immediate repair in this model.',
  'dns-misconfig': 'Lower DNS TTL to 60 seconds before changes. A DNS part on the affected route limits how long its downstream routers keep the wrong address. A disconnected DNS part cannot help.',
  'cert-expiry': 'Connect a synthetic probe and pager so an expired certificate is detected and acknowledged sooner. Automatic renewal prevents this in production; the model measures incident response.',
  'schema-migration-lock': 'Buffer writes through a queue while the table is locked. Online migration is a production planning practice; adding CI/CD does not shorten this fixed lock in the model.',
  'cardinality-explosion': 'Connect alerting to metrics so the high-series-count incident is noticed and stopped sooner. Limiting metric labels prevents this in production; the model measures the response time.',
};
export function mechanicalCounter(eventId, counter) {
  if (eventId === 'disk-full' && counter.knob === 'retentionDays') return false;
  if (eventId === 'dns-misconfig' && counter.element === 'synthetic-probe') return false;
  if (eventId === 'schema-migration-lock' && counter.element === 'ci-cd') return false;
  if (eventId === 'thundering-herd' && counter.knob === 'backoff') return false;
  return true;
}
export function guidedEvent(base, text = {}) {
  return { ...base, ...text,
    counters: (base.counters || []).filter(c => mechanicalCounter(base.id, c)),
    debrief: { ...base.debrief, ...(FIX[base.id] ? { fix: FIX[base.id] } : {}), ...text.debrief } };
}
