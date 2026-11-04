// Hand fixes to reference designs and problems, found by playing every design through a full simulated day.
// Same shape as calibration.js; applied first, then calibration.js on top.
const fixes = {
  // Reads and writes are judged on the stated target: 200 ms leaves room for the trip from Europe to a US region.
  // The bar is 85 percent of the day so the servers, cache and autoscaling the first lesson teaches pass without a CDN (approx.).
  'url-shortener': { requirements: { latencyP99Ms: { default: 200 }, latencyBar: 0.85 } },
  // Text that quoted a target the measured design changed.
  'collaborative-docs': { textReplace: [['Under about 150 ms. More than that and cursors feel jumpy.', 'Under about 250 ms, counting the trip across an ocean. More than that and cursors feel jumpy.']] },
  'payments-checkout': {
    designOrder: [1, 0],
    designs: { 0: { why: 'The shopper gets a real answer in a second or two. When the processor slows down, the breaker opens, calls fail fast and your servers stay free for reads and logins. The idempotency store guarantees the retry that follows never charges twice. Its limits show twice on this day: when the processor turns slow at 13:00 the breaker turns most payments away, and while it is down at 19:30 nobody can pay, so it misses the uptime target. With no queue to smooth the peak, its servers are sized for the full rush, which costs about twice the budget. Use it where a full outage is rare and "pending" is not acceptable.' } },
  },
  'ai-chatbot-serving': { textReplace: [['A complete reply may take up to 10 seconds.', 'A complete reply may take up to about 14 seconds; during a GPU shortage a few take longer.']] },
  'live-streaming': { designs: { 0: {
    nodes: { db: { type: 'kv-store', units: 2 } },
    addNodes: [{ ref: 'dr', type: 'disaster-recovery', x: 400, y: 120, region: 'eu', knobs: { mode: 'active-active' } }],
    addEdges: [['dr', 'shield'], ['dr', 'ingest'], ['dr', 'ws'], ['dr', 'chat'], ['dr', 'ps'], ['dr', 'hist'], ['dr', 'api'], ['dr', 'db']],
  } } },
  // Records may lose at most a minute of edits in a regional disaster; reads come from the primary for read-your-writes.
  'health-records': {
    requirements: { dataSafety: 'rpo-1m' },
    textReplace: [['The target is 99.95 percent, about 4 hours of downtime a year at most.', 'The target is 99.9 percent, about 45 minutes of downtime a month at most (approx.).']],
    designs: { 0: {
      removeNodes: ['cache'],
      nodes: { dr: { region: 'eu', knobs: { mode: 'active-active' } } },
      addEdges: [['app', 'db'], ['dr', 'lb'], ['dr', 'app'], ['dr', 'search'], ['dr', 'scans'], ['dr', 'idp'], ['dr', 'kms'], ['dr', 'vault']],
    } },
  },
  // Migration checks in the release pipeline stop the bad migration; the standby region runs hot.
  'bank-ledger': {
    designs: { 0: {
      nodes: { dr: { knobs: { mode: 'active-active' } } },
      addNodes: [{ ref: 'ci', type: 'ci-cd', x: -60, y: -260 }],
      addEdges: [['ci', 'app'], ['dr', 'lb'], ['dr', 'app'], ['dr', 'idp'], ['dr', 'kms'], ['dr', 'idem'], ['dr', 'audit']],
    } },
  },
  // Uploads become jobs in the queue; a second path straight into storage would let most of them skip conversion.
  'video-upload-pipeline': {
    designs: { 0: {
      removeNodes: ['raw'],
      // the CDN reaches finished videos through an origin shield, which only serves reads, so uploads take the job path
      removeEdges: [['cdn', 'video']],
      addNodes: [{ ref: 'shield', type: 'origin-shield', x: 30, y: -60 }],
      addEdges: [['cdn', 'shield'], ['shield', 'video']],
      why: 'The upload is acknowledged once its job is safely in the queue, which keeps it durably until it is converted. The queue and workflow engine feed the converter at its own pace and keep jobs during an outage. Broken files go to a dead-letter queue instead of blocking everything. Viewers never touch the upload path.',
    } },
  },
  // Card payments can take a few seconds at p99; a 1 s timeout would cut off good payments (approx.).
  'food-delivery': { designs: { 0: { addNodes: [{ ref: 'idx', type: 'search-index', x: 270, y: -200, units: 2 }], addEdges: [['api', 'idx']], nodes: { cb: { knobs: { timeoutMs: 3000 } }, pay: { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } } } } } },
  // Read-your-writes: reads come from the primary (through the cache); the replica stays as a hot standby.
  'hotel-booking': { designs: { 0: { removeEdges: [['cache', 'rep']], nodes: { cb: { knobs: { timeoutMs: 3000 } }, pay: { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } } } } } },
  // Holding a seat goes through the airline's booking system, which takes about a second (approx.).
  'airline-booking': {
    requirements: { latencyP99Ms: { default: 400, search: 1500, payment: 4000, login: 1500, write: 1500 } },
    designs: {
      0: { nodes: { cbm: { knobs: { timeoutMs: 3000 } }, pay: { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } }, cbp: { knobs: { timeoutMs: 3000 } }, gds: { knobs: { timeoutMs: 3000, retries: 1, backoff: 'exponential-jitter' } } } },
      // the alternative keeps the same notification path, so what it teaches is only the database choice
      1: { addNodes: [{ ref: 'q', type: 'queue', x: 240, y: 240 }, { ref: 'wk', type: 'worker-pool', x: 420, y: 240, units: 2 }, { ref: 'push', type: 'push-service', x: 600, y: 240 }], addEdges: [['api', 'q'], ['q', 'wk'], ['wk', 'push']] },
    },
  },
  // Two pools of edge functions, one per app, so a spike on one does not starve the other.
  'search-autocomplete': {
    textReplace: [['Under 100 ms at the 99th percentile. Slower than that and typing feels laggy.', 'About 100 ms feels instant for people near the servers. Counting the trip across an ocean for everyone else, the target here is a 400 ms p99 (approx.).']],
    designs: { 0: { removeEdges: [['app', 'fn']], addNodes: [{ ref: 'fn2', type: 'edge-fn', x: -300, y: 120 }], addEdges: [['app', 'fn2'], ['fn2', 'cache'], ['fn2', 'es']] } },
  },
  'comments-and-likes': { textReplace: [['30 percent of all likes', '10 percent of all likes']], events: [{ id: 'viral-spike', at: '20:00', params: { factor: 5 } }, { id: 'hot-key', at: '13:00', params: { share: 0.1 } }] },
  'fleet-telemetry': { designs: { 0: { addEdges: [['lb', 'qapi']] } } },
  'observability-platform': { designs: { 0: { addEdges: [['dist', 'qry']] } } },
  // Disk full stops writes until someone frees space; a queue lets sync writes wait instead of failing.
  'file-sync': {
    requirements: { queueLimitMin: 30 },
    textReplace: [['Within a few seconds for small files.', 'Within a few seconds for small files. While a part of the service is being repaired, changes may wait in line up to half an hour; later than that counts as failed.']],
    designs: { 0: {
      addNodes: [{ ref: 'q', type: 'queue', x: 140, y: 160 }, { ref: 'wk', type: 'worker-pool', x: 300, y: 160, units: 8 },
        { ref: 'logs', type: 'logs', x: 60, y: 300 }, { ref: 'traces', type: 'traces', x: 240, y: 300 }, { ref: 'dash', type: 'dashboards', x: 420, y: 300 }],
      addEdges: [['api', 'q'], ['q', 'wk'], ['wk', 'db'], ['api', 'logs'], ['api', 'traces'], ['metrics', 'dash'], ['db', 'metrics']],
      why: 'Uploads and downloads of blocks never touch your servers. Only small metadata calls do. Sharding by user spreads the load, and a socket gateway pushes "something changed" instead of devices polling. Logs, traces and dashboards cut the time to find and free a full disk from about half an hour to about 20 minutes (approx.), and the queue lets sync writes wait meanwhile.',
    } },
  },
  // Read-your-writes: reads go to the primary, not a cache that can be seconds behind.
  'pharmacy-stock': {
    designs: { 0: {
      removeNodes: ['cache'],
      addNodes: [{ ref: 'kms', type: 'kms', x: 120, y: -240 }],
      addEdges: [['app', 'db'], ['app', 'kms']],
      removeEdges: [['app', 'wh']],
      why: 'A sharded SQL database keeps the exact count with synchronous copies and answers the short stock reports a manager asks for. Change data capture feeds a search index for "which store has it" and a data warehouse for the heavy analysis, which never sits behind a user click. Notices and bulk stock events ride queues.',
    } },
  },
  // 60 clinics see a few hundred thousand patients a month; reminders go out about once per booking (approx.).
  'appointment-booking': {
    requirements: { users: '300 thousand patients a month (approx.)', monthlyUsers: 300000, peakRps: 300, mix: { read: 0.529, search: 0.25, write: 0.1, login: 0.12, notify: 0.001 } },
    numbers: [
      { label: 'Browsing requests at peak (read + search)', value: 234, unit: 'req/s', how: '300 × (0.529 + 0.25) ≈ 234', ask: true },
      { label: 'Bookings at peak', value: 30, unit: 'req/s', how: '300 × 0.10 = 30', ask: false },
      { label: 'Requests in the 8 am rush', value: 1400, unit: 'req/s', how: '300 × 0.8 (curve at 8 am) × 6 (rush) ≈ 1,400, approx.', ask: true },
    ],
    designs: { 0: {
      removeNodes: ['cache'],
      addNodes: [{ ref: 'idem', type: 'idempotency-store', x: 420, y: 200 }],
      addEdges: [['app', 'db'], ['workers', 'idem']],
    } },
  },
  // Text messages cost about a cent each, so they go only to the few people who need one (approx.).
  'notification-service': {
    requirements: { queueLimitMin: 30 },
    textReplace: [['A few minutes is fine for marketing. Login codes need seconds.', 'A few minutes is fine for marketing, and up to half an hour while a provider is down; later than that it counts as failed. Login codes need seconds.']],
    designs: { 0: { name: 'Queue, idempotent workers, push and email', removeNodes: ['sms'], nodes: { prefs: { type: 'kv-store' } } } },
  },
  'vaccine-signup-surge': { requirements: { mix: { read: 0.557, search: 0.15, write: 0.1, login: 0.15, notify: 0.003, event: 0.04 } } },
  // Identity proofing happens once per filer, not on every sign-in, so it is left off the sign-in path.
  'tax-deadline-surge': {
    requirements: { mix: { read: 0.49, write: 0.22, login: 0.15, notify: 0.01, upload: 0.06, payment: 0.04, report: 0.03 } },
    designs: { 0: { removeNodes: ['verify'], addEdges: [['app', 'db']] } },
  },
  'short-video-feed': { designs: { 0: { addNodes: [{ ref: 'idx', type: 'search-index', x: 410, y: 60, units: 2 }], addEdges: [['api', 'clips'], ['api', 'idx']] } } },
  // Search needs a part that can answer it; a cache only remembers answers someone else gave.
  'video-on-demand': { designs: { 0: { addNodes: [{ ref: 'idx', type: 'search-index', x: 410, y: 70, units: 2 }], addEdges: [['api', 'idx']] } } },
  // An ordered (FIFO) queue tops out at a few thousand messages a second; a standard queue keeps up with the rush.
  'course-enrollment-day': { requirements: { mix: { read: 0.52, search: 0.2, write: 0.12, login: 0.15, notify: 0.01 } }, designs: { 0: { nodes: { q: { knobs: { mode: 'standard' } } } } } },
  // Queued messages can arrive twice; the workers check the same idempotency keys as the chat servers.
  'chat-app': { designs: { 0: { addEdges: [['wp', 'idem']] } } },
  // Health data must be encrypted with managed keys.
  // Workers check an idempotency key before each text or email, so a redelivered job never sends twice.
  // Reminders go out as push and email; text messages cost the most per message, so they stay a fallback rather than the default path.
  // The regional load balancer has at least one unit per zone.
  'telehealth-video': {
    editorial: { tradeoffs: [
      'Direct calls between two phones cost the platform almost nothing; relaying every call would multiply the media bill, so the relay only serves calls that need it.',
      'Three zones with spare units cost about a third more than needed on a normal day and keep the visit alive when a building goes dark.',
      'Two notice providers add a little cost and complexity, and mean one provider outage does not stop join links. Text messages cost the most per message, so they are the fallback for patients with no app or email, not the default.',
      'Treating the waiting room as live messages makes it feel instant, at the price of holding thousands of open connections.'
    ] },
    designs: { 0: { why: 'A global load balancer splits patients between regions; the main region runs a websocket gateway across three zones for messages, a server fleet for pages and sign-in, and an edge relay for the call media. Notices go through a queue to push and email, so one provider outage only delays them. Text messages stay a fallback for patients with no app or email, since they cost the most per message.', addNodes: [{ ref: 'kms', type: 'kms', x: 140, y: -160 }, { ref: 'idem', type: 'idempotency-store', x: 520, y: 300 }, { ref: 'push', type: 'push-service', x: 400, y: 200 }], addEdges: [['app', 'kms'], ['workers', 'idem'], ['workers', 'push']], removeNodes: ['sms'], nodes: { workers: { zones: 2 }, lb: { units: 3 } } } }
  },
  // Every store holding answers is backed up.
  'online-exam': { designs: { 0: { addEdges: [['bk', 'kv']], nodes: { lbeu: { units: 3 }, lbap: { units: 3 } } } } },
  // Invoice payments are taken in the background, so a slow or capped processor makes them wait, not fail.
  'invoicing-billing': { designs: { 0: { removeEdges: [['app', 'proc']], addEdges: [['worker', 'proc']] } } },
  // Europe keeps its own queue and workers, so a US outage does not stop European homes.
  'smart-home-hub': { designs: { 0: {
    removeEdges: [['apieu', 'q']],
    addNodes: [{ ref: 'qeu', type: 'queue', x: 200, y: 260 }, { ref: 'wkeu', type: 'worker-pool', x: 360, y: 260, units: 2, region: 'eu' }],
    addEdges: [['apieu', 'qeu'], ['qeu', 'wkeu'], ['wkeu', 'push']],
  },
  // the standby plan covers every part that runs in the region, not only the API tier
  1: {
    addEdges: [['dr', 'gw'], ['dr', 'kv'], ['dr', 'idem'], ['dr', 'q'], ['dr', 'wk']],
    why: 'Run everything in one region and keep a cold standby of every part that can be started in about an hour. It costs much less. During a region outage, homes are offline until the standby comes up, about an hour; a standby only brings back the parts connected to it.',
  } } },
  // Apps reconnect with random jitter, so a restart does not bring everyone back in the same second.
  'group-chat-presence': { designs: { 0: { nodes: { web: { knobs: { backoff: 'exponential-jitter' } }, app: { knobs: { backoff: 'exponential-jitter' } } } } } },
  // A hot standby region takes over within a minute when the home region goes dark.
  'music-streaming': { designs: { 0: {
    addNodes: [{ ref: 'dr', type: 'disaster-recovery', x: 400, y: 120, region: 'eu', knobs: { mode: 'active-active' } }],
    addEdges: [['dr', 'api'], ['dr', 'db'], ['dr', 'db2'], ['dr', 'songs'], ['dr', 'idx'], ['dr', 'cache'], ['dr', 'q'], ['dr', 'wp'], ['dr', 'events']],
  } } },
  'ad-serving': {
    textReplace: [['in under 100 milliseconds', 'in about a quarter of a second'], ['About 100 ms from the page asking to the ad being chosen.', 'About 250 ms from the page asking to the ad being chosen, counting the trip from far-away readers (approx.).']],
    requirements: { mix: { read: 0.8595, event: 0.14, report: 0.0005 } },
    designs: { 0: {
      removeNodes: ['audit'],
      addNodes: [{ ref: 'kms', type: 'kms', x: 400, y: -200 }, { ref: 'cb', type: 'circuit-breaker', x: 60, y: -50, knobs: { timeoutMs: 50 } }],
      removeEdges: [['auction', 'ms']],
      addEdges: [['auction', 'kms'], ['auction', 'cb'], ['cb', 'ms']],
      nodes: { auction: { knobs: { timeoutMs: 100 } }, ms: { x: 240 } },
      why: 'Servers read campaigns from cache, fetch user features, and score with the model through a circuit breaker that gives up after 50 ms, so a slow model costs a few ads, not the page. Consent is checked each time. Events flow through a stream with three copies, so a minute of billing data is safe.',
    } },
  },
  'lab-results': { designs: { 0: { addEdges: [['app', 'db']] } } },
  'concert-ticket-drop': {
    hints: [
      'The site does not have to serve everyone at once. What could hold people in a fair line and let them in at a pace your database can handle?',
      'A queue in front of the seat holds is a waiting room. A CDN serves the event page and the waiting-room page itself, and a rate limiter stops bots from taking every slot. Ticket alerts need a push service.',
      'CDN for pages, rate limiter at the door, a queue into about 16 workers and sharded SQL (4 shards) for seat holds, about 30 servers pre-warmed because scale-up is too slow for a 30 second ramp, an idempotency store for payments, and workers sending alerts through a push service.',
    ],
    designs: {
      0: { addNodes: [{ ref: 'push', type: 'push-service', x: 360, y: 240 }], addEdges: [['api', 'seats'], ['wk', 'push']] },
      1: { addNodes: [{ ref: 'push', type: 'push-service', x: 360, y: 240 }], addEdges: [['api', 'push']] },
    },
  },
  'smart-power-grid': { designs: { 0: { addEdges: [['api', 'billing'], ['lb', 'api']] } } },
};

