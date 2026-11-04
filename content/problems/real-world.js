// Real-world problems: delivery, rides, maps, travel booking, ticket drops, smart homes, fleets and the power grid.
// All figures are rough, round-number approximations; every problem says so in its notes.

// Short builders so each reference design stays readable.
const N = (ref, type, x, y, extra = {}) => ({ ref, type, x, y, ...extra });
const G = (nodes, edges) => ({ nodes, edges });

export default {
  group: {
    id: 'real-world',
    title: 'Real-world systems',
    blurb: 'Rides, deliveries, maps, bookings, ticket drops, smart homes, fleets and the power grid.'
  },
  problems: [
    // ------------------------------------------------------------------
    // 1. Package tracking (Easy)
    // ------------------------------------------------------------------
    {
      id: 'package-tracking',
      title: 'Package tracking',
      difficulty: 'Easy',
      concepts: ['caching', 'queues-backpressure'],
      like: 'parcel tracking like UPS',
      brief: 'You run the tracking page for a parcel company. People refresh it again and again while they wait for a delivery, and depots send a scan every time a parcel moves. Keep the page fast, never lose a scan, and make sure a broken text-message service cannot slow anything down.',
      clarify: [
        { q: 'Do tracking answers have to be up to the second?', a: 'No. A status that is up to a minute old is fine. People care that the page opens fast and the next step is right.' },
        { q: 'Can a depot scan be lost or counted twice?', a: 'Never lost. Scanners resend when the network drops, so the same scan can arrive twice. Counting it twice would show the wrong history.' },
        { q: 'What happens when the text-message service is down?', a: 'Alerts can arrive later. The tracking page must keep working and no alert may be dropped.' }
      ],
      requirements: {
        users: '20 million people a month (approx.)',
        monthlyUsers: 20000000,
        peakRps: 3000,
        mix: { read: 0.90, write: 0.07, notify: 0.03 },
        latencyP99Ms: { default: 250, write: 500 },
        availability: 0.999,
        dataSafety: 'rpo-1m',
        readYourWrites: false,
        compliance: [],
        budgetPerMonth: 3600,
        storageTb: 5,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          'About 15 million parcels a day, 8 scans each, about 0.5 KB per scan: roughly 60 GB a day, 90 days kept hot (approx.).',
          'Reads are tracking-page lookups, writes are depot scans, notifications are text and push alerts.',
          'The peak is a holiday-season evening. All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.45, 'mobile-app': 0.48, 'partner-system': 0.07 }, params: {} },
      requires: {},
      palette: null,
      starter: {
        nodes: [
          N('web', 'web-browser', -480, -110, { locked: true, label: 'Tracking page' }),
          N('phones', 'mobile-app', -480, 0, { locked: true, label: 'Parcel app' }),
          N('depots', 'partner-system', -480, 110, { locked: true, label: 'Depot scanners' })
        ],
        edges: []
      },
      events: [
        { id: 'dependency-outage', at: '10:15' },
        { id: 'viral-spike', at: '18:30', params: { factor: 4 } }
      ],
      eventPool: ['cache-stampede', 'duplicate-delivery', 'slow-dependency'],
      numbers: [
        { label: 'Lookups per second at peak', value: 2700, unit: 'req/s', how: '3,000 x 0.90', ask: true },
        { label: 'Reads that reach the database with an 85% cache hit rate', value: 405, unit: 'req/s', how: '2,700 x (1 - 0.85)', ask: true },
        { label: 'Scan history kept for 90 days', value: 5.4, unit: 'TB', how: '15M parcels x 8 scans x 0.5 KB = 60 GB a day, x 90 days', ask: true }
      ],
      hints: [
        'Most of the load is people checking the same parcel again and again. What could remember an answer for a minute?',
        'A cache between your servers and the database turns most lookups into memory reads. Send alerts through a queue so a failing alert service cannot slow the page.',
        'Cache with a 60 second keep time and collapse misses. Four servers over two zones, a queue with two workers into the push service, and an idempotency store so a repeated scan counts once.'
      ],
      editorial: {
        summary: 'This is a read-heavy problem with a small, careful write path. Nine in ten requests are lookups of data that changes a few times a day, so a cache answers most of them. Scans are the data you cannot lose, and alerts are work that can wait, so they go through a queue.',
        designs: [
          {
            name: 'Cached lookups, queued alerts',
            why: 'A short-lived cache takes about 85 percent of lookups off the database. The network balancer costs almost nothing per request. Alerts wait in a queue, so when the push service fails for twenty minutes they are sent afterwards and the tracking page never notices.',
            graph: G([
              N('web', 'web-browser', -480, -110),
              N('phones', 'mobile-app', -480, 0),
              N('depots', 'partner-system', -480, 110),
              N('lb', 'network-lb', -300, 0, { zones: 3 }),
              N('api', 'vm-fleet', -120, 0, { units: 4, zones: 2 }),
              N('cache', 'cache', 60, -80, { zones: 2, knobs: { ttlSec: 60, coalesce: true } }),
              N('db', 'sql-primary', 240, -80, { zones: 2 }),
              N('rep', 'sql-replica', 240, 40, { units: 1 }),
              N('idem', 'idempotency-store', -120, 130),
              N('q', 'queue', 60, 90),
              N('wk', 'worker-pool', 240, 150, { units: 2 }),
              N('push', 'push-service', 420, 150),
              N('metrics', 'metrics', 420, -80),
              N('alerting', 'alerting', 420, 10)
            ], [
              ['web', 'lb'], ['phones', 'lb'], ['depots', 'lb'], ['lb', 'api'],
              ['api', 'cache'], ['cache', 'db'], ['cache', 'rep'], ['db', 'rep'],
              ['api', 'idem'], ['api', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 930, costPerMonth: 3000 }
          },
          {
            name: 'Fully managed, pay for every call',
            why: 'Serverless functions and a key-value table need almost no operations work and scale on their own. At this steady, high volume you pay for every single call, so the bill is far above the budget. It is a good choice for a small parcel company and a poor one for a large one.',
            graph: G([
              N('web', 'web-browser', -480, -110),
              N('phones', 'mobile-app', -480, 0),
              N('depots', 'partner-system', -480, 110),
              N('fn', 'serverless-fn', -240, 0, { units: 1, knobs: { warmPool: 20 } }),
              N('kv', 'kv-store', 0, -60, { units: 1 }),
              N('idem', 'idempotency-store', -240, 130),
              N('q', 'queue', 0, 90),
              N('wk', 'worker-pool', 180, 150, { units: 2 }),
              N('push', 'push-service', 360, 150),
              N('metrics', 'metrics', 360, -60),
              N('alerting', 'alerting', 360, 30)
            ], [
              ['web', 'fn'], ['phones', 'fn'], ['depots', 'fn'],
              ['fn', 'kv'], ['fn', 'idem'], ['fn', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['fn', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 820, costPerMonth: 7200 }
          }
        ],
        tradeoffs: [
          'A 60 second cache means a status can be a minute old. For parcels that is fine; for a stock price it would not be.',
          'Collapsing misses protects the database when the cache is cold, at the price of a few people waiting for one shared refill.',
          'A queue adds a small delay to alerts and in return makes a failing push service harmless.',
          'The idempotency store costs a little per scan and prevents a duplicate scan from rewriting history.',
          'Fully managed services trade your time for their per-call price. Check the bill at peak, not just at launch.'
        ],
        realWorld: 'Large parcel companies track on the order of tens of millions of parcels a day and answer many more lookups than scans. Most of those lookups are served from caches (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 2. Fleet telemetry (Medium)
    // ------------------------------------------------------------------
    {
      id: 'fleet-telemetry',
      title: 'Fleet telemetry',
      difficulty: 'Medium',
      concepts: ['queues-backpressure', 'storage-tiers', 'observability'],
      like: 'trucks reporting every few seconds',
      brief: 'A freight company has 150,000 trucks that each send a batch of sensor readings every 30 seconds. Dispatchers watch live maps and analysts run reports. You must take in every batch, keep a month of detail cheaply, and survive the moments when thousands of trucks come back online at once.',
      clarify: [
        { q: 'Can a batch from a truck be lost?', a: 'A minute of readings may be lost in a disaster, but not routinely. Batches are used for safety and billing reports.' },
        { q: 'How old can the live map data be?', a: 'A few seconds is fine. Reports can take several seconds to run.' },
        { q: 'How long do we keep the readings?', a: '30 days of full detail on fast storage, then the older data moves somewhere cheaper.' },
        { q: 'What do trucks do when they lose signal?', a: 'They keep the readings and upload the backlog when the signal returns, so reconnects arrive in bursts.' }
      ],
      requirements: {
        users: '150,000 trucks and 3,000 dispatchers and analysts (approx.)',
        monthlyUsers: 3000,
        peakRps: 6000,
        mix: { telemetry: 0.93, report: 0.03, read: 0.04 },
        latencyP99Ms: { default: 300, report: 5000 },
        availability: 0.999,
        dataSafety: 'rpo-1m',
        readYourWrites: false,
        compliance: [],
        budgetPerMonth: 6000,
        storageTb: 2,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          'Each telemetry batch holds about 100 readings, about 1 KB. 150,000 trucks every 30 s is about 5,000 batches a second.',
          'About 500,000 readings a second at 1.5 bytes each compressed is around 65 GB a day (approx.).',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'business-hours', sources: { 'iot-device': 0.93, 'admin-console': 0.07 }, params: {} },
      requires: {},
      palette: null,
      starter: {
        nodes: [
          N('trucks', 'iot-device', -480, -60, { locked: true, label: 'Trucks' }),
          N('staff', 'admin-console', -480, 100, { locked: true, label: 'Dispatch and analysts' })
        ],
        edges: []
      },
      events: [
        { id: 'thundering-herd', at: '07:00', params: { factor: 4, types: ['telemetry'] } },
        { id: 'cardinality-explosion', at: '11:00' },
        { id: 'disk-full', at: '14:30' }
      ],
      eventPool: ['network-partition', 'bad-config-push', 'noisy-neighbor'],
      numbers: [
        { label: 'Batches per second at peak', value: 5580, unit: 'req/s', how: '6,000 x 0.93', ask: true },
        { label: 'Readings per second at peak', value: 558000, unit: 'readings/s', how: '5,580 batches/s x 100 readings (about 500,000 on an average second)', ask: true },
        { label: 'Hot storage for 30 days', value: 1.9, unit: 'TB', how: '500,000 readings/s x 1.5 B x 86,400 s = 65 GB a day, x 30', ask: true }
      ],
      hints: [
        'Trucks do not wait for an answer. What can accept a batch immediately and let the rest of the system work at its own pace?',
        'A durable stream between the front door and the time-series database absorbs bursts. Add alerts on growth so storage never fills silently.',
        'Balancer into an event stream (3 brokers), two stream workers into a 3-node time-series database, a small query API for dispatchers, metrics with an alert on series count and on disk growth.'
      ],
      editorial: {
        summary: 'The load is steady, write-heavy and machine-made. Nobody is waiting for a reply, so the design is a pipe: accept fast, buffer in a stream, process, store in a database built for timestamps. The interesting failures are all about the pipe, not the users.',
        designs: [
          {
            name: 'Stream in front of a time-series store',
            why: 'The stream accepts a burst of four times normal traffic and lets the workers catch up. The time-series database is built for this write rate and compresses readings. Alerts on series count and disk growth catch the two slow disasters before they cost money or stop writes.',
            graph: G([
              N('trucks', 'iot-device', -480, -60),
              N('staff', 'admin-console', -480, 100),
              N('lb', 'network-lb', -300, -60, { zones: 3 }),
              N('stream', 'event-stream', -110, -60, { units: 3, zones: 3, knobs: { partitions: 24, retentionDays: 1 } }),
              N('proc', 'stream-processor', 80, -60, { units: 2, zones: 2 }),
              N('tsdb', 'timeseries-db', 270, -60, { units: 3, zones: 3, knobs: { retentionDays: 30 } }),
              N('lake', 'data-lake', 460, -140, { knobs: { retentionDays: 395 } }),
              N('qapi', 'vm-fleet', -110, 110, { units: 2, zones: 2 }),
              N('metrics', 'metrics', 270, 90),
              N('alerting', 'alerting', 270, 180),
              N('pager', 'pager', 460, 180),
              N('bk', 'backups', 460, 40)
            ], [
              ['trucks', 'lb'], ['lb', 'stream'], ['stream', 'proc'], ['proc', 'tsdb'], ['proc', 'lake'],
              ['staff', 'qapi'], ['qapi', 'tsdb'],
              ['proc', 'metrics'], ['tsdb', 'metrics'], ['metrics', 'alerting'], ['alerting', 'pager'],
              ['bk', 'tsdb']
            ]),
            expect: { score: 920, costPerMonth: 4900 }
          }
        ],
        tradeoffs: [
          'A stream costs a fixed amount each month. A per-message queue looks cheaper to start and costs more at this volume.',
          'Short stream retention (one day) saves money but means a stuck worker must be fixed within a day or data is lost.',
          'Moving data older than 30 days to the lake cuts storage cost by roughly ten times, but old reports run slower.',
          'More partitions let more workers read in parallel; order is kept only inside one truck, which is all this problem needs.',
          'Alerts cost a little and are the only reason a disk-full or label explosion is a small incident instead of a large one.'
        ],
        realWorld: 'Large fleets send on the order of one to ten readings a second per vehicle, and operators keep days to weeks on fast storage and years in cheap object storage (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 3. Food delivery (Medium)
    // ------------------------------------------------------------------
    {
      id: 'food-delivery',
      title: 'Food delivery',
      difficulty: 'Medium',
      concepts: ['realtime-connections', 'idempotency-retries', 'circuit-breakers'],
      like: 'an app like DoorDash',
      brief: 'You run food delivery in a few big cities. People browse menus, pay for an order, and watch a courier move on a map. Dinner time is brutal, and the payment company sometimes slows down. Nobody may be charged twice, and no paid order may vanish.',
      clarify: [
        { q: 'How fresh must the courier dot on the map be?', a: 'Within a few seconds. Couriers send a position every 4 to 5 seconds.' },
        { q: 'What if the payment company is slow?', a: 'Orders still need to be taken. Tell the customer the payment is pending and finish it when the service is back.' },
        { q: 'Can a customer see an old order status after paying?', a: 'No. Right after placing an order the customer must see it.' }
      ],
      requirements: {
        users: '8 million people a month (approx.)',
        monthlyUsers: 8000000,
        peakRps: 5000,
        mix: { read: 0.50, search: 0.15, payment: 0.04, write: 0.03, location: 0.26, notify: 0.02 },
        latencyP99Ms: { default: 300, payment: 2500 },
        availability: 0.999,
        dataSafety: 'no-loss',
        readYourWrites: true,
        compliance: ['encryption', 'audit-log'],
        budgetPerMonth: 9500,
        storageTb: 2,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          'Dinner peak is about 5,000 requests a second. Courier pings are 26 percent of traffic (approx.).',
          'About 200 orders paid per second at the very peak. Card data stays with the payment company.',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'meals', sources: { 'mobile-app': 0.85, 'web-browser': 0.10, 'partner-system': 0.05 }, params: {} },
      requires: { payment: [['payment-processor']] },
      palette: null,
      starter: {
        nodes: [
          N('app', 'mobile-app', -480, -80, { locked: true, label: 'Customer and courier app' }),
          N('web', 'web-browser', -480, 40, { locked: true, label: 'Website' }),
          N('tablets', 'partner-system', -480, 150, { locked: true, label: 'Restaurant tablets' })
        ],
        edges: []
      },
      events: [
        { id: 'viral-spike', at: '12:00', params: { factor: 2.5 } },
        { id: 'slow-dependency', at: '18:30' },
        { id: 'duplicate-delivery', at: '19:15' }
      ],
      eventPool: ['dependency-outage', 'zone-outage', 'cache-stampede'],
      numbers: [
        { label: 'Courier pings per second at peak', value: 1300, unit: 'req/s', how: '5,000 x 0.26', ask: true },
        { label: 'Payments per second at peak', value: 200, unit: 'req/s', how: '5,000 x 0.04', ask: true },
        { label: 'Servers for 5,000 req/s at about 1,000 req/s each', value: 6, unit: 'servers', how: '5,000 / 1,000 = 5, plus one spare so a zone can fail', ask: true }
      ],
      hints: [
        'A payment company that slows to 3 seconds will fill your servers with waiting requests. What can stop that?',
        'Set a short timeout on the payment call and add a circuit breaker, so your servers fail fast instead of waiting. An idempotency store makes a retried payment safe.',
        'Balancer, 6 servers over 3 zones, circuit breaker and idempotency store in front of the payment company, a cache for menus, a primary with replicas, a wide-column store for courier positions, and a queue for notifications.'
      ],
      editorial: {
        summary: 'Three kinds of traffic share one app: menus (cacheable), courier dots (a steady stream of tiny writes) and payments (rare, must be exactly once). Give each its own treatment and put a fuse on the one call you do not control.',
        designs: [
          {
            name: 'Fused payments, cached menus, fast positions',
            why: 'A circuit breaker and a short timeout keep a slow payment company from tying up every server. The idempotency store makes retries safe. Menus come from a cache. Courier positions go to a store built for many small writes. Notifications wait in a queue.',
            graph: G([
              N('app', 'mobile-app', -480, -80),
              N('web', 'web-browser', -480, 40),
              N('tablets', 'partner-system', -480, 150),
              N('lb', 'network-lb', -300, 40, { zones: 3 }),
              N('api', 'container-cluster', -110, 40, { units: 6, zones: 3 }),
              N('menus', 'distributed-cache', 80, -110, { units: 3, zones: 3, knobs: { ttlSec: 300, coalesce: true } }),
              N('db', 'sql-primary', 270, -110, { tier: 'L', zones: 2, knobs: { replication: 'sync' } }),
              N('rep', 'sql-replica', 270, 0, { units: 2, zones: 2 }),
              N('pos', 'wide-column', 80, 60, { units: 3, zones: 3, knobs: { mode: 'ONE' } }),
              N('idem', 'idempotency-store', -110, 190),
              N('cb', 'circuit-breaker', 80, 190, { knobs: { timeoutMs: 1000 } }),
              N('pay', 'payment-processor', 270, 190, { knobs: { timeoutMs: 1000, retries: 2, backoff: 'exponential-jitter' } }),
              N('q', 'queue', 80, 270),
              N('wk', 'worker-pool', 270, 270, { units: 2 }),
              N('push', 'push-service', 450, 270),
              N('kms', 'kms', -110, -110),
              N('audit', 'audit-log', 450, -110),
              N('metrics', 'metrics', 450, 60),
              N('alerting', 'alerting', 450, 130)
            ], [
              ['app', 'lb'], ['web', 'lb'], ['tablets', 'lb'], ['lb', 'api'],
              ['api', 'menus'], ['menus', 'db'], ['menus', 'rep'], ['db', 'rep'],
              ['api', 'pos'], ['api', 'idem'], ['api', 'cb'], ['cb', 'pay'],
              ['api', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['api', 'kms'], ['db', 'audit'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 900, costPerMonth: 8200 }
          }
        ],
        tradeoffs: [
          'A 1 second payment timeout fails some slow-but-fine payments. In exchange your servers keep serving menus during a payment slowdown.',
          'Sync replication on the order database costs a few milliseconds per write and means a failover loses nothing.',
          'Courier positions use a store that can lose the very latest ping. Losing one ping is harmless; losing an order is not.',
          'Notifications through a queue can arrive seconds late and never block ordering.',
          'Running 6 servers instead of 5 costs about $140 a month and lets a zone fail without a brown-out.'
        ],
        realWorld: 'Delivery apps handle a few hundred thousand orders on a busy night in a large country, with courier positions updated every few seconds (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 4. Ride-hailing dispatch (Hard)
    // ------------------------------------------------------------------
    {
      id: 'ride-hailing-dispatch',
      title: 'Ride-hailing dispatch',
      difficulty: 'Hard',
      concepts: ['realtime-connections', 'hot-keys', 'sharding'],
      like: 'an app like Uber',
      brief: 'You run dispatch for a big metro area. About 100,000 drivers send a position every 4 seconds, and riders ask for cars near them. When a stadium empties, thousands of riders ask for a car from the same few blocks at the same moment. Match riders to drivers fast, and never charge a trip twice.',
      clarify: [
        { q: 'How accurate must the car positions be?', a: 'A rider sees cars that are a few seconds old. Dispatch itself needs the freshest position of each driver.' },
        { q: 'What happens at a stadium exit?', a: 'Thousands of requests come from one small area in a few minutes. One map cell can get a third of all lookups.' },
        { q: 'Can a ride request be lost?', a: 'No. Once a rider is told a car is coming, the trip record must survive a server failure.' },
        { q: 'Is a duplicate charge ever acceptable?', a: 'Never. A trip is charged once, even if the network retries.' }
      ],
      requirements: {
        users: '15 million riders and 600,000 drivers a month, 100,000 drivers online at peak (approx.)',
        monthlyUsers: 15000000,
        peakRps: 30000,
        mix: { location: 0.80, read: 0.12, write: 0.04, payment: 0.005, notify: 0.035 },
        latencyP99Ms: { default: 300, payment: 3000 },
        availability: 0.999,
        dataSafety: 'no-loss',
        readYourWrites: true,
        compliance: ['encryption', 'pii-vault'],
        budgetPerMonth: 14000,
        storageTb: 2,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          '100,000 drivers x one ping per 4 s is about 25,000 pings a second. Locations are 80 percent of traffic.',
          'Rider reads are nearby-car lookups and price quotes. Writes are ride state changes: request, accept, start, end.',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'commute', sources: { 'mobile-app': 0.2, 'iot-device': 0.8 }, params: {} },
      requires: { payment: [['payment-processor']] },
      palette: null,
      starter: {
        nodes: [
          N('riders', 'mobile-app', -480, -80, { locked: true, label: 'Rider app' }),
          N('drivers', 'iot-device', -480, 110, { locked: true, label: 'Driver app' })
        ],
        edges: []
      },
      events: [
        { id: 'zone-outage', at: '08:10' },
        { id: 'hot-key', at: '17:45', params: { share: 0.3, durationSec: 3600 } },
        { id: 'flash-crowd', at: '22:45', params: { factor: 6, rampSec: 60, holdSec: 1800, decaySec: 1800, types: ['read', 'write', 'notify'] } }
      ],
      eventPool: ['slow-dependency', 'retry-storm', 'replication-lag'],
      numbers: [
        { label: 'Driver pings per second at peak', value: 24000, unit: 'req/s', how: '30,000 x 0.80', ask: true },
        { label: 'Ride writes per second at peak', value: 1200, unit: 'req/s', how: '30,000 x 0.04', ask: true },
        { label: 'Write shards needed at about 2,000 writes/s each, with room to spare', value: 4, unit: 'shards', how: '1,200 / 2,000 = 0.6 of one shard; four shards give headroom and a failure margin', ask: true }
      ],
      hints: [
        'Location pings are four out of five requests and each one is tiny. Do they belong in the same database as ride records?',
        'Keep positions in a store built for many small writes, behind a socket gateway. Put a short-lived cache in front of nearby-car lookups, because one map cell can become a hot key.',
        'Balancer, socket gateway (4 nodes) into a wide-column store for positions, 10 servers, a 5 second cache for nearby-car reads, sharded SQL for ride records, a privacy vault and key service, and an idempotency store for payments.'
      ],
      editorial: {
        summary: 'Three workloads share one app and must not hurt each other: a firehose of tiny location writes, a read-mostly lookup that can go hot on one map cell, and a small set of rides and payments that must be exact. Split them by what each one needs.',
        designs: [
          {
            name: 'Firehose, hot-cell cache, careful ride records',
            why: 'A socket gateway and a wide-column store take the location firehose without touching ride records. A 5 second cache serves nearby-car reads, so a stadium exit hits memory and not the database. Ride records go to sharded SQL with synchronous copies, and the payment call is guarded by an idempotency store.',
            graph: G([
              N('riders', 'mobile-app', -480, -80),
              N('drivers', 'iot-device', -480, 110),
              N('lb', 'network-lb', -300, 10, { zones: 3 }),
              N('gw', 'websocket-gateway', -110, 130, { units: 4, zones: 3 }),
              N('loc', 'wide-column', 100, 130, { units: 4, zones: 3, knobs: { mode: 'ONE' } }),
              N('api', 'container-cluster', -110, -60, { units: 10, zones: 3 }),
              N('near', 'distributed-cache', 100, -60, { units: 4, zones: 3, knobs: { ttlSec: 5, coalesce: true } }),
              N('rides', 'sharded-sql', 300, -60, { units: 4, zones: 3, knobs: { replication: 'sync' } }),
              N('idem', 'idempotency-store', -110, -190),
              N('pay', 'payment-processor', 100, -190, { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } }),
              N('q', 'queue', 300, 20),
              N('wk', 'worker-pool', 480, 20, { units: 4 }),
              N('push', 'push-service', 650, 20),
              N('kms', 'kms', 300, -190),
              N('vault', 'privacy-vault', 480, -190),
              N('metrics', 'metrics', 480, 130),
              N('alerting', 'alerting', 480, 210),
              N('pager', 'pager', 650, 210)
            ], [
              ['riders', 'lb'], ['drivers', 'lb'], ['lb', 'gw'], ['lb', 'api'],
              ['gw', 'loc'], ['api', 'near'], ['near', 'loc'], ['api', 'rides'],
              ['api', 'idem'], ['api', 'pay'], ['api', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['api', 'kms'], ['api', 'vault'],
              ['api', 'metrics'], ['metrics', 'alerting'], ['alerting', 'pager']
            ]),
            expect: { score: 890, costPerMonth: 12500 }
          }
        ],
        tradeoffs: [
          'Reading a position back with consistency level ONE is fast and can be a few seconds stale. A driver position is stale after 4 seconds anyway.',
          'A 5 second cache means a rider can see a car that just took another trip. The match step re-checks with the driver before it commits.',
          'Sharding ride records by city or map region keeps each shard small, and makes a trip that crosses regions need extra care.',
          'Running every layer in three zones costs about a third more and is what lets one zone fail at rush hour with no outage.',
          'A privacy vault costs about $1,000 a month and is what lets you answer a data-protection audit in minutes.'
        ],
        realWorld: 'Large ride apps track millions of drivers worldwide with a position every few seconds, and divide the map into small cells (hexagons or squares) so each region can be handled on its own (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 5. Maps and routing (Hard)
    // ------------------------------------------------------------------
    {
      id: 'maps-routing',
      title: 'Maps and routing',
      difficulty: 'Hard',
      concepts: ['cdn', 'caching', 'multi-region'],
      like: 'a maps app like Google Maps',
      brief: 'You run a maps app with places, routes and live traffic. Map pictures never change much, but route lookups, place search and traffic from moving phones do. Soon a whole new continent will start using it. Keep maps fast everywhere without paying to serve the same picture twice.',
      clarify: [
        { q: 'How fresh must map pictures be?', a: 'Map tiles change maybe once a day. A tile can be kept for hours or longer.' },
        { q: 'How fresh must traffic be?', a: 'About a minute. Phones on the road send speed pings, and the app uses the latest average per road.' },
        { q: 'Can a route be reused for another person?', a: 'Popular routes can. Many people ask for the same commute, so route answers are worth keeping for a few minutes.' },
        { q: 'Where do users live?', a: 'Half in North America and a third in Europe today. After the new-continent launch, a big share will be in Asia Pacific.' }
      ],
      requirements: {
        users: '20 million people a month (approx.)',
        monthlyUsers: 20000000,
        peakRps: 12000,
        mix: { read: 0.65, search: 0.13, location: 0.20, write: 0.02 },
        latencyP99Ms: { default: 200, search: 300 },
        availability: 0.999,
        dataSafety: 'rpo-1m',
        readYourWrites: false,
        compliance: [],
        budgetPerMonth: 36000,
        storageTb: 90,
        userRegions: { us: 0.5, eu: 0.35, apac: 0.15 },
        homeRegion: 'us',
        notes: [
          'Reads are map tiles (about 85 percent) and route or place-card lookups (about 15 percent). A tile is about 4 KB here (approx.).',
          'Map imagery for the world is on the order of 80 TB at several zoom levels (approx.).',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'global-follow-sun', sources: { 'mobile-app': 0.8, 'web-browser': 0.2 }, params: {} },
      requires: {},
      palette: null,
      starter: {
        nodes: [
          N('phones', 'mobile-app', -480, -60, { locked: true, label: 'Phones' }),
          N('web', 'web-browser', -480, 80, { locked: true, label: 'Website' })
        ],
        edges: []
      },
      events: [
        { id: 'overseas-launch', at: '08:00' },
        { id: 'viral-spike', at: '13:00', params: { factor: 4, types: ['read', 'search'] } },
        { id: 'cache-stampede', at: '17:00' }
      ],
      eventPool: ['hot-key', 'region-outage', 'slow-dependency'],
      numbers: [
        { label: 'Tile and route reads per second at peak', value: 7800, unit: 'req/s', how: '12,000 x 0.65', ask: true },
        { label: 'Reads that reach your servers with a 95% CDN hit rate', value: 390, unit: 'req/s', how: '7,800 x (1 - 0.95)', ask: true },
        { label: 'Traffic pings per second at peak', value: 2400, unit: 'req/s', how: '12,000 x 0.20', ask: true }
      ],
      hints: [
        'Most requests ask for a picture that was the same yesterday. Where is the cheapest place to keep a copy near the user?',
        'A CDN with a very long keep time serves tiles. When the cache empties, make one request refill each item instead of thousands. For a new continent, send users to the nearest region with geo DNS.',
        'Geo DNS into a CDN (keep tiles for a day, collapse misses), tiles in object storage, two regional stacks, a distributed cache for routes and places, a search index for places, a stream processor and wide-column store for live traffic.'
      ],
      editorial: {
        summary: 'Maps are mostly a caching problem. Seven in ten requests are for pictures that rarely change, which a CDN serves from near the user. The hard parts are what the CDN cannot do: live traffic from phones, place search and the day the cache is empty.',
        designs: [
          {
            name: 'CDN first, two regions behind it',
            why: 'A CDN with a one-day keep time and collapsed misses serves nearly all tiles. Geo DNS sends other requests to the nearest of two regions, so launch traffic from Asia Pacific is served from Europe or the US with a modest delay instead of falling over. Traffic pings go through a stream processor into a wide-column store.',
            graph: G([
              N('phones', 'mobile-app', -480, -60),
              N('web', 'web-browser', -480, 80),
              N('dns', 'geo-dns', -300, 10, { knobs: { mode: 'latency' } }),
              N('cdn', 'cdn', -110, -150, { knobs: { ttlSec: 86400, coalesce: true } }),
              N('tiles', 'object-storage', 100, -150),
              N('lbus', 'network-lb', -110, 10, { zones: 3, region: 'us' }),
              N('lbeu', 'network-lb', -110, 150, { zones: 3, region: 'eu' }),
              N('apius', 'container-cluster', 80, 10, { units: 8, zones: 3, region: 'us' }),
              N('apieu', 'container-cluster', 80, 150, { units: 6, zones: 3, region: 'eu' }),
              N('dcus', 'distributed-cache', 270, -40, { units: 3, zones: 3, region: 'us', knobs: { ttlSec: 300, coalesce: true } }),
              N('dceu', 'distributed-cache', 270, 150, { units: 2, zones: 2, region: 'eu', knobs: { ttlSec: 300, coalesce: true } }),
              N('places', 'search-index', 460, -40, { units: 3, zones: 3, region: 'us' }),
              N('roads', 'document-db', 460, 70, { units: 3, zones: 3, region: 'us' }),
              N('sp', 'stream-processor', 270, 270, { units: 2, region: 'us' }),
              N('live', 'wide-column', 460, 270, { units: 3, zones: 3, region: 'us', knobs: { mode: 'ONE' } }),
              N('edits', 'sql-primary', 650, 70, { zones: 2, region: 'us' }),
              N('metrics', 'metrics', 650, -40),
              N('alerting', 'alerting', 650, -130)
            ], [
              ['phones', 'dns'], ['web', 'dns'], ['dns', 'cdn'], ['dns', 'lbus'], ['dns', 'lbeu'],
              ['cdn', 'tiles'], ['lbus', 'apius'], ['lbeu', 'apieu'],
              ['apius', 'dcus'], ['apieu', 'dceu'], ['dcus', 'places'], ['dceu', 'places'],
              ['dcus', 'roads'], ['dceu', 'roads'],
              ['apius', 'sp'], ['apieu', 'sp'], ['sp', 'live'],
              ['apius', 'edits'], ['apieu', 'edits'],
              ['apius', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 880, costPerMonth: 31500 }
          }
        ],
        tradeoffs: [
          'A one-day tile keep time makes the CDN bill small and means a fixed map error can take up to a day to disappear, unless you purge it.',
          'Collapsing misses protects the origin when the cache empties, and makes the first few viewers of each tile wait together.',
          'Serving Asia Pacific from far-away regions is cheap and adds about 150 to 170 ms to every request that is not cached. A third region fixes that for about $5,000 a month.',
          'Live traffic uses eventual consistency. A speed from 60 seconds ago is good enough for routing.',
          'The CDN is the largest line on the bill because it is paid per request and per byte; it is also what keeps the other lines small.'
        ],
        realWorld: 'Map apps serve billions of tile requests a day, and over 90 percent come from caches near the user (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 6. Hotel booking (Medium)
    // ------------------------------------------------------------------
    {
      id: 'hotel-booking',
      title: 'Hotel booking',
      difficulty: 'Medium',
      concepts: ['search-indexing', 'consistency', 'rate-limiting'],
      like: 'a site like Booking.com',
      brief: 'You run a hotel booking site. People search for rooms, open hotel pages and book. Search can be a little behind, but you must never sell the last room twice. Bots copy your prices all day, and sometimes the payment company slows down.',
      clarify: [
        { q: 'Can search results be a little stale?', a: 'Yes, by a minute or so. A result that says "2 rooms left" may be out of date.' },
        { q: 'Can the final booking be stale?', a: 'No. The booking step must check the real count, so the last room is never sold twice.' },
        { q: 'How bad are the bots?', a: 'They send about half as much traffic again as real users, all day, mostly searches and page views.' },
        { q: 'Can a booking be paid later?', a: 'A room is held for 10 minutes while the guest pays. If the payment service is slow, the guest should see it quickly.' }
      ],
      requirements: {
        users: '30 million people a month (approx.)',
        monthlyUsers: 30000000,
        peakRps: 8000,
        mix: { search: 0.45, read: 0.40, write: 0.08, payment: 0.02, login: 0.05 },
        latencyP99Ms: { default: 400, search: 300, payment: 3000 },
        availability: 0.999,
        dataSafety: 'no-loss',
        readYourWrites: true,
        compliance: ['encryption', 'audit-log'],
        budgetPerMonth: 7500,
        storageTb: 3,
        userRegions: { us: 0.6, eu: 0.4 },
        homeRegion: 'us',
        notes: [
          'About 3,600 searches, 3,200 page views and 800 booking steps a second at the evening peak (approx.).',
          'Room counts change when a guest books or cancels. Search results are a copy of them.',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
      requires: { payment: [['payment-processor']] },
      palette: null,
      starter: {
        nodes: [
          N('web', 'web-browser', -480, -60, { locked: true, label: 'Website' }),
          N('app', 'mobile-app', -480, 80, { locked: true, label: 'Mobile app' })
        ],
        edges: []
      },
      events: [
        { id: 'bot-scraping', at: '10:00' },
        { id: 'slow-dependency', at: '15:30' },
        { id: 'replication-lag', at: '20:15', params: { lagSec: 45 } }
      ],
      eventPool: ['viral-spike', 'cache-stampede', 'zone-outage'],
      numbers: [
        { label: 'Searches per second at peak', value: 3600, unit: 'req/s', how: '8,000 x 0.45', ask: true },
        { label: 'Searches that reach the index with a 90% cache hit rate', value: 360, unit: 'req/s', how: '3,600 x (1 - 0.90)', ask: true },
        { label: 'Booking steps per second (holds and payments)', value: 800, unit: 'req/s', how: '8,000 x (0.08 + 0.02)', ask: true }
      ],
      hints: [
        'Searching and booking need different promises. Which one can use a slightly old copy, and which one must ask the real source?',
        'Put room counts in a primary database and let a search index be a copy kept up to date by change events. Add a rate limiter so bots cannot use the capacity real guests need.',
        'Balancer and rate limiter, 10 servers over 3 zones, a cache for search and pages, a search index fed by a change connector, a primary with sync replication for the final booking check, a circuit breaker and idempotency store around payments.'
      ],
      editorial: {
        summary: 'Search and booking look like one action to a guest and are two different problems. Search can use a fast, slightly old copy. The final room count must come from one place that serializes bookings, which is the primary database.',
        designs: [
          {
            name: 'Fast copy for search, one truth for booking',
            why: 'A search index fed by change events answers searches quickly and can be a minute behind. The booking step reads and updates the primary, so two guests cannot take the last room. A rate limiter and a circuit breaker protect the site from bots and a slow payment service.',
            graph: G([
              N('web', 'web-browser', -480, -60),
              N('app', 'mobile-app', -480, 80),
              N('lb', 'network-lb', -300, 10, { zones: 3 }),
              N('rl', 'rate-limiter', -120, 10, { units: 1, knobs: { limitRps: 20, mode: 'fail-open' } }),
              N('api', 'vm-fleet', 60, 10, { units: 10, zones: 3 }),
              N('cache', 'distributed-cache', 250, -110, { units: 3, zones: 3, knobs: { ttlSec: 60, coalesce: true } }),
              N('idx', 'search-index', 440, -190, { units: 3, zones: 3 }),
              N('cdc', 'cdc-connector', 440, -60),
              N('db', 'sql-primary', 440, 60, { tier: 'L', zones: 2, knobs: { replication: 'sync' } }),
              N('rep', 'sql-replica', 440, 160, { units: 2, zones: 2 }),
              N('idem', 'idempotency-store', 60, 150),
              N('cb', 'circuit-breaker', 250, 190, { knobs: { timeoutMs: 1000 } }),
              N('pay', 'payment-processor', 440, 250, { knobs: { timeoutMs: 1000, retries: 2, backoff: 'exponential-jitter' } }),
              N('kms', 'kms', 60, -130),
              N('audit', 'audit-log', 630, 60),
              N('metrics', 'metrics', 630, -60),
              N('alerting', 'alerting', 630, -150)
            ], [
              ['web', 'lb'], ['app', 'lb'], ['lb', 'rl'], ['rl', 'api'],
              ['api', 'cache'], ['cache', 'idx'], ['cache', 'db'], ['cache', 'rep'], ['db', 'rep'],
              ['db', 'cdc'], ['cdc', 'idx'],
              ['api', 'idem'], ['api', 'cb'], ['cb', 'pay'],
              ['api', 'kms'], ['db', 'audit'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 905, costPerMonth: 6300 }
          }
        ],
        tradeoffs: [
          'A search index is a second copy of your data. It makes search fast and means a result can show a room that was just taken.',
          'A rate limiter set too tight blocks families on a hotel Wi-Fi who share one address; set too loose it lets scrapers through. Pick a limit from real traffic.',
          'The final booking check goes to the primary and takes a few ms more, which is the price of never selling the same room twice.',
          'A circuit breaker on payments means some guests see "try again" during a slowdown instead of everyone waiting 30 seconds.',
          'A 60 second cache cuts search load by about 90 percent and hides a price change for up to a minute.'
        ],
        realWorld: 'Large booking sites list millions of rooms and answer far more searches than bookings, often by a ratio of hundreds to one (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 7. Airline booking (Hard)
    // ------------------------------------------------------------------
    {
      id: 'airline-booking',
      title: 'Airline booking',
      difficulty: 'Hard',
      concepts: ['consistency', 'circuit-breakers', 'security-compliance'],
      like: "an airline's booking and seat system",
      brief: 'You run the booking system for an airline. Fare searches are heavy, seats are limited, and every flight needs the right number of tickets, no more and no fewer. You depend on a partner system for fares from other airlines, and it has strict limits. A fare sale and a slow partner will both happen on the same day.',
      clarify: [
        { q: 'Can two people hold the same seat?', a: 'Never. A seat is held by exactly one person, and holds expire after 15 minutes.' },
        { q: 'How heavy is a fare search?', a: 'Heavy. Most results can be reused for a few minutes, since fares move slowly, except during a sale.' },
        { q: 'What is the partner system limit?', a: 'About 200 requests a second, and during busy hours it can cut that in half without warning.' },
        { q: 'What records must we keep?', a: 'Passenger and payment records are sensitive. Every action must be audited, data encrypted, and backups proven to restore.' }
      ],
      requirements: {
        users: '20 million visitors a month (approx.)',
        monthlyUsers: 20000000,
        peakRps: 6000,
        mix: { search: 0.58, read: 0.25, write: 0.06, payment: 0.02, login: 0.06, notify: 0.03 },
        latencyP99Ms: { default: 400, search: 1500, payment: 4000, login: 1500 },
        availability: 0.9995,
        dataSafety: 'no-loss',
        readYourWrites: true,
        compliance: ['encryption', 'audit-log', 'pii-vault', 'backups'],
        budgetPerMonth: 8500,
        storageTb: 4,
        userRegions: { us: 0.6, eu: 0.4 },
        homeRegion: 'us',
        notes: [
          'About 3,500 fare searches a second at peak. Seat holds and changes are about 360 writes a second (approx.).',
          'A partner (global distribution) system provides some fares; limit about 200 requests a second.',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
      requires: { payment: [['payment-processor']] },
      palette: null,
      starter: {
        nodes: [
          N('web', 'web-browser', -480, -60, { locked: true, label: 'Website' }),
          N('app', 'mobile-app', -480, 80, { locked: true, label: 'Mobile app' })
        ],
        edges: []
      },
      events: [
        { id: 'slow-dependency', at: '09:30' },
        { id: 'flash-crowd', at: '12:00', params: { factor: 6, rampSec: 120, holdSec: 1200, decaySec: 1800, types: ['search', 'read', 'login'] } },
        { id: 'third-party-rate-limit', at: '19:00' }
      ],
      eventPool: ['dependency-outage', 'zone-outage', 'compliance-audit', 'replication-lag'],
      numbers: [
        { label: 'Fare searches per second at peak', value: 3480, unit: 'req/s', how: '6,000 x 0.58', ask: true },
        { label: 'Searches that reach the search index with a 90% cache hit rate', value: 348, unit: 'req/s', how: '3,480 x (1 - 0.90)', ask: true },
        { label: 'Seat holds, changes and payments per second', value: 480, unit: 'req/s', how: '6,000 x (0.06 + 0.02)', ask: true }
      ],
      hints: [
        'Searching can use old answers. Holding a seat cannot. Where must the seat count live so two people cannot take the same one?',
        'Keep seats in one strongly consistent database with synchronous copies. Cache fare searches for a few minutes so the partner system sees only a trickle, and wrap every outside call in a circuit breaker.',
        'Balancer, 8 servers over 3 zones, a cache with a short keep time, a search index for own fares, a large primary with sync replication, circuit breakers on the partner API and payments, an idempotency store, a privacy vault, key service, audit log and backups.'
      ],
      editorial: {
        summary: 'A seat is a scarce thing that two people want at once, so booking needs one strongly consistent truth. Everything around it can be fast and approximate: search, pages, notifications. The outside systems are the weak points, so every call to them gets a timeout, a breaker and a cache.',
        designs: [
          {
            name: 'One strong database, approximate everything around it',
            why: 'A single large primary with synchronous copies makes every seat hold atomic. A search index and short cache absorb searches so the partner system is only asked for fares you cannot compute yourself. Circuit breakers keep a slow partner or payment company from taking the site with it.',
            graph: G([
              N('web', 'web-browser', -480, -60),
              N('app', 'mobile-app', -480, 80),
              N('lb', 'network-lb', -300, 10, { zones: 3 }),
              N('api', 'vm-fleet', -110, 10, { units: 8, zones: 3 }),
              N('cache', 'distributed-cache', 80, -110, { units: 3, zones: 3, knobs: { ttlSec: 300, coalesce: true } }),
              N('idx', 'search-index', 270, -190, { units: 3, zones: 3 }),
              N('db', 'sql-primary', 270, -50, { tier: 'L', zones: 3, knobs: { replication: 'sync' } }),
              N('rep', 'sql-replica', 270, 50, { units: 2, zones: 2 }),
              N('cbp', 'circuit-breaker', 80, 120, { knobs: { timeoutMs: 1000 } }),
              N('gds', 'third-party-api', 270, 140, { knobs: { timeoutMs: 1000, retries: 1, backoff: 'exponential-jitter' } }),
              N('cbm', 'circuit-breaker', 80, 220, { knobs: { timeoutMs: 1000 } }),
              N('pay', 'payment-processor', 270, 250, { knobs: { timeoutMs: 1000, retries: 2, backoff: 'exponential-jitter' } }),
              N('idem', 'idempotency-store', -110, 150),
              N('q', 'queue', 80, 320),
              N('wk', 'worker-pool', 270, 340, { units: 2 }),
              N('push', 'push-service', 450, 340),
              N('kms', 'kms', -110, -130),
              N('vault', 'privacy-vault', 80, -230),
              N('audit', 'audit-log', 450, -50),
              N('bk', 'backups', 450, 40),
              N('metrics', 'metrics', 450, 130),
              N('alerting', 'alerting', 450, 210)
            ], [
              ['web', 'lb'], ['app', 'lb'], ['lb', 'api'],
              ['api', 'cache'], ['cache', 'idx'], ['cache', 'db'], ['cache', 'rep'], ['db', 'rep'],
              ['api', 'cbp'], ['cbp', 'gds'], ['api', 'cbm'], ['cbm', 'pay'],
              ['api', 'idem'], ['api', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['api', 'kms'], ['api', 'vault'], ['db', 'audit'], ['bk', 'db'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 890, costPerMonth: 7000 }
          },
          {
            name: 'Distributed SQL across two regions',
            why: 'Three nodes of a distributed SQL database stay correct if a whole zone is lost and can be spread across regions later. You pay about twice the database price and gain a path to running in two regions without changing how seats work.',
            graph: G([
              N('web', 'web-browser', -480, -60),
              N('app', 'mobile-app', -480, 80),
              N('lb', 'network-lb', -300, 10, { zones: 3 }),
              N('api', 'vm-fleet', -110, 10, { units: 8, zones: 3 }),
              N('cache', 'distributed-cache', 80, -110, { units: 3, zones: 3, knobs: { ttlSec: 300, coalesce: true } }),
              N('idx', 'search-index', 270, -190, { units: 3, zones: 3 }),
              N('db', 'distributed-sql', 270, -30, { units: 3, zones: 3 }),
              N('cbp', 'circuit-breaker', 80, 120, { knobs: { timeoutMs: 1000 } }),
              N('gds', 'third-party-api', 270, 140, { knobs: { timeoutMs: 1000, retries: 1, backoff: 'exponential-jitter' } }),
              N('cbm', 'circuit-breaker', 80, 220, { knobs: { timeoutMs: 1000 } }),
              N('pay', 'payment-processor', 270, 250, { knobs: { timeoutMs: 1000, retries: 2, backoff: 'exponential-jitter' } }),
              N('idem', 'idempotency-store', -110, 150),
              N('kms', 'kms', -110, -130),
              N('vault', 'privacy-vault', 80, -230),
              N('audit', 'audit-log', 450, -30),
              N('bk', 'backups', 450, 60),
              N('metrics', 'metrics', 450, 150),
              N('alerting', 'alerting', 450, 230)
            ], [
              ['web', 'lb'], ['app', 'lb'], ['lb', 'api'],
              ['api', 'cache'], ['cache', 'idx'], ['cache', 'db'],
              ['api', 'cbp'], ['cbp', 'gds'], ['api', 'cbm'], ['cbm', 'pay'],
              ['api', 'idem'],
              ['api', 'kms'], ['api', 'vault'], ['db', 'audit'], ['bk', 'db'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 870, costPerMonth: 9400 }
          }
        ],
        tradeoffs: [
          'Sync replication adds a few ms to every seat hold. It is the reason a failover cannot lose a booking.',
          'Caching fares for five minutes cuts partner calls by about 90 percent, and shows a price that may be a few minutes old. Re-check the price at checkout.',
          'A circuit breaker returns "try again" quickly when the partner is slow. Without one, all your servers end up waiting on the partner.',
          'Distributed SQL costs about twice as much per node and removes the single primary. A single big primary is simpler and cheaper until you need two regions.',
          'The privacy vault and audit log are fixed costs. An audit failure costs more than both put together.'
        ],
        realWorld: 'Airlines hold their seat inventory in one authoritative system, and many fare lookups are answered from caches that are minutes old (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 8. Concert ticket drop (Hard)
    // ------------------------------------------------------------------
    {
      id: 'concert-ticket-drop',
      title: 'Concert ticket drop',
      difficulty: 'Hard',
      concepts: ['queues-backpressure', 'rate-limiting', 'idempotency-retries'],
      like: 'a ticket sale like Ticketmaster',
      brief: 'Tickets for a huge tour go on sale at 10:00 sharp. Hundreds of thousands of fans arrive in the same minute, bots arrive earlier, and everyone refreshes when the page stalls. There are 40,000 seats. Sell each one once, charge each buyer once, and keep the site standing.',
      clarify: [
        { q: 'Is it fine to make fans wait in line?', a: 'Yes. A fair waiting room is much better than a broken site. Fans wait if they are told their place.' },
        { q: 'Can a seat be sold twice?', a: 'Never. A seat is held for one buyer for 5 minutes, then sold or released.' },
        { q: 'What about people who press refresh?', a: 'Many will. Every refresh can add load, and a failing payment may be retried several times by the app.' },
        { q: 'Can some requests be turned away?', a: 'A small share, yes, if bots and extra refreshes are the ones turned away. 99 percent of real people should be served.' }
      ],
      requirements: {
        users: '2 million fans on the day (approx.)',
        monthlyUsers: 2000000,
        peakRps: 6000,
        mix: { read: 0.57, login: 0.10, write: 0.24, payment: 0.05, notify: 0.04 },
        latencyP99Ms: { default: 500, payment: 4000, login: 1500 },
        availability: 0.99,
        dataSafety: 'no-loss',
        readYourWrites: true,
        compliance: ['encryption', 'audit-log'],
        budgetPerMonth: 7500,
        storageTb: 1,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          'The normal day is flat at about 600 requests a second. At 10:00 sharp, traffic jumps to about 25 times that for 15 minutes (approx.).',
          'At the top of the rush that is about 8,500 page views, 3,600 seat holds and 750 payments a second.',
          'One database primary handles about 2,000 writes a second; payments are limited by the card company to about 1,000 a second.'
        ]
      },
      traffic: { curve: 'drop', sources: { 'web-browser': 0.5, 'mobile-app': 0.5 }, params: { dropAt: '10:00' } },
      requires: { payment: [['payment-processor']] },
      palette: null,
      starter: {
        nodes: [
          N('web', 'web-browser', -480, -60, { locked: true, label: 'Fans on the website' }),
          N('app', 'mobile-app', -480, 80, { locked: true, label: 'Fans in the app' })
        ],
        edges: []
      },
      events: [
        { id: 'bot-scraping', at: '09:50' },
        { id: 'flash-crowd', at: '10:00', params: { factor: 25, rampSec: 30, holdSec: 900, decaySec: 1800 } },
        { id: 'retry-storm', at: '10:07' }
      ],
      eventPool: ['slow-dependency', 'dependency-outage', 'duplicate-delivery'],
      numbers: [
        { label: 'Requests per second at the top of the rush', value: 15000, unit: 'req/s', how: '600 normal x 25', ask: true },
        { label: 'Seat holds per second at the top of the rush', value: 3600, unit: 'req/s', how: '15,000 x 0.24', ask: true },
        { label: 'Time to sell 40,000 seats at 2,000 holds per second, ignoring payment', value: 20, unit: 'seconds', how: '40,000 / 2,000', ask: true }
      ],
      hints: [
        'The site does not have to serve everyone at once. What could hold people in a fair line and let them in at a pace your database can handle?',
        'A queue in front of the seat holds is a waiting room. A CDN serves the event page and the waiting-room page itself, and a rate limiter stops bots from taking every slot.',
        'CDN for pages, rate limiter at the door, a first-in-first-out queue into 10 workers and sharded SQL for seat holds, servers and an idempotency store for payments, 10 servers pre-warmed because scale-up is too slow for a 30 second ramp.'
      ],
      editorial: {
        summary: 'You cannot buy your way out of a 25 times jump that lasts 15 minutes. You shape the traffic instead: serve static pages from the edge, turn away bots, queue seat holds and process them at the speed your database can take. Everyone is served in order, and nobody gets double charged.',
        designs: [
          {
            name: 'Waiting room in front of the seat database',
            why: 'The CDN absorbs most page views. The rate limiter caps each client so bots cannot take every slot. Seat holds enter a first-in-first-out queue and workers apply them at a pace the sharded database can handle. Payments go through the idempotency store, so a retry after a timeout is never a second charge.',
            graph: G([
              N('web', 'web-browser', -480, -60),
              N('app', 'mobile-app', -480, 80),
              N('cdn', 'cdn', -290, -140, { knobs: { ttlSec: 60, coalesce: true } }),
              N('rl', 'rate-limiter', -290, 10, { units: 1, knobs: { limitRps: 5, mode: 'fail-closed' } }),
              N('lb', 'network-lb', -110, 10, { zones: 3 }),
              N('api', 'vm-fleet', 70, 10, { units: 10, zones: 3 }),
              N('q', 'queue', 250, -60, { knobs: { mode: 'fifo', retentionDays: 1 } }),
              N('wk', 'worker-pool', 430, -60, { units: 10 }),
              N('seats', 'sharded-sql', 610, -60, { units: 4, zones: 2, knobs: { replication: 'sync' } }),
              N('idem', 'idempotency-store', 70, 150),
              N('pay', 'payment-processor', 250, 170, { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } }),
              N('kms', 'kms', 250, 70),
              N('audit', 'audit-log', 610, 50),
              N('metrics', 'metrics', 430, 150),
              N('alerting', 'alerting', 430, 230)
            ], [
              ['web', 'cdn'], ['app', 'cdn'], ['web', 'rl'], ['app', 'rl'],
              ['cdn', 'lb'], ['rl', 'lb'], ['lb', 'api'],
              ['api', 'q'], ['q', 'wk'], ['wk', 'seats'],
              ['api', 'idem'], ['api', 'pay'], ['api', 'kms'], ['seats', 'audit'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 880, costPerMonth: 6200 }
          },
          {
            name: 'Over-provisioned, no waiting room',
            why: 'Skip the queue and buy enough servers and shards to take the whole rush straight through. It is simple, and the cost is a large fixed bill all month for fifteen minutes of use, with no protection if the crowd is bigger than you planned.',
            graph: G([
              N('web', 'web-browser', -480, -60),
              N('app', 'mobile-app', -480, 80),
              N('cdn', 'cdn', -290, -140, { knobs: { ttlSec: 60, coalesce: true } }),
              N('lb', 'network-lb', -290, 10, { zones: 3 }),
              N('api', 'vm-fleet', -110, 10, { units: 30, zones: 3 }),
              N('seats', 'sharded-sql', 90, -60, { units: 8, zones: 2, knobs: { replication: 'sync' } }),
              N('idem', 'idempotency-store', -110, 150),
              N('pay', 'payment-processor', 90, 170, { knobs: { timeoutMs: 3000, retries: 2, backoff: 'exponential-jitter' } }),
              N('kms', 'kms', -110, 230),
              N('audit', 'audit-log', 270, -60),
              N('metrics', 'metrics', 270, 150),
              N('alerting', 'alerting', 270, 230)
            ], [
              ['web', 'cdn'], ['app', 'cdn'], ['web', 'lb'], ['app', 'lb'],
              ['cdn', 'lb'], ['lb', 'api'], ['api', 'seats'],
              ['api', 'idem'], ['api', 'pay'], ['api', 'kms'], ['seats', 'audit'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 760, costPerMonth: 9300 }
          }
        ],
        tradeoffs: [
          'A waiting room feels slow to a fan and stops the site from falling over. Most fans prefer a place in line to an error page.',
          'A rate limiter set to fail closed turns people away if it breaks. Fail open lets bots through. For a sale, closed is usually the safer choice.',
          'Pre-warmed servers cost money all month. Autoscaling cannot add servers in the 30 seconds before the first wave arrives.',
          'First-in-first-out ordering is fair and slower than an unordered queue. For a seat sale, fairness is the point.',
          'Retries with jitter spread repeat requests out. Without them a short blip becomes a four times bigger one.'
        ],
        realWorld: 'Big ticket sales have drawn millions of fans for tens of thousands of seats, and large sellers now use queues or timed access to control the rate (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 9. Smart home (Medium)
    // ------------------------------------------------------------------
    {
      id: 'smart-home-hub',
      title: 'Smart home',
      difficulty: 'Medium',
      concepts: ['realtime-connections', 'multi-region', 'queues-backpressure'],
      like: 'lights and locks controlled from a phone',
      brief: 'One million homes have a hub that keeps a live connection to your cloud. The hub reports its devices every few minutes, and the phone app sends commands like "lock the door". Commands must feel instant and must not be repeated. Once in a while a power cut ends and every hub reconnects together.',
      clarify: [
        { q: 'How fast must a command feel?', a: 'A tap on the phone should switch the light in under a third of a second most of the time.' },
        { q: 'What if a command arrives twice?', a: 'A lock command twice is usually harmless, but "toggle the garage door" twice is not. Treat commands as one-time actions.' },
        { q: 'What happens if a whole region goes down?', a: 'Homes should connect to the other region within a couple of minutes, and commands should work again.' },
        { q: 'How many users are in Europe?', a: 'About a third. The rest are mostly in North America.' }
      ],
      requirements: {
        users: '1 million homes and 2.5 million app users (approx.)',
        monthlyUsers: 2500000,
        peakRps: 5000,
        mix: { telemetry: 0.50, message: 0.12, read: 0.14, event: 0.14, notify: 0.10 },
        latencyP99Ms: { default: 300 },
        availability: 0.999,
        dataSafety: 'rpo-1m',
        readYourWrites: false,
        compliance: [],
        budgetPerMonth: 10500,
        storageTb: 2,
        userRegions: { us: 0.6, eu: 0.4 },
        homeRegion: 'us',
        notes: [
          'Each hub sends a batch of device states every few minutes. About 2,500 batches a second at the peak (approx.).',
          'A hub holds one open connection. A single gateway node holds about 100,000 connections.',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'consumer-evening', sources: { 'iot-device': 0.64, 'mobile-app': 0.36 }, params: {} },
      requires: {},
      palette: null,
      starter: {
        nodes: [
          N('hubs', 'iot-device', -480, -60, { locked: true, label: 'Home hubs' }),
          N('phones', 'mobile-app', -480, 100, { locked: true, label: 'Phone app' })
        ],
        edges: []
      },
      events: [
        { id: 'thundering-herd', at: '08:00', params: { factor: 8, types: ['telemetry', 'message', 'read'] } },
        { id: 'region-outage', at: '20:00' }
      ],
      eventPool: ['duplicate-delivery', 'network-partition', 'dependency-outage'],
      numbers: [
        { label: 'Gateway nodes to hold 1 million hub connections at 100,000 each', value: 10, unit: 'nodes', how: '1,000,000 / 100,000', ask: true },
        { label: 'Device batches per second at peak', value: 2500, unit: 'req/s', how: '5,000 x 0.50', ask: true },
        { label: 'Commands and acknowledgements per second', value: 600, unit: 'req/s', how: '5,000 x 0.12', ask: true }
      ],
      hints: [
        'A hub keeps a connection open all day. What holds a million open connections without becoming the thing that breaks?',
        'A socket gateway layer holds the connections and passes messages inward. For a region outage, route users with geo DNS and keep a copy of hub state in a second region.',
        'Geo DNS into two regional stacks, each with a socket gateway, a few servers and a key-value store for device state. A queue for notifications. Tell the apps to reconnect with jitter so a power cut does not turn into a stampede.'
      ],
      editorial: {
        summary: 'This problem is about connections, not requests per second. A million open sockets need a layer of their own. The other lesson is to treat commands as actions that happen once, and to expect that after a power cut, a million hubs call home in the same minute.',
        designs: [
          {
            name: 'Two regions, connection layer in front',
            why: 'A socket gateway layer in each region holds the open connections. Device state sits in a key-value store that is cheap per write at this volume. Geo DNS sends hubs to the nearest healthy region, and the idempotency store makes a repeated command harmless.',
            graph: G([
              N('hubs', 'iot-device', -480, -60),
              N('phones', 'mobile-app', -480, 100),
              N('dns', 'geo-dns', -300, 10, { knobs: { mode: 'latency' } }),
              N('gwus', 'websocket-gateway', -110, -80, { units: 6, zones: 3, region: 'us' }),
              N('gweu', 'websocket-gateway', -110, 100, { units: 4, zones: 2, region: 'eu' }),
              N('apius', 'container-cluster', 80, -80, { units: 4, zones: 3, region: 'us' }),
              N('apieu', 'container-cluster', 80, 100, { units: 3, zones: 3, region: 'eu' }),
              N('kvus', 'kv-store', 270, -80, { units: 2, region: 'us' }),
              N('kveu', 'kv-store', 270, 100, { units: 1, region: 'eu' }),
              N('idem', 'idempotency-store', 80, 200, { region: 'us' }),
              N('q', 'queue', 270, 20),
              N('wk', 'worker-pool', 450, 20, { units: 2, region: 'us' }),
              N('push', 'push-service', 630, 20),
              N('metrics', 'metrics', 450, -90),
              N('alerting', 'alerting', 450, 190),
              N('pager', 'pager', 630, 190)
            ], [
              ['hubs', 'dns'], ['phones', 'dns'], ['dns', 'gwus'], ['dns', 'gweu'],
              ['gwus', 'apius'], ['gweu', 'apieu'], ['apius', 'kvus'], ['apieu', 'kveu'],
              ['apius', 'idem'], ['apius', 'q'], ['apieu', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['apius', 'metrics'], ['metrics', 'alerting'], ['alerting', 'pager']
            ]),
            expect: { score: 900, costPerMonth: 8600 }
          },
          {
            name: 'One region plus a standby',
            why: 'Run everything in one region and keep a cold standby that can be started in about an hour. It costs much less. During a region outage, homes are offline until the standby comes up, which this design is slower to recover from.',
            graph: G([
              N('hubs', 'iot-device', -480, -60),
              N('phones', 'mobile-app', -480, 100),
              N('gw', 'websocket-gateway', -270, 20, { units: 8, zones: 3 }),
              N('api', 'container-cluster', -60, 20, { units: 5, zones: 3 }),
              N('kv', 'kv-store', 150, -20, { units: 2 }),
              N('idem', 'idempotency-store', -60, 140),
              N('q', 'queue', 150, 110),
              N('wk', 'worker-pool', 330, 110, { units: 2 }),
              N('push', 'push-service', 510, 110),
              N('dr', 'disaster-recovery', 330, -20, { region: 'eu', knobs: { mode: 'pilot-light' } }),
              N('metrics', 'metrics', 330, -110),
              N('alerting', 'alerting', 510, -110)
            ], [
              ['hubs', 'gw'], ['phones', 'gw'], ['gw', 'api'], ['api', 'kv'], ['api', 'idem'],
              ['api', 'q'], ['q', 'wk'], ['wk', 'push'], ['dr', 'api'],
              ['api', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 810, costPerMonth: 6100 }
          }
        ],
        tradeoffs: [
          'A second region costs about a third more and turns a region outage from hours of downtime into a short reconnect.',
          'A key-value table is cheap per write and cannot answer complex questions. Keep a separate reporting copy for those.',
          'Jittered reconnect spreads a million hubs over a minute or two, at the price of some hubs waiting a bit to get back online.',
          'Treating commands as one-time actions needs an idempotency key on every command, and removes a whole class of rare bugs.',
          'A cold standby is cheap and slow. A warm standby is faster and costs closer to a second region.'
        ],
        realWorld: 'Smart-home clouds keep hundreds of thousands of connections per gateway node and ask devices to reconnect with random delays after an outage (approx.).'
      },
      daily: true
    },

    // ------------------------------------------------------------------
    // 10. Smart power grid (Medium)
    // ------------------------------------------------------------------
    {
      id: 'smart-power-grid',
      title: 'Smart power grid',
      difficulty: 'Medium',
      concepts: ['storage-tiers', 'queues-backpressure', 'security-compliance'],
      like: 'a power company reading millions of smart meters',
      brief: 'A power company has 5 million smart meters. Each reports usage every 15 minutes, and they all try on the quarter hour. Customers see their usage, billing needs exact totals for seven years, and a regulator checks that records are kept safely. Control commands to home batteries and thermostats must never run twice.',
      clarify: [
        { q: 'Can a meter reading be lost?', a: 'No. Readings are the basis of every bill. A meter keeps its readings and resends, so the same reading may arrive twice.' },
        { q: 'How long are readings kept?', a: 'Seven years for billing. The last 30 days must be fast to query; older data can be slow and cheap.' },
        { q: 'What happens during an outage?', a: 'When power returns, thousands of meters report at once. A short link failure between the substations and the cloud must not lose data.' },
        { q: 'What does the regulator check?', a: 'That every action is logged, data is encrypted with managed keys, backups exist and old records are kept for the required years.' }
      ],
      requirements: {
        users: '5 million meters, 3 million customers who look at usage (approx.)',
        monthlyUsers: 3000000,
        peakRps: 7000,
        mix: { telemetry: 0.78, event: 0.08, read: 0.06, report: 0.03, write: 0.02, notify: 0.03 },
        latencyP99Ms: { default: 500, report: 8000 },
        availability: 0.999,
        dataSafety: 'no-loss',
        readYourWrites: false,
        compliance: ['encryption', 'audit-log', 'backups', 'retention'],
        budgetPerMonth: 10000,
        storageTb: 12,
        userRegions: { us: 1 },
        homeRegion: 'us',
        notes: [
          '5 million meters every 15 minutes is about 5,500 batches a second on average, and the quarter-hour waves are about 25 percent higher (approx.).',
          'Each meter reading is about 100 bytes; one day is on the order of 50 GB. Seven years is on the order of 120 TB cold (approx.).',
          'All numbers are rough approximations.'
        ]
      },
      traffic: { curve: 'flat', sources: { 'iot-device': 0.91, 'web-browser': 0.06, 'admin-console': 0.03 }, params: {} },
      requires: {},
      palette: null,
      starter: {
        nodes: [
          N('meters', 'iot-device', -480, -80, { locked: true, label: 'Smart meters' }),
          N('customers', 'web-browser', -480, 50, { locked: true, label: 'Customer portal' }),
          N('analysts', 'admin-console', -480, 170, { locked: true, label: 'Grid analysts' })
        ],
        edges: []
      },
      events: [
        { id: 'network-partition', at: '09:20' },
        { id: 'thundering-herd', at: '16:45', params: { factor: 3, types: ['telemetry', 'event'] } },
        { id: 'compliance-audit', at: '21:00' }
      ],
      eventPool: ['disk-full', 'duplicate-delivery', 'data-corruption'],
      numbers: [
        { label: 'Meter batches per second at peak', value: 5460, unit: 'req/s', how: '7,000 x 0.78', ask: true },
        { label: 'Readings stored per day', value: 480, unit: 'million', how: '5,000,000 meters x 96 readings a day', ask: true },
        { label: 'Seven years of readings at about 100 bytes', value: 120, unit: 'TB', how: '480M x 100 B = 48 GB a day, x 365 x 7', ask: true }
      ],
      hints: [
        'Seven years of data is much more than any fast database should hold. How can old data move somewhere cheaper while the last month stays quick?',
        'A stream absorbs the quarter-hour waves, a time-series database keeps 30 days, and a cold archive keeps the rest. Add an audit log, key service and backups for the regulator.',
        'Balancer, event stream (3 brokers), two stream workers, a 3-node time-series database with 30 day retention, a data lake and cold archive for older data, a small API with a cache for the customer portal, an idempotency store for control commands, audit log, key service, backups and alerts.'
      ],
      editorial: {
        summary: 'A fleet of meters is a metronome: everyone calls on the quarter hour, so the system must take big even waves, never lose a reading and keep it for seven years. Hot, warm and cold storage is the main lever on cost, and the regulator needs proof, not promises.',
        designs: [
          {
            name: 'Stream, hot database, cold archive',
            why: 'The stream flattens each quarter-hour wave and keeps readings safe if a link drops. Thirty days live in the time-series database for fast queries, and everything older goes to the lake and archive at about a hundredth of the storage price. The audit log, key service and backups answer the regulator.',
            graph: G([
              N('meters', 'iot-device', -480, -80),
              N('customers', 'web-browser', -480, 50),
              N('analysts', 'admin-console', -480, 170),
              N('lb', 'network-lb', -300, -80, { zones: 3 }),
              N('stream', 'event-stream', -110, -80, { units: 3, zones: 3, knobs: { partitions: 24, retentionDays: 4 } }),
              N('proc', 'stream-processor', 80, -80, { units: 2, zones: 2 }),
              N('tsdb', 'timeseries-db', 270, -80, { units: 3, zones: 3, knobs: { retentionDays: 30 } }),
              N('lake', 'data-lake', 460, -150, { knobs: { retentionDays: 395 } }),
              N('arch', 'cold-archive', 640, -150, { knobs: { retentionDays: 395 } }),
              N('idem', 'idempotency-store', 80, 60),
              N('api', 'vm-fleet', -110, 110, { units: 3, zones: 3 }),
              N('cache', 'cache', 80, 150, { zones: 2, knobs: { ttlSec: 300 } }),
              N('billing', 'sql-primary', 270, 140, { zones: 2, knobs: { replication: 'sync' } }),
              N('q', 'queue', 80, 240),
              N('wk', 'worker-pool', 270, 260, { units: 2 }),
              N('push', 'push-service', 450, 260),
              N('kms', 'kms', -110, 220),
              N('audit', 'audit-log', 460, 90),
              N('bk', 'backups', 640, 50),
              N('metrics', 'metrics', 460, -20),
              N('alerting', 'alerting', 640, -20)
            ], [
              ['meters', 'lb'], ['lb', 'stream'], ['stream', 'proc'], ['proc', 'tsdb'], ['proc', 'lake'], ['proc', 'arch'],
              ['customers', 'api'], ['analysts', 'api'], ['api', 'cache'], ['cache', 'tsdb'], ['cache', 'billing'],
              ['api', 'idem'], ['api', 'q'], ['q', 'wk'], ['wk', 'push'],
              ['api', 'kms'], ['billing', 'audit'], ['bk', 'tsdb'], ['bk', 'billing'],
              ['proc', 'metrics'], ['tsdb', 'metrics'], ['metrics', 'alerting']
            ]),
            expect: { score: 900, costPerMonth: 8800 }
          }
        ],
        tradeoffs: [
          'Hot storage costs roughly ten to a hundred times more than cold. Keeping only 30 days hot is the largest saving in the design.',
          'Four days of stream retention is enough to survive a weekend of trouble and costs little. One day is not.',
          'Resending readings is safe because a reading has a meter id and a time; the store ignores the second copy.',
          'Text messages cost about a cent each and push alerts cost nothing, so alerts go out by push and only the urgent ones get a text.',
          'The audit log, key service and backups are small monthly costs and each prevents a failed audit check.'
        ],
        realWorld: 'Utilities often collect 15-minute interval readings from millions of meters and are required to keep billing records for several years (approx.).'
      },
      daily: true
    }
  ]
};
