// Seven problems that fill the industry gaps: shopping carts and flash sales, login and single sign-on, clickstream
// analytics, texts and calls, and object storage. Every figure is a rough real-world approximation and the notes say so.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'commerce', title: 'Commerce and retail', blurb: 'Shopping carts and sale days: lots of browsing, few buys, and every unit of stock counted once.' },
  problems: [
{
  id: 'shopping-cart', title: 'Shopping cart', difficulty: 'Easy',
  concepts: ['caching', 'consistency'],
  like: 'the cart on an online store like Amazon',
  brief: 'Shoppers browse products, drop things in a cart and come back later from another phone. Browsing is most of the traffic and can be a little old. The cart itself must always show what the shopper just added.',
  clarify: [
    { q: 'Can the product pages be a little old?', a: 'Yes, by a minute or two. A price that changes is fixed at checkout.' },
    { q: 'Can the cart be old?', a: 'No. If someone adds a shirt and the page reloads without it, they leave.' },
    { q: 'How long does a cart live?', a: 'About 30 days. Most carts are never bought (approx.).' }
  ],
  requirements: {
    users: '10 million shoppers a month (approx.)', monthlyUsers: 10000000, peakRps: 3000,
    mix: { read: 0.75, write: 0.17, login: 0.08 }, latencyP99Ms: { default: 400 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: true, compliance: [], budgetPerMonth: 5000, storageTb: 0.5,
    userRegions: { us: 0.8, eu: 0.2 }, homeRegion: 'us',
    notes: ['About 510 cart changes a second at the evening peak (approx.).', 'A cart is a few KB (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'flash-crowd', at: '12:00', params: { factor: 2.5 } }, { id: 'cache-stampede', at: '20:00' } ],
  eventPool: ['slow-dependency'],
  numbers: [
    { label: 'Cart changes per second at peak', value: 510, unit: 'writes/s', how: '3,000 × 0.17 (approx.)', ask: true },
    { label: 'Product views per second at peak', value: 2250, unit: 'req/s', how: '3,000 × 0.75 (approx.)', ask: true },
    { label: 'Cart data', value: 0.05, unit: 'TB', how: '10 million shoppers × about 5 KB ≈ 50 GB (approx.)' }
  ],
  hints: [
    'Product pages and the cart have different promises. Which one may be a minute old?',
    'A cache can answer product views. A key-value store keeps each cart under its owner as the key, with no joins needed.',
    'Load balancer, a few servers, a cache for products, a SQL database for the catalog, and a key-value store for carts.'
  ],
  editorial: {
    summary: 'Most traffic only looks at products, so a cache answers it. Each cart is one small record looked up by its owner, which is exactly what a key-value store does well, so carts never wait on the catalog database.',
    designs: [ { name: 'Cache for products, key-value store for carts', why: 'The cache serves product pages from memory and may be a minute old. Carts live in a key-value store read and written by one key, so adding an item is visible at once and the store grows without effort.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { zones: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 6, zones: 2 }),
        N('cache', 'cache', X[3], -60, { knobs: { ttlSec: 60 } }), N('catalog', 'sql-primary', X[4], -60), N('carts', 'kv-store', X[4], 70),
        N('metrics', 'metrics', X[3], 160), N('alerts', 'alerting', X[4], 160)],
        edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'catalog'], ['api', 'carts'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 900, costPerMonth: 4000 } } ],
    tradeoffs: [
      'A longer cache time saves the catalog database but can show an old price. A minute is a good middle.',
      'A key-value store scales carts easily, but you cannot ask it questions like "who has this item in a cart".',
      'Keeping the cart only in the browser is cheap, but it vanishes when the shopper switches device.',
      'Saving carts for 30 days costs a little storage and brings many shoppers back.'
    ],
    realWorld: 'Large shops see a few hundred cart changes a second on a normal evening and many times more on a sale day. Carts are usually kept in key-value stores for exactly this reason (approx.).'
  },
  daily: true
},
{
  id: 'flash-sale-inventory', title: 'Flash sale inventory', difficulty: 'Medium',
  concepts: ['hot-keys', 'queues-backpressure'],
  like: 'a limited-stock sale like a sneaker drop',
  brief: 'At noon a hot item goes on sale with only a few thousand units. A huge crowd arrives in the same minute and everyone taps Buy. Stock must never go below zero, nobody should be charged for an item that is gone, and the site must not fall over.',
  clarify: [
    { q: 'Can we sell more than we have?', a: 'Never. Overselling means cancelled orders and angry buyers.' },
    { q: 'Must buyers get an instant answer?', a: 'They need to know their order was received within a second. Confirmation can follow shortly after.' },
    { q: 'Can some buyers be turned away?', a: 'Yes. Stock is tiny compared with the crowd, so most people will see "sold out". That is fine if it is fast and honest.' }
  ],
  requirements: {
    users: '4 million shoppers on the day (approx.)', monthlyUsers: 4000000, peakRps: 25000,
    mix: { read: 0.65, write: 0.3, payment: 0.05 }, latencyP99Ms: { default: 600, payment: 4000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: [], budgetPerMonth: 20000, storageTb: 0.5,
    userRegions: { us: 0.7, eu: 0.3 }, homeRegion: 'us',
    notes: ['Only about 5,000 units are for sale, but about 7,500 buy attempts a second arrive at the first minute (approx.).', 'One item row is the hot key everyone fights over.', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'drop', sources: { 'web-browser': 0.5, 'mobile-app': 0.5 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'thundering-herd', at: '12:00', params: { factor: 3, types: ['read'] } }, { id: 'bot-scraping', at: '12:05' } ],
  eventPool: ['hot-key', 'db-failover'],
  numbers: [
    { label: 'Buy attempts per second at peak', value: 7500, unit: 'writes/s', how: '25,000 × 0.3 (approx.)', ask: true },
    { label: 'Units that can be sold', value: 5000, unit: 'units', how: 'The whole stock, which a crowd of millions fights for (approx.)', ask: true },
    { label: 'Attempts that must fail politely', value: 99, unit: 'percent', how: 'Almost every attempt meets a sold-out item once the 5,000 units are taken (approx.)' }
  ],
  hints: [
    'Millions fight over one number: the units left. What makes the count safe, and what keeps the crowd away from it?',
    'Rate limit the crowd at the edge, then put buy attempts in a queue so one worker at a time touches the stock. Browsing can come from a cache.',
    'CDN and cache for the page, a rate limiter, servers, a queue, workers with an idempotency store, a SQL database that takes stock in one step.'
  ],
  editorial: {
    summary: 'Keep the crowd and the stock apart. A cache and CDN absorb browsing, a rate limiter trims the bots, and buy attempts wait in a queue. A few workers take stock one transaction at a time, so the count never goes wrong and the database is never swarmed.',
    designs: [ { name: 'Queue in front of one safe stock counter', why: 'The queue turns a crowd into an orderly line. Workers check the idempotency store, then take stock in one SQL transaction. Everyone past the stock gets a quick sold-out answer.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('cdn', 'cdn', X[1], -90), N('rl', 'rate-limiter', X[1], 50, { units: 2 }), N('lb', 'regional-lb', X[2], 50, { zones: 2 }),
        N('api', 'container-cluster', X[3], 50, { units: 20, zones: 2 }), N('cache', 'cache', X[3], -80, { knobs: { ttlSec: 30 } }),
        N('q', 'queue', X[4], 50), N('wp', 'worker-pool', X[5], 50, { units: 20, zones: 2 }), N('idem', 'idempotency-store', X[5], -60, { units: 2 }),
        N('stock', 'sql-primary', X[6], 50), N('metrics', 'metrics', X[3], 170), N('alerts', 'alerting', X[4], 170)],
        edges: [['web', 'cdn'], ['app', 'rl'], ['cdn', 'rl'], ['rl', 'lb'], ['lb', 'api'], ['api', 'cache'], ['api', 'q'], ['q', 'wp'], ['wp', 'idem'], ['wp', 'stock'], ['cache', 'stock'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 880, costPerMonth: 15000 } } ],
    tradeoffs: [
      'A queue gives a "received" answer fast and protects the stock, but the final yes or no arrives a moment later.',
      'Rate limiting at the edge keeps bots out, but a strict limit can also turn away real buyers on a shared network.',
      'One database row for stock is simple and correct. Splitting the stock over many rows is faster but adds care when it runs low.',
      'Holding an item in the cart for a few minutes is kind to buyers but locks stock that may never be paid for.'
    ],
    realWorld: 'Limited drops can bring hundreds of thousands of shoppers in one minute for a few thousand units. Big retailers put waiting rooms and queues in front of the stock for this reason (approx.).'
  },
  daily: true
},
{
  id: 'login-sso', title: 'Login and single sign-on', difficulty: 'Medium',
  concepts: ['rate-limiting', 'security-compliance'],
  like: 'the "Sign in with" button used by many apps',
  brief: 'Employees and customers sign in to many apps through one account. Most of the day is quiet, then 9 am arrives and everyone signs in at once. Attackers also hammer the login with stolen passwords. Let real people in quickly and keep the rest out.',
  clarify: [
    { q: 'Do apps check a session on every click?', a: 'Yes, so session checks are far more common than logins. They must be fast.' },
    { q: 'Can a session check be a few seconds old?', a: 'Yes, if someone signs out, a few seconds of delay is acceptable. A password change must take effect soon.' },
    { q: 'What about password guessing?', a: 'Limit attempts per account and per address, and log every attempt for audit.' }
  ],
  requirements: {
    users: '8 million people a month (approx.)', monthlyUsers: 8000000, peakRps: 6000,
    mix: { read: 0.7, login: 0.3 }, latencyP99Ms: { default: 300, login: 1000 }, availability: 0.9995,
    dataSafety: 'no-loss', readYourWrites: true, compliance: ['audit-log'], budgetPerMonth: 9000, storageTb: 0.2,
    userRegions: { us: 0.6, eu: 0.4 }, homeRegion: 'us',
    notes: ['About 1,800 sign-ins a second at the 9 am peak, and 4,200 session checks (approx.).', 'A password check is deliberately slow and costs real compute.', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.6, 'mobile-app': 0.3, 'partner-system': 0.1 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 40, 'Mobile app'), S('partner', 'partner-system', 140, 'Partner apps')], edges: [] },
  events: [ { id: 'bot-scraping', at: '10:30' }, { id: 'retry-storm', at: '09:00' } ],
  eventPool: ['cert-expiry', 'ddos-attack', 'key-leak'],
  numbers: [
    { label: 'Sign-ins per second at peak', value: 1800, unit: 'logins/s', how: '6,000 × 0.3 (approx.)', ask: true },
    { label: 'Session checks per second at peak', value: 4200, unit: 'req/s', how: '6,000 × 0.7 (approx.)', ask: true },
    { label: 'Audit log a day', value: 20, unit: 'GB', how: 'About 150 million events × about 150 bytes ≈ 22 GB (approx.)' }
  ],
  hints: [
    'Signing in is rare and heavy. Checking a session is frequent and light. Should they take the same path?',
    'Keep sessions in a fast store so a check never touches the password database. Put a rate limiter and a firewall in front of the login.',
    'Firewall, load balancer, servers, rate limiter, identity provider, key-value store for sessions, SQL for accounts, secrets manager and an audit log.'
  ],
  editorial: {
    summary: 'Split the cheap, constant session check from the costly, rare sign-in. Sessions live in a key-value store so apps get a fast answer. The identity provider handles password work behind a firewall and a rate limiter, and every attempt goes to an audit log.',
    designs: [ { name: 'Fast sessions, guarded sign-in, audit trail', why: 'A session check reads one key and never reaches the password database. The sign-in path is guarded twice, by the firewall and by per-account limits, and the audit log records each attempt.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 40), S('partner', 'partner-system', 140),
        N('waf', 'waf', X[1], 40), N('lb', 'regional-lb', X[2], 40, { units: 2, zones: 2 }), N('rl', 'rate-limiter', X[3], -60, { units: 2 }),
        N('api', 'container-cluster', X[3], 60, { units: 10, zones: 2 }), N('idp', 'identity-provider', X[4], -20, { units: 4 }),
        N('sessions', 'kv-store', X[4], 90), N('users', 'sql-primary', X[5], -20), N('secrets', 'secrets-manager', X[5], 80),
        N('audit', 'audit-log', X[5], 180), N('metrics', 'metrics', X[3], 180), N('alerts', 'alerting', X[4], 200), N('pager', 'pager', X[5], 260), N('probe', 'synthetic-probe', X[1], 200)],
        edges: [['web', 'waf'], ['app', 'waf'], ['partner', 'waf'], ['waf', 'lb'], ['lb', 'rl'], ['rl', 'api'], ['api', 'idp'], ['api', 'sessions'], ['api', 'users'], ['api', 'secrets'], ['api', 'audit'], ['api', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager'], ['probe', 'waf']] },
      expect: { score: 880, costPerMonth: 7500 } } ],
    tradeoffs: [
      'Session checks served from a fast store are quick, but a signed-out session may linger for a few seconds.',
      'Strict attempt limits stop guessing, but can lock out a real user whose account is being attacked.',
      'Long sessions are friendlier, but a stolen session lasts longer. Many teams use short sessions with a refresh.',
      'If login goes down, every connected app goes down with it. That is why it gets the highest uptime target here.'
    ],
    realWorld: 'A large company sign-in service handles thousands of session checks for each real sign-in, and sees its peak in the first minutes of the work day (approx.).'
  },
  daily: true
},
{
  id: 'clickstream-analytics', title: 'Clickstream analytics', difficulty: 'Medium',
  concepts: ['queues-backpressure', 'storage-tiers'],
  like: 'the page-view tracking behind a product analytics tool',
  brief: 'Every tap and page view on a busy site sends a tiny event to you. Hundreds of millions pile up each day. Analysts open dashboards to ask what happened this hour. Never drop an event, and keep the storage bill under control as the pile grows.',
  clarify: [
    { q: 'Must a dashboard be real-time?', a: 'A few minutes behind is fine. Nobody needs the exact second.' },
    { q: 'Can an event be counted twice?', a: 'Rarely and a little is acceptable for page views, but lost events are not.' },
    { q: 'How long do we keep raw events?', a: 'Recent data stays handy for a month. Older data is rarely read and can go to cheap storage.' }
  ],
  requirements: {
    users: 'Events from 30 million visitors a month (approx.)', monthlyUsers: 30000000, peakRps: 8000,
    mix: { event: 0.99, report: 0.01 }, latencyP99Ms: { default: 400, report: 30000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: [], budgetPerMonth: 45000, storageTb: 20,
    userRegions: { us: 0.5, eu: 0.3, asia: 0.2 }, homeRegion: 'us',
    notes: ['About 300 million events a day, each about 0.5 KB (approx.).', 'Roughly 150 GB of new raw data a day (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Websites'), S('app', 'mobile-app', 80, 'Mobile apps')], edges: [] },
  events: [ { id: 'viral-spike', at: '20:00', params: { factor: 2 } }, { id: 'cardinality-explosion', at: '14:00' }, { id: 'cost-blowout', at: '16:00' } ],
  eventPool: ['poison-message', 'disk-full'],
  numbers: [
    { label: 'Events per second at peak', value: 7920, unit: 'events/s', how: '8,000 × 0.99 (approx.)', ask: true },
    { label: 'New raw data a day', value: 0.15, unit: 'TB', how: '300 million × 0.5 KB ≈ 150 GB (approx.)', ask: true },
    { label: 'Raw data after one year', value: 55, unit: 'TB', how: '150 GB × 365 ≈ 55 TB (approx.). Cold storage costs about a fifth of hot storage.' }
  ],
  hints: [
    'Events arrive far faster than people read dashboards. What can sit between the two?',
    'An event stream takes the flood, a stream processor rolls it up into small summaries, and old raw data moves to cheap storage.',
    'Load balancer, collectors, event stream, stream processor, a data lake for raw events, a warehouse that answers the dashboards, and a cold archive.'
  ],
  editorial: {
    summary: 'Write once into a durable stream, then split the work. A processor turns the flood into small summaries that dashboards read quickly, while raw events settle in a data lake and move to cold storage as they age.',
    designs: [ { name: 'Stream in, summaries out, tiered storage', why: 'The stream absorbs bursts without dropping events. Summaries keep dashboards fast and cheap. The lake keeps raw events for deep questions and a cold archive takes the old ones at a fraction of the price.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('lb', 'regional-lb', X[1], 10, { units: 2, zones: 2 }), N('collect', 'container-cluster', X[2], 10, { units: 12, zones: 2 }),
        N('stream', 'event-stream', X[3], 10), N('proc', 'stream-processor', X[4], -60, { units: 6 }),
        N('lake', 'data-lake', X[4], 80), N('wh', 'data-warehouse', X[5], -60),
        N('cold', 'cold-archive', X[5], 130), N('metrics', 'metrics', X[3], 160), N('alerts', 'alerting', X[4], 200)],
        edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'collect'], ['collect', 'stream'], ['stream', 'proc'], ['stream', 'lake'], ['proc', 'wh'], ['collect', 'wh'], ['proc', 'cold'], ['collect', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 880, costPerMonth: 38000 } } ],
    tradeoffs: [
      'Dashboards a few minutes behind are far cheaper than live ones, because summaries are built in batches.',
      'Keeping raw events lets analysts ask new questions later, but storage grows every day. Tiering keeps it affordable.',
      'Sampling events cuts cost sharply, but a rare event may vanish from the numbers.',
      'A stream with several days of retention lets you replay after a bug, at the price of extra storage.'
    ],
    realWorld: 'Busy products collect hundreds of millions to billions of events a day. Teams keep a few weeks hot, summarise the rest, and move raw history to storage that costs a few cents per GB-month (approx.).'
  },
  daily: true
},
{
  id: 'otp-sms-delivery', title: 'One-time code by text', difficulty: 'Easy',
  concepts: ['idempotency-retries', 'rate-limiting'],
  like: 'the login code text that arrives in seconds',
  brief: 'Apps ask you to send a six-digit code to a phone. The code must arrive in seconds, a person must never get it twice, and nobody may use your system to spam a number. Texts go through a carrier partner with a hard speed limit and a real price per message.',
  clarify: [
    { q: 'How fast must the code arrive?', a: 'Within about 10 seconds of the request. Late codes are as bad as none.' },
    { q: 'Can the same request be sent twice?', a: 'Apps retry when they are unsure. Send each code only once.' },
    { q: 'What stops abuse?', a: 'Limit how many codes one phone number can get in a few minutes.' }
  ],
  requirements: {
    users: '3 million people a month (approx.)', monthlyUsers: 3000000, peakRps: 40,
    mix: { notify: 0.2, write: 0.3, read: 0.5 }, latencyP99Ms: { default: 400, notify: 10000 }, availability: 0.999,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 18000, storageTb: 0.2,
    userRegions: { us: 0.5, eu: 0.3, asia: 0.2 }, homeRegion: 'us',
    notes: ['The carrier partner accepts about 100 texts a second per sender in this scenario (approx.).', 'Each text costs about a cent (approx.). Every code is a real bill.', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.6, 'web-browser': 0.4 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('app', 'mobile-app', -60, 'Mobile app'), S('web', 'web-browser', 80, 'Website')], edges: [] },
  events: [ { id: 'third-party-rate-limit', at: '09:00', params: { rpsCapFactor: 0.8 } }, { id: 'duplicate-delivery', at: '13:00', params: { share: 0.05 } } ],
  eventPool: ['retry-storm', 'dependency-outage'],
  numbers: [
    { label: 'Codes to send per second at peak', value: 8, unit: 'texts/s', how: '40 × 0.2 (approx.)', ask: true },
    { label: 'Texts a day', value: 0.31, unit: 'million', how: 'Average load is about 0.45 of peak: 8 × 0.45 × 86,400 ≈ 310,000 (approx.)', ask: true },
    { label: 'Text bill a month', value: 75, unit: 'thousand dollars', how: '310,000 × 30 × about $0.008 ≈ $75,000 (approx.). This is why abuse limits matter.' }
  ],
  hints: [
    'The carrier has a speed limit and a code that arrives late is useless. What smooths a burst without delaying everyone?',
    'Put a queue before the carrier. Use an idempotency store so a retry never sends a second text, and a rate limiter per phone number.',
    'Load balancer, servers, rate limiter, a key-value store for codes, queue, workers with an idempotency store, the text provider, and a dead-letter queue.'
  ],
  editorial: {
    summary: 'Accept the request quickly, limit abuse per number, and put the send in a queue. Workers check that the code has not been sent already and hand it to the carrier at the speed it allows.',
    designs: [ { name: 'Rate limit, queue, one send per code', why: 'The limiter stops number spam before it costs money. The queue smooths bursts to the carrier limit. The idempotency check makes an app retry harmless.',
      graph: { nodes: [S('app', 'mobile-app', -60), S('web', 'web-browser', 80),
        N('lb', 'regional-lb', X[1], 10, { units: 2, zones: 2 }), N('rl', 'rate-limiter', X[2], -70, { units: 1 }), N('api', 'container-cluster', X[2], 40, { units: 4, zones: 2 }),
        N('q', 'queue', X[3], 40), N('dlq', 'dead-letter-queue', X[3], 150), N('wp', 'worker-pool', X[4], 40, { units: 8, zones: 2, knobs: { retries: 3, backoff: 'exponential-jitter' } }),
        N('idem', 'idempotency-store', X[5], -50, { units: 1 }), N('sms', 'sms-provider', X[5], 50, { units: 1 }), N('codes', 'kv-store', X[3], -70),
        N('metrics', 'metrics', X[2], 160), N('alerts', 'alerting', X[3], 260)],
        edges: [['app', 'lb'], ['web', 'lb'], ['lb', 'rl'], ['rl', 'api'], ['api', 'q'], ['q', 'wp'], ['q', 'dlq'], ['api', 'codes'], ['wp', 'codes'], ['wp', 'idem'], ['wp', 'sms'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 880, costPerMonth: 14000 } } ],
    tradeoffs: [
      'A queue can delay a code when the carrier slows. Giving codes their own queue keeps marketing texts from waiting in the same line.',
      'Strict per-number limits stop abuse but may block a real person who retries a few times.',
      'A second carrier partner raises uptime, at the price of another contract and another limit to respect.',
      'Sending the code by email or an authenticator app is far cheaper than texting every time.'
    ],
    realWorld: 'Code texts cost roughly a cent or two each, so even a modest app pays a large bill, and carriers cap their speed, so large apps rate limit hard and often offer an authenticator app instead (approx.).'
  },
  daily: true
},
{
  id: 'call-routing', title: 'Voice and video call setup', difficulty: 'Medium',
  concepts: ['realtime-connections', 'multi-region'],
  like: 'the ringing part of a calling app or phone carrier',
  brief: 'People tap a name and expect the other phone to ring in a second or two. Your job is the setup: find where the person is, ring their devices and connect the two sides. Everyone calls at the same moments, like evenings and holidays.',
  clarify: [
    { q: 'Do you carry the voice itself?', a: 'No. Voice and video flow between the phones or a media service. You only set the call up and tear it down.' },
    { q: 'How fast must a call ring?', a: 'About 2 seconds from the tap. Longer feels broken.' },
    { q: 'What if a data centre fails?', a: 'Calls already in progress should continue. New calls must find another route quickly.' }
  ],
  requirements: {
    users: '40 million people a month (approx.)', monthlyUsers: 40000000, peakRps: 15000,
    mix: { message: 0.7, event: 0.1, read: 0.1, login: 0.1 }, latencyP99Ms: { default: 400, message: 300 }, availability: 0.9995,
    dataSafety: 'rpo-1m', readYourWrites: false, compliance: [], budgetPerMonth: 60000, storageTb: 3,
    userRegions: { us: 0.4, eu: 0.35, asia: 0.25 }, homeRegion: 'us',
    notes: ['Setting up one call takes about 8 small messages (approx.).', 'About 1,900 calls begin each second at the evening peak (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'meals', sources: { 'mobile-app': 0.75, 'web-browser': 0.25 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('app', 'mobile-app', -60, 'Phones'), S('web', 'web-browser', 80, 'Web callers')], edges: [] },
  events: [ { id: 'flash-crowd', at: '19:00', params: { factor: 2.5 } }, { id: 'zone-outage', at: '21:00' } ],
  eventPool: ['network-partition', 'slow-dependency'],
  numbers: [
    { label: 'Setup messages per second at peak', value: 10500, unit: 'msg/s', how: '15,000 × 0.7 (approx.)', ask: true },
    { label: 'Calls started per second at peak', value: 1300, unit: 'calls/s', how: '10,500 setup messages ÷ about 8 per call ≈ 1,300 (approx.)', ask: true },
    { label: 'Phones online at the evening peak', value: 6, unit: 'million', how: 'About 15 percent of 40 million people (approx.)' }
  ],
  hints: [
    'To ring someone you must know which server holds their open connection. Where can that be kept?',
    'Phones keep a live connection. A fast store maps each person to their connection, and a pub/sub channel carries the ring to it.',
    'Geo DNS, regional load balancers, websocket gateway, signaling servers, key-value store for presence, pub/sub, SQL for call history, across two zones.'
  ],
  editorial: {
    summary: 'Phones hold a live connection to a gateway. A presence store remembers which gateway each person is on, and a pub/sub channel carries ring and answer messages to it. Spreading across zones means one failure only costs the calls on that zone.',
    designs: [ { name: 'Live gateways and a presence map', why: 'Signaling servers stay stateless. They look up where a person is in the presence store, then ring the gateway that holds that connection directly. History is written to SQL afterwards, off the ringing path.',
      graph: { nodes: [S('app', 'mobile-app', -60), S('web', 'web-browser', 80),
        N('dns', 'geo-dns', X[1], 10), N('lb', 'regional-lb', X[2], 10, { zones: 2 }), N('gw', 'websocket-gateway', X[3], 10, { units: 12, zones: 2 }),
        N('sig', 'container-cluster', X[4], -50, { units: 30, zones: 2 }), N('presence', 'kv-store', X[5], -90),
        N('hist', 'sql-primary', X[6], -30), N('metrics', 'metrics', X[3], 150), N('alerts', 'alerting', X[4], 190)],
        edges: [['app', 'dns'], ['web', 'dns'], ['dns', 'lb'], ['lb', 'gw'], ['gw', 'sig'], ['sig', 'presence'], ['sig', 'hist'], ['gw', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 860, costPerMonth: 48000 } } ],
    tradeoffs: [
      'Keeping presence in a fast store makes ringing quick, but it may briefly say a person is online after they left.',
      'Running in several regions keeps calls quick for everyone, at the price of more machines and a harder failover plan.',
      'Sending the voice directly between phones is cheap, but some networks block it, so a relay service is needed as backup.',
      'Retrying a ring is kind to flaky phones, but it must not make a phone ring twice.'
    ],
    realWorld: 'Calling apps handle many millions of live connections and set up thousands of calls a second at peak. Calls cluster around evenings and holidays (approx.).'
  },
  daily: true
},
{
  id: 'object-storage', title: 'Object storage service', difficulty: 'Hard',
  concepts: ['storage-tiers', 'sharding'],
  like: 'a cloud file store like Amazon S3',
  brief: 'Customers store billions of files, from tiny pictures to huge videos, and fetch them by name. The service must never lose a file, scale without a limit and stay cheap. Most files are written once and rarely read again.',
  clarify: [
    { q: 'Can a file change after it is saved?', a: 'A new upload replaces it whole. Files are never edited in place.' },
    { q: 'How safe must a file be?', a: 'Never lost. Once saved, a file must be there years later, even if a data centre burns down.' },
    { q: 'Are all files read equally?', a: 'No. A small share is read all the time and most are almost never touched.' }
  ],
  requirements: {
    users: '5 million developers and apps (approx.)', monthlyUsers: 5000000, peakRps: 12000,
    mix: { read: 0.75, upload: 0.15, write: 0.1 }, latencyP99Ms: { default: 400, upload: 4000 }, availability: 0.9995,
    dataSafety: 'no-loss', readYourWrites: false, compliance: ['encryption'], budgetPerMonth: 120000, storageTb: 2000,
    userRegions: { us: 0.5, eu: 0.3, asia: 0.2 }, homeRegion: 'us',
    notes: ['About 1,800 uploads a second at peak, averaging a few MB (approx.).', 'Around 2 PB stored, growing every day (approx.).', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'global-follow-sun', sources: { 'web-browser': 0.3, 'partner-system': 0.5, 'mobile-app': 0.2 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Websites'), S('partner', 'partner-system', 50, 'Customer systems'), S('app', 'mobile-app', 160, 'Mobile apps')], edges: [] },
  events: [ { id: 'viral-spike', at: '10:00', params: { factor: 3 } }, { id: 'zone-outage', at: '15:00' }, { id: 'cost-blowout', at: '19:00' } ],
  eventPool: ['hot-key', 'slow-dependency'],
  numbers: [
    { label: 'Uploads per second at peak', value: 1800, unit: 'uploads/s', how: '12,000 × 0.15 (approx.)', ask: true },
    { label: 'Reads per second at peak', value: 9000, unit: 'req/s', how: '12,000 × 0.75 (approx.)', ask: true },
    { label: 'Stored data', value: 2000, unit: 'TB', how: 'About 2 PB. Cold storage is roughly a fifth of the price of hot storage (approx.).' }
  ],
  hints: [
    'Two different jobs hide here: finding a file by name, and storing its bytes. Should one database do both?',
    'Keep a small metadata store that maps a name to where the bytes live, and keep the bytes in object storage. Move cold files to cheaper tiers.',
    'Gateway, servers, a CDN for popular files, a metadata store that scales, object storage for bytes, a queue and workers that move old files to cold archive.'
  ],
  editorial: {
    summary: 'Separate the name from the bytes. A scalable metadata store answers "where is this file", object storage holds the bytes in several copies, a CDN serves the popular few, and a background job pushes cold files to cheap storage.',
    designs: [ { name: 'Metadata store, object storage, CDN and tiering', why: 'Names go through a store built for huge key lookups. Bytes sit in object storage with copies in several zones. The CDN takes hot reads off it and a lifecycle job moves old files to the archive.',
      graph: { nodes: [S('web', 'web-browser', -60), S('partner', 'partner-system', 50), S('app', 'mobile-app', 160),
        N('cdn', 'cdn', X[1], -60), N('gw', 'api-gateway', X[1], 90, { units: 2 }), N('lb', 'regional-lb', X[2], 90, { units: 3, zones: 3 }),
        N('api', 'container-cluster', X[3], 90, { units: 40, zones: 3 }), N('meta', 'kv-store', X[4], -10, { units: 4 }), N('blobs', 'object-storage', X[4], 120),
        N('q', 'queue', X[5], 20), N('wp', 'worker-pool', X[5], 130, { units: 6 }), N('idem', 'idempotency-store', X[5], 60, { units: 2 }), N('kms', 'kms', X[5], -80), N('cold', 'cold-archive', X[6], 130),
        N('metrics', 'metrics', X[3], 220), N('alerts', 'alerting', X[4], 250)],
        edges: [['web', 'cdn'], ['partner', 'gw'], ['app', 'gw'], ['cdn', 'gw'], ['gw', 'lb'], ['lb', 'api'], ['api', 'meta'], ['api', 'blobs'], ['api', 'kms'], ['api', 'idem'], ['api', 'q'], ['q', 'wp'], ['wp', 'blobs'], ['wp', 'cold'], ['api', 'metrics'], ['metrics', 'alerts']] },
      expect: { score: 860, costPerMonth: 95000 } } ],
    tradeoffs: [
      'Keeping several copies protects against loss but multiplies the storage bill. Erasure coding gives similar safety for less.',
      'Cold tiers are cheap to keep and slow or costly to read. Move a file there only when it is truly idle.',
      'A CDN speeds up popular files but may serve a stale version for a short time after a replace.',
      'Strong "read your own write" is simpler for customers but limits how far the metadata store can be spread.'
    ],
    realWorld: 'The biggest object stores hold trillions of files and answer tens of millions of requests a second. Durability is promised at eleven nines, and old data costs a fraction of a cent per GB-month (approx.).'
  },
  daily: true
}
  ]
};