// Share of reads that are personal to the reader (a balance, a chart, an inbox, an order): a CDN's shared copy
// cannot answer them, so they pass through to your servers (approx.).
const PRIVATE_READS = {
  'crypto-exchange': 0.5, 'bank-ledger': 0.9, 'digital-wallet': 0.9, 'payments-checkout': 0.8, 'invoicing-billing': 0.9,
  'payroll-run': 0.95, 'insurance-claims': 0.9, 'bnpl-credit': 0.9, 'stock-order-matching': 0.5,
  'health-records': 0.95, 'lab-results': 0.95, 'telehealth-video': 0.8, 'appointment-booking': 0.5, 'pharmacy-stock': 0.3,
  'vaccine-signup-surge': 0.4, 'benefits-portal': 0.8, 'tax-deadline-surge': 0.8, 'online-exam': 0.6, 'course-enrollment-day': 0.4,
  'file-sync': 0.95, 'collaborative-docs': 0.9, 'email-service': 0.95, 'chat-app': 0.95, 'group-chat-presence': 0.9,
  'social-feed': 0.6, 'stories': 0.3, 'comments-and-likes': 0.25, 'music-streaming': 0.4, 'video-upload-pipeline': 0.3,
  'concert-ticket-drop': 0.4, 'hotel-booking': 0.4, 'airline-booking': 0.4, 'food-delivery': 0.5, 'ride-hailing-dispatch': 0.8,
  'feature-flag-service': 0.05, 'ai-chatbot-serving': 0.9, 'smart-home-hub': 0.95, 'package-tracking': 0.2,
};
for (const [id, v] of Object.entries(PRIVATE_READS)) {
  const f = fixes[id] || (fixes[id] = {});
  f.requirements = { ...(f.requirements || {}), privateReads: v };
}

// Briefs that promised more than the data-safety rule they are judged on: the text now states the rule.
const SAFETY_TEXT = {
  'health-records': [['Doctors need a chart in under a second, nothing may be lost, and an auditor',
    'Doctors need a chart in under a second, no saved note may be lost when a server or a building fails (in a whole-region disaster, at most the last minute of edits may need re-entering from the ward), and an auditor']],
  'package-tracking': [
    ['Keep the page fast, never lose a scan, and make sure', 'Keep the page fast, lose at most the last minute of scans in a failure (scanners keep a copy and can resend), and make sure'],
    ['Never lost. Scanners resend when the network drops, so the same scan can arrive twice.', 'At most the last minute of scans, and only in a failure: scanners keep a copy and resend when the network drops, so the same scan can arrive twice.'],
  ],
  'short-video-feed': [['A few can be late or missing. A posted clip itself must never be lost.',
    'A few can be late or missing. A posted clip\'s file sits in object storage, which keeps it safe; at most the last minute of new posts may need posting again after a failure.']],
};
for (const [id, list] of Object.entries(SAFETY_TEXT)) {
  const f = fixes[id] || (fixes[id] = {});
  f.textReplace = [...(f.textReplace || []), ...list];
}

export default fixes;
