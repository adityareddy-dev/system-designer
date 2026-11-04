// A Hard problem for the commerce group: a sale day with search, carts and payments.
// Every figure is a rough real-world approximation and the notes say so.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'commerce', title: 'Commerce and retail', blurb: 'Shopping carts and sale days: lots of browsing, few buys, and every unit of stock counted once.' },
  problems: [
{
  id: 'black-friday-marketplace', title: 'Black Friday marketplace', difficulty: 'Hard',
  concepts: ['caching', 'hot-keys', 'idempotency-retries'],
  like: 'the biggest sale day of an online marketplace like Amazon',
  brief: 'Once a year a marketplace puts thousands of deals live at the same minute. Millions browse and search, a few doorbuster items get hammered, and a smaller crowd checks out. A payment must never be taken twice, and the day must survive the card processor having a bad hour.',
  clarify: [
    { q: 'Can search results and product pages be a little old?', a: 'Yes, by a minute. A changed price is checked again at checkout.' },
    { q: 'Can a shopper be charged twice?', a: 'Never. Phones retry when the network is slow, so every payment needs one unique key.' },
    { q: 'What if the card processor is down?', a: 'Orders must still be accepted and paid when it returns. A shopper should see "order received", not an error.' },
    { q: 'Do all items sell equally?', a: 'No. A handful of doorbusters take a large share of the taps and the stock counts.' }
  ],
  requirements: {
    users: '30 million shoppers on the day (approx.)', monthlyUsers: 30000000, peakRps: 20000,
    mix: { read: 0.55, search: 0.15, write: 0.15, payment: 0.025, login: 0.1, notify: 0.025 }, latencyP99Ms: { default: 500, search: 700, payment: 4000, notify: 30000 }, availability: 0.999,
    dataSafety: 'no-loss', readYourWrites: false, compliance: ['encryption', 'audit-log'], budgetPerMonth: 70000, storageTb: 20,
    userRegions: { us: 0.6, eu: 0.3, asia: 0.1 }, homeRegion: 'us',
    notes: ['About 500 payments a second at the sale-day peak, and 3,000 searches (approx.).', 'The card processor is paid from revenue and is not in this budget.', 'All numbers are rough approximations.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
  requires: {}, palette: null,
  starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
  events: [ { id: 'flash-crowd', at: '06:00', params: { factor: 3 } }, { id: 'hot-key', at: '06:10' }, { id: 'duplicate-delivery', at: '13:00', params: {} }, { id: 'dependency-outage', at: '19:30', params: {} } ],
  eventPool: ['cache-stampede', 'retry-storm', 'bot-scraping'],
  numbers: [
    { label: 'Searches per second at peak', value: 3000, unit: 'req/s', how: '20,000 × 0.15 (approx.)', ask: true },
    { label: 'Payments per second at peak', value: 500, unit: 'payments/s', how: '20,000 × 0.025 (approx.)', ask: true },
    { label: 'Share of taps on the top doorbusters', value: 40, unit: 'percent', how: 'A few dozen deals draw most of the crowd, so a few keys are very hot (approx.)' }
  ],
  hints: [
    'Four different jobs share one site: browsing, searching, the cart and paying. Do they need the same kind of storage?',
    'Serve browsing from a CDN and cache, searching from a search index, carts from a key-value store. Payments go through a queue with one key each.',
    'CDN, rate limiter, load balancer, servers, cache, search index, key-value carts, SQL orders, a queue with workers, an idempotency store, a circuit breaker in front of the processor.'
  ],
  editorial: {
    summary: 'Split the traffic by what it needs. A CDN and a cache take the browsing and the hot doorbuster pages, a search index answers searches, carts live in a fast key-value store, and orders go to SQL. Payments wait in a queue, carry one key each and reach the processor through a circuit breaker, so a bad hour at the processor costs delay, not orders.',
    designs: [ { name: 'Browse from cache, search from an index, pay through a queue', why: 'Each kind of request gets the store that suits it. The queue and the idempotency store make a retry harmless, and the breaker keeps a failing processor from pulling the shop down with it.',
      graph: { nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
        N('cdn', 'cdn', X[1], -100), N('rl', 'rate-limiter', X[1], 50, { units: 2 }), N('lb', 'regional-lb', X[2], 50, { units: 3, zones: 3 }),
        N('api', 'container-cluster', X[3], 50, { units: 40, zones: 3, knobs: { autoscale: { on: true, min: 40, max: 80, targetUtil: 0.6 } } }), N('scale', 'autoscaler', X[3], 190),
        N('cache', 'distributed-cache', X[4], -120, { knobs: { ttlSec: 60 } }), N('search', 'search-index', X[4], -30), N('carts', 'kv-store', X[4], 60, { units: 4 }),
        N('orders', 'sql-primary', X[5], -60, { zones: 2, knobs: { replication: 'sync' } }), N('q', 'queue', X[4], 160), N('wp', 'worker-pool', X[5], 160, { units: 20, zones: 2, knobs: { retries: 3, backoff: 'exponential-jitter' } }),
        N('idem', 'idempotency-store', X[5], 270, { units: 2 }), N('breaker', 'circuit-breaker', X[6], 160), N('proc', 'payment-processor', X[7], 160), N('push', 'push-service', X[6], 60),
        N('kms', 'kms', X[5], -170), N('audit', 'audit-log', X[6], -170), N('metrics', 'metrics', X[3], 300), N('alerts', 'alerting', X[4], 300), N('pager', 'pager', X[5], 360)],
        edges: [['web', 'cdn'], ['app', 'rl'], ['cdn', 'rl'], ['rl', 'lb'], ['lb', 'api'], ['scale', 'api'], ['api', 'cache'], ['api', 'search'], ['api', 'carts'], ['cache', 'orders'], ['api', 'orders'], ['api', 'q'], ['q', 'wp'], ['wp', 'idem'], ['wp', 'breaker'], ['breaker', 'proc'], ['wp', 'push'], ['api', 'kms'], ['api', 'audit'], ['api', 'metrics'], ['metrics', 'alerts'], ['alerts', 'pager']] },
      expect: { score: 880, costPerMonth: 55000 } } ],
    tradeoffs: [
      'A cache and CDN make browsing cheap and fast, but a price or a stock count can be a minute old.',
      'A queue in front of payments keeps the site up when the processor is slow, but the final "paid" message arrives later.',
      'One unique key per payment makes a retry safe, at the price of one more lookup on every payment.',
      'A search index is quick but is a second copy of the catalog, so it can lag behind a price change.'
    ],
    realWorld: 'Marketplaces can see several times their normal traffic in the first minutes of a sale day. A few doorbuster items take a large share of the taps, and card processors are often rate limited or slow during the biggest hours (approx.).'
  },
  daily: true
}
  ]
};
