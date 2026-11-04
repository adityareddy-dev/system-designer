// Three Hard problems that fill the gaps in the bank: a job scheduler (core), a firmware rollout (IoT) and a battle-royale launch (games).
// Every figure is a rough, real-world approximation and the notes say so.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'core', title: 'Hard picks', blurb: 'Harder problems for the core, IoT and games groups.' },
  problems: [
{
  id: 'job-scheduler', title: 'Scheduled job service', difficulty: 'Hard',
  concepts: ['queues-backpressure', 'idempotency-retries'],
  like: 'a cron-as-a-service product',
  brief: 'Customers register jobs: "call my web address every night at 02:00" or "every hour on the hour". Your service must fire each job on time, exactly once, even when a machine dies halfway. Half the world picks the top of the hour, so a huge crowd of jobs comes due in the same second.',
  clarify: [
    { q: 'How late may a job fire?', a: 'Within about 5 seconds of its time is fine. A minute late is a failure.' },
    { q: 'What if a job is delivered twice?', a: 'That is the worst outcome: a bill sent twice, a backup run twice. Twice must never happen, even if a worker crashes and the job is tried again.' },
    { q: 'Do jobs we cannot run get lost?', a: 'No. A job that keeps failing is parked where the customer can see it, and everything else carries on.' }
  ],
  requirements: {
    users: '300,000 customers and 40 million jobs (approx.)', monthlyUsers: 300000, peakRps: 1200,
    mix: { webhook: 0.7, write: 0.15, read: 0.15 }, latencyP99Ms: { default: 1500, webhook: 5000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: true, compliance: [], budgetPerMonth: 12000, storageTb: 0.3,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['A job record is about 1 KB (approx.).', 'At the top of the hour about 1,200 requests a second come due for a few minutes (approx.).', 'One app server handles about 1,000 requests a second (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'flat', sources: { 'partner-system': 0.7, 'web-browser': 0.2, 'admin-console': 0.1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('jobs', 'partner-system', -80, 'Job callers'), S('web', 'web-browser', 40, 'Dashboard'), S('admin', 'admin-console', 160, 'Operators')], edges: [] },
  events: [ { id: 'flash-crowd', at: '12:00', params: { factor: 3 } }, { id: 'duplicate-delivery', at: '15:00' } ],
  eventPool: ['poison-message', 'db-failover'],
  numbers: [
    { label: 'Jobs firing per second at the top of the hour', value: 840, unit: 'jobs/s', how: '1,200 × 0.7 (approx.)', ask: true },
    { label: 'Job records stored', value: 40, unit: 'GB', how: '40 million jobs × 1 KB ≈ 40 GB, small enough for one database (approx.)', ask: true },
    { label: 'Workers to run the top of the hour', value: 24, unit: 'workers', how: 'Each worker finishes about 200 light jobs a second; 840 ÷ 200 ≈ 5, plus room for retries and the 3 times crowd (approx.)' }
  ],
  hints: [
    'Jobs come due in a wall at the top of the hour. What can hold the wall so the servers are not flooded?',
    'A queue holds the wall and workers drain it at their own pace. If a worker dies, the same job is tried again, so something must notice a job already ran.',
    'Load balancer, servers, a queue with workers, an idempotency store, a dead-letter queue for jobs that keep failing, and a SQL database.'
  ],
  editorial: {
    summary: 'The schedule tells the system what is due. A queue turns the wall of due jobs into a steady line, workers pull from it at a fixed pace, and an idempotency store makes a retried job a no-op. Jobs that keep failing are parked so one bad job never blocks the rest.',
    designs: [ { name: 'Queue, workers and an idempotency store', why: 'The servers drop each due job on the queue, and the workers drain it. Before running, a worker checks the idempotency store, so a job re-tried after a crash does not run twice. A dead-letter queue parks jobs that keep failing, and the SQL database holds the schedule.',
      graph: { nodes: [S('jobs', 'partner-system', -80), S('web', 'web-browser', 40), S('admin', 'admin-console', 160),
        N('lb', 'regional-lb', X[1], 40, { zones: 2, units: 2 }), N('api', 'vm-fleet', X[2], 40, { units: 6, zones: 2 }),
        N('db', 'sql-primary', X[3], 160),
        N('q', 'queue', X[4], -40), N('wk', 'worker-pool', X[5], -40, { units: 24 }), N('idem', 'idempotency-store', X[4], 60),
        N('dlq', 'dead-letter-queue', X[5], 60), N('cust', 'payment-processor', X[6], 60, { label: 'Customer web addresses' }), N('metrics', 'metrics', X[6], -40), N('alerts', 'alerting', X[7], -40)],
        edges: [['jobs', 'lb'], ['web', 'lb'], ['admin', 'lb'], ['lb', 'api'], ['api', 'db'], ['api', 'q'], ['q', 'wk'], ['wk', 'idem'], ['wk', 'cust'], ['q', 'dlq'], ['wk', 'db'], ['wk', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 1000, costPerMonth: 6991 } } ],
    tradeoffs: [
      'Firing a few seconds early and spreading the wall over a short window flattens the peak, at the price of jobs that are not to the second.',
      'Checking for a repeat before running costs one lookup per job, and it is the only thing that makes "exactly once" true after a crash.',
      'A dead-letter queue keeps a poison job from blocking the line, but someone must look at what lands there.',
      'One database is simple and enough for the schedule; sharding it by customer is the next step if jobs reach billions.'
    ],
    realWorld: 'Hosted schedulers fire millions of jobs a day, and the top of the hour is always the busiest minute, since people pick round times (approx.).'
  },
  daily: false
},
{
  id: 'firmware-rollout', title: 'Firmware rollout', difficulty: 'Hard',
  concepts: ['cdn', 'rate-limiting'],
  like: 'an over-the-air update for a million smart devices',
  brief: 'A new firmware goes out to a million smart devices at 03:00 when they are idle. Every device asks "is there an update?", then downloads the same file in pieces, then reports back. If they all wake together, they can flatten your service, and a device that fails to update must not be left broken.',
  clarify: [
    { q: 'Do all devices need the update at once?', a: 'No. Within a few hours is fine, so the rush can be spread out.' },
    { q: 'Are the files the same for everyone?', a: 'Yes, per model. The same pieces are asked for by hundreds of thousands of devices.' },
    { q: 'What if a device keeps failing?', a: 'It keeps its old firmware and tries again later. The service must tell us how many devices updated.' }
  ],
  requirements: {
    users: '1 million devices (approx.)', monthlyUsers: 1000000, peakRps: 6000,
    mix: { read: 0.55, telemetry: 0.3, event: 0.1, write: 0.05 }, latencyP99Ms: { default: 800 }, availability: 0.995,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 14000, storageTb: 2,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 }, homeRegion: 'us',
    notes: ['The firmware is about 40 MB, cut into 1 MB pieces (approx.).', 'Devices wake together in the first minutes after 03:00 (approx.).', 'One app server handles about 1,000 requests a second (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'drop', sources: { 'iot-device': 0.95, 'admin-console': 0.05 }, params: { dropAt: '03:00' } },
  requires: {}, palette: null,
  starter: { nodes: [S('devices', 'iot-device', -20, 'Devices'), S('ops', 'admin-console', 120, 'Fleet team')], edges: [] },
  events: [ { id: 'thundering-herd', at: '03:05', params: { factor: 3 } }, { id: 'network-partition', at: '14:00' } ],
  eventPool: ['cache-stampede', 'zone-outage'],
  numbers: [
    { label: 'Piece requests per second at the start', value: 3300, unit: 'req/s', how: '6,000 × 0.55 (approx.)', ask: true },
    { label: 'Data to send', value: 40, unit: 'TB', how: '1 million devices × 40 MB = 40 TB (approx.)', ask: true },
    { label: 'Share served from the edge copy', value: 0.99, unit: 'of pieces', how: 'Everyone asks for the same pieces, so an edge copy answers nearly all of them (approx.)' }
  ],
  hints: [
    'A million devices ask for the same few files. What should answer them, and what should never see them?',
    'A CDN with a long copy time serves the pieces. The small "is there an update" and "I finished" calls need a rate limiter and a stream so they cannot flood the database.',
    'CDN, origin shield and object storage for the pieces; load balancer, rate limiter, servers, an event stream and a key-value store for status.'
  ],
  editorial: {
    summary: 'The firmware pieces never change, so the edge serves them. The small status calls are the part that can hurt: a rate limiter and a stream take the wall of reports and let the database fill at its own pace.',
    designs: [ { name: 'Edge pieces, rate-limited status calls', why: 'The CDN keeps each piece for a week and the shield collapses misses into one trip to object storage. Status calls pass a rate limiter and land on an event stream, which a small worker group writes into the key-value store at a steady pace.',
      graph: { nodes: [S('devices', 'iot-device', -20), S('ops', 'admin-console', 120),
        N('cdn', 'cdn', X[1], -100, { knobs: { ttlSec: 604800, coalesce: true } }), N('shield', 'origin-shield', X[2], -100), N('obj', 'object-storage', X[3], -100),
        N('lb', 'network-lb', X[1], 80, { zones: 2 }), N('rl', 'rate-limiter', X[2], 80), N('api', 'vm-fleet', X[3], 80, { units: 6, zones: 2 }),
        N('es', 'event-stream', X[4], 80, { units: 2 }), N('wk', 'worker-pool', X[5], 80, { units: 4 }), N('db', 'kv-store', X[6], 80, { units: 3 }),
        N('metrics', 'metrics', X[4], 220), N('alerts', 'alerting', X[5], 220)],
        edges: [['devices', 'cdn'], ['cdn', 'shield'], ['shield', 'obj'], ['devices', 'lb'], ['ops', 'lb'], ['lb', 'rl'], ['rl', 'api'], ['api', 'es'], ['es', 'wk'], ['wk', 'db'], ['api', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 1000, costPerMonth: 5124 } } ],
    tradeoffs: [
      'Rolling out to a few percent first catches a bad firmware before it reaches everyone, at the price of a slower rollout.',
      'Random delays on each device spread the rush for free, and cost nothing on the server side.',
      'A rate limiter protects the database, but devices that are turned away must back off, not retry at once.',
      'A week-long edge copy needs a new file name for each version, so devices never read a stale piece.'
    ],
    realWorld: 'Large device makers stage updates over days and rely on edge networks, because a million devices asking at once would otherwise look like an attack (approx.).'
  },
  daily: false
},
{
  id: 'battle-royale', title: 'Battle royale launch', difficulty: 'Hard',
  concepts: ['realtime-connections', 'hot-keys'],
  like: 'a 100-player last-one-standing game on launch night',
  brief: 'On launch night millions of players queue for matches of 100. Each match streams positions many times a second, the lobby shows the live player count, and one patch notes page is opened by everyone. Connections must stay open, a match server dying must not end a match, and a few hot items, like the daily reward, are hit by everybody.',
  clarify: [
    { q: 'How fast must positions arrive?', a: 'Within about 150 ms for players near the servers. Counting the trip across an ocean for everyone else, the target here is a 450 ms p99 (approx.).' },
    { q: 'If a match server dies, may the match be lost?', a: 'The match may be lost, but every player keeps their progress and rewards.' },
    { q: 'Can the lobby count be a little old?', a: 'Yes, a few seconds. It is the same number for everyone.' }
  ],
  requirements: {
    users: '5 million players a month (approx.)', monthlyUsers: 5000000, peakRps: 15000,
    mix: { message: 0.65, read: 0.15, write: 0.1, login: 0.05, event: 0.05 }, latencyP99Ms: { default: 450, message: 450 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: true, compliance: [], budgetPerMonth: 30000, storageTb: 2,
    userRegions: { us: 0.4, eu: 0.35, apac: 0.25 }, homeRegion: 'us',
    notes: ['A match has 100 players and sends about 10 position updates a second each (approx.).', 'Everyone opens the lobby count and the daily reward (approx.).', 'One app server handles about 1,000 requests a second (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'game-client': 0.9, 'web-browser': 0.1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('players', 'game-client', -20, 'Players'), S('web', 'web-browser', 120, 'Website')], edges: [] },
  events: [ { id: 'viral-spike', at: '20:00', params: { factor: 2 } }, { id: 'hot-key', at: '20:30', params: { share: 0.3 } } ],
  eventPool: ['zone-outage', 'cache-stampede'],
  numbers: [
    { label: 'Position updates per second at peak', value: 9750, unit: 'msg/s', how: '15,000 × 0.65 (approx.)', ask: true },
    { label: 'Servers for the request and login calls', value: 8, unit: 'servers', how: '15,000 × 0.35 other calls ÷ about 1,000 per server ≈ 5, plus room for the spike (approx.)', ask: true },
    { label: 'Open connections at peak', value: 300000, unit: 'sockets', how: 'About 3,000 matches × 100 players = 300,000 (approx.)' }
  ],
  hints: [
    'Players stay connected for minutes. Which part holds a connection open, and which part answers the same question for everyone?',
    'A socket gateway holds the connections and a pub/sub spreads positions inside a match. The lobby count and daily reward are one answer for everyone, so cache it.',
    'Load balancer, socket gateway, pub/sub, servers, a cache for the hot items, a coordination service for who owns each match, and a wide-column store.'
  ],
  editorial: {
    summary: 'Two kinds of traffic hide in one game: long-lived match connections that need a gateway and pub/sub, and a few hot read answers that one cache can absorb. Keeping them apart lets each be sized on its own.',
    designs: [ { name: 'Socket gateway, pub/sub and a hot-item cache', why: 'The gateway holds the connections and pub/sub fans positions out inside a match. The lobby count and daily reward come from a cache so the hot key never reaches the database, and a coordination service knows which server owns each match.',
      graph: { nodes: [S('players', 'game-client', -20), S('web', 'web-browser', 120),
        N('lb', 'regional-lb', X[1], 40, { zones: 2, units: 2 }), N('ws', 'websocket-gateway', X[2], -60, { units: 6 }), N('ps', 'pubsub', X[3], -60),
        N('api', 'vm-fleet', X[2], 120, { units: 10, zones: 2 }), N('cache', 'distributed-cache', X[3], 120, { units: 3, knobs: { ttlSec: 5 } }),
        N('coord', 'coordination-service', X[4], -60), N('db', 'wide-column', X[4], 120, { units: 8 }),
        N('metrics', 'metrics', X[5], 120), N('alerts', 'alerting', X[6], 120)],
        edges: [['players', 'lb'], ['web', 'lb'], ['lb', 'ws'], ['lb', 'api'], ['ws', 'ps'], ['ws', 'coord'], ['api', 'cache'], ['cache', 'db'], ['ws', 'db'], ['ps', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 1000, costPerMonth: 16063 } } ],
    tradeoffs: [
      'Sending positions as small, frequent updates feels smooth but costs bandwidth; sending fewer, larger ones is cheaper and feels laggy.',
      'A five second copy of the lobby count is invisible to players and removes almost all of that load.',
      'Spreading a hot counter over several keys stops one partition from melting, at the price of adding them up when read.',
      'Losing a match when its server dies is acceptable if progress and rewards are saved elsewhere.'
    ],
    realWorld: 'Launch nights for big online games reach millions of players at once; studios keep match state in memory and save only results to a database (approx.).'
  },
  daily: false
}
  ]
};
