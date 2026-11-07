// Product deadlines and explicit boundaries shared by briefs, requirements and scored traffic days.
const DEADLINES = {
  'job-scheduler': { webhook: 60 }, 'video-upload-pipeline': { upload: 600 },
  'insurance-claims': { notify: 120 }, 'lab-results': { notify: 300 },
  'pharmacy-stock': { notify: 60 }, 'calendar-invites': { notify: 60 },
  'otp-sms-delivery': { notify: 10 }, 'ci-cd-pipeline': { batch: 120 },
  'industrial-sensors': { event: 5 },
};
const RETENTION = { 'health-records': 2555, 'smart-power-grid': 2555, 'bank-ledger': 2555, 'insurance-claims': 2555, 'tax-deadline-surge': 2555, 'benefits-portal': 2555,
  'package-tracking': 90, 'fleet-telemetry': 30, 'industrial-sensors': 5, 'shopping-cart': 30, 'ci-cd-pipeline': 30, 'email-service': 3650,
  'logs-platform': 30, 'tracing-platform': 7, 'tenant-metrics': 14, 'device-notes': 90 };
const COPY = {
  'invoicing-billing': [['No. Within a minute or two is fine, but each email goes out exactly once.', 'Provider acceptance within 120 seconds is fine. Use a stable provider key and reconcile unknown outcomes after a crash. Without provider support, one external email delivery cannot be guaranteed.']],
  'comments-and-likes': [['Comments should be kept, but losing the last few seconds in a rare crash is acceptable.', 'Comments should be kept. After a failure, at most the last 60 seconds of writes may need replay.']],
  'photo-sharing': [['Most people leave if a photo takes more than about a third of a second to show up.', 'The scored photo-read p99 target is 450 ms, including network travel. Uploads have a separate 4,000 ms target.']],
  'battle-royale': [['a match server dying must not end a match', 'a match server dying must preserve acknowledged progress within the stated recovery point'], ['The match may be lost, but every player keeps their progress and rewards.', 'The match may be lost. At most the last 60 seconds of progress and rewards may need replay after a failure; earlier acknowledged progress must survive.']],
  'wearable-health': [['Reserve fourteen offline days.', 'Reserve at least 30 days of local raw capacity for the supported 14-day outage.']],
  'job-scheduler': [['Before running, a worker checks the idempotency store, so a job re-tried after a crash does not run twice.', 'The worker durably claims a job occurrence and reuses its key at the customer endpoint. After an unknown outcome it reconciles with that endpoint; a local lookup alone cannot prevent a second external effect.']],
};

export function applyPromises(problem) {
  const replacements = [...(COPY[problem.id] || []), ['The idempotency store guarantees the retry that follows never charges twice.', 'Persist one logical payment key and reuse it at the provider. A local lookup alone cannot guarantee one charge after a crash; reconcile unknown outcomes using that same key.']];
  const rewrite = value => typeof value === 'string' ? replacements.reduce((s, [from,to]) => s.split(from).join(to), value) : Array.isArray(value) ? value.map(rewrite) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,rewrite(v)])) : value;
  const p = replacements.length ? rewrite(problem) : { ...problem };
  const r = { ...p.requirements };
  if (r.userRegions?.asia) { r.userRegions = { ...r.userRegions, apac: (r.userRegions.apac || 0) + r.userRegions.asia }; delete r.userRegions.asia; }
  if (DEADLINES[p.id]) r.queueDeadlineSec = { ...DEADLINES[p.id] };
  if (RETENTION[p.id]) {
    r.retentionDays = RETENTION[p.id];
    r.notes = [...(r.notes || []), `Scored data retention: at least ${r.retentionDays} days on active authoritative stores. Copies used only for search or reports can be rebuilt. Local device history and rollup policies still require the separate protocol check.`];
  }
  if (p.id === 'stories') { r.maxRetentionDays = 1; r.notes = [...(r.notes || []), 'Scored file retention is at most 1 day. Production visibility must also check expiry on reads; deleting a file later does not hide a cached copy.']; }
  p.requirements = r;
  if (r.mix.notify > 0) r.notes = [...(r.notes || []), 'Notification speed measures provider acceptance. Device receipt is outside this traffic model; check expiry, provider outcome and retries in the correctness trace before claiming delivery guarantees.'];
  if (p.id === 'job-scheduler') {
    p.services = { 'third-party-api': { name: 'Customer web addresses', description: 'Independent customer endpoints, reached with a stable key for each scheduled occurrence.', capacity: { rps: 10000, unit: 'webhooks per second across independent customer endpoints', note: 'Aggregate scenario quota, approx.' }, cost: {}, latencyMs: { p50: 150, p99: 1500, note: 'approx.' } } };
    p.editorial = { ...p.editorial, designs: p.editorial.designs.map(d => ({ ...d, graph: { ...d.graph, nodes: d.graph.nodes.map(n => n.ref === 'cust' ? { ...n, type: 'third-party-api' } : n) } })) };
    r.notes = [...r.notes, 'Customer web addresses have an aggregate quota of 10,000 webhooks/s across independent endpoints, with no per-call infrastructure fee. One endpoint can still time out. External one-effect delivery requires endpoint idempotency or reconciliation.'];
  }
  return p;
}
