// A Hard problem for the telecom group: bulk text campaigns sent through carrier partners with hard speed limits.
// Every figure is a rough real-world approximation and the notes say so.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'telecom', title: 'Telecom and messaging', blurb: 'Texts and calls: carriers with hard limits, and codes that must arrive in seconds.' },
  problems: [
{
  id: 'bulk-sms-campaigns', title: 'Bulk text campaigns', difficulty: 'Hard',
  concepts: ['queues-backpressure', 'rate-limiting', 'idempotency-retries'],
  like: 'the platform behind store coupons and delivery alerts, like Twilio or Braze',
  brief: 'Businesses send a coupon or an alert to hundreds of thousands of phones at once. Carriers accept texts only at a fixed speed, every text costs real money, and a person who replied STOP must never be texted again. Delivery receipts come back by the thousand and must be counted.',
  clarify: [
    { q: 'Can a campaign take a few minutes to finish?', a: 'Yes, within its window. Sending slower than the carrier allows is fine. Sending faster gets you blocked.' },
    { q: 'Can a phone get the same text twice?', a: 'No. Retries after a carrier timeout must not send it again, and a repeat is real money wasted.' },
    { q: 'What about people who texted STOP?', a: 'They must be checked before every send, and the check is audited. One wrong text can be a legal problem.' },
    { q: 'Do receipts have to be instant?', a: 'No. A few minutes is fine, but none may be lost or counted twice.' }
  ],
  requirements: {
    users: '60 thousand businesses (approx.)', monthlyUsers: 60000, peakRps: 30,
    mix: { notify: 0.4, event: 0.35, write: 0.1, read: 0.15 }, latencyP99Ms: { default: 500, notify: 60000, event: 120000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: ['audit-log'], budgetPerMonth: 150000, storageTb: 5,
    userRegions: { us: 0.6, eu: 0.3, asia: 0.1 }, homeRegion: 'us',
    notes: ['A busy hour sends about 12 texts a second, and a carrier accepts only a fixed speed (approx.).', 'Each text costs about a cent, so a repeated send is a visible bill (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'business-hours', sources: { 'cron-scheduler': 0.5, 'partner-system': 0.3, 'admin-console': 0.2 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('schedule', 'cron-scheduler', -60, 'Scheduled campaigns'), S('carrier', 'partner-system', 40, 'Carrier receipts'), S('admin', 'admin-console', 140, 'Marketers')], edges: [] },
  events: [ { id: 'third-party-rate-limit', at: '09:30', params: { rpsCapFactor: 0.7, durationSec: 1200 } }, { id: 'duplicate-delivery', at: '12:00', params: { share: 0.03 } }, { id: 'poison-message', at: '16:00', params: {} } ],
  eventPool: ['retry-storm', 'dependency-outage', 'cost-blowout'],
  numbers: [
    { label: 'Texts leaving per second at peak', value: 12, unit: 'texts/s', how: '30 × 0.4 (approx.)', ask: true },
    { label: 'Delivery receipts per second', value: 11, unit: 'receipts/s', how: '30 × 0.35 (approx.)', ask: true },
    { label: 'Cost of one repeated campaign of 500 thousand texts', value: 5, unit: 'thousand dollars', how: '500,000 × about $0.01 ≈ $5,000 (approx.). This is why repeats must not happen.' }
  ],
  hints: [
    'The carrier sets the speed, not you. What holds the work while it waits, and what makes a retry safe?',
    'Queue the sends and let workers send at the carrier pace. An idempotency key makes a retry a no-op, and a consent check runs before each send.',
    'Gateway, servers, a queue with a dead-letter queue, workers with an idempotency store and a consent service, the carrier link, and an event stream with a processor for receipts.'
  ],
  editorial: {
    summary: 'The carrier is the narrow part, so everything before it is a line. Campaigns wait in a queue, workers send at the pace the carrier allows, and an idempotency key plus a consent check run before each text. Receipts take their own path through an event stream, so counting them never slows the sends.',
    designs: [ { name: 'Queue at the carrier pace, key and consent on every send', why: 'The queue absorbs the campaign and the workers drain it at the carrier speed. The key stops a retry from texting twice, the consent check honours STOP, and receipts flow through a stream into a time-series store.',
      graph: { nodes: [S('schedule', 'cron-scheduler', -60), S('carrier', 'partner-system', 40), S('admin', 'admin-console', 140),
        N('gw', 'api-gateway', X[1], 40, { units: 1 }), N('api', 'container-cluster', X[2], 40, { units: 10, zones: 2 }),
        N('q', 'queue', X[3], -20, { knobs: { retentionDays: 4 } }), N('dlq', 'dead-letter-queue', X[3], 100),
        N('wp', 'worker-pool', X[4], -20, { units: 30, zones: 2, knobs: { retries: 3, backoff: 'exponential-jitter' } }), N('idem', 'idempotency-store', X[5], -110, { units: 2 }),
        N('consent', 'consent-service', X[5], -40, { units: 1 }), N('sms', 'sms-provider', X[6], -20, { units: 10 }), N('opt', 'kv-store', X[3], -110),
        N('es', 'event-stream', X[3], 200), N('sp', 'stream-processor', X[4], 200, { units: 4 }), N('ts', 'timeseries-db', X[5], 200),
        N('audit', 'audit-log', X[5], 100), N('metrics', 'metrics', X[2], 160), N('alerts', 'alerting', X[3], 300)],
        edges: [['schedule', 'gw'], ['carrier', 'gw'], ['admin', 'gw'], ['gw', 'api'], ['api', 'q'], ['api', 'opt'], ['q', 'wp'], ['q', 'dlq'], ['wp', 'idem'], ['wp', 'consent'], ['wp', 'sms'], ['api', 'es'], ['es', 'sp'], ['sp', 'ts'], ['api', 'audit'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 880, costPerMonth: 128000 } } ],
    tradeoffs: [
      'Sending at the carrier pace protects the account, but a huge campaign takes minutes instead of seconds.',
      'Checking consent before every send is slower than checking once per campaign, and it is the only way STOP is honoured at once.',
      'A second carrier raises uptime and speed, at the price of another contract and another limit to respect.',
      'Counting receipts from a stream can lag by minutes, but it never slows a send.'
    ],
    realWorld: 'Carriers accept bulk texts at fixed speeds, often tens to a few hundred per second per connection, and each text costs around a cent. Big senders spread a campaign over time for this reason (approx.).'
  },
  daily: true
}
  ]
};
