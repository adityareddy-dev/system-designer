// Platforms and developer tools: problem bank for system design practice.
// Every number is a rough, real-world approximation and is labelled as one in the text shown to players.
const S = (ref, type, y = 0) => ({ ref, type, x: -480, y, locked: true });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

const problems = [
{
  id: 'url-shortener', title: 'URL shortener', difficulty: 'Easy',
  concepts: ['caching', 'back-of-envelope'],
  like: 'a link shortener like Bitly',
  brief: 'People paste a long web address and get back a short one. Millions of other people then tap that short link, so reading is almost everything. Keep every tap fast, and never lose a link.',
  clarify: [
    { q: 'Can a short link change after it is made?', a: 'No. A link never changes once created, so saved answers never go out of date and caching is safe.' },
    { q: 'How many people tap a link compared with people who make one?', a: 'About 99 taps for every 1 new link. This is a read-heavy system.' },
    { q: 'Do we count clicks live?', a: 'No. Click counts can arrive a few minutes late. The redirect itself must be fast.' }
  ],
  requirements: {
    users: '50 million people a month', monthlyUsers: 50000000, peakRps: 5000,
    mix: { read: 0.99, write: 0.01 }, latencyP99Ms: { default: 150 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: [], budgetPerMonth: 3000, storageTb: 1.5,
    userRegions: { us: 0.7, eu: 0.3 }, homeRegion: 'us',
    notes: ['Short codes are 7 characters.', 'About 20 new links a second on average (≈ 50 million a month, approx.).', 'One app server handles about 1,000 requests a second (approx.).']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'viral-spike', at: '19:30', params: { factor: 3 } }, { id: 'cache-stampede', at: '12:10' } ],
  eventPool: ['hot-key', 'db-failover'],
  numbers: [
    { label: 'Reads per second at peak', value: 4950, unit: 'req/s', how: '5,000 × 0.99 (approx.)', ask: true },
    { label: 'App servers for the evening peak', value: 5, unit: 'servers', how: '5,000 req/s ÷ about 1,000 per server = 5. Run at least 6, and 7 or 8 so each sits near 70 percent, and turn on autoscaling: the 3 times spike needs about 15 (approx.).', ask: true },
    { label: 'Storage after 5 years', value: 1.5, unit: 'TB', how: '50 million links a month × 12 × 5 years × 0.5 KB each ≈ 1.5 TB (approx.)', ask: true },
    { label: 'Possible 7-character codes', value: 3.5e12, unit: 'codes', how: '62 letters and digits, to the power of 7 ≈ 3.5 trillion, so we will not run out (approx.)' }
  ],
  hints: [
    'One server handles about 1,000 requests a second. At 5,000 that is 5 servers with no spare room, so plan for about 6 or more (the 3 from the intro is not enough here). What happens when a link goes viral?',
    'A link never changes, so answers can be kept: put a cache in front of the database, and a CDN in front of everything for the spike.',
    'Users, then CDN, then load balancer, then servers, then a cache, then a key-value store. Keep answers for an hour or longer.'
  ],
  editorial: {
    summary: 'One tiny record per link, looked up by its code. Because links never change, almost every tap can be answered from a copy: first at the edge network near the person, then in memory, and only rarely from the database.',
    designs: [
      { name: 'Cached redirects at the edge', why: 'The CDN answers most taps near the person, without touching your servers. A distributed cache catches the rest, so the key-value store only sees a trickle. You pay the CDN for every request, but a viral link adds almost no load to your own servers.',
        graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60),
          N('cdn', 'cdn', X[1], 0, { knobs: { ttlSec: 3600, coalesce: true } }), N('lb', 'regional-lb', X[2], 0, { zones: 2 }),
          N('api', 'vm-fleet', X[3], 0, { units: 6, zones: 2 }), N('cache', 'distributed-cache', X[4], 0, { units: 3, knobs: { ttlSec: 86400 } }),
          N('db', 'kv-store', X[5], 0, { units: 1 }), N('metrics', 'metrics', X[4], 140), N('alerts', 'alerting', X[5], 140)],
          edges: [['users', 'cdn'], ['app', 'cdn'], ['users', 'lb'], ['app', 'lb'], ['cdn', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db'], ['api', 'metrics'], ['metrics', 'alerts']] },
        expect: { score: 900, costPerMonth: 2200 } },
      { name: 'Serverless at the edge', why: 'Run the lookup in small functions near the user and keep every link in a key-value store. Fewer parts to run, but you pay for every call and the store sees more traffic.',
        graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('cdn', 'cdn', X[1], 0, { knobs: { ttlSec: 3600, coalesce: true } }),
          N('fn', 'edge-fn', X[2], 0), N('db', 'kv-store', X[3], 0, { units: 2 })],
          edges: [['users', 'cdn'], ['app', 'cdn'], ['users', 'fn'], ['app', 'fn'], ['cdn', 'fn'], ['fn', 'db']] },
        expect: { score: 860, costPerMonth: 1900 } },
      { name: 'Servers, cache and autoscaling', why: 'The pattern from the intro, sized by the numbers: a load balancer, about 8 servers so each runs near 60 percent at the evening peak, autoscaling for the 3 times spike, and a cache that keeps hot links off the database. No CDN, so it is the cheapest, but every tap crosses the ocean to your servers and the spike lands on them.',
        graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60),
          N('lb', 'regional-lb', X[1], 0), N('api', 'vm-fleet', X[2], 0, { units: 8, knobs: { autoscale: { on: true, min: 8, max: 40 } } }),
          N('cache', 'cache', X[3], 0, { knobs: { ttlSec: 3600 } }), N('db', 'sql-primary', X[4], 0)],
          edges: [['users', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db']] },
        expect: { score: 900, costPerMonth: 3000 } }
    ],
    tradeoffs: [
      'A longer cache time means more hits and less cost. Links never change, so an hour or a day is safe here.',
      'Collapsing misses stops a thousand people asking for the same cold link from hitting the database together.',
      'Short random codes avoid a single counter, but you must check for clashes. A counter is simple but guessable.',
      'Click counts go on a queue and are counted later, so they never slow the redirect.'
    ],
    realWorld: 'Public link shorteners handle tens of thousands of redirects a second at peak and store billions of links. Most taps are served from edge or memory copies (approx.).'
  },
  daily: true
},
{
  id: 'leaderboards', title: 'Leaderboards', difficulty: 'Easy',
  concepts: ['hot-keys', 'caching'],
  like: 'a global high-score table',
  brief: 'Players send their score at the end of every match and open the top-100 table all day. Everyone looks at the same top 100, which makes that one answer extremely popular. A tournament final will make it much worse.',
  clarify: [
    { q: 'How fresh must the top 100 be?', a: 'Five seconds behind is fine. Nobody notices.' },
    { q: 'Does a player need to see their own new score and rank immediately?', a: 'Their own score should show within a second or two. Everyone else can wait a few seconds.' },
    { q: 'Can we lose a score?', a: 'Rarely and only for the last minute. A lost score is a very unhappy player.' }
  ],
  requirements: {
    users: '8 million players a month', monthlyUsers: 8000000, peakRps: 6000,
    mix: { read: 0.85, write: 0.15 }, latencyP99Ms: { default: 200 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 4000, storageTb: 0.1,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 }, homeRegion: 'us',
    notes: ['One score record is about 100 bytes (approx.).']
  },
  traffic: { curve: 'consumer-evening', sources: { 'game-client': 0.7, 'web-browser': 0.3 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('players', 'game-client', -60), S('web', 'web-browser', 60)], edges: [] },
  events: [ { id: 'hot-key', at: '20:00', params: { share: 0.5 } }, { id: 'viral-spike', at: '20:30', params: { factor: 5 } } ],
  eventPool: ['cache-stampede', 'replication-lag'],
  numbers: [
    { label: 'Score submissions per second at peak', value: 900, unit: 'writes/s', how: '6,000 × 0.15', ask: true },
    { label: 'All scores in memory', value: 0.8, unit: 'GB', how: '8 million players × 100 bytes ≈ 0.8 GB, fits in one cache node (approx.)', ask: true },
    { label: 'Share of reads that ask for the top 100', value: 0.5, unit: 'of reads', how: 'Roughly half of table views are the global top board during the hot-key event (approx.)' }
  ],
  hints: [
    'Half the players are asking for the exact same page. Do they each need a fresh answer?',
    'A CDN with a very short time to keep answers (5 seconds) turns thousands of identical reads into a few.',
    'CDN with 5 second answers, then servers, then a cache that holds every score, then a key-value store for safety.'
  ],
  editorial: {
    summary: 'The top board is one hot answer. Keep it for a few seconds at the edge and the flood of readers becomes a trickle. The rest of the work is a fast in-memory table for a player\'s own rank and a durable store behind it.',
    designs: [ { name: 'Five-second edge copy', why: 'The CDN keeps the top 100 for 5 seconds and collapses misses, so the origin sees one request per edge per 5 seconds. The cache serves personal ranks and the store makes scores safe.',
      graph: { nodes: [S('players', 'game-client', -60), S('web', 'web-browser', 60), N('cdn', 'cdn', X[1], 0, { knobs: { ttlSec: 5, coalesce: true } }),
        N('lb', 'regional-lb', X[2], 0, { zones: 2 }), N('api', 'vm-fleet', X[3], 0, { units: 4, zones: 2 }),
        N('cache', 'distributed-cache', X[4], 0, { units: 2, knobs: { ttlSec: 60 } }), N('db', 'kv-store', X[5], 0, { units: 1 })],
        edges: [['players', 'cdn'], ['web', 'cdn'], ['players', 'lb'], ['web', 'lb'], ['cdn', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db']] },
      expect: { score: 900, costPerMonth: 1700 } } ],
    tradeoffs: [
      'A five second copy is slightly stale. Players accept that for a global table, and the saving is enormous.',
      'The player\'s own rank skips the edge copy, so it stays fresh but costs the origin a lookup.',
      'A sorted set in memory ranks fast. A database must scan or index, which is slower under writes.',
      'Writes go to a durable store too, so a cache restart never wipes the scores.'
    ],
    realWorld: 'A popular game can see tens of thousands of score writes a second at a season launch. The top-100 view is one of the most cached pages in the product (approx.).'
  },
  daily: true
},
{
  id: 'rate-limiter-service', title: 'Rate limiter for a public API', difficulty: 'Medium',
  concepts: ['rate-limiting', 'hot-keys'],
  like: 'the limits on a public API like GitHub\'s',
  brief: 'Developers call your public API from scripts and apps. A few misbehaving or malicious clients can crowd out everyone else. Build limits that are fair, fast and cheap, and that survive a retry storm.',
  clarify: [
    { q: 'What should an over-limit client see?', a: 'A quick, polite "429 slow down" with a hint when to try again. It must be faster than a normal answer.' },
    { q: 'Is the limit per person or per key?', a: 'Per API key. One customer may have many servers sharing one key.' },
    { q: 'If the limiter itself breaks, do we let traffic through or block it?', a: 'Let it through for ordinary traffic. A broken limiter must not take the whole API down. Abuse protection is still wanted.' },
    { q: 'How exact must the counting be?', a: 'Close is fine. Being off by a few percent is acceptable.' }
  ],
  requirements: {
    users: '2 million developers', monthlyUsers: 2000000, peakRps: 20000,
    mix: { read: 0.85, write: 0.15 }, latencyP99Ms: { default: 120 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 6000, storageTb: 1,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['Typical limit: 5,000 requests an hour per key, bursts allowed (approx.).', 'Counters for 2 million keys use about 200 MB (approx.).']
  },
  traffic: { curve: 'business-hours', sources: { 'partner-system': 0.7, 'web-browser': 0.3 }, params: {} },
  // every request passes something that enforces the per-key limit: a rate limiter or a throttling API gateway
  requires: { read: [['rate-limiter', 'api-gateway']], write: [['rate-limiter', 'api-gateway']] }, palette: null,
  starter: { nodes: [S('clients', 'partner-system', -60), S('web', 'web-browser', 60)], edges: [] },
  events: [ { id: 'bot-scraping', at: '10:00', params: { factorOfPeak: 1, durationSec: 7200 } }, { id: 'retry-storm', at: '15:30' } ],
  eventPool: ['hot-key', 'ddos-attack'],
  numbers: [
    { label: 'Writes per second at peak', value: 3000, unit: 'writes/s', how: '20,000 × 0.15', ask: true },
    { label: 'Counter memory for all keys', value: 200, unit: 'MB', how: '2 million keys × 100 bytes (approx.)', ask: true },
    { label: 'Limit check cost', value: 0.2, unit: 'ms', how: 'One in-memory counter update, about the speed of a cache hit (approx.)' }
  ],
  hints: [
    'Where is the cheapest place to say no: before your servers do any work, or after?',
    'Add a rate limiter in front of the gateway so abusive keys are stopped early. Think about who else is flooding you in the retry storm.',
    'Users, WAF, rate limiter, API gateway, servers, cache, key-value store. Set the limiter fail-open and a sensible per-client limit.'
  ],
  editorial: {
    summary: 'Count requests per key in fast memory and refuse the extra ones before they reach the expensive part. Abusive traffic and retry storms get stopped at the door, while ordinary clients never notice the limiter.',
    designs: [
      { name: 'Limiter in front of the gateway', why: 'A WAF removes obvious junk, the limiter applies the per-key limit, and only legitimate traffic reaches the servers. Failing open keeps the API up if the limiter breaks.',
        graph: { nodes: [S('clients', 'partner-system', -60), S('web', 'web-browser', 60), N('waf', 'waf', X[1], 0),
          N('rl', 'rate-limiter', X[2], 0, { units: 2, knobs: { limitRps: 100, mode: 'fail-open' } }), N('gw', 'api-gateway', X[3], 0, { units: 3 }),
          N('svc', 'container-cluster', X[4], 0, { units: 26, zones: 2, knobs: { autoscale: { on: true, min: 20, max: 50, targetUtil: 0.6 } } }),
          N('cache', 'distributed-cache', X[5], -60, { units: 2, knobs: { ttlSec: 60 } }), N('db', 'kv-store', X[6], 0, { units: 1 }),
          N('metrics', 'metrics', X[4], 140), N('alerts', 'alerting', X[5], 140)],
          edges: [['clients', 'waf'], ['web', 'waf'], ['waf', 'rl'], ['rl', 'gw'], ['gw', 'svc'], ['svc', 'cache'], ['cache', 'db'], ['svc', 'metrics'], ['metrics', 'alerts']] },
        expect: { score: 880, costPerMonth: 5200 } },
      { name: 'Limit at the gateway only', why: 'Use the gateway\'s own per-key throttle. Fewer parts and lower cost, but it cannot share counters across regions or cap retries as sharply.',
        graph: { nodes: [S('clients', 'partner-system', -60), S('web', 'web-browser', 60), N('gw', 'api-gateway', X[1], 0, { units: 3, knobs: { limitRps: 100 } }),
          N('svc', 'container-cluster', X[2], 0, { units: 26, zones: 2 }), N('db', 'kv-store', X[3], 0, { units: 1 })],
          edges: [['clients', 'gw'], ['web', 'gw'], ['gw', 'svc'], ['svc', 'db']] },
        expect: { score: 780, costPerMonth: 4600 } }
    ],
    tradeoffs: [
      'Fail-open keeps users happy when the limiter breaks, but briefly lets abusers through. Fail-closed is safer for abuse, riskier for uptime.',
      'A shared counter is exact but adds a network hop. Local counters are fastest but let a key exceed the limit across many servers.',
      'Retries multiply load. A good limiter also caps how many retries a client may send.',
      'Per-key limits protect against one customer. A WAF stops junk that is not tied to any key at all.'
    ],
    realWorld: 'Public APIs commonly allow around 1,000 to 5,000 requests an hour per key, with short bursts allowed. Limit checks are in-memory counters taking well under a millisecond (approx.).'
  },
  daily: true
},
{
  id: 'search-autocomplete', title: 'Search autocomplete', difficulty: 'Medium',
  concepts: ['caching', 'search-indexing'],
  like: 'suggestions as you type, like Google',
  brief: 'As people type, they expect suggestions after every letter, in the blink of an eye. Most people type the same popular beginnings. When news breaks, one phrase suddenly dominates.',
  clarify: [
    { q: 'How fast must suggestions appear?', a: 'Under 100 ms at the 99th percentile. Slower than that and typing feels laggy.' },
    { q: 'Do suggestions need to include something that happened five minutes ago?', a: 'A few minutes late is fine. Hourly refresh of the main list is acceptable, trending words faster.' },
    { q: 'Do we log what people type?', a: 'Yes, so the next list can be built, but logging must never slow a suggestion.' }
  ],
  requirements: {
    users: '200 million people a month', monthlyUsers: 200000000, peakRps: 60000,
    mix: { search: 0.96, event: 0.04 }, latencyP99Ms: { default: 100 }, availability: 0.999,
    dataSafety: 'best-effort', readYourWrites: false, compliance: [], budgetPerMonth: 12000, storageTb: 0.5,
    userRegions: { us: 0.45, eu: 0.3, apac: 0.25 }, homeRegion: 'us',
    notes: ['Typing is debounced: about 5 requests for each finished search (approx.).', 'The suggestion index holds the 50 million most popular prefixes.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'viral-spike', at: '14:00', params: { factor: 6 } }, { id: 'hot-key', at: '14:05', params: { share: 0.4 } } ],
  eventPool: ['cache-stampede', 'bad-deploy'],
  numbers: [
    { label: 'Suggestion requests per second at peak', value: 57600, unit: 'req/s', how: '60,000 × 0.96', ask: true },
    { label: 'Prefix cache size', value: 10, unit: 'GB', how: '50 million prefixes × 200 bytes of suggestions each ≈ 10 GB (approx.)', ask: true },
    { label: 'Cache hit rate needed', value: 0.9, unit: 'of requests', how: 'The index handles about 1,500 queries/s per node; 90% hits leaves ≈ 5,800/s for 4 nodes (approx.)', ask: true }
  ],
  hints: [
    'Most people type the same first few letters. Which answers repeat the most?',
    'Search is a read on a copy. Cache whole prefixes in memory and put the lookup near the user.',
    'Users, edge function, a distributed cache of prefixes, a search index behind it. Send typed-query logs to a stream, off the fast path.'
  ],
  editorial: {
    summary: 'Short prefixes like "th" are asked for millions of times, so their answers live in memory right next to the user. The slow, expensive search index is only asked for rare prefixes. Logging queries flows through a stream on the side.',
    designs: [
      { name: 'Edge function and prefix cache', why: 'Edge functions are cheap at huge request rates. A distributed cache holds popular prefixes, so the index serves only the long tail. Logs go to a stream and a lake, never in the way.',
        graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('fn', 'edge-fn', X[1], 0),
          N('cache', 'distributed-cache', X[2], -60, { units: 4, zones: 2, knobs: { ttlSec: 3600, coalesce: true } }),
          N('idx', 'search-index', X[3], -60, { units: 5, zones: 2 }),
          N('es', 'event-stream', X[2], 100, { units: 3, zones: 2 }), N('sp', 'stream-processor', X[3], 100, { units: 2 }), N('lake', 'data-lake', X[4], 100)],
          edges: [['users', 'fn'], ['app', 'fn'], ['fn', 'cache'], ['cache', 'idx'], ['fn', 'es'], ['es', 'sp'], ['sp', 'lake']] },
        expect: { score: 900, costPerMonth: 9800 } },
      { name: 'Regional servers', why: 'A fleet of servers does the lookup. Simpler to reason about, but you pay for servers sized for the spike.',
        graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('lb', 'regional-lb', X[1], 0, { zones: 3 }),
          N('svc', 'container-cluster', X[2], 0, { units: 40, zones: 3 }), N('cache', 'distributed-cache', X[3], -60, { units: 4, knobs: { ttlSec: 3600 } }),
          N('idx', 'search-index', X[4], -60, { units: 5, zones: 2 }), N('es', 'event-stream', X[3], 100, { units: 3 }),
          N('sp', 'stream-processor', X[4], 100, { units: 2 }), N('lake', 'data-lake', X[5], 100)],
          edges: [['users', 'lb'], ['app', 'lb'], ['lb', 'svc'], ['svc', 'cache'], ['cache', 'idx'], ['svc', 'es'], ['es', 'sp'], ['sp', 'lake']] },
        expect: { score: 840, costPerMonth: 11800 } }
    ],
    tradeoffs: [
      'A longer time to keep prefixes saves the index but delays trending words. Trending words can use a short-lived fast list.',
      'Caching only short prefixes captures most traffic with little memory. Long rare prefixes would waste cache.',
      'Logging queries through a stream means a logging problem can never slow a suggestion.',
      'One hot phrase hits one cache shard. Collapsing misses and spreading the copy protects that shard.'
    ],
    realWorld: 'Large engines answer billions of suggestion requests a day and serve most from memory. A suggestion usually returns in tens of milliseconds (approx.).'
  },
  daily: true
},
{
  id: 'notification-service', title: 'Notification service', difficulty: 'Medium',
  concepts: ['queues-backpressure', 'idempotency-retries'],
  like: 'the service that sends every push, email and text',
  brief: 'Every other team asks you to send messages: order shipped, new login, a sale starting. You send them by push, email and text through outside providers who have their own limits. Send each message once, and never block the team that asked.',
  clarify: [
    { q: 'Does the sender wait until the message is delivered?', a: 'No. They only need to know it was accepted. Delivery happens afterwards.' },
    { q: 'What if the same message is asked for twice?', a: 'Send it only once. A double "your card was charged" text is a bad day.' },
    { q: 'Can a message be late?', a: 'A few minutes is fine for marketing. Login codes need seconds.' },
    { q: 'Do people opt out?', a: 'Yes. Check their preferences before every send.' }
  ],
  requirements: {
    users: '30 million people a month', monthlyUsers: 30000000, peakRps: 8000,
    mix: { notify: 0.7, event: 0.2, write: 0.1 }, latencyP99Ms: { default: 300, notify: 30000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: ['consent'], budgetPerMonth: 14000, storageTb: 2,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['Providers cap how fast you may send: push ≈ 10,000/s, email ≈ 1,000/s, text ≈ 100/s (approx.).', 'Texts cost far more than email or push.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.6, 'cron-scheduler': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('apps', 'mobile-app', -60), S('schedule', 'cron-scheduler', 60)], edges: [] },
  events: [ { id: 'third-party-rate-limit', at: '09:00', params: { rpsCapFactor: 0.4 } }, { id: 'duplicate-delivery', at: '13:00', params: { share: 0.03 } }, { id: 'dependency-outage', at: '18:30' } ],
  eventPool: ['flash-crowd', 'poison-message'],
  numbers: [
    { label: 'Messages to send per second at peak', value: 5600, unit: 'msg/s', how: '8,000 × 0.7', ask: true },
    { label: 'Messages per day', value: 190, unit: 'million', how: 'Average load is about 0.4 of peak: 5,600 × 0.4 × 86,400 ≈ 190 million (approx.)', ask: true },
    { label: 'Email sending limit', value: 1000, unit: 'email/s', how: 'The provider cap in this scenario: you must spread load across channels and wait politely (approx.)' }
  ],
  hints: [
    'The team asking should not wait for the message to go out. What can hold the work?',
    'Put a queue between asking and sending. Check for duplicates and preferences while sending.',
    'Gateway, servers, queue, workers that check an idempotency store and consent, then push, email and text providers. Add a dead-letter queue for bad messages.'
  ],
  editorial: {
    summary: 'Accept the request, store it in a queue and answer quickly. Workers pull from the queue at a speed the providers allow, check that the message was not already sent and that the person agreed, then send. The queue absorbs bursts and outages.',
    designs: [ { name: 'Queue, idempotent workers, three channels', why: 'The queue soaks up a campaign blast. An idempotency check makes retries safe. The reference uses two providers: push at about 10,000 sends/s and email at about 1,000 sends/s. One slowing or failing does not stop the other. Text delivery would need a separate SMS provider capped at about 100 sends/s, with its own queue and cost budget (approx.).',
      graph: { nodes: [S('apps', 'mobile-app', -60), S('schedule', 'cron-scheduler', 60), N('gw', 'api-gateway', X[1], 0, { units: 1 }),
        N('api', 'container-cluster', X[2], 0, { units: 8, zones: 2 }), N('q', 'queue', X[3], 0, { knobs: { retentionDays: 4 } }),
        N('dlq', 'dead-letter-queue', X[3], 130), N('wp', 'worker-pool', X[4], 0, { units: 40, zones: 2, knobs: { retries: 3, backoff: 'exponential-jitter', autoscale: { on: true, min: 30, max: 60, targetUtil: 0.6 } } }),
        N('idem', 'idempotency-store', X[5], -130, { units: 2 }), N('consent', 'consent-service', X[5], -50, { units: 1 }),
        N('push', 'push-service', X[6], -60), N('email', 'email-provider', X[6], 20), N('sms', 'sms-provider', X[6], 100, { units: 1 }),
        N('prefs', 'sql-primary', X[3], -130), N('metrics', 'metrics', X[2], 140), N('alerts', 'alerting', X[3], 260)],
        edges: [['apps', 'gw'], ['schedule', 'gw'], ['gw', 'api'], ['api', 'q'], ['api', 'prefs'], ['q', 'wp'], ['q', 'dlq'], ['wp', 'idem'], ['wp', 'consent'],
          ['wp', 'push'], ['wp', 'email'], ['wp', 'sms'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 880, costPerMonth: 11500 } } ],
    tradeoffs: [
      'A queue makes sending late but never lost. Without one, a slow provider slows every sender.',
      'At-least-once delivery plus an idempotency check gives "once" in practice and costs one extra lookup per message.',
      'Spreading across channels increases resilience but multiplies the number of limits you must respect.',
      'A dead-letter queue keeps one bad message from blocking all the rest.'
    ],
    realWorld: 'Big apps send billions of notifications a day. Push is nearly free, email is about $0.10 per thousand, and a text costs several cents each (approx.).'
  },
  daily: true
},
{
  id: 'recommendations', title: 'Recommendations', difficulty: 'Medium',
  concepts: ['caching', 'ai-serving'],
  like: 'a "you may also like" row',
  brief: 'Every page shows a row of things the visitor might like. A ranking model builds each row, but the model is slow and costly. The row must appear instantly, even when the model is having a bad day.',
  clarify: [
    { q: 'Does the row need to be exactly right for this second?', a: 'No. A list computed a few hours ago is fine for most people.' },
    { q: 'What if the model is slow or down?', a: 'Show a simple popular-items row. A generic row is far better than a blank space.' },
    { q: 'Is it a problem if two people see the same row?', a: 'No. Many people share a similar taste group, so shared answers are fine.' }
  ],
  requirements: {
    users: '20 million people a month', monthlyUsers: 20000000, peakRps: 15000,
    mix: { read: 0.93, event: 0.07 }, latencyP99Ms: { default: 250 }, availability: 0.995,
    dataSafety: 'best-effort', readYourWrites: false, compliance: [], budgetPerMonth: 15000, storageTb: 3,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['A ranking call takes about 50 ms of model time (approx.).', 'Click events help tomorrow\'s lists but need not be real-time.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'slow-dependency', at: '12:00', params: { target: 'el:recommender' } }, { id: 'cache-stampede', at: '20:00' }, { id: 'replication-lag', at: '20:30' } ],
  eventPool: ['viral-spike', 'bad-deploy'],
  numbers: [
    { label: 'Rows requested per second at peak', value: 13950, unit: 'req/s', how: '15,000 × 0.93', ask: true },
    { label: 'Model calls per second if nothing is cached', value: 13950, unit: 'calls/s', how: 'One ranking per row; at about 2,000 per unit that is 7 units, too costly (approx.)', ask: true },
    { label: 'Model calls per second with a 90% cache hit rate', value: 1395, unit: 'calls/s', how: '13,950 × 0.10 ≈ 1,400, under one recommender unit', ask: true }
  ],
  hints: [
    'Ranking is expensive. Which rows can be reused between visits?',
    'Cache rows for a long time and put a circuit breaker before the model so a slow model does not drag every page.',
    'Servers, distributed cache with collapse-misses, circuit breaker, recommender with a feature store, key-value store. Keep a popular-items path that skips the model.'
  ],
  editorial: {
    summary: 'Rank once, reuse many times. Rows are cached for hours. If the model slows down, a circuit breaker stops waiting and the page falls back to a popular row stored beside it.',
    designs: [ { name: 'Cache, breaker, fallback', why: 'The cache absorbs nearly all reads. Misses go through a circuit breaker to the recommender. If the breaker opens, misses fall back to precomputed popular lists, so pages stay fast.',
      graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('lb', 'regional-lb', X[1], 0, { zones: 2 }), N('api', 'vm-fleet', X[2], 0, { units: 20, zones: 2 }),
        N('cache', 'distributed-cache', X[3], 0, { units: 4, zones: 2, knobs: { ttlSec: 3600, coalesce: true } }), N('cb', 'circuit-breaker', X[4], -80, { knobs: { timeoutMs: 300 } }),
        N('rec', 'recommender', X[5], -80, { units: 2, zones: 2 }), N('fs', 'feature-store', X[6], -160, { units: 2 }), N('kv', 'kv-store', X[6], 0, { units: 1 }),
        N('es', 'event-stream', X[2], 130, { units: 3 }), N('sp', 'stream-processor', X[3], 130, { units: 2 }), N('lake', 'data-lake', X[4], 130)],
        edges: [['users', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'cb'], ['cb', 'rec'], ['rec', 'fs'], ['rec', 'kv'], ['cache', 'kv'], ['api', 'es'], ['es', 'sp'], ['sp', 'lake']] },
      expect: { score: 880, costPerMonth: 12800 } } ],
    tradeoffs: [
      'A longer cache time cuts model cost but shows older tastes. A new item takes a while to appear.',
      'The breaker trades quality for speed: a generic row is shown when the model is slow.',
      'Collapsing misses protects the model when the cache is emptied.',
      'Click events feed tomorrow\'s model off the fast path, so a logging issue cannot slow a page.'
    ],
    realWorld: 'Large shops and video services precompute most recommendations offline and serve them from memory. Live ranking is limited to a few hundred candidates (approx.).'
  },
  daily: true
},
{
  id: 'matchmaking', title: 'Multiplayer matchmaking', difficulty: 'Medium',
  concepts: ['queues-backpressure', 'multi-region'],
  like: 'finding a match in an online game',
  brief: 'Players press Play and wait. You must put them in a match with others nearby, with similar skill, in a few seconds. Players in a far-away region will have a bad time, so you must keep each region close.',
  clarify: [
    { q: 'How long may a player wait?', a: 'Most should be matched within 10 seconds. Being matched slowly beats being matched badly far away.' },
    { q: 'Can players play across regions?', a: 'Only when a region is empty or down. Normally keep them local: a ping above 80 ms feels bad.' },
    { q: 'Do we keep waiting tickets if a machine fails?', a: 'It is fine to lose waiting tickets. Players just press Play again.' }
  ],
  requirements: {
    users: '3 million players online at peak', monthlyUsers: 12000000, peakRps: 12000,
    mix: { read: 0.55, write: 0.25, message: 0.2 }, latencyP99Ms: { default: 200, message: 300 }, availability: 0.999,
    dataSafety: 'best-effort', readYourWrites: false, compliance: [], budgetPerMonth: 18000, storageTb: 0.5,
    userRegions: { us: 0.4, eu: 0.35, apac: 0.25 }, homeRegion: 'us',
    notes: ['Each waiting player polls or holds a connection until matched (approx.).', 'Lobby messages are tiny, about 1 KB.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'game-client': 1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('players', 'game-client', 0)], edges: [] },
  events: [ { id: 'overseas-launch', at: '17:00', params: { region: 'apac', share: 0.4 } }, { id: 'flash-crowd', at: '20:00', params: { factor: 3, holdSec: 1800 } }, { id: 'zone-outage', at: '21:30' } ],
  eventPool: ['region-outage', 'thundering-herd'],
  numbers: [
    { label: 'Join-queue tickets per second at peak', value: 3000, unit: 'writes/s', how: '12,000 × 0.25', ask: true },
    { label: 'Lobby messages per second at peak', value: 2400, unit: 'msg/s', how: '12,000 × 0.20', ask: true },
    { label: 'Open connections for waiting players', value: 3000000, unit: 'sockets', how: '3 million online ÷ 100,000 per gateway node ≈ 30 nodes (approx.)' }
  ],
  hints: [
    'Where should a player be matched: near them or in one big pool in one place?',
    'Run a stack in each region and send players to the nearest with geo-DNS. Lobby messages use a socket gateway.',
    'Geo-DNS, then in each region: load balancer, socket gateway, servers and a key-value store for tickets. Use at least two zones.'
  ],
  editorial: {
    summary: 'Keep matchmaking local. Each region has its own pool of waiting tickets, so players match with people close by. Geo-DNS sends each player to the nearest region and reroutes when a region fails.',
    designs: [ { name: 'Three independent regions', why: 'US, EU and APAC each run a complete stack. Tickets never cross an ocean, latency stays low, and a failure in one region does not affect the others.',
      graph: { nodes: [S('players', 'game-client', 0), N('dns', 'geo-dns', X[1], 0),
        ...['us', 'eu', 'apac'].flatMap((r, i) => { const y = (i - 1) * 190; return [
          N('lb-' + r, 'regional-lb', X[2], y, { region: r, zones: 2 }), N('ws-' + r, 'websocket-gateway', X[3], y - 50, { region: r, units: i === 2 ? 8 : 10, zones: 2 }),
          N('svc-' + r, 'container-cluster', X[4], y, { region: r, units: i === 2 ? 5 : 7, zones: 2 }), N('kv-' + r, 'kv-store', X[5], y, { region: r })]; })],
        edges: [['players', 'dns'], ...['us', 'eu', 'apac'].flatMap(r => [['dns', 'lb-' + r], ['lb-' + r, 'ws-' + r], ['lb-' + r, 'svc-' + r], ['ws-' + r, 'svc-' + r], ['svc-' + r, 'kv-' + r]])] },
      expect: { score: 860, costPerMonth: 12500 } } ],
    tradeoffs: [
      'Waiting longer lets the matcher find a better skill match; matching instantly gives lopsided games.',
      'Regional pools give low ping but small pools at night. You may widen the search over time.',
      'Tickets in memory are fast but lost on a crash. Games accept that: the player simply queues again.',
      'Geo-DNS with failover is what lets players still find a match when a region is down.'
    ],
    realWorld: 'A big online game can have millions of players online at peak, most idle in menus. Matchmaking aims for a ping under about 50 to 80 ms (approx.).'
  },
  daily: true
},
{
  id: 'file-sync', title: 'File sync', difficulty: 'Medium',
  concepts: ['storage-tiers', 'consistency'],
  like: 'a file sync app like Dropbox',
  brief: 'A folder on your laptop mirrors to the cloud and to your other devices. Small changes must arrive quickly, big files must upload reliably, and a shared folder with thousands of people must not melt the metadata service.',
  clarify: [
    { q: 'What are the two kinds of data?', a: 'File contents (large, in blocks) and file lists with names and versions (small, but constantly changing). They are stored differently.' },
    { q: 'What happens when two people change the same file?', a: 'Keep both versions and show a "conflicted copy". Never silently lose someone\'s work.' },
    { q: 'How fast must a change show up on another device?', a: 'Within a few seconds for small files.' }
  ],
  requirements: {
    users: '3 million people a month', monthlyUsers: 3000000, peakRps: 4000,
    mix: { sync: 0.66, read: 0.25, upload: 0.06, write: 0.03 }, latencyP99Ms: { default: 300, upload: 3000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: true, compliance: [], budgetPerMonth: 45000, storageTb: 900,
    userRegions: { us: 0.5, eu: 0.5 }, homeRegion: 'us',
    notes: ['Files are cut into blocks of about 4 MB, and identical blocks are stored once (approx.).', 'Shared folders are the hot spots.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('desktop', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'thundering-herd', at: '09:00', params: { factor: 6, types: ['sync', 'read'] } }, { id: 'hot-key', at: '13:00', params: { share: 0.3 } }, { id: 'disk-full', at: '15:00' } ],
  eventPool: ['network-partition', 'replication-lag'],
  numbers: [
    { label: 'Block uploads per second at peak', value: 240, unit: 'uploads/s', how: '4,000 × 0.06', ask: true },
    { label: 'Metadata checks per second', value: 2640, unit: 'sync/s', how: '4,000 × 0.66', ask: true },
    { label: 'Storage after dedupe', value: 900, unit: 'TB', how: '3 million people × 0.3 GB after identical blocks are stored once ≈ 900 TB (approx.)', ask: true }
  ],
  hints: [
    'File blocks and file lists are different problems. Do they belong in the same database?',
    'Blocks go to object storage through the CDN; the file list goes to a database that you can split by user.',
    'Users, CDN to object storage for blocks, load balancer and servers to a sharded SQL database for the file list. Add a socket gateway so devices hear about changes.'
  ],
  editorial: {
    summary: 'Split the system in two. Blocks are big, immutable and cheap: object storage behind a CDN. The file list is small but changes all the time and needs correctness: a sharded SQL database with versions. A socket tells other devices to look.',
    designs: [ { name: 'Blocks in object storage, metadata sharded', why: 'Uploads and downloads of blocks never touch your servers. Only small metadata calls do. Sharding by user spreads the load, and a socket gateway pushes "something changed" instead of devices polling.',
      graph: { nodes: [S('desktop', 'web-browser', -60), S('app', 'mobile-app', 60), N('cdn', 'cdn', X[1], -130, { knobs: { ttlSec: 3600 } }), N('blocks', 'object-storage', X[2], -130),
        N('lb', 'regional-lb', X[1], 40, { zones: 2 }), N('ws', 'websocket-gateway', X[2], 160, { units: 4, zones: 2 }),
        N('api', 'container-cluster', X[3], 40, { units: 10, zones: 2, knobs: { autoscale: { on: true, min: 8, max: 25, targetUtil: 0.6 } } }),
        N('db', 'sharded-sql', X[4], 40, { units: 6, zones: 2 }), N('metrics', 'metrics', X[3], 200), N('alerts', 'alerting', X[4], 200), N('pager', 'pager', X[5], 200), N('bk', 'backups', X[5], 40)],
        edges: [['desktop', 'cdn'], ['app', 'cdn'], ['cdn', 'blocks'], ['desktop', 'lb'], ['app', 'lb'], ['lb', 'ws'], ['lb', 'api'], ['ws', 'api'], ['api', 'db'],
          ['api', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager'], ['bk', 'db']] },
      expect: { score: 850, costPerMonth: 32000 } } ],
    tradeoffs: [
      'Storing identical blocks once saves a lot of space but means a block is only deleted when nobody uses it.',
      'Sharding by user spreads load. A shared folder with thousands of people becomes a hot spot that needs its own cache.',
      'Keeping both versions of a conflict is slightly messy but never loses work.',
      'Old file versions can move to cheaper storage: slower to restore, much cheaper to keep.'
    ],
    realWorld: 'Sync services keep exabytes of data. Object storage costs roughly $0.02 per GB each month, and metadata databases are sharded into thousands of pieces (approx.).'
  },
  daily: true
},
{
  id: 'ci-cd-pipeline', title: 'CI/CD build system', difficulty: 'Medium',
  concepts: ['queues-backpressure', 'cost', 'autoscaling'],
  like: 'build runners like GitHub Actions',
  brief: 'Every time a developer saves code to the shared repository, you build and test it. Thousands of developers do this all day, and release day brings a rush. Builds must start quickly, but idle build machines cost real money.',
  clarify: [
    { q: 'How long may a build wait to start?', a: 'Under a few minutes. Developers get impatient after about two.' },
    { q: 'What if one broken build keeps crashing the workers?', a: 'Stop retrying it after a few tries, set it aside and tell the author. It must not block anyone else.' },
    { q: 'Do we keep build outputs?', a: 'Yes, for a month, in cheap storage.' },
    { q: 'May we use spare cheap machines that can disappear?', a: 'Yes. A build can be restarted if its machine vanishes.' }
  ],
  requirements: {
    users: '40,000 developers', monthlyUsers: 40000, peakRps: 300,
    mix: { event: 0.5, batch: 0.2, read: 0.2, write: 0.1 }, latencyP99Ms: { default: 300, batch: 600000 }, availability: 0.995,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 30000, storageTb: 120,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['About 20 builds per developer per day: 800,000 a day, peak ≈ 60 per second (approx.).', 'A "batch" request here is one build job.']
  },
  traffic: { curve: 'business-hours', sources: { 'partner-system': 0.4, 'cron-scheduler': 0.4, 'web-browser': 0.2 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('git', 'partner-system', -100), S('sched', 'cron-scheduler', 0), S('devs', 'web-browser', 100)], edges: [] },
  events: [ { id: 'flash-crowd', at: '10:00', params: { factor: 6, rampSec: 60, holdSec: 1800 } }, { id: 'poison-message', at: '14:00' }, { id: 'cost-blowout', at: '17:00' } ],
  eventPool: ['bad-deploy', 'disk-full'],
  numbers: [
    { label: 'Builds started per second at peak', value: 60, unit: 'builds/s', how: '300 × 0.20', ask: true },
    { label: 'Builds running at once at peak', value: 18000, unit: 'builds', how: "Little's law: 60 builds/s × 300 s (a 5-minute build) ≈ 18,000 running together, so real fleets autoscale thousands of runners (approx.)", ask: true },
    { label: 'Build artefacts stored', value: 120, unit: 'TB', how: '800,000 builds a day × 5 MB × 30 days ≈ 120 TB (approx.)' }
  ],
  hints: [
    'Builds arrive in bursts but workers cost money by the minute. How do you smooth that out?',
    'Put a queue in front of the workers and let the worker count follow the queue. Plan for one bad job crashing a worker over and over.',
    'Gateway, control servers, queue with a dead-letter queue, batch workers with autoscale, object storage for artefacts. Watch the queue with metrics and alerts.'
  ],
  editorial: {
    summary: 'A push creates a job on a queue and the developer gets an instant answer. Build workers grow when the queue is long and shrink when it empties. Jobs that keep failing move to a dead-letter queue so one bad build cannot stall everybody.',
    designs: [ { name: 'Queue with autoscaling workers', why: 'The queue absorbs the release-day rush and the workers scale to match it. Dead-lettering stops a poison build from looping. Artefacts go to cheap object storage.',
      graph: { nodes: [S('git', 'partner-system', -100), S('sched', 'cron-scheduler', 0), S('devs', 'web-browser', 100), N('gw', 'api-gateway', X[1], 0, { units: 1 }),
        N('ctl', 'container-cluster', X[2], 0, { units: 6, zones: 2 }), N('q', 'queue', X[3], 0, { knobs: { retentionDays: 4 } }), N('dlq', 'dead-letter-queue', X[3], 130),
        N('bc', 'batch-cluster', X[4], -60, { units: 60, knobs: { autoscale: { on: true, min: 20, max: 200, targetUtil: 0.7 } } }),
        N('art', 'object-storage', X[5], -60), N('kv', 'kv-store', X[4], 80, { units: 1 }),
        N('ci', 'ci-cd', X[3], -150), N('metrics', 'metrics', X[2], 150), N('alerts', 'alerting', X[3], 260), N('pager', 'pager', X[4], 260)],
        edges: [['git', 'gw'], ['sched', 'gw'], ['devs', 'gw'], ['gw', 'ctl'], ['ctl', 'q'], ['ctl', 'kv'], ['q', 'bc'], ['q', 'kv'], ['q', 'dlq'], ['bc', 'art'], ['ci', 'ctl'],
          ['ctl', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager']] },
      expect: { score: 860, costPerMonth: 22000 } } ],
    tradeoffs: [
      'Keeping a few workers warm starts builds faster but costs money all night.',
      'Cheap interruptible machines save a lot but need builds that can restart safely.',
      'A retry limit protects workers from a bad build. Without one a single job can occupy the whole fleet.',
      'Longer artefact storage helps debugging but grows the monthly bill every day.'
    ],
    realWorld: 'Hosted build services run millions of jobs a day. Compute is billed per minute, a few tenths of a cent each for small machines (approx.).'
  },
  daily: true
},
{
  id: 'feature-flag-service', title: 'Feature flag service', difficulty: 'Medium',
  concepts: ['realtime-connections', 'cdn'],
  like: 'a flag service like LaunchDarkly',
  brief: 'Companies turn features on and off for groups of users without redeploying. Millions of apps ask "is this on for me?", and the answer must be instant. A wrong flag value can take down an entire customer, so changes must roll out safely and be reversible in seconds.',
  clarify: [
    { q: 'Do apps ask your servers on every check?', a: 'No. Apps download the rules and decide locally. Your service sends the rules and receives usage reports.' },
    { q: 'How quick must an emergency off-switch be?', a: 'Within about 30 seconds everywhere.' },
    { q: 'What if your service is down?', a: 'The app keeps using its last known rules. You must never be the cause of a customer outage.' }
  ],
  requirements: {
    users: '2,000 customer companies, 5 million app instances', monthlyUsers: 5000000, peakRps: 25000,
    mix: { read: 0.895, event: 0.1, write: 0.005 }, latencyP99Ms: { default: 100 }, availability: 0.9999,
    dataSafety: 'no-loss', readYourWrites: true, compliance: [], budgetPerMonth: 12000, storageTb: 0.2,
    userRegions: { us: 0.45, eu: 0.35, apac: 0.2 }, homeRegion: 'us',
    notes: ['A rule file is about 50 KB for a big customer (approx.).', 'Usage events are small and can be a minute late.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.5, 'mobile-app': 0.4, 'admin-console': 0.1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('apps', 'web-browser', -100), S('mobile', 'mobile-app', 0), S('admin', 'admin-console', 100)], edges: [] },
  events: [ { id: 'thundering-herd', at: '09:00', params: { factor: 6, types: ['read'] } }, { id: 'bad-config-push', at: '11:00' } ],
  eventPool: ['cache-stampede', 'zone-outage'],
  numbers: [
    { label: 'Rule downloads per second at peak', value: 22375, unit: 'req/s', how: '25,000 × 0.895', ask: true },
    { label: 'Usage events per second at peak', value: 2500, unit: 'events/s', how: '25,000 × 0.10', ask: true },
    { label: 'Rule data held by the CDN', value: 0.1, unit: 'GB', how: '2,000 customers × 50 KB ≈ 100 MB, small enough to keep everywhere (approx.)' }
  ],
  hints: [
    'Every app downloads the same file for its customer. Where can a copy of that file live?',
    'Serve rules from a CDN with a short time to keep them, and push changes to connected apps with a socket gateway. Think about what stops a bad change.',
    'CDN, socket gateway, servers, cache, document database. Add config service for staged rollouts and the feature flag control to switch a bad change off in seconds.'
  ],
  editorial: {
    summary: 'Rules are small and read by many, so the CDN does the heavy lifting with a short keep time. Sockets announce changes. The riskiest part is a bad change: staged rollouts, a kill switch and a last-known-good fallback keep one mistake from reaching everyone.',
    designs: [ { name: 'CDN-first with staged changes', why: 'Nearly every read is a CDN hit, so the origin stays calm even when thousands of apps reconnect together. Staged rollouts limit a bad change to a small share, and metrics with alerts make sure you notice fast.',
      graph: { nodes: [S('apps', 'web-browser', -100), S('mobile', 'mobile-app', 0), S('admin', 'admin-console', 100),
        N('cdn', 'cdn', X[1], -100, { knobs: { ttlSec: 5, coalesce: true } }), N('lb', 'regional-lb', X[2], 0, { zones: 3 }), N('ws', 'websocket-gateway', X[2], 130, { units: 4, zones: 3 }),
        N('api', 'container-cluster', X[3], 0, { units: 8, zones: 3 }), N('cache', 'distributed-cache', X[4], -70, { units: 2, zones: 2, knobs: { ttlSec: 60 } }),
        N('db', 'document-db', X[5], 0, { units: 3, zones: 3 }), N('es', 'event-stream', X[4], 110, { units: 3, zones: 2 }), N('sp', 'stream-processor', X[5], 110, { units: 2 }), N('lake', 'data-lake', X[6], 110),
        N('ff', 'feature-flags', X[3], -170), N('cfg', 'config-service', X[4], -170), N('metrics', 'metrics', X[3], 220), N('alerts', 'alerting', X[4], 220), N('pager', 'pager', X[5], 220)],
        edges: [['apps', 'cdn'], ['mobile', 'cdn'], ['cdn', 'lb'], ['apps', 'ws'], ['mobile', 'ws'], ['admin', 'lb'], ['lb', 'api'], ['ws', 'api'], ['api', 'cache'], ['cache', 'db'], ['api', 'db'],
          ['api', 'es'], ['es', 'sp'], ['sp', 'lake'], ['ff', 'api'], ['cfg', 'api'], ['api', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager']] },
      expect: { score: 880, costPerMonth: 9400 } } ],
    tradeoffs: [
      'A shorter CDN keep time makes changes appear sooner but sends more traffic to the origin.',
      'Pushing changes over sockets is fast but means holding millions of open connections.',
      'Staged rollouts slow a good change down a little, and make a bad change far less costly.',
      'Apps that fall back to the last known rules stay safe even if you are completely down.'
    ],
    realWorld: 'Flag services deliver rule changes to connected apps in well under a second and handle many billions of flag checks a day, nearly all evaluated locally (approx.).'
  },
  daily: true
},
{
  id: 'ad-serving', title: 'Ad serving', difficulty: 'Hard',
  concepts: ['caching', 'cost', 'ai-serving'],
  like: 'ad auctions on a news site',
  brief: 'Each page view asks you to pick the best ad in under 100 milliseconds: check who is allowed to see what, score the candidates with a model, run a quick auction and answer. Every impression and click must be counted exactly because money depends on it.',
  clarify: [
    { q: 'How long do we have?', a: 'About 100 ms from the page asking to the ad being chosen. A slower answer means a blank space, which earns nothing.' },
    { q: 'What if the scoring model is slow?', a: 'Fall back to a simpler ranking. A decent ad on time beats a perfect ad too late.' },
    { q: 'Do we need the person\'s permission?', a: 'Yes. Personalised ads need consent. Check it on every request.' },
    { q: 'How exact must billing counts be?', a: 'Very. Lose no more than a minute of events, and never count one twice.' }
  ],
  requirements: {
    users: '60 million people a month', monthlyUsers: 60000000, peakRps: 50000,
    mix: { read: 0.85, event: 0.14, report: 0.01 }, latencyP99Ms: { default: 100, report: 10000 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: ['consent'], budgetPerMonth: 60000, storageTb: 40,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['Model scoring takes about 20 ms per ad request (approx.).', 'Impressions and clicks are billing records.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'viral-spike', at: '11:00', params: { factor: 4 } }, { id: 'slow-dependency', at: '14:00', params: { target: 'el:model-server' } }, { id: 'cost-blowout', at: '16:00' }, { id: 'compliance-audit', at: '20:00', params: { checks: ['consent', 'encryption'] } } ],
  eventPool: ['cache-stampede', 'bad-deploy'],
  numbers: [
    { label: 'Ad requests per second at peak', value: 42500, unit: 'req/s', how: '50,000 × 0.85', ask: true },
    { label: 'Impression and click events per second', value: 7000, unit: 'events/s', how: '50,000 × 0.14', ask: true },
    { label: 'Campaign data in memory', value: 20, unit: 'GB', how: '2 million live campaigns × 10 KB ≈ 20 GB, kept in cache (approx.)', ask: true }
  ],
  hints: [
    'You have about a quarter of a second. Which steps must happen in that time, and which can happen afterwards?',
    'Cache campaign data in memory, keep scoring in a model server, and send billing events down a stream so they are never lost and never slow the auction.',
    'Servers, consent check, feature store and model server (called while serving), distributed cache over a key-value store. Event stream to a processor and a warehouse for reports.'
  ],
  editorial: {
    summary: 'The auction is a tight loop of in-memory lookups and one fast model call. Everything that is not needed to choose the ad, such as counting, billing and reports, happens afterwards through a stream. A slow model must degrade the ad quality, not the page.',
    designs: [ { name: 'Cache, score, auction, then stream', why: 'Servers read campaigns from cache, fetch user features, score with the model and answer. Consent is checked each time. Events flow through a stream with three copies, so a minute of billing data is safe.',
      graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('lb', 'regional-lb', X[1], 0, { zones: 3 }),
        N('auction', 'vm-fleet', X[2], 0, { units: 24, tier: 'L', zones: 3 }), N('consent', 'consent-service', X[3], -190, { units: 2 }),
        N('fs', 'feature-store', X[3], -120, { units: 3 }), N('ms', 'model-server', X[3], -50, { units: 14, zones: 3 }),
        N('cache', 'distributed-cache', X[3], 40, { units: 6, zones: 3, knobs: { ttlSec: 60, coalesce: true } }), N('kv', 'kv-store', X[4], 40, { units: 1 }),
        N('es', 'event-stream', X[3], 140, { units: 5, zones: 3 }), N('sp', 'stream-processor', X[4], 140, { units: 4 }), N('lake', 'data-lake', X[5], 140),
        N('wh', 'data-warehouse', X[4], 240, { units: 2 }), N('metrics', 'metrics', X[2], 150), N('alerts', 'alerting', X[2], 250), N('audit', 'audit-log', X[5], -100), N('kms', 'kms', X[5], -190)],
        edges: [['users', 'lb'], ['app', 'lb'], ['lb', 'auction'], ['auction', 'consent'], ['auction', 'fs'], ['auction', 'ms'], ['auction', 'cache'], ['cache', 'kv'],
          ['auction', 'es'], ['es', 'sp'], ['sp', 'lake'], ['auction', 'wh'], ['auction', 'metrics'], ['metrics', 'alerts'], ['auction', 'audit']] },
      expect: { score: 820, costPerMonth: 46000 } } ],
    tradeoffs: [
      'A bigger model picks better ads but takes longer and costs more. A smaller one on time earns more than a perfect one late.',
      'Longer cache times for campaign data save money but let a paused campaign keep showing for a minute.',
      'Billing events go through a stream to be exact and safe, at the price of results appearing minutes later.',
      'Consent checks add a lookup to every request, but showing ads without permission is far costlier.'
    ],
    realWorld: 'Real ad exchanges decide in about 100 ms and may handle millions of requests a second across all participants. A single site may see tens of thousands a second (approx.).'
  },
  daily: true
},
{
  id: 'ai-chatbot-serving', title: 'AI chatbot serving', difficulty: 'Hard',
  concepts: ['ai-serving', 'cost', 'rate-limiting'],
  like: 'a chat assistant like ChatGPT',
  brief: 'Millions of people ask your assistant questions. Each reply takes a GPU several seconds, and GPUs are expensive and sometimes simply unavailable. Keep replies flowing, protect your wallet from abuse, and have a plan for when the GPUs run out.',
  clarify: [
    { q: 'How long may a reply take?', a: 'The first words should appear in about a second. A complete reply may take up to 10 seconds.' },
    { q: 'What if we run out of GPUs?', a: 'Use a hosted model from an outside provider as overflow, at a higher cost per reply. Better a pricier answer than an error.' },
    { q: 'Must conversations be stored?', a: 'Yes, so people can come back to them. They are private and encrypted.' },
    { q: 'Should every question be answered fresh?', a: 'No. Very common questions can reuse a saved answer.' }
  ],
  requirements: {
    users: '8 million people a month', monthlyUsers: 8000000, peakRps: 800,
    mix: { inference: 0.15, read: 0.7, write: 0.15 }, latencyP99Ms: { default: 300, inference: 10000 }, availability: 0.995,
    dataSafety: 'rpo-1m', readYourWrites: true, compliance: ['encryption', 'retention'], budgetPerMonth: 75000, storageTb: 20,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['A GPU makes about 6 replies per second with batching (approx.).', 'A hosted model costs about $0.003 per reply (approx.).']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.65, 'mobile-app': 0.35 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'gpu-shortage', at: '10:00', params: { factor: 1.8 } }, { id: 'third-party-rate-limit', at: '14:00' }, { id: 'cost-blowout', at: '17:00' } ],
  eventPool: ['viral-spike', 'bad-deploy'],
  numbers: [
    { label: 'Replies to generate per second at peak', value: 120, unit: 'replies/s', how: '800 × 0.15', ask: true },
    { label: 'GPUs needed at peak', value: 20, unit: 'GPUs', how: '120 replies/s ÷ 6 per GPU = 20 (approx.)', ask: true },
    { label: 'Cost if every reply used a hosted model', value: 18000, unit: '$ per day', how: '70 replies/s average × 86,400 ≈ 6 million replies × $0.003 ≈ $18,000 (approx.)', ask: true }
  ],
  hints: [
    'GPUs are the scarce, expensive part. What can stand in front of them to absorb abuse and repeats?',
    'Add a rate limiter per user, a safety filter, and a semantic cache for repeated questions. Keep a hosted model as overflow.',
    'Rate limiter, then an LLM gateway that checks safety, tries a semantic cache and then your GPUs, with the hosted model as a fallback. Chat history goes through ordinary servers to a document database.'
  ],
  editorial: {
    summary: 'Treat GPU time as the precious resource. A per-user limit stops one person eating a thousand replies. A semantic cache reuses answers to common questions. Your own GPUs are the main path, and an outside hosted model is the escape valve for shortages and spikes.',
    designs: [ { name: 'Gateway, cache, own GPUs, hosted overflow', why: 'The limiter and safety filter protect cost and reputation. The semantic cache removes repeats. Own GPUs carry the base load cheaply, and the gateway falls back to the hosted model when they are full or unavailable.',
      graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('waf', 'waf', X[1], 0),
        N('rl', 'rate-limiter', X[2], 0, { units: 2, knobs: { limitRps: 5, mode: 'fail-open' } }),
        N('gw', 'llm-gateway', X[3], -110, { units: 2 }), N('sf', 'safety-filter', X[4], -190, { units: 2 }),
        N('sc', 'semantic-cache', X[5], -190, { units: 2, knobs: { ttlSec: 3600 } }), N('gpu', 'gpu-cluster', X[6], -190, { units: 22, zones: 2, knobs: { autoscale: { on: true, min: 18, max: 40, targetUtil: 0.7 } } }),
        N('hosted', 'hosted-llm-api', X[6], -80, { units: 1, knobs: { retries: 1, backoff: 'exponential-jitter' } }),
        N('api', 'api-gateway', X[3], 90, { units: 1 }), N('svc', 'container-cluster', X[4], 90, { units: 4, zones: 2 }), N('db', 'document-db', X[5], 90, { units: 4, zones: 3 }),
        N('kms', 'kms', X[5], 190), N('audit', 'audit-log', X[6], 190), N('bk', 'backups', X[6], 90), N('metrics', 'metrics', X[4], 190), N('alerts', 'alerting', X[4], 290)],
        edges: [['users', 'waf'], ['app', 'waf'], ['waf', 'rl'], ['rl', 'gw'], ['rl', 'api'], ['gw', 'sf'], ['sf', 'sc'], ['sc', 'gpu'], ['gw', 'hosted'], ['api', 'svc'], ['svc', 'db'], ['svc', 'kms'], ['svc', 'audit'],
          ['bk', 'db'], ['gw', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 800, costPerMonth: 60000 } } ],
    tradeoffs: [
      'A semantic cache saves GPU time on repeats but can return a slightly different answer to a similar question.',
      'Own GPUs cost less per reply at steady load. A hosted model costs more per reply but needs no buying ahead.',
      'A strict per-user limit saves money and protects others, but may annoy heavy users.',
      'A smaller model answers faster and cheaper, with lower quality. Gateways often route easy questions to it.'
    ],
    realWorld: 'A mid-size model produces about 2,500 tokens a second per GPU with batching and a reply is around 400 tokens, so one GPU does a few replies a second. A GPU is roughly $2 to $4 an hour (approx.).'
  },
  daily: true
},
{
  id: 'collaborative-docs', title: 'Collaborative documents', difficulty: 'Hard',
  concepts: ['realtime-connections', 'consistency'],
  like: 'shared docs like Google Docs',
  brief: 'Many people edit the same document at the same moment and everyone must see a consistent result in a fraction of a second. Edits must never be lost, even if a server crashes in the middle of typing or two people type in the same place.',
  clarify: [
    { q: 'What if two people edit the same sentence together?', a: 'Both edits survive and everyone ends up with the same text. The order of edits is decided in one place per document.' },
    { q: 'How fast must an edit reach others?', a: 'Under about 150 ms. More than that and cursors feel jumpy.' },
    { q: 'What if someone loses their connection?', a: 'They keep typing offline and their edits merge when they return.' },
    { q: 'Can we lose an edit?', a: 'Never. Typed text is saved before it is confirmed.' }
  ],
  requirements: {
    users: '15 million people a month', monthlyUsers: 15000000, peakRps: 40000,
    mix: { message: 0.6, sync: 0.2, read: 0.15, write: 0.05 }, latencyP99Ms: { default: 300, message: 150 }, availability: 0.9995,
    dataSafety: 'no-loss', readYourWrites: true, compliance: ['encryption'], budgetPerMonth: 35000, storageTb: 60,
    userRegions: { us: 0.5, eu: 0.5 }, homeRegion: 'us',
    notes: ['250,000 people editing at once, about a tenth typing in any one second (approx.).', 'One gateway node holds about 100,000 open connections (approx.).']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.8, 'mobile-app': 0.2 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60)], edges: [] },
  events: [ { id: 'thundering-herd', at: '09:00', params: { factor: 5, types: ['read', 'sync', 'message'] } }, { id: 'zone-outage', at: '11:00' }, { id: 'network-partition', at: '14:30' } ],
  eventPool: ['region-outage', 'schema-migration-lock'],
  numbers: [
    { label: 'Edits per second at peak', value: 24000, unit: 'msg/s', how: '40,000 × 0.60', ask: true },
    { label: 'Socket gateway nodes needed', value: 3, unit: 'nodes', how: '250,000 open connections ÷ 100,000 each ≈ 3; use 4 for spare room (approx.)', ask: true },
    { label: 'Edit log growth per day', value: 17, unit: 'GB', how: '24,000 edits/s × 0.4 average × 86,400 s × 20 bytes ≈ 17 GB (approx.)', ask: true }
  ],
  hints: [
    'Two people editing the same document must agree on the order. Where does that order get decided?',
    'Send every edit to one server per document over a socket, write it to a log first, then fan it out. Save snapshots from time to time.',
    'Load balancer, socket gateway, servers per document, coordination service for who owns which document, wide-column edit log in three zones, a queue and workers that write snapshots to object storage.'
  ],
  editorial: {
    summary: 'Each open document has one owner server that orders all the edits. Edits are written to a durable log in several zones before they are confirmed, then sent out to everyone. Snapshots saved now and then keep opening a document quick.',
    designs: [ { name: 'Owner per document with a durable log', why: 'The coordination service decides which server owns each document. Edits go into a log replicated over three zones, so nothing is lost if a zone falls over. A background pipeline writes snapshots so opening a document never replays millions of edits.',
      graph: { nodes: [S('users', 'web-browser', -60), S('app', 'mobile-app', 60), N('lb', 'global-lb', X[1], 0), N('ws', 'websocket-gateway', X[2], -70, { units: 4, zones: 3 }),
        N('svc', 'container-cluster', X[3], 0, { units: 34, zones: 3, knobs: { autoscale: { on: true, min: 30, max: 60, targetUtil: 0.6 } } }),
        N('coord', 'coordination-service', X[4], -140, { units: 3, zones: 3 }), N('cache', 'distributed-cache', X[4], -40, { units: 3, zones: 3, knobs: { ttlSec: 60 } }),
        N('log', 'wide-column', X[5], 0, { units: 9, zones: 3 }), N('q', 'queue', X[4], 100), N('wp', 'worker-pool', X[5], 100, { units: 8, zones: 2 }), N('snap', 'object-storage', X[6], 100),
        N('kms', 'kms', X[5], -140), N('bk', 'backups', X[6], 0), N('metrics', 'metrics', X[3], 160), N('alerts', 'alerting', X[4], 200), N('pager', 'pager', X[5], 200)],
        edges: [['users', 'lb'], ['app', 'lb'], ['lb', 'ws'], ['lb', 'svc'], ['ws', 'svc'], ['svc', 'coord'], ['svc', 'cache'], ['cache', 'log'], ['svc', 'log'], ['svc', 'q'], ['q', 'wp'], ['wp', 'snap'],
          ['svc', 'kms'], ['bk', 'log'], ['svc', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager']] },
      expect: { score: 800, costPerMonth: 25000 } } ],
    tradeoffs: [
      'One owner per document gives a clear order but is a single point to recover. The coordination service picks a new owner within seconds.',
      'Writing to the log before confirming adds a few milliseconds but means no typed text is ever lost.',
      'Snapshots speed up opening a document at the cost of storage and a background job.',
      'Offline edits are merged by a rule that keeps both sides\' work. It is clever, and hard to explain to users.'
    ],
    realWorld: 'Editors in the real world serve millions of simultaneous documents. Each document is small, and the per-document activity is modest; the difficulty is the sheer number of sockets and the ordering (approx.).'
  },
  daily: true
},
{
  id: 'email-service', title: 'Email service', difficulty: 'Hard',
  concepts: ['search-indexing', 'storage-tiers', 'queues-backpressure'],
  like: 'an email service like Gmail',
  brief: 'Mail arrives from the whole internet, including a lot of spam, and must land in the right inbox. People open, search, send and attach. Never lose a message, and keep search fast even over years of mail.',
  clarify: [
    { q: 'How quickly must a new email appear in the inbox?', a: 'Within a few seconds. A delay of a minute is noticeable, an hour is a bug.' },
    { q: 'Can search be a little behind?', a: 'A few seconds behind is fine. It must still find mail from ten years ago.' },
    { q: 'Do we keep old mail on fast disks?', a: 'No. Recent mail is hot, older mail moves to cheaper storage. Opening it may take a bit longer.' },
    { q: 'Do I see my sent mail at once?', a: 'Yes. A sent message must show in Sent immediately, even if delivery to the other side takes longer.' }
  ],
  requirements: {
    users: '2 million people', monthlyUsers: 2000000, peakRps: 9000,
    mix: { read: 0.45, write: 0.4, search: 0.1, upload: 0.05 }, latencyP99Ms: { default: 300, upload: 3000 }, availability: 0.9995,
    dataSafety: 'no-loss', readYourWrites: true, compliance: ['encryption', 'backups'], budgetPerMonth: 45000, storageTb: 150,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['Most incoming mail is spam or bulk; the filter must be cheap per message (approx.).', 'Older mail lives in cheap storage: only the recent 150 TB is on fast disks.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.45, 'mobile-app': 0.25, 'partner-system': 0.3 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -100), S('app', 'mobile-app', 0), S('world', 'partner-system', 100)], edges: [] },
  events: [ { id: 'bot-scraping', at: '10:00' }, { id: 'disk-full', at: '14:00' }, { id: 'replication-lag', at: '18:00' } ],
  eventPool: ['viral-spike', 'thundering-herd'],
  numbers: [
    { label: 'Messages stored per second at peak', value: 3600, unit: 'writes/s', how: '9,000 × 0.40', ask: true },
    { label: 'Search queries per second at peak', value: 900, unit: 'queries/s', how: '9,000 × 0.10', ask: true },
    { label: 'Mailbox growth per day', value: 0.9, unit: 'TB', how: '3,600 writes/s × 0.35 average × 86,400 s × 8 KB ≈ 0.9 TB (approx.)', ask: true }
  ],
  hints: [
    'A new email should be accepted fast and processed afterwards. What can hold the work in the middle?',
    'Queue incoming mail, have workers filter and store it, and keep search in an index fed from the mailbox rather than the mailbox itself.',
    'WAF, load balancer, servers, queue, workers, wide-column mailbox in three zones, change connector into a search index. Cache for opening mail and object storage for attachments.'
  ],
  editorial: {
    summary: 'Accept mail quickly, queue it, filter and store it afterwards. The mailbox is a write-heavy store built for huge volumes, search is a separate index kept fed by a change connector, and attachments go to cheap object storage. Old mail drifts to colder tiers.',
    designs: [ { name: 'Queue, mailbox, search index on the side', why: 'The queue means a spam flood slows delivery a little but never refuses mail. The mailbox absorbs the writes and reads at quorum, so you always see the mail you just moved or sent. A connector copies changes into the search index, so searching never touches the mailbox and indexing never slows delivery.',
      graph: { nodes: [S('web', 'web-browser', -100), S('app', 'mobile-app', 0), S('world', 'partner-system', 100), N('waf', 'waf', X[1], 0),
        N('lb', 'regional-lb', X[2], 0, { zones: 3 }), N('svc', 'container-cluster', X[3], 0, { units: 16, zones: 3 }),
        N('q', 'queue', X[4], 90, { knobs: { retentionDays: 7 } }), N('wp', 'worker-pool', X[5], 90, { units: 25, zones: 2, knobs: { retries: 3, backoff: 'exponential-jitter' } }),
        N('dlq', 'dead-letter-queue', X[4], 190), N('cache', 'distributed-cache', X[4], -30, { units: 3, zones: 3, knobs: { ttlSec: 300 } }),
        N('mb', 'wide-column', X[6], 0, { units: 9, zones: 3, knobs: { mode: 'QUORUM' } }), N('cdc', 'cdc-connector', X[6], 130, { units: 2 }), N('idx', 'search-index', X[7], 130, { units: 5, zones: 3 }),
        N('att', 'object-storage', X[5], -140), N('kms', 'kms', X[4], -140), N('bk', 'backups', X[7], 0), N('metrics', 'metrics', X[3], 160), N('alerts', 'alerting', X[3], 260), N('pager', 'pager', X[4], 260)],
        edges: [['web', 'waf'], ['app', 'waf'], ['world', 'waf'], ['waf', 'lb'], ['lb', 'svc'], ['svc', 'cache'], ['cache', 'mb'], ['svc', 'q'], ['q', 'wp'], ['q', 'dlq'], ['wp', 'mb'], ['mb', 'cdc'], ['cdc', 'idx'],
          ['svc', 'idx'], ['svc', 'att'], ['svc', 'kms'], ['bk', 'mb'], ['svc', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager']] },
      expect: { score: 800, costPerMonth: 33000 } } ],
    tradeoffs: [
      'Filtering after queuing keeps accepting mail during a spam flood, but spam may reach inboxes a little later.',
      'A separate search index costs extra storage but keeps heavy searches away from the mailbox.',
      'Moving old mail to cold storage cuts cost sharply but makes opening a ten year old message slower.',
      'Three copies in three zones cost three times the disks, and protect against a building failing.'
    ],
    realWorld: 'Large mail providers store exabytes of mail and block over 99 percent of attempted spam. Cold storage is roughly a tenth of the price of fast disks (approx.).'
  },
  daily: true
},
{
  id: 'observability-platform', title: 'Metrics platform', difficulty: 'Hard',
  concepts: ['sharding', 'observability', 'multi-region'],
  like: 'a metrics store like Mimir',
  brief: 'Thousands of services send a stream of measurements: CPU, errors, latency. You store them, draw the dashboards and fire the alerts. The platform watching everyone else must never go down first, and one customer creating millions of new series can ruin the bill.',
  clarify: [
    { q: 'How many measurements arrive?', a: 'About 17 million different series, each sampled every 15 seconds. That is around 1.1 million samples every second.' },
    { q: 'Is it OK to lose a few seconds of measurements?', a: 'About a minute is fine. But alerts must keep working during problems.' },
    { q: 'How long do we keep data?', a: 'Fifteen days at full detail. Older data is summarised elsewhere.' },
    { q: 'What if one team creates a million new series by accident?', a: 'Limit new series per team so one mistake cannot hurt everyone.' }
  ],
  requirements: {
    users: '2,000 services and their on-call teams', monthlyUsers: 8000, peakRps: 14000,
    mix: { telemetry: 0.8, report: 0.12, read: 0.08 }, latencyP99Ms: { default: 500, telemetry: 1000, report: 5000 }, availability: 0.9995,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 25000, storageTb: 8,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 }, homeRegion: 'us',
    notes: ['One ingest request is a batch of 100 samples, so 11,200 requests a second ≈ 1.1 million samples a second (approx.).', 'A sample takes about 1.5 bytes after compression (approx.).']
  },
  traffic: { curve: 'flat', sources: { 'iot-device': 0.8, 'admin-console': 0.2 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('agents', 'iot-device', -60), S('oncall', 'admin-console', 60)], edges: [] },
  events: [ { id: 'cardinality-explosion', at: '08:00' }, { id: 'thundering-herd', at: '09:00', params: { factor: 8, types: ['report', 'read'] } }, { id: 'zone-outage', at: '12:00' } ],
  eventPool: ['noisy-neighbor', 'disk-full'],
  numbers: [
    { label: 'Ingest batches per second at peak', value: 11200, unit: 'batches/s', how: '14,000 × 0.80', ask: true },
    { label: 'Database nodes needed for writes', value: 4, unit: 'nodes', how: '11,200 ÷ 3,000 batches per node ≈ 4; use more for headroom (approx.)', ask: true },
    { label: 'Data held for 15 days, three copies', value: 6.4, unit: 'TB', how: '1.1 M samples/s × 1.5 B × 86,400 × 15 days × 3 copies ≈ 6.4 TB (approx.)', ask: true }
  ],
  hints: [
    'Writes are constant and huge, reads come in bursts when people open dashboards. Do they need the same machines?',
    'Buffer incoming data in an event stream, spread series over many database nodes (shards), and cache repeated dashboard reads.',
    'Rate limiter per team on the way in, load balancer, distributors, event stream, stream processors, time-series database in three zones. Separate query servers with a cache. Add metrics to watch yourself.'
  ],
  editorial: {
    summary: 'Ingest and query are separate paths that share only the time-series store. Ingest is buffered by a stream so a slow database cannot cause drops. Series are spread across shards. Queries are cached because dashboards repeat. A per-team limit stops runaway series.',
    designs: [ { name: 'Buffered ingest, sharded store, cached queries', why: 'Distributors accept data quickly, the stream holds it, and processors write it in batches to shards in three zones. Dashboards are served by query servers with a cache, so nine o\'clock dashboards do not hurt ingestion.',
      graph: { nodes: [S('agents', 'iot-device', -60), S('oncall', 'admin-console', 60), N('lb', 'regional-lb', X[1], -60, { units: 3, zones: 3 }),
        N('rl', 'rate-limiter', X[2], -60, { units: 2, knobs: { limitRps: 500, mode: 'fail-open' } }), N('dist', 'container-cluster', X[3], -110, { units: 14, zones: 3 }),
        N('es', 'event-stream', X[4], -110, { units: 6, zones: 3, knobs: { partitions: 48 } }), N('sp', 'stream-processor', X[5], -110, { units: 4, zones: 3 }),
        N('tsdb', 'timeseries-db', X[6], 0, { units: 12, zones: 3, knobs: { retentionDays: 15 } }),
        N('qlb', 'regional-lb', X[1], 140, { zones: 3 }), N('qry', 'container-cluster', X[3], 140, { units: 6, zones: 3 }), N('cache', 'distributed-cache', X[4], 140, { units: 2, knobs: { ttlSec: 60 } }),
        N('metrics', 'metrics', X[3], 270), N('alerts', 'alerting', X[4], 270), N('pager', 'pager', X[5], 270), N('bk', 'backups', X[7], 0)],
        edges: [['agents', 'lb'], ['lb', 'rl'], ['rl', 'dist'], ['dist', 'es'], ['es', 'sp'], ['sp', 'tsdb'], ['oncall', 'qlb'], ['qlb', 'qry'], ['qry', 'cache'], ['cache', 'tsdb'], ['qry', 'tsdb'],
          ['dist', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager'], ['bk', 'tsdb']] },
      expect: { score: 800, costPerMonth: 19000 } } ],
    tradeoffs: [
      'The stream adds a few seconds before data is queryable, but protects against drops when the database stalls.',
      'More shards means more write capacity and more copies of the cluster to run. Choosing the shard key matters.',
      'Query caching makes busy dashboards cheap but may show data up to a minute old.',
      'Per-team limits stop runaway series, but a limit set too low silently drops real data from a busy team.'
    ],
    realWorld: 'Large metrics clusters ingest tens of millions of samples a second across hundreds of nodes. Cost scales with the number of distinct series more than with the sample rate (approx.).'
  },
  daily: true
}
];

export default {
  group: { id: 'platforms-dev', title: 'Platforms and developer tools', blurb: 'Shared building blocks and the tools that run other tools: links, limits, search, notifications, ads, AI, docs, mail, builds and metrics.' },
  problems
};
