// Seven more problems that fill the gaps in the bank: an Easy start in travel, IoT, AI, productivity and developer platforms,
// plus a second problem in IoT and games. Every figure is a rough, real-world approximation and the notes say so.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'core', title: 'More problems', blurb: 'Easy starts and extra practice across travel, devices, AI, productivity, tools and games.' },
  problems: [
{
  id: 'restaurant-reservations', title: 'Restaurant reservations', difficulty: 'Easy',
  concepts: ['consistency', 'caching'],
  like: 'a booking site like OpenTable',
  brief: 'Diners look up restaurants, check which tables are free tonight and book one. Looking is easy to speed up. Booking is not: two people must never get the same table. Friday at 5 pm is the busy moment.',
  clarify: [
    { q: 'Can the list of free times be a little old?', a: 'Yes, by a minute. If a time has just gone, the booking step says so politely.' },
    { q: 'Can the booking step be old?', a: 'No. The final check must use the real table count, so a table is never given out twice.' },
    { q: 'How many people look compared with people who book?', a: 'About 5 people look for every 1 who books (approx.).' }
  ],
  requirements: {
    users: '6 million diners a month (approx.)', monthlyUsers: 6000000, peakRps: 1500,
    mix: { read: 0.8, write: 0.15, login: 0.05 }, latencyP99Ms: { default: 500 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: true, compliance: [], budgetPerMonth: 4000, storageTb: 0.3,
    userRegions: { us: 0.8, eu: 0.2 }, homeRegion: 'us',
    notes: ['About 225 bookings a second at the Friday evening peak (approx.).', 'One app server handles about 1,000 requests a second (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.5, 'mobile-app': 0.5 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'flash-crowd', at: '17:00', params: { factor: 3 } }, { id: 'cache-stampede', at: '12:10' } ],
  eventPool: ['db-failover', 'replication-lag'],
  numbers: [
    { label: 'Bookings per second at peak', value: 225, unit: 'writes/s', how: '1,500 × 0.15 (approx.)', ask: true },
    { label: 'Lookups per second at peak', value: 1200, unit: 'req/s', how: '1,500 × 0.8 (approx.)', ask: true },
    { label: 'App servers at 60 percent busy', value: 3, unit: 'servers', how: '1,500 ÷ 1,000 per server ÷ 0.6 ≈ 3 (approx.). Add one more for the 3 times spike.' }
  ],
  hints: [
    'Looking and booking need different promises. Which can use an old copy and which cannot?',
    'A cache can answer the lookups. The booking step must read and write the real database in one transaction.',
    'Load balancer, a few servers, a cache for lookups, and a SQL database that checks and takes the table in one step.'
  ],
  editorial: {
    summary: 'Most traffic only looks, so a cache answers it. The few bookings go straight to one SQL database that checks and takes the table in a single transaction, which is what stops a double booking.',
    designs: [ { name: 'Cache for looking, one database for booking', why: 'The cache answers the free-times lookups from memory and may be a minute old. Bookings skip it and use the database, which locks the table row and takes it in one step.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { zones: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 4, zones: 2 }),
        N('cache', 'cache', X[3], -50, { knobs: { ttlSec: 60 } }), N('db', 'sql-primary', X[4], 10),
        N('metrics', 'metrics', X[3], 130), N('alerts', 'alerting', X[4], 130)],
        edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db'], ['api', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 3000 } } ],
    tradeoffs: [
      'A longer cache time saves the database, but shows tables that are already gone. A minute is a good middle.',
      'One database that serializes bookings is simple and correct. Spreading bookings over many databases needs care to keep the promise.',
      'Holding a table for a few minutes while the diner confirms avoids a rush of failed bookings, but locks tables that may never be taken.',
      'A small queue for confirmation emails keeps the booking itself fast.'
    ],
    realWorld: 'Reservation sites handle a few hundred bookings a second at the Friday dinner rush and many times more lookups. The lookups come from copies; the booking never does (approx.).'
  },
  daily: true
},
{
  id: 'ev-charging-network', title: 'EV charging network', difficulty: 'Easy',
  concepts: ['idempotency-retries', 'queues-backpressure'],
  like: 'a public charger network',
  brief: 'Thousands of chargers report their status every few seconds and send a record when a session ends. Drivers open an app to find a free charger. A session record must never be lost or counted twice, because it becomes a bill.',
  clarify: [
    { q: 'Must the status on the map be exact?', a: 'No. Ten seconds behind is fine. Drivers just need to know a charger is probably free.' },
    { q: 'Can a charger retry a session record?', a: 'Yes, and it will after any bad connection. A retry must not bill the driver twice.' },
    { q: 'Can billing finish later?', a: 'Yes. A bill can be settled in the background, as long as no record is lost.' }
  ],
  requirements: {
    users: '2 million drivers a month (approx.)', monthlyUsers: 2000000, peakRps: 1800,
    mix: { telemetry: 0.65, read: 0.22, event: 0.06, write: 0.05, login: 0.02 }, latencyP99Ms: { default: 600 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: [], budgetPerMonth: 4500, storageTb: 1,
    userRegions: { us: 0.7, eu: 0.3 }, homeRegion: 'us',
    notes: ['About 20,000 chargers, each sending a status every 10 to 20 seconds (approx.).', 'A session record is about 1 KB (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'commute', sources: { 'iot-device': 0.65, 'mobile-app': 0.35 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('chargers', 'iot-device', -60, 'Chargers'), S('app', 'mobile-app', 80, 'Driver app')], edges: [] },
  events: [ { id: 'dependency-outage', at: '17:30' }, { id: 'thundering-herd', at: '08:00', params: { factor: 4, types: ['telemetry'] } } ],
  eventPool: ['retry-storm', 'duplicate-delivery'],
  numbers: [
    { label: 'Status messages per second at peak', value: 1170, unit: 'msg/s', how: '1,800 × 0.65 (approx.)', ask: true },
    { label: 'Session records a day', value: 130000, unit: 'records', how: '2 million drivers a month ÷ 30 × about 2 sessions each ≈ 130,000 (approx.)', ask: true },
    { label: 'Session data a year', value: 0.05, unit: 'TB', how: '130,000 a day × 365 × 1 KB ≈ 50 GB (approx.)' }
  ],
  hints: [
    'A charger will retry after a bad connection. What stops a retry from billing twice?',
    'Put a queue between the servers and the billing work, so a slow bill never blocks a charger. Add an idempotency store so a repeated record counts once.',
    'Load balancer, servers, idempotency store, queue and workers for sessions, a key-value store for charger status, a SQL database for sessions.'
  ],
  editorial: {
    summary: 'Two kinds of message with two promises. Status is frequent and may be a little old, so a key-value store holds the latest. A session record must land exactly once, so it carries a unique key, goes through a queue and is stored in SQL.',
    designs: [ { name: 'Status in a key-value store, sessions through a queue', why: 'Chargers write only their latest status into a key-value store, which the map reads. Session records pass an idempotency store, wait in a queue and are written by workers, so retries and slow billing never lose or double a record.',
      graph: { nodes: [S('chargers', 'iot-device', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { zones: 2, units: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 6, zones: 2 }),
        N('idem', 'idempotency-store', X[3], 130), N('kv', 'kv-store', X[3], -80, { units: 1 }),
        N('q', 'queue', X[3], 10), N('wk', 'worker-pool', X[4], 10, { units: 2 }), N('db', 'sql-primary', X[5], 10),
        N('metrics', 'metrics', X[4], 130), N('alerts', 'alerting', X[5], 130)],
        edges: [['chargers', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'kv'], ['api', 'idem'], ['api', 'q'], ['q', 'wk'], ['wk', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 4100 } } ],
    tradeoffs: [
      'Keeping only the latest status per charger makes writes cheap. History, if wanted, goes to a separate cheaper store.',
      'The idempotency store costs a lookup per record, and it is what makes retries safe.',
      'The queue absorbs a morning rush of reconnecting chargers. Billing may lag a few minutes, which is fine.',
      'If the billing partner is down, records wait in the queue instead of failing.'
    ],
    realWorld: 'A national charger network has tens of thousands of chargers, each sending a status every few seconds, so a thousand or more small messages a second. Session records are far fewer but must never be lost (approx.).'
  },
  daily: true
},
{
  id: 'calendar-invites', title: 'Calendar and invites', difficulty: 'Easy',
  concepts: ['queues-backpressure', 'idempotency-retries'],
  like: 'a shared calendar',
  brief: 'People view their week, create meetings and invite others. Each invite sends an email or phone alert. Monday at 9 am everyone opens the calendar at once. A repeated send must never produce two invites, and a slow email partner must not slow the calendar.',
  clarify: [
    { q: 'Must an alert arrive instantly?', a: 'Within a minute is fine. The calendar page itself must be quick.' },
    { q: 'What if the email partner limits us?', a: 'It will, at busy times. Alerts wait in a line and go out when the partner allows.' },
    { q: 'What if a message is delivered twice?', a: 'The guest must still see one invite, so each invite carries a unique key.' }
  ],
  requirements: {
    users: '10 million people a month (approx.)', monthlyUsers: 10000000, peakRps: 1200,
    mix: { read: 0.79, write: 0.12, notify: 0.03, login: 0.06 }, latencyP99Ms: { default: 400, notify: 60000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: true, compliance: [], budgetPerMonth: 7500, storageTb: 0.5,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['About 144 new meetings a second at the Monday peak (approx.).', 'On a busy morning the email partner slows to a few dozen messages a second (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'third-party-rate-limit', at: '09:00', params: { rpsCapFactor: 0.4, durationSec: 1200 } }, { id: 'duplicate-delivery', at: '13:00', params: { share: 0.05 } } ],
  eventPool: ['cache-stampede', 'slow-dependency'],
  numbers: [
    { label: 'Alerts to send per second at peak', value: 36, unit: 'msg/s', how: '1,200 × 0.03 (approx.)', ask: true },
    { label: 'Calendar views per second at peak', value: 948, unit: 'req/s', how: '1,200 × 0.79 (approx.)', ask: true },
    { label: 'Alerts the partner takes while limiting us', value: 14, unit: 'msg/s', how: 'At 40 percent of the 36 a second, so a line forms and drains later (approx.)' }
  ],
  hints: [
    'The email partner slows down at 9 am. Where do the extra alerts wait?',
    'A queue holds alerts and workers send them at the pace the partner allows. A key on each invite makes a repeat harmless.',
    'Load balancer, servers, cache for views, SQL database, idempotency store, queue, workers, email provider.'
  ],
  editorial: {
    summary: 'Viewing is a cached read. Creating an invite is a write plus a promise of an alert. The alert goes on a queue so the calendar never waits for the partner, and a unique key makes every repeat harmless.',
    designs: [ { name: 'Queue the alerts, key every invite', why: 'The server saves the meeting, then puts the alert on a queue and answers at once. Workers send at the partner\'s pace, and the idempotency store drops repeated deliveries.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { zones: 2, units: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 4, zones: 2 }),
        N('cache', 'cache', X[3], -80, { knobs: { ttlSec: 30 } }), N('db', 'sql-primary', X[4], -80),
        N('idem', 'idempotency-store', X[3], 130), N('q', 'queue', X[3], 30), N('wk', 'worker-pool', X[4], 30, { units: 2 }), N('mail', 'email-provider', X[5], 30),
        N('metrics', 'metrics', X[4], 140), N('alerts', 'alerting', X[5], 140)],
        edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db'], ['api', 'idem'], ['api', 'q'], ['q', 'wk'], ['wk', 'mail'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 6500 } } ],
    tradeoffs: [
      'A short cache time keeps the week view fresh. A long one saves the database but shows a stale meeting.',
      'A queue means an alert may be a minute late. That is the price of never blocking the calendar.',
      'Unique keys cost a lookup but turn a repeated delivery into a no-op.',
      'If the partner is down for long, a second provider is a cheap way to keep alerts moving.'
    ],
    realWorld: 'Calendar systems see their biggest bursts on Monday mornings, when millions of people open the week at once. Alerts are sent through outside email and push partners with their own limits (approx.).'
  },
  daily: true
},
{
  id: 'status-page', title: 'Status page', difficulty: 'Easy',
  concepts: ['multi-region', 'cdn'],
  like: 'a public status page',
  brief: 'When a big service has a problem, millions of people open its status page to see what is happening. The page must stay up exactly when everything else is down, and it must not share a home with the thing it reports on. A few staff update it by hand.',
  clarify: [
    { q: 'How fresh must the page be?', a: 'About 30 seconds behind is fine. Staff updates do not need to appear instantly.' },
    { q: 'Can it live next to the main service?', a: 'It should not. If the main region fails, the status page has to keep working.' },
    { q: 'How many people write to it?', a: 'A handful of staff. Almost all traffic is reading.' }
  ],
  requirements: {
    users: '5 million visitors in a bad week (approx.)', monthlyUsers: 5000000, peakRps: 800,
    mix: { read: 0.99, write: 0.005, login: 0.005 }, latencyP99Ms: { default: 400 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 3500, storageTb: 0.01,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 }, homeRegion: 'us',
    notes: ['The whole page is a few kilobytes of text (approx.).', 'During a big outage reads can be 5 times the usual (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'flat', sources: { 'web-browser': 0.7, 'mobile-app': 0.3 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'flash-crowd', at: '14:00', params: { factor: 5 } }, { id: 'zone-outage', at: '14:20' } ],
  eventPool: ['region-outage', 'cache-stampede'],
  numbers: [
    { label: 'Reads per second at peak', value: 792, unit: 'req/s', how: '800 × 0.99 (approx.)', ask: true },
    { label: 'Reads per second in a 5 times crowd', value: 4000, unit: 'req/s', how: '800 × 5 (approx.)', ask: true },
    { label: 'Page size', value: 20, unit: 'KB', how: 'A small page of text and a few icons (approx.)' }
  ],
  hints: [
    'Everyone reads the same page. How many of those reads must reach your own servers?',
    'A CDN can keep the page for 30 seconds. Even a whole zone failing will not matter if the edge holds a copy.',
    'CDN with a 30 second copy, load balancer over three zones, a few servers and a key-value store.'
  ],
  editorial: {
    summary: 'One small page read by millions is the easiest thing to cache. A CDN holds it for about 30 seconds, so the servers see a handful of requests no matter how big the crowd. The rest is keeping the origin spread over zones.',
    designs: [ { name: 'Edge copy with a spread-out origin', why: 'The CDN answers nearly every read and collapses misses, so a 5 times crowd barely reaches the origin. Servers and the store sit in three zones, so one zone failing is invisible.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('cdn', 'cdn', X[1], 10, { knobs: { ttlSec: 30, coalesce: true } }), N('lb', 'regional-lb', X[2], 10, { zones: 3, units: 3 }),
        N('api', 'vm-fleet', X[3], 10, { units: 3, zones: 3 }), N('kv', 'kv-store', X[4], 10, { units: 1 }),
        N('metrics', 'metrics', X[3], 130), N('alerts', 'alerting', X[4], 130)],
        edges: [['web', 'cdn'], ['app', 'cdn'], ['cdn', 'lb'], ['lb', 'api'], ['api', 'kv'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 3100 } } ],
    tradeoffs: [
      'A 30 second copy is slightly stale. Anything shorter costs more origin traffic with little gain.',
      'Hosting away from the main service means a second set of accounts to look after, but it survives the failure you are reporting.',
      'Serving a saved copy while the origin is down keeps the page up even in a full region outage.',
      'Pay-per-request CDN pricing makes a 5 times crowd cost more, but only for the day it lasts.'
    ],
    realWorld: 'Status pages for big services are served almost entirely from an edge network. In a major incident, traffic can jump from a few requests a second to thousands within minutes (approx.).'
  },
  daily: true
},
{
  id: 'semantic-search', title: 'Semantic search', difficulty: 'Easy',
  concepts: ['ai-serving', 'search-indexing'],
  like: '"search by meaning" on a help center',
  brief: 'A help center lets people type a question in plain words and finds the right articles even when the words differ. Each question is turned into a list of numbers (a vector) and matched to similar articles. Many people ask the same few questions.',
  clarify: [
    { q: 'How fast must an answer come back?', a: 'Under about a second. A person is waiting at the search box.' },
    { q: 'Do many people ask the same thing?', a: 'Yes. About half of all questions repeat within a day.' },
    { q: 'How often do articles change?', a: 'A few times a day. New articles are searchable within minutes.' }
  ],
  requirements: {
    users: '3 million people a month (approx.)', monthlyUsers: 3000000, peakRps: 400,
    mix: { search: 0.85, read: 0.12, write: 0.03 }, latencyP99Ms: { default: 800, search: 1000 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 5000, storageTb: 0.05,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['About 50,000 articles, each stored as one vector (approx.).', 'Making a vector takes about 30 ms on a small model server (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.7, 'mobile-app': 0.3 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Help center'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'viral-spike', at: '10:00', params: { factor: 4 } }, { id: 'bad-deploy', at: '14:00' } ],
  eventPool: ['gpu-shortage', 'cache-stampede'],
  numbers: [
    { label: 'Searches per second at peak', value: 340, unit: 'req/s', how: '400 × 0.85 (approx.)', ask: true },
    { label: 'Searches that need a new vector with half repeating', value: 170, unit: 'req/s', how: '340 × (1 − 0.5) (approx.)', ask: true },
    { label: 'Article vectors in memory', value: 0.3, unit: 'GB', how: '50,000 articles × 1,536 numbers × 4 bytes ≈ 0.3 GB (approx.)' }
  ],
  hints: [
    'Half of the questions repeat. Do you need to turn each into a vector again?',
    'A cache keyed on the question saves the vector work. Put article vectors in a vector database for the matching.',
    'Load balancer, servers, cache for repeated questions, embedding service, vector database.'
  ],
  editorial: {
    summary: 'The costly step is turning a question into a vector. Remember answers to repeated questions and that step disappears for half the traffic. The matching itself is one lookup in a vector database that fits in memory.',
    designs: [ { name: 'Remember repeated questions', why: 'A cache returns the saved results for a question that has been seen. Only new questions reach the embedding service, and the vector database finds the nearest articles.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { zones: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 2, zones: 2 }),
        N('cache', 'cache', X[3], -60, { knobs: { ttlSec: 3600 } }), N('emb', 'embedding-service', X[4], -60, { units: 1 }),
        N('vec', 'vector-db', X[5], 10, { units: 1 }), N('metrics', 'metrics', X[3], 130), N('alerts', 'alerting', X[4], 130)],
        edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'emb'], ['emb', 'vec'], ['api', 'vec'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 3500 } } ],
    tradeoffs: [
      'A longer cache time saves model work, but a changed article may not show for an hour.',
      'A bigger model finds better matches and costs more per question. A small one is usually enough for a help center.',
      'Match by meaning and by words together for the best results. Either alone misses some cases.',
      'New articles need a vector made once, in the background.'
    ],
    realWorld: 'Making a vector with a small model takes tens of milliseconds, and a vector database finds nearest matches in a few milliseconds over a hundred thousand items (approx.). Repeated questions make caching worthwhile.'
  },
  daily: true
},
{
  id: 'industrial-sensors', title: 'Factory sensors', difficulty: 'Medium',
  concepts: ['storage-tiers', 'observability'],
  like: 'sensors on a factory floor',
  brief: 'A factory has thousands of machines, each sending readings many times a second. Engineers open charts of the last hour and last month, and an alarm must fire within seconds when a reading goes out of range. The data grows without end.',
  clarify: [
    { q: 'How quickly must an alarm fire?', a: 'Within 5 seconds of the bad reading.' },
    { q: 'How long do we keep full detail?', a: 'Five days in full. After that, one average per minute is enough for a year.' },
    { q: 'Can the factory network drop?', a: 'Yes. Readings wait on the machine and arrive later; late data must still be stored.' }
  ],
  requirements: {
    users: '10,000 sensors and 300 engineers (approx.)', monthlyUsers: 300, peakRps: 3000,
    mix: { telemetry: 0.9, read: 0.06, report: 0.02, event: 0.02 }, latencyP99Ms: { default: 800, report: 10000, event: 5000 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 14000, storageTb: 20,
    userRegions: { us: 1 }, homeRegion: 'us',
    notes: ['Each reading is about 100 bytes (approx.).', 'About 2,700 readings a second all day, since machines never sleep (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'flat', sources: { 'iot-device': 0.9, 'admin-console': 0.1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('machines', 'iot-device', -60, 'Machines'), S('eng', 'admin-console', 80, 'Engineers')], edges: [] },
  events: [ { id: 'thundering-herd', at: '08:00', params: { factor: 3, types: ['telemetry'] } }, { id: 'network-partition', at: '15:00' } ],
  eventPool: ['disk-full', 'cardinality-explosion'],
  numbers: [
    { label: 'Readings per second', value: 2700, unit: 'readings/s', how: '3,000 × 0.9 (approx.)', ask: true },
    { label: 'Raw data a day', value: 23, unit: 'GB', how: '2,700 × 100 bytes × 86,400 seconds ≈ 23 GB (approx.)', ask: true },
    { label: 'Five days of full detail', value: 115, unit: 'GB', how: '23 GB × 5 (approx.)' }
  ],
  hints: [
    'Data arrives non-stop and never goes away. What do you keep in full and what do you shrink?',
    'A stream absorbs bursts and late data. A time-series database stores recent detail; old data moves to cheap storage.',
    'Load balancer, servers, event stream, stream processor for alarms, time-series database, object storage for old data.'
  ],
  editorial: {
    summary: 'A steady flood of small writes belongs in a stream and a database built for time. Alarms read the stream, so they do not wait for storage. Old detail is rolled up and moved to cheap object storage so cost stays flat as data grows.',
    designs: [ { name: 'Stream, alarm processor and tiered storage', why: 'The stream takes every reading and survives gaps. A processor checks limits within seconds, the time-series database holds the recent five days, and a nightly job moves older data to object storage as one-minute averages.',
      graph: { nodes: [S('machines', 'iot-device', -60), S('eng', 'admin-console', 80),
        N('lb', 'network-lb', X[1], 10, { zones: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 12, zones: 2 }),
        N('es', 'event-stream', X[3], -60, { units: 2 }), N('sp', 'stream-processor', X[4], -120, { units: 2 }), N('ts', 'timeseries-db', X[4], 10, { units: 3, knobs: { retentionDays: 5 } }),
        N('obj', 'object-storage', X[5], 10), N('alerts', 'alerting', X[5], -120), N('pager', 'pager', X[6], -120), N('metrics', 'metrics', X[3], 130)],
        edges: [['machines', 'lb'], ['eng', 'lb'], ['lb', 'api'], ['api', 'es'], ['es', 'sp'], ['es', 'ts'], ['sp', 'alerts'], ['alerts', 'pager'], ['es', 'obj'], ['api', 'ts'], ['api', 'metrics'], ['ts', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 850, costPerMonth: 12000 } } ],
    tradeoffs: [
      'Rolling up to one-minute averages cuts old data about 600 times, but you lose the short spikes.',
      'A stream costs extra, but it lets alarms and storage work at their own pace and replay after a failure.',
      'Compressing time-series data tightly saves disk, at the price of slower updates to old points.',
      'Sending readings in small batches from the machine cuts request cost a lot.'
    ],
    realWorld: 'A busy plant can produce millions of readings a second. Teams keep days of detail on fast storage and months of averages on cheap storage (approx.).'
  },
  daily: true
},
{
  id: 'game-patch-day', title: 'Patch day downloads', difficulty: 'Medium',
  concepts: ['cdn', 'cost'],
  like: 'a big game update',
  brief: 'A popular game ships a 5 GB update at 10 am. Millions of players press Update within the same hour. The files are identical for everyone, so the work is moving huge amounts of data without a huge bill, while players still log in and play.',
  clarify: [
    { q: 'Is every player downloading the same file?', a: 'Yes, for each platform. The same file is requested millions of times.' },
    { q: 'Can downloads be slow?', a: 'A bit. Players accept a few minutes. Logging in must stay quick.' },
    { q: 'Does the bill matter?', a: 'A great deal. Moving data out is the largest cost of the day.' }
  ],
  requirements: {
    users: '12 million players a month (approx.)', monthlyUsers: 12000000, peakRps: 1200,
    mix: { stream: 0.75, read: 0.1, login: 0.1, write: 0.05 }, latencyP99Ms: { default: 400, stream: 2000 }, availability: 0.995,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 60000, storageTb: 30,
    userRegions: { us: 0.4, eu: 0.35, apac: 0.25 }, homeRegion: 'us',
    notes: ['The update is about 5 GB, cut into 8 MB pieces (approx.).', 'Most pieces are asked for by millions of players in one hour (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'drop', sources: { 'game-client': 0.9, 'web-browser': 0.1 }, params: { dropAt: '10:00' } },
  requires: {}, palette: null,
  starter: { nodes: [S('game', 'game-client', -60, 'Game clients'), S('web', 'web-browser', 80, 'Website')], edges: [] },
  events: [ { id: 'flash-crowd', at: '10:00', params: { factor: 3 } }, { id: 'cost-blowout', at: '12:00' } ],
  eventPool: ['cache-stampede', 'zone-outage'],
  numbers: [
    { label: 'Piece requests per second at peak', value: 900, unit: 'req/s', how: '1,200 × 0.75 (approx.)', ask: true },
    { label: 'Data to send in the first hour', value: 12000, unit: 'TB', how: 'About 2.4 million players × 5 GB ≈ 12 PB, which is 12,000 TB (approx.)', ask: true },
    { label: 'Share served from the edge copy', value: 0.99, unit: 'of pieces', how: 'The same pieces are requested by everyone, so a CDN hits almost always (approx.)' }
  ],
  hints: [
    'Millions ask for the same pieces. What should answer them, and what should never see them?',
    'A CDN with a very long copy time and an origin shield serves each piece from the origin only a few times.',
    'CDN, origin shield, object storage for the pieces; a separate small path of servers for login and profiles.'
  ],
  editorial: {
    summary: 'The pieces never change, so they are the ideal thing to cache. A CDN with a long time-to-keep serves almost all of them, an origin shield collapses misses into one fetch, and object storage is only touched a few times per piece.',
    designs: [ { name: 'Long edge copies and an origin shield', why: 'The CDN keeps each piece for a week, so it fetches it from the origin once per edge location. The shield collapses those into one trip to object storage. Login and profile calls use a small separate set of servers and are never queued behind downloads.',
      graph: { nodes: [S('game', 'game-client', -60), S('web', 'web-browser', 80),
        N('cdn', 'cdn', X[1], -60, { knobs: { ttlSec: 604800, coalesce: true } }), N('shield', 'origin-shield', X[2], -60), N('obj', 'object-storage', X[3], -60),
        N('lb', 'regional-lb', X[1], 120, { zones: 2 }), N('api', 'vm-fleet', X[2], 120, { units: 6, zones: 2 }), N('db', 'kv-store', X[3], 120, { units: 2 }),
        N('metrics', 'metrics', X[4], 120), N('alerts', 'alerting', X[5], 120)],
        edges: [['game', 'cdn'], ['web', 'cdn'], ['cdn', 'shield'], ['shield', 'obj'], ['cdn', 'lb'], ['game', 'lb'], ['web', 'lb'], ['lb', 'api'], ['api', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 850, costPerMonth: 40000 } } ],
    tradeoffs: [
      'A week-long copy time almost removes origin load. It needs versioned file names, so a fixed file is never served stale.',
      'A cheaper bulk CDN tier costs less per terabyte but is slower. Many studios use it for patches.',
      'Letting players share pieces with each other cuts bandwidth further, but adds complexity and trust questions.',
      'Spreading the release over a few hours smooths the peak and the cost.'
    ],
    realWorld: 'Big game patches move petabytes in a day. Studios rely on edge networks and often stagger the release by region to keep the peak in check (approx.).'
  },
  daily: true
}
  ]
};
