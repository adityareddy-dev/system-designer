// Healthcare, government and education problems.
// Every number is a rough real-world approximation for teaching.

const n = (ref, type, x, y, extra = {}) => ({ ref, type, x, y, ...extra });
const g = (nodes, edges) => ({ nodes, edges: edges.map((s) => s.split('>')) });
const lock = (ref, type, y) => n(ref, type, -480, y, { locked: true });
const starterWM = () => ({ nodes: [lock('web', 'web-browser', -60), lock('mobile', 'mobile-app', 60)], edges: [] });
const web = n('web', 'web-browser', -480, -60);
const mobile = n('mobile', 'mobile-app', -480, 60);

// ---------------------------------------------------------------- health

const appointmentBooking = {
  id: 'appointment-booking',
  title: 'Clinic appointment booking',
  difficulty: 'Easy',
  concepts: ['consistency', 'queues-backpressure'],
  like: 'booking a doctor\'s visit online',
  brief: 'A group of 60 clinics lets patients find a free slot, book it and get a text reminder. Slots open at 8 am, and the phone lines used to melt. Two people must never get the same slot, and reminders must go out even when the text-message company has a bad hour.',
  clarify: [
    { q: 'Can two patients hold the same slot?', a: 'Never. A double booking means a patient turns up and there is no room for them, so a booked slot must be recorded exactly once.' },
    { q: 'Do reminders have to arrive instantly?', a: 'No. A reminder a few minutes late is fine, but it must not be lost. That means it can wait in a line.' },
    { q: 'How busy is the 8 am rush?', a: 'About six times a normal busy hour, for around ten minutes, when new slots open.' },
    { q: 'Do patients sign in?', a: 'Yes. Records are private, so every booking is tied to a signed-in patient.' }
  ],
  requirements: {
    users: '2 million patients a month (approx.)',
    monthlyUsers: 2000000,
    peakRps: 900,
    mix: { read: 0.45, search: 0.25, write: 0.1, login: 0.12, notify: 0.08 },
    latencyP99Ms: { default: 300, search: 400, notify: 30000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['access-control', 'backups'],
    budgetPerMonth: 3000,
    storageTb: 0.5,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['Peak means the busiest minute of a normal weekday, approx.', 'A reminder text costs about a cent; the cost line is small but real.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
  requires: {},
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'flash-crowd', at: '08:00', params: { factor: 6, rampSec: 60, holdSec: 600, decaySec: 900 } },
    { id: 'third-party-rate-limit', at: '10:30', params: { rpsCapFactor: 0.1, durationSec: 2400 } }
  ],
  eventPool: ['slow-dependency', 'db-failover'],
  numbers: [
    { label: 'Browsing requests at peak (read + search)', value: 630, unit: 'req/s', how: '900 × (0.45 + 0.25)', ask: true },
    { label: 'Bookings at peak', value: 90, unit: 'req/s', how: '900 × 0.10', ask: false },
    { label: 'Requests in the 8 am rush', value: 4300, unit: 'req/s', how: '900 × 0.8 (curve at 8 am) × 6 (rush), approx.', ask: true }
  ],
  hints: [
    'Reminders are not urgent. What lets the work wait without losing it?',
    'Put a queue and a small worker pool between your servers and the text-message service, so a slow provider does not slow patients.',
    'A booking must be exact, so keep slots in a database with transactions and two copies across zones. Add a cache for browsing, and a search index so slot search does not hit the main database.'
  ],
  editorial: {
    summary: 'This is a small, correct system. Browsing is the bulk of the traffic and can be cached; the booking itself is a few requests per second and goes to a real transactional database. Reminders are the only work that talks to an outside company, so they ride a queue.',
    designs: [{
      name: 'Cached browsing, queued reminders',
      why: 'The load balancer spreads patients across three servers in two zones. A cache answers most browsing, a search index answers slot searches, and the SQL database (two copies, synchronous) holds the slots. Reminders wait in a queue so the text provider can be slow or capped without hurting patients.',
      graph: g([
        web, mobile,
        n('lb', 'regional-lb', -320, 0, { units: 2 }),
        n('app', 'vm-fleet', -160, 0, { units: 3, zones: 2, knobs: { autoscale: { on: true, min: 3, max: 10, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -160, -140, { units: 2 }),
        n('cache', 'cache', 0, -40, { knobs: { ttlSec: 60 } }),
        n('db', 'sql-primary', 160, -40, { zones: 2, knobs: { replication: 'sync' } }),
        n('cdc', 'cdc-connector', 160, 60),
        n('search', 'search-index', 320, 60, { units: 2, tier: 'S' }),
        n('q', 'queue', 0, 120),
        n('workers', 'worker-pool', 160, 160, { units: 2 }),
        n('sms', 'sms-provider', 320, 160),
        n('bk', 'backups', 320, -40)
      ], ['web>lb', 'mobile>lb', 'lb>app', 'app>idp', 'app>cache', 'cache>db', 'app>search', 'db>cdc', 'cdc>search', 'app>q', 'q>workers', 'workers>sms', 'bk>db']),
      expect: { score: 900, costPerMonth: 2500 }
    }],
    tradeoffs: [
      'Synchronous replication makes every booking a few milliseconds slower, but a zone failure can never lose or double a booking.',
      'A 60-second cache keeps the database calm but may show a slot that was just taken; the booking step checks again, so nobody is double booked.',
      'The queue adds a short delay to reminders, and in return a text-provider problem never touches patients.',
      'The search index is a copy of the slots, so search can be a few seconds behind. It costs extra but keeps search off the main database.'
    ],
    realWorld: 'Online booking tools for clinic groups commonly handle a few hundred requests a second at the daily peak, and most of that is people looking, not booking (approx.). Text reminders are usually sent through an outside provider that caps how fast you can send.'
  },
  daily: true
};

const healthRecords = {
  id: 'health-records',
  title: 'Patient health records',
  difficulty: 'Medium',
  concepts: ['security-compliance', 'multi-region'],
  like: 'a hospital\'s electronic records',
  brief: 'A hospital network keeps patient charts, orders, notes and scanned documents for 40 hospitals. Doctors need a chart in under a second, nothing may be lost, and an auditor can walk in any day and ask you to prove who looked at what.',
  clarify: [
    { q: 'What happens if the system is down?', a: 'Staff fall back to paper, which is slow and risky. The target is 99.95 percent, about 4 hours of downtime a year at most.' },
    { q: 'Who is allowed to see a chart?', a: 'Only staff involved in that patient\'s care, and every look is written to a log nobody can edit.' },
    { q: 'Can a copy of the records be kept in a second region?', a: 'Yes, under the same privacy contract. That is what makes a regional disaster survivable.' },
    { q: 'What is in the scans?', a: 'X-ray images and signed forms. They are big and rarely change.' }
  ],
  requirements: {
    users: '25,000 staff, 3 million patients (approx.)',
    monthlyUsers: 25000,
    peakRps: 3000,
    mix: { read: 0.66, search: 0.1, write: 0.13, login: 0.06, upload: 0.03, report: 0.02 },
    latencyP99Ms: { default: 300, search: 500, upload: 3000, report: 10000 },
    availability: 0.9995,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['audit-log', 'encryption', 'pii-vault', 'backups', 'access-control', 'retention'],
    budgetPerMonth: 12000,
    storageTb: 120,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['Records are kept for at least 7 years, approx.', 'Sensitive fields are stored apart from the chart.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.6, 'mobile-app': 0.25, 'partner-system': 0.15 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock('web', 'web-browser', -80), lock('mobile', 'mobile-app', 0), lock('partner', 'partner-system', 80)], edges: [] },
  events: [
    { id: 'key-leak', at: '09:30', params: {} },
    { id: 'compliance-audit', at: '11:00', params: {} },
    { id: 'region-outage', at: '14:00', params: { durationSec: 5400 } }
  ],
  eventPool: ['noisy-neighbor', 'db-failover', 'disk-full'],
  numbers: [
    { label: 'Chart views at peak', value: 1980, unit: 'req/s', how: '3,000 × 0.66', ask: true },
    { label: 'Scan uploads at peak', value: 90, unit: 'uploads/s', how: '3,000 × 0.03', ask: false },
    { label: 'Scan storage kept', value: 120, unit: 'TB', how: '3M patients × about 40 MB of scans each, approx.', ask: true }
  ],
  hints: [
    'Three things are asked of you besides speed: prove access, protect keys, survive a lost region. Which elements give each one?',
    'Compliance checks look for an audit log, a key service, a privacy vault, backups and an identity provider. Connect servers to all of them.',
    'Add a disaster-recovery element in a second region. A region outage here lasts about an hour, so only active-active (about a minute to take over) keeps you inside the uptime target. Keep replication synchronous inside the main region, and put scans in object storage.'
  ],
  editorial: {
    summary: 'Records are a correctness and proof problem more than a speed problem. The traffic is moderate; the hard parts are the audit, the leaked key and the lost region. Each has a dedicated element, and the design is mostly about connecting them.',
    designs: [{
      name: 'Proof built in, second region running hot',
      why: 'A WAF guards the front, an identity provider ties every action to a person, and the audit log taps every server. Keys sit in a key service so a leak can be fixed by rotating them. The database has two zones and synchronous copies, and a second region runs active-active, so it takes over in about a minute. It costs about as much as the main system again; a warm standby at about 40 percent would take about 15 minutes, too long for this uptime target.',
      graph: g([
        n('web', 'web-browser', -480, -80), n('mobile', 'mobile-app', -480, 0), n('partner', 'partner-system', -480, 80),
        n('waf', 'waf', -340, 0),
        n('lb', 'regional-lb', -220, 0, { units: 3, zones: 3 }),
        n('app', 'vm-fleet', -90, 0, { units: 10, zones: 3, knobs: { autoscale: { on: true, min: 8, max: 20, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -90, -160, { units: 4 }),
        n('kms', 'kms', 60, -160),
        n('vault', 'privacy-vault', 60, -220),
        n('audit', 'audit-log', 60, 200),
        n('cache', 'cache', 60, -40, { knobs: { ttlSec: 60 } }),
        n('db', 'sql-primary', 220, -40, { tier: 'L', zones: 2, knobs: { replication: 'sync' } }),
        n('cdc', 'cdc-connector', 220, 60),
        n('search', 'search-index', 380, 60, { units: 2, tier: 'S' }),
        n('scans', 'object-storage', 220, 160),
        n('bk', 'backups', 380, -40, { knobs: { retentionDays: 395 } }),
        n('dr', 'disaster-recovery', 380, -120, { knobs: { mode: 'active-active', region: 'eu' } }),
        n('metrics', 'metrics', -90, 160), n('alerts', 'alerting', 0, 240), n('pager', 'pager', 100, 280)
      ], ['web>waf', 'mobile>waf', 'partner>waf', 'waf>lb', 'lb>app', 'app>idp', 'app>kms', 'app>vault', 'app>audit', 'app>cache', 'cache>db', 'app>search', 'db>cdc', 'cdc>search', 'app>scans', 'bk>db', 'dr>db', 'app>metrics', 'metrics>alerts', 'alerts>pager']),
      expect: { score: 880, costPerMonth: 10500 }
    }],
    tradeoffs: [
      'Active-active costs about 100 percent of the main system again and recovers in about a minute. A warm standby costs about 40 percent and takes about 15 minutes; backup-and-restore is far cheaper and takes hours (approx.).',
      'The privacy vault (about $1,000 a month) is a fixed price you pay once, whatever the traffic, to keep sensitive fields in one controlled place.',
      'Key rotation and an audit log do not make traffic faster. They make a bad day short and provable.',
      'Scans in object storage cost a fraction of database storage, but a scan is fetched in a second request after the chart.'
    ],
    realWorld: 'Hospital record systems are often expected to be up 99.9 to 99.99 percent of the time, and health law in many countries requires access logs and encryption. A 120 TB archive of scans is about $2,800 a month in standard object storage (approx.).'
  },
  daily: true
};

const telehealthVideo = {
  id: 'telehealth-video',
  title: 'Telehealth video visits',
  difficulty: 'Medium',
  concepts: ['realtime-connections', 'multi-region'],
  like: 'a video doctor visit',
  brief: 'Patients join a video visit with a doctor from their phone. Most calls go straight between the two people, but the platform runs the waiting room, chat, sign-in, the join link and a relay for the calls that cannot connect directly. A bad minute here means a patient staring at a spinner.',
  clarify: [
    { q: 'Does the platform carry the video itself?', a: 'Only for about 1 call in 7. Most calls connect directly. The game shows that share as a small number of heavy media requests going through a relay.' },
    { q: 'What happens at the top of the hour?', a: 'Many visits start at :00 and :30, so sign-ins and waiting-room messages spike together, about 3 times the normal level for a minute.' },
    { q: 'How do patients find out the visit is ready?', a: 'A text or email with a join link, sent through outside providers.' },
    { q: 'Where are the patients?', a: 'Eight in ten are in North America, two in ten in Europe.' }
  ],
  requirements: {
    users: '800,000 visits a month (approx.)',
    monthlyUsers: 600000,
    peakRps: 3000,
    mix: { message: 0.38, read: 0.25, login: 0.12, write: 0.08, notify: 0.06, upload: 0.05, search: 0.04, live: 0.02 },
    latencyP99Ms: { default: 300, live: 800, upload: 3000, notify: 30000, search: 500 },
    availability: 0.999,
    dataSafety: 'rpo-1m',
    readYourWrites: false,
    compliance: ['access-control', 'encryption'],
    budgetPerMonth: 9000,
    storageTb: 8,
    userRegions: { us: 0.8, eu: 0.2 },
    homeRegion: 'us',
    notes: ['Messages include chat, presence in the waiting room and the signalling that sets up each call.', 'Photos are patient uploads such as a rash; they are small.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.55, 'mobile-app': 0.45 }, params: {} },
  requires: {},
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'thundering-herd', at: '09:00', params: { factor: 3, holdSec: 90 } },
    { id: 'zone-outage', at: '10:15', params: { durationSec: 1800 } },
    { id: 'dependency-outage', at: '14:00', params: { durationSec: 1200 } }
  ],
  eventPool: ['slow-dependency', 'viral-spike', 'cert-expiry'],
  numbers: [
    { label: 'Live waiting-room and call messages at peak', value: 1140, unit: 'msg/s', how: '3,000 × 0.38', ask: true },
    { label: 'Relayed call media at peak', value: 60, unit: 'segments/s', how: '3,000 × 0.02, about 1 MB each, approx.', ask: false },
    { label: 'Open connections at peak', value: 20000, unit: 'sockets', how: 'about 10,000 visits live × 2 people, approx.', ask: true }
  ],
  hints: [
    'Messages are the biggest slice, and they need a live, two-way connection. Which element holds those open?',
    'Spread across three zones so a zone loss only costs a third. A websocket gateway needs a few spare units to take the load of a lost zone.',
    'The relay for call media behaves like an edge cache here. Put reminders behind a queue so an outage at the text provider only delays them.'
  ],
  editorial: {
    summary: 'A visit is mostly a small, live conversation. The game focuses on the part the platform owns: connections, the join moment and the notifications. Two things hurt: the top-of-the-hour herd and losing a zone, and both are solved by spare capacity and a buffer. (In the game an edge cache stands in for the media relay: a simplification.)',
    designs: [{
      name: 'Three zones, live gateway, queued notices',
      why: 'A global load balancer splits patients between regions; the main region runs a websocket gateway across three zones for messages, a server fleet for pages and sign-in, and an edge relay for the call media. Notices go through a queue to both text and email, so one provider outage only delays them.',
      graph: g([
        web, mobile,
        n('glb', 'global-lb', -340, 0),
        n('lb', 'regional-lb', -220, 0, { units: 2, zones: 3 }),
        n('ws', 'websocket-gateway', -90, -120, { units: 4, zones: 3 }),
        n('app', 'vm-fleet', -90, 40, { units: 6, zones: 3, knobs: { autoscale: { on: true, min: 6, max: 20, targetUtil: 0.6 } } }),
        n('relay', 'cdn', -220, -160, { knobs: { ttlSec: 5 } }),
        n('idp', 'identity-provider', -90, 160, { units: 3 }),
        n('kv', 'kv-store', 80, -120, { units: 3 }),
        n('db', 'sql-primary', 80, 60, { zones: 2, knobs: { replication: 'sync' } }),
        n('cdc', 'cdc-connector', 80, 150),
        n('search', 'search-index', 240, 150, { units: 2, tier: 'S' }),
        n('photos', 'object-storage', 240, 40),
        n('q', 'queue', 80, 240),
        n('workers', 'worker-pool', 240, 240, { units: 2 }),
        n('sms', 'sms-provider', 400, 200), n('mail', 'email-provider', 400, 280),
        n('bk', 'backups', 240, -40)
      ], ['web>glb', 'mobile>glb', 'glb>lb', 'glb>relay', 'relay>lb', 'lb>ws', 'lb>app', 'ws>kv', 'app>kv', 'app>db', 'app>idp', 'app>search', 'db>cdc', 'cdc>search', 'app>photos', 'app>q', 'q>workers', 'workers>sms', 'workers>mail', 'bk>db']),
      expect: { score: 880, costPerMonth: 7600 }
    }],
    tradeoffs: [
      'Direct calls between two phones cost the platform almost nothing; relaying every call would multiply the media bill, so the relay only serves calls that need it.',
      'Three zones with spare units cost about a third more than needed on a normal day and keep the visit alive when a building goes dark.',
      'Two notice providers add a little cost and complexity, and mean a text outage does not stop join links.',
      'Treating the waiting room as live messages makes it feel instant, at the price of holding thousands of open connections.'
    ],
    realWorld: 'A single gateway node typically holds about 100,000 idle connections (approx.), so connection count is rarely the limit; bursts at the top of the hour and the notification path are the usual weak points. Relay servers are needed for roughly 10 to 20 percent of video calls.'
  },
  daily: true
};

const pharmacyStock = {
  id: 'pharmacy-stock',
  title: 'Pharmacy stock and refills',
  difficulty: 'Medium',
  concepts: ['replication-lag', 'search-indexing'],
  like: 'a pharmacy chain\'s stock and refill system',
  brief: 'A pharmacy chain with 4,000 stores tracks how many boxes of each medicine every store has, takes refill requests, and shows patients which nearby store has their medicine today. If the system says a store has a box that is gone, a patient makes a wasted trip.',
  clarify: [
    { q: 'How wrong may a stock count be?', a: 'For browsing, a few seconds late is fine. For handing out a controlled medicine, the count must be exact at the moment of sale.' },
    { q: 'Is there a nightly report?', a: 'Yes. Head office runs big stock reports during the night and again in the morning. They are heavy.' },
    { q: 'Is one medicine ever far more popular than others?', a: 'Yes. A flu season or a shortage can make one product ID hold a third of all lookups.' },
    { q: 'Are patients told when a refill is ready?', a: 'Yes, by push or text. It can arrive a minute late, but not twice.' }
  ],
  requirements: {
    users: '9 million patients, 4,000 stores (approx.)',
    monthlyUsers: 9000000,
    peakRps: 2500,
    mix: { read: 0.33, search: 0.25, write: 0.2, event: 0.1, notify: 0.05, login: 0.04, report: 0.03 },
    latencyP99Ms: { default: 300, search: 400, report: 10000, notify: 30000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['audit-log', 'access-control', 'encryption'],
    budgetPerMonth: 9500,
    storageTb: 5,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['Each store sends a stock event every time a box is scanned in or out.', 'A "write" here is a dispense or a refill order.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.35, 'mobile-app': 0.4, 'partner-system': 0.25 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock('web', 'web-browser', -80), lock('mobile', 'mobile-app', 0), lock('stores', 'partner-system', 80)], edges: [] },
  events: [
    { id: 'noisy-neighbor', at: '07:30', params: { factor: 0.4, durationSec: 2400 } },
    { id: 'replication-lag', at: '11:00', params: { lagSec: 45, durationSec: 1200 } },
    { id: 'hot-key', at: '17:00', params: { share: 0.35, durationSec: 3600 } }
  ],
  eventPool: ['db-failover', 'compliance-audit', 'viral-spike'],
  numbers: [
    { label: 'Stock events from scanners at peak', value: 250, unit: 'events/s', how: '2,500 × 0.10', ask: true },
    { label: 'Dispenses and refills at peak', value: 500, unit: 'writes/s', how: '2,500 × 0.20', ask: false },
    { label: 'Searches at peak', value: 625, unit: 'req/s', how: '2,500 × 0.25', ask: true }
  ],
  hints: [
    'Which requests must be exact, and which can be a little behind? Send the first to the main copy and the second to a copy.',
    'Search on "which store has it" is a different job from keeping the count. A search index fed from the database by change data capture is the usual split.',
    'Keep the heavy reports off the live database: feed a data warehouse from the same changes, and cache or spread the one very popular product.'
  ],
  editorial: {
    summary: 'The same stock number is used for two things: an exact count at the till and a roughly-right count for browsing. The design splits them. The database owns the exact count; a search index and a warehouse are copies that can be a little behind and keep their load off it.',
    designs: [{
      name: 'One truth, two copies',
      why: 'A sharded SQL database keeps the exact count with synchronous copies. Change data capture feeds a search index for "which store has it" and a data warehouse for the reports, so a heavy report cannot slow a dispense. Notices and bulk stock events ride queues.',
      graph: g([
        n('web', 'web-browser', -480, -80), n('mobile', 'mobile-app', -480, 0), n('stores', 'partner-system', -480, 80),
        n('lb', 'regional-lb', -340, 0, { units: 2, zones: 2 }),
        n('app', 'vm-fleet', -200, 0, { units: 5, zones: 2, knobs: { autoscale: { on: true, min: 4, max: 14, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -200, -140, { units: 2 }),
        n('cache', 'distributed-cache', -60, -60, { units: 2, knobs: { ttlSec: 5, coalesce: true } }),
        n('db', 'sharded-sql', 100, -20, { units: 3, zones: 2, knobs: { replication: 'sync' } }),
        n('cdc', 'cdc-connector', 100, 100),
        n('search', 'search-index', 260, 100, { units: 2, tier: 'S' }),
        n('wh', 'data-warehouse', 260, 200, { units: 1 }),
        n('q', 'queue', -60, 140),
        n('workers', 'worker-pool', 100, 220, { units: 3 }),
        n('push', 'push-service', 260, 280),
        n('audit', 'audit-log', -60, 260),
        n('bk', 'backups', 260, -60)
      ], ['web>lb', 'mobile>lb', 'stores>lb', 'lb>app', 'app>idp', 'app>cache', 'cache>db', 'app>search', 'app>q', 'q>workers', 'workers>db', 'workers>push', 'db>cdc', 'cdc>search', 'cdc>wh', 'app>wh', 'app>audit', 'bk>db']),
      expect: { score: 870, costPerMonth: 8200 }
    }],
    tradeoffs: [
      'The search index can be a few seconds behind. That is fine for "who has it nearby", and the till still checks the exact count before dispensing.',
      'Reports in a warehouse cost another $1,800 a month and take the heavy job off the live database; running them on the main database is free until a morning where it is not.',
      'A tiny cache with coalescing makes the very popular product cost one database read per few seconds instead of thousands.',
      'Sharding by store spreads writes, but one store\'s big night can still fall on one shard.'
    ],
    realWorld: 'A large pharmacy chain handles on the order of hundreds of stock events a second at peak (approx.), and replica lag in a healthy managed database is usually well under a second, but can reach tens of seconds during heavy writes or maintenance.'
  },
  daily: true
};

const labResults = {
  id: 'lab-results',
  title: 'Lab results portal',
  difficulty: 'Easy',
  concepts: ['caching', 'queues-backpressure', 'idempotency-retries'],
  like: 'a patient portal that shows blood test results',
  brief: 'Labs send results to a portal, patients get a notice that a result is ready and open it. When the notice goes to thousands of people at the same minute, they all open the portal at once. Nobody should get the same notice twice.',
  clarify: [
    { q: 'How fast must a notice go out?', a: 'Within a few minutes of the result arriving. It can wait a little, but never be sent twice.' },
    { q: 'Do many patients open the portal at the same time?', a: 'Yes. A weekday 7 am batch of results notifies thousands at once, and about ten times the normal traffic arrives within a minute.' },
    { q: 'Can the queue ever deliver a message twice?', a: 'Yes, queues occasionally deliver the same message again, about 1 in 100 here. The notice step has to cope.' },
    { q: 'Who is sending the results?', a: 'Partner labs, through an approved connection.' }
  ],
  requirements: {
    users: '1.2 million patients a month (approx.)',
    monthlyUsers: 1200000,
    peakRps: 700,
    mix: { read: 0.58, login: 0.15, write: 0.12, notify: 0.12, report: 0.03 },
    latencyP99Ms: { default: 300, report: 10000, notify: 30000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: false,
    compliance: ['access-control', 'backups', 'encryption', 'audit-log'],
    budgetPerMonth: 3200,
    storageTb: 2,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['A "write" is a lab sending a result in.', 'A "report" is a clinic printing a monthly summary.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.5, 'mobile-app': 0.4, 'partner-system': 0.1 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock('web', 'web-browser', -80), lock('mobile', 'mobile-app', 0), lock('labs', 'partner-system', 80)], edges: [] },
  events: [
    { id: 'duplicate-delivery', at: '03:00', params: { share: 0.01, durationSec: 3600 } },
    { id: 'flash-crowd', at: '07:00', params: { factor: 10, rampSec: 60, holdSec: 600, decaySec: 1200 } }
  ],
  eventPool: ['slow-dependency', 'db-failover'],
  numbers: [
    { label: 'Result views at peak', value: 406, unit: 'req/s', how: '700 × 0.58', ask: true },
    { label: 'Notices at peak', value: 84, unit: 'notices/s', how: '700 × 0.12', ask: false },
    { label: 'Views in the 7 am rush', value: 5600, unit: 'req/s', how: '700 × 0.8 (curve at 7 am) × 10 (rush), approx.', ask: true }
  ],
  hints: [
    'Most traffic is reading the same result list again and again. What remembers an answer for a minute?',
    'Notices are not urgent but must not repeat. A queue holds them; something must remember which ones have gone out.',
    'Put an idempotency store next to the worker that sends the notice, then send through push and email providers.'
  ],
  editorial: {
    summary: 'Three simple ideas make this a solid small system: a cache for the repeated reads, a queue for the notices that can wait, and an idempotency store so a repeated queue message does not become a repeated notice.',
    designs: [{
      name: 'Cached views, queue and a once-only notice',
      why: 'Servers in two zones sit behind a load balancer; a short cache answers repeated result views; the SQL database stores results. Notices go through a queue to a worker, which asks the idempotency store whether this notice was already sent.',
      graph: g([
        web, mobile, n('labs', 'partner-system', -480, 140),
        n('lb', 'regional-lb', -340, 0),
        n('app', 'vm-fleet', -200, 0, { units: 3, zones: 2, knobs: { autoscale: { on: true, min: 3, max: 12, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -200, -140, { units: 2 }),
        n('cache', 'cache', -60, -40, { knobs: { ttlSec: 60 } }),
        n('db', 'sql-primary', 100, -40, { zones: 2, knobs: { replication: 'sync' } }),
        n('q', 'queue', -60, 100),
        n('workers', 'worker-pool', 100, 140, { units: 2 }),
        n('idem', 'idempotency-store', 100, 230),
        n('push', 'push-service', 260, 120), n('mail', 'email-provider', 260, 190),
        n('kms', 'kms', -60, -140), n('audit', 'audit-log', -60, 240), n('bk', 'backups', 260, -40)
      ], ['web>lb', 'mobile>lb', 'labs>lb', 'lb>app', 'app>idp', 'app>cache', 'cache>db', 'app>q', 'q>workers', 'workers>idem', 'workers>push', 'workers>mail', 'app>kms', 'app>audit', 'bk>db']),
      expect: { score: 900, costPerMonth: 2300 }
    }],
    tradeoffs: [
      'A 60-second cache keeps the database calm in the rush and means a brand-new result can take up to a minute to appear for a patient who already looked.',
      'The idempotency store costs about $100 a month and removes the one embarrassing failure: a patient getting the same alert three times.',
      'Two notice channels (push and email) cost a little more and give you a fallback when one is slow.',
      'The queue absorbs the 7 am wave of notices; the cost is that the last patients in the wave get theirs a minute later.'
    ],
    realWorld: 'Patient portals commonly see their daily peak just after results are released, and queues in most managed services deliver at least once, meaning a duplicate now and then is normal (approx.). Receiving the same alert twice is among the top complaints about notification systems.'
  },
  daily: true
};

const vaccineSignupSurge = {
  id: 'vaccine-signup-surge',
  title: 'Vaccine sign-up surge',
  difficulty: 'Hard',
  concepts: ['rate-limiting', 'queues-backpressure'],
  like: 'a county vaccine sign-up site',
  brief: 'A county opens 80,000 vaccine appointments at 8 am. Within seconds, thousands of people reload and bots try to grab slots. The site must stay up, never sell the same slot twice, and be fair to people on a phone with a poor signal.',
  clarify: [
    { q: 'How many people show up at once?', a: 'About forty times the usual traffic for the first fifteen minutes after 8 am, then it falls back.' },
    { q: 'Is it fine to make people wait?', a: 'Yes, if it is fair and clear. A short wait is better than an error page. Failing and reloading makes it worse.' },
    { q: 'Are bots a problem?', a: 'Yes. Scripts try to book many slots and resell them. About half as much bot traffic as human traffic shows up a few minutes in.' },
    { q: 'What if the database fails mid-rush?', a: 'Bookings must not be lost or doubled. A short stall is acceptable; a wrong slot count is not.' }
  ],
  requirements: {
    users: '4 million residents; 600,000 try on launch day (approx.)',
    monthlyUsers: 600000,
    peakRps: 3000,
    mix: { read: 0.5, search: 0.15, write: 0.1, login: 0.15, notify: 0.06, event: 0.04 },
    latencyP99Ms: { default: 500, search: 600, notify: 60000 },
    availability: 0.995,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['access-control', 'backups', 'audit-log'],
    budgetPerMonth: 9000,
    storageTb: 1,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['Base traffic is about a tenth of the peak number; the 8 am rush multiplies it.', 'The event is a one-off, so capacity you rent for an hour counts only for an hour.']
  },
  traffic: { curve: 'drop', sources: { 'web-browser': 0.65, 'mobile-app': 0.35 }, params: { dropAt: '08:00' } },
  requires: {},
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'flash-crowd', at: '08:00', params: { factor: 40, rampSec: 20, holdSec: 900, decaySec: 1800 } },
    { id: 'bot-scraping', at: '08:05', params: { factorOfPeak: 0.5, types: ['login', 'read', 'write'], durationSec: 3600 } },
    { id: 'db-failover', at: '08:20', params: { durationSec: 90 } }
  ],
  eventPool: ['ddos-attack', 'third-party-rate-limit', 'bad-deploy'],
  numbers: [
    { label: 'Normal-day traffic', value: 300, unit: 'req/s', how: '3,000 × 0.1 (flat day)', ask: false },
    { label: 'Rush at 8:00', value: 12000, unit: 'req/s', how: '300 × 40', ask: true },
    { label: 'Slot booking attempts in the rush', value: 1200, unit: 'writes/s', how: '12,000 × 0.10', ask: true }
  ],
  hints: [
    'The slot list is the same for everyone. Which element can answer thousands of people with one copy that is a few seconds old?',
    'A rate limiter protects the rest from bots and from people reloading. It turns hard failure into a polite "try again".',
    'Keep the exact slot count in a database with two zones and synchronous copies, read most lists from a replica, and let servers autoscale.'
  ],
  editorial: {
    summary: 'The rush is 40 times normal and lasts a quarter hour. The answer is to refuse some load gently, copy the answers that are the same for everyone, and protect the one thing that has to be exact: the slot count.',
    designs: [{
      name: 'Limit, copy, scale, keep one truth',
      why: 'A CDN holds the slot list for a few seconds. A WAF and rate limiter drop bots and reloaders. The app autoscales behind a load balancer; the SQL primary (XL, synchronous, two zones) owns the slot count; a replica serves lists. Notices and analytics go through a queue.',
      graph: g([
        web, mobile,
        n('cdn', 'cdn', -360, -120, { knobs: { ttlSec: 5, coalesce: true } }),
        n('waf', 'waf', -360, 60),
        n('rl', 'rate-limiter', -240, 60, { units: 2, knobs: { limitRps: 5 } }),
        n('lb', 'regional-lb', -120, 0, { units: 4, zones: 2 }),
        n('app', 'vm-fleet', 20, 0, { units: 10, zones: 2, knobs: { autoscale: { on: true, min: 10, max: 60, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', 20, -140, { units: 6 }),
        n('db', 'sql-primary', 180, 0, { tier: 'XL', zones: 2, knobs: { replication: 'sync' } }),
        n('replica', 'sql-replica', 180, -120, { units: 3, tier: 'L' }),
        n('cdc', 'cdc-connector', 180, 100),
        n('search', 'search-index', 340, 100, { units: 2 }),
        n('q', 'queue', 20, 140),
        n('workers', 'worker-pool', 180, 200, { units: 4 }),
        n('sms', 'sms-provider', 340, 200),
        n('audit', 'audit-log', 20, 260), n('bk', 'backups', 340, 0)
      ], ['web>cdn', 'mobile>cdn', 'web>waf', 'mobile>waf', 'cdn>lb', 'waf>rl', 'rl>lb', 'lb>app', 'app>idp', 'app>db', 'db>replica', 'app>replica', 'app>search', 'db>cdc', 'cdc>search', 'app>q', 'q>workers', 'workers>db', 'workers>sms', 'app>audit', 'bk>db']),
      expect: { score: 840, costPerMonth: 8100 }
    }],
    tradeoffs: [
      'A 5-second CDN copy of the slot list may show a slot that has just gone. The booking step is the source of truth, so the worst case is a polite "that slot was just taken".',
      'The rate limiter will turn away a few honest people who reload quickly. That is the price of keeping the site up for everyone else.',
      'A bigger single database (XL) is simple and holds everything in one place, but it is one box; the failover takes about a minute and bookings pause meanwhile.',
      'A waiting room (a queue in front of the whole site) is the fairest design, and costs the most to build; this design is the lean alternative.'
    ],
    realWorld: 'Public vaccine sites in 2021 regularly saw 20 to 100 times their usual traffic within a minute of slots opening (approx.), and the ones that stayed up usually put a queue or waiting room in front and cached everything that was the same for all visitors.'
  },
  daily: true
};

// ------------------------------------------------------------ government

const taxDeadlineSurge = {
  id: 'tax-deadline-surge',
  title: 'Tax filing deadline',
  difficulty: 'Hard',
  concepts: ['queues-backpressure', 'autoscaling', 'security-compliance'],
  like: 'a national tax filing site',
  brief: 'A national tax site lets 30 million people file online. Most wait until deadline day, and traffic climbs all evening to a final-hour rush. People upload forms, check what they owe and pay. A mistake in a payment or a leak of tax data is a national story.',
  clarify: [
    { q: 'When is the rush?', a: 'The deadline is 23:30 on the last day. Traffic builds from the afternoon and peaks in the final hour at about three times the already high evening level.' },
    { q: 'Can a payment be taken twice?', a: 'Never. Every payment must happen exactly once, even when the person presses pay again or their phone retries.' },
    { q: 'What if the identity-check provider rate-limits us?', a: 'It happens in the rush. Sign-ins that cannot be verified right now must wait, not fail forever.' },
    { q: 'What does an auditor ask for?', a: 'Proof of an audit trail, encryption, isolated personal data, backups, signed-in access and retention for years.' }
  ],
  requirements: {
    users: '30 million filers over the season (approx.)',
    monthlyUsers: 30000000,
    peakRps: 8000,
    mix: { read: 0.42, write: 0.22, login: 0.15, notify: 0.08, upload: 0.06, payment: 0.04, report: 0.03 },
    latencyP99Ms: { default: 600, upload: 4000, report: 10000, payment: 3000, notify: 60000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['audit-log', 'encryption', 'pii-vault', 'backups', 'access-control', 'retention'],
    budgetPerMonth: 30000,
    storageTb: 80,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['The deadline-day curve climbs to 1.0 at 23:30, and an extra rush on top triples the last stretch.', 'A "write" is saving a draft or submitting a return.']
  },
  traffic: { curve: 'deadline', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: { deadlineAt: '23:30' } },
  requires: { payment: [['payment-processor']] },
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'compliance-audit', at: '15:00', params: { checks: ['audit-log', 'encryption', 'pii-vault', 'backups', 'access-control', 'retention'] } },
    { id: 'deadline-surge', at: '18:00', params: { factor: 3, rampSec: 14400, holdSec: 3600, decaySec: 600 } },
    { id: 'third-party-rate-limit', at: '22:00', params: { rpsCapFactor: 0.5, durationSec: 3600 } }
  ],
  eventPool: ['db-failover', 'bot-scraping', 'bad-deploy'],
  numbers: [
    { label: 'Final-hour peak', value: 24000, unit: 'req/s', how: '8,000 × 3 (rush)', ask: true },
    { label: 'Payments in the final hour', value: 960, unit: 'payments/s', how: '24,000 × 0.04', ask: true },
    { label: 'Forms stored', value: 80, unit: 'TB', how: '30M returns × about 2.7 MB each, approx.', ask: false }
  ],
  hints: [
    'The load arrives slowly and then all at once. What element adds servers as the day builds, and why will it still be late?',
    'Anything that can wait should: uploads, notices and receipts go through a queue and workers, so the front stays fast.',
    'Payments need an idempotency store in front of the payment processor. Compliance wants an audit log, a key service, a privacy vault, backups and an identity provider.'
  ],
  editorial: {
    summary: 'Three things matter. Absorb a very big climb with autoscaling and a cache for what is the same for everyone. Keep slow work off the live path with queues. And prove safety: exactly-once payments and a full compliance set.',
    designs: [{
      name: 'Autoscaled front, queued back, once-only payments',
      why: 'A CDN carries forms and static pages, a WAF and rate limiter keep abuse out, and an autoscaled container cluster does the live work. A distributed cache and a sharded SQL database hold the returns. Uploads, notices and receipts go via queues to workers. Payments go through an idempotency store to the processor.',
      graph: g([
        web, mobile,
        n('cdn', 'cdn', -380, -140, { knobs: { ttlSec: 3600 } }),
        n('waf', 'waf', -380, 40),
        n('rl', 'rate-limiter', -260, 40, { units: 4, knobs: { limitRps: 10 } }),
        n('lb', 'regional-lb', -140, 0, { units: 6, zones: 3 }),
        n('app', 'container-cluster', 0, 0, { units: 20, zones: 3, knobs: { autoscale: { on: true, min: 20, max: 80, targetUtil: 0.55 } } }),
        n('idp', 'identity-provider', 0, -160, { units: 12 }),
        n('verify', 'identity-verification', 160, -160),
        n('cache', 'distributed-cache', 160, -60, { units: 4, knobs: { ttlSec: 60, coalesce: true } }),
        n('db', 'sharded-sql', 320, -20, { units: 6, zones: 2, knobs: { replication: 'sync' } }),
        n('q', 'queue', 0, 140),
        n('workers', 'worker-pool', 160, 160, { units: 12, knobs: { autoscale: { on: true, min: 8, max: 40, targetUtil: 0.6 } } }),
        n('files', 'object-storage', 320, 140),
        n('mail', 'email-provider', 320, 220),
        n('idem', 'idempotency-store', 160, 60, { units: 3 }),
        n('pay', 'payment-processor', 320, 80),
        n('kms', 'kms', 0, 240), n('vault', 'privacy-vault', 100, 280), n('audit', 'audit-log', 200, 280),
        n('bk', 'backups', 480, -20, { knobs: { retentionDays: 395 } }),
        n('metrics', 'metrics', -140, 140), n('alerts', 'alerting', -140, 220), n('pager', 'pager', -140, 290)
      ], ['web>cdn', 'mobile>cdn', 'web>waf', 'mobile>waf', 'cdn>lb', 'waf>rl', 'rl>lb', 'lb>app', 'app>idp', 'idp>verify', 'app>cache', 'cache>db', 'app>q', 'q>workers', 'workers>files', 'workers>mail', 'app>idem', 'app>pay', 'app>kms', 'app>vault', 'app>audit', 'bk>db', 'lb>metrics', 'metrics>alerts', 'alerts>pager']),
      expect: { score: 800, costPerMonth: 26000 }
    }],
    tradeoffs: [
      'Autoscaling takes a few minutes to add servers, so the design pre-sizes to 20 and scales on a climb that starts hours early. A sudden minute-long jump would still hurt.',
      'The queue lets the site accept a return in a moment and finish processing it later; the person sees "received" and gets a confirmation after.',
      'Idempotency keys cost about $300 a month here and turn "press pay twice" from a double charge into a no-op.',
      'The compliance set (vault, key service, audit, backups) is a fixed price of a few thousand dollars; skipping it is cheaper until the audit.'
    ],
    realWorld: 'National filing sites commonly take a large share of their season\'s returns in the last two or three days (approx.). Identity-check and payment partners are the usual limits in the final hour, and many agencies pre-scale and rehearse load for it.'
  },
  daily: true
};

const onlineExam = {
  id: 'online-exam',
  title: 'Online exam',
  difficulty: 'Medium',
  concepts: ['realtime-connections', 'multi-region'],
  like: 'a timed online exam for 200,000 students',
  brief: 'A national board runs a two-hour online exam for 200,000 students in three regions at the same time. Answers save automatically every half minute, a live heartbeat shows the student is still there, and proctoring marks suspicious events. Every saved answer matters. A minute of outage at the wrong time is a national story.',
  clarify: [
    { q: 'Can the exam start late for everyone?', a: 'Yes, if it must. But students already inside cannot lose answers or time.' },
    { q: 'How often does a student\'s browser talk to us?', a: 'An autosave about every 30 seconds and a heartbeat about every 20 seconds, so the load is steady and large.' },
    { q: 'Is the sign-in rush at the start?', a: 'Yes. Most students sign in within a few minutes before 9 am, about three times the normal level.' },
    { q: 'What does an expired certificate do?', a: 'Browsers refuse to connect at all. Everyone is locked out until someone finds and replaces it.' }
  ],
  requirements: {
    users: '200,000 students at the same time (approx.)',
    monthlyUsers: 200000,
    peakRps: 25000,
    mix: { message: 0.4, write: 0.25, read: 0.17, login: 0.1, event: 0.08 },
    latencyP99Ms: { default: 400, login: 1500 },
    availability: 0.9995,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['access-control', 'backups', 'audit-log'],
    budgetPerMonth: 20000,
    storageTb: 2,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 },
    homeRegion: 'us',
    notes: ['Load is nearly flat during the exam window and falls to almost nothing after.', 'Heartbeats are small and can be lost; saved answers cannot.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.8, 'mobile-app': 0.2 }, params: {} },
  requires: {},
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'thundering-herd', at: '08:55', params: { factor: 3, holdSec: 300, types: ['login', 'message', 'read'] } },
    { id: 'cert-expiry', at: '09:40', params: {} },
    { id: 'zone-outage', at: '10:10', params: { durationSec: 1800 } }
  ],
  eventPool: ['network-partition', 'bad-config-push', 'dns-misconfig'],
  numbers: [
    { label: 'Autosaves at peak', value: 6700, unit: 'writes/s', how: '200,000 students ÷ 30 s', ask: true },
    { label: 'Heartbeats at peak', value: 10000, unit: 'msg/s', how: '200,000 students ÷ 20 s (approx.)', ask: true },
    { label: 'Open connections', value: 200000, unit: 'sockets', how: 'one per student, about 2 gateway nodes per 200k at 100k each, approx.', ask: false }
  ],
  hints: [
    'Every student is far from at least one region. A global load balancer sends each to the nearest healthy one.',
    'Saved answers must not be lost, so use a store that spans zones with synchronous copies; heartbeats can go to a fast key-value store.',
    'A certificate that expires silently is a detection problem: a synthetic probe plus alerting and a pager find it in a minute, and a config or secrets service lets you fix it fast.'
  ],
  editorial: {
    summary: 'The traffic is a steady, large, write-heavy stream from three continents. Put a front in each region, keep answers in a replicated store, and make a silent failure loud: a certificate or a bad push should page someone within a minute.',
    designs: [{
      name: 'Three fronts, one safe answer store',
      why: 'A global load balancer sends each student to a regional front. Each front runs its own servers; heartbeats go to a key-value store and answers to a distributed SQL database spread over three zones. A synthetic probe, alerting and a pager catch a certificate failure fast, and a secrets and config service lets the team replace it.',
      graph: g([
        web, mobile,
        n('glb', 'global-lb', -360, 0),
        n('lbus', 'regional-lb', -240, -140, { units: 3, zones: 3, region: 'us' }),
        n('lbeu', 'regional-lb', -240, 0, { units: 2, zones: 3, region: 'eu' }),
        n('lbap', 'regional-lb', -240, 140, { units: 2, zones: 3, region: 'apac' }),
        n('appus', 'vm-fleet', -100, -140, { units: 10, zones: 3, region: 'us', knobs: { autoscale: { on: true, min: 10, max: 30, targetUtil: 0.6 } } }),
        n('appeu', 'vm-fleet', -100, 0, { units: 6, zones: 3, region: 'eu', knobs: { autoscale: { on: true, min: 6, max: 20, targetUtil: 0.6 } } }),
        n('appap', 'vm-fleet', -100, 140, { units: 4, zones: 3, region: 'apac', knobs: { autoscale: { on: true, min: 4, max: 14, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', 40, -240, { units: 6 }),
        n('kv', 'kv-store', 200, -100, { units: 5 }),
        n('db', 'distributed-sql', 200, 40, { units: 5, zones: 3 }),
        n('cache', 'distributed-cache', 40, -60, { units: 2, knobs: { ttlSec: 60 } }),
        n('audit', 'audit-log', 200, 160),
        n('bk', 'backups', 360, 40),
        n('secrets', 'secrets-manager', 40, 240), n('cfg', 'config-service', 140, 240),
        n('probe', 'synthetic-probe', -360, 200), n('metrics', 'metrics', -240, 240), n('alerts', 'alerting', -240, 300), n('pager', 'pager', -240, 360)
      ], ['web>glb', 'mobile>glb', 'glb>lbus', 'glb>lbeu', 'glb>lbap', 'lbus>appus', 'lbeu>appeu', 'lbap>appap', 'appus>idp', 'appeu>idp', 'appap>idp', 'appus>cache', 'appeu>cache', 'appap>cache', 'cache>db', 'appus>kv', 'appeu>kv', 'appap>kv', 'appus>audit', 'bk>db', 'secrets>appus', 'cfg>appus', 'glb>probe', 'glb>metrics', 'metrics>alerts', 'alerts>pager']),
      expect: { score: 830, costPerMonth: 15500 }
    }],
    tradeoffs: [
      'A key-value store for heartbeats is cheap and fast; sending heartbeats to the answer database would triple its cost for data nobody keeps.',
      'A global store spanning regions adds round-trip time for far-away students, so answers are saved in the nearest copy and replicated; a lost region costs a few seconds of replay, not an exam.',
      'A probe and a pager add little to the bill and cut the detection of a silent failure from 15 or more minutes to about one.',
      'Overprovisioning for the start rush is cheap for two hours and wasteful for the other 22; autoscale and short pre-warming keep the average low.'
    ],
    realWorld: 'Large remote exams have been taken by hundreds of thousands at once; the typical failure was not capacity but a shared dependency such as identity, a certificate or a single region (approx.). A synthetic check that logs in every minute catches many of those.'
  },
  daily: true
};

const courseEnrollmentDay = {
  id: 'course-enrollment-day',
  title: 'Course enrollment day',
  difficulty: 'Medium',
  concepts: ['hot-keys', 'rate-limiting'],
  like: 'a university\'s registration day',
  brief: 'Registration opens at 9 am for 40,000 students, and a handful of popular courses have only 30 seats each. Everyone clicks "enroll" at the same moment, and when the page is slow they click again. A seat must go to exactly one student.',
  clarify: [
    { q: 'How wrong can the seat count shown on the page be?', a: 'A few seconds late is fine. The final check happens when you press enroll.' },
    { q: 'Can a student enroll twice in the same course?', a: 'No. A repeated click or a retry must not count twice, and must not take two seats.' },
    { q: 'What happens at 9:00?', a: 'About twelve times normal traffic for fifteen minutes, with a third of all lookups going to the same few courses.' },
    { q: 'Do students retry on errors?', a: 'Yes. When a page fails they click again quickly, which makes things worse.' }
  ],
  requirements: {
    users: '40,000 students, 12 courses each (approx.)',
    monthlyUsers: 40000,
    peakRps: 4000,
    mix: { read: 0.48, search: 0.2, write: 0.12, login: 0.15, notify: 0.05 },
    latencyP99Ms: { default: 400, search: 500, notify: 60000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: false,
    compliance: ['access-control', 'backups'],
    budgetPerMonth: 5000,
    storageTb: 0.2,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['A "write" is an enroll, a drop or a swap.', 'Seat counts shown on the page may be a little behind; the booking is exact.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.75, 'mobile-app': 0.25 }, params: {} },
  requires: {},
  palette: null,
  starter: starterWM(),
  events: [
    { id: 'flash-crowd', at: '09:00', params: { factor: 12, rampSec: 30, holdSec: 900, decaySec: 1800 } },
    { id: 'hot-key', at: '09:00', params: { share: 0.3, durationSec: 1800 } },
    { id: 'retry-storm', at: '09:05', params: {} }
  ],
  eventPool: ['db-failover', 'slow-dependency', 'bad-deploy'],
  numbers: [
    { label: 'Rush at 9:00', value: 38000, unit: 'req/s', how: '4,000 × 0.8 (curve at 9) × 12', ask: true },
    { label: 'Enroll attempts in the rush', value: 4600, unit: 'writes/s', how: '38,000 × 0.12', ask: true },
    { label: 'Requests for the hottest course', value: 11000, unit: 'req/s', how: '38,000 × 0.3', ask: false }
  ],
  hints: [
    'A third of the traffic wants the same few rows. What keeps one row from being the whole database\'s problem?',
    'Slow the retries at the door: a rate limiter per student stops the retry storm from feeding itself.',
    'Send enroll requests through a queue so seats are granted one at a time in order, add an idempotency store so a double click is one enroll, and serve course pages from a replica or CDN.'
  ],
  editorial: {
    summary: 'Seats are a hot row. Reads of the course page can be copied; the seat grant cannot, so it is serialised through a queue. Rate limiting and an idempotency store turn the panic of retries into harmless noise.',
    designs: [{
      name: 'Copy the pages, queue the seats',
      why: 'A CDN and a replica answer the course pages from copies. A per-student rate limiter flattens the clicking. Enroll requests ride a queue to workers that update the primary one at a time, and an idempotency store makes a repeated enroll a no-op.',
      graph: g([
        web, mobile,
        n('cdn', 'cdn', -380, -120, { knobs: { ttlSec: 5, coalesce: true } }),
        n('rl', 'rate-limiter', -380, 40, { units: 2, knobs: { limitRps: 3 } }),
        n('lb', 'regional-lb', -240, 0, { units: 3, zones: 2 }),
        n('app', 'vm-fleet', -100, 0, { units: 8, zones: 2, knobs: { autoscale: { on: true, min: 6, max: 24, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -100, -140, { units: 4 }),
        n('q', 'queue', 40, 100, { knobs: { mode: 'fifo' } }),
        n('workers', 'worker-pool', 180, 100, { units: 3 }),
        n('idem', 'idempotency-store', 180, 200, { units: 2 }),
        n('db', 'sql-primary', 300, 0, { tier: 'L', zones: 2, knobs: { replication: 'sync' } }),
        n('replica', 'sql-replica', 300, -120, { units: 2 }),
        n('cdc', 'cdc-connector', 300, 100),
        n('search', 'search-index', 440, 100, { units: 2, tier: 'S' }),
        n('mail', 'email-provider', 440, 200),
        n('bk', 'backups', 440, 0)
      ], ['web>cdn', 'mobile>cdn', 'web>rl', 'mobile>rl', 'cdn>lb', 'rl>lb', 'lb>app', 'app>idp', 'app>replica', 'app>search', 'app>q', 'q>workers', 'workers>idem', 'workers>db', 'workers>mail', 'db>replica', 'db>cdc', 'cdc>search', 'bk>db']),
      expect: { score: 860, costPerMonth: 4100 }
    }],
    tradeoffs: [
      'A strict queue grants seats in order and keeps the database calm, but each student waits a moment longer to hear "you got in".',
      'A 5-second page copy can show "1 seat left" when it is gone; the queue decides, and the student sees a clear message.',
      'A per-student limit of 3 per second never bothers a normal person and removes most of the retry storm.',
      'Splitting a hot course into several counters is faster still, but complicates fairness; the queue is simpler to explain.'
    ],
    realWorld: 'University registration systems have long been known for crashing at the minute seats open; typical fixes are staggered start times by year, queues for the enroll step and aggressive caching of course lists (approx.).'
  },
  daily: true
};

const benefitsPortal = {
  id: 'benefits-portal',
  title: 'Benefits application portal',
  difficulty: 'Easy',
  concepts: ['queues-backpressure', 'security-compliance'],
  like: 'a state benefits site',
  brief: 'People apply for food, health or housing help on a state site. Forms are long, people save drafts and upload documents, and a caseworker team reviews each one. The last week of the month is busy, and an auditor checks the privacy and access controls once a year.',
  clarify: [
    { q: 'Can an application be lost?', a: 'No. Someone may be applying for help to eat. A saved form must stay saved.' },
    { q: 'How fast must an email "we got your application" go out?', a: 'Within minutes. It can wait in a line when the site is busy.' },
    { q: 'When is it busy?', a: 'The closing days of a month can bring four times the usual traffic over several hours.' },
    { q: 'Who looks at the forms afterwards?', a: 'Caseworkers, through an admin tool that runs heavy reports.' }
  ],
  requirements: {
    users: '1.5 million applicants a year (approx.)',
    monthlyUsers: 400000,
    peakRps: 300,
    mix: { read: 0.54, write: 0.2, login: 0.15, upload: 0.04, notify: 0.05, report: 0.02 },
    latencyP99Ms: { default: 500, upload: 5000, report: 10000, notify: 60000 },
    availability: 0.995,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['access-control', 'backups', 'audit-log', 'encryption', 'retention'],
    budgetPerMonth: 2200,
    storageTb: 10,
    userRegions: { us: 1 },
    homeRegion: 'us',
    notes: ['Public agencies often have small budgets; cost counts.', 'A "write" is saving a draft or submitting an application.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.55, 'mobile-app': 0.3, 'admin-console': 0.15 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock('web', 'web-browser', -80), lock('mobile', 'mobile-app', 0), lock('staff', 'admin-console', 80)], edges: [] },
  events: [
    { id: 'compliance-audit', at: '10:00', params: { checks: ['access-control', 'backups', 'audit-log', 'encryption', 'retention'] } },
    { id: 'deadline-surge', at: '12:00', params: { factor: 4, rampSec: 21600, holdSec: 3600, decaySec: 900 } }
  ],
  eventPool: ['slow-dependency', 'db-failover', 'disk-full'],
  numbers: [
    { label: 'Page views and saves at peak', value: 222, unit: 'req/s', how: '300 × (0.54 + 0.20)', ask: true },
    { label: 'Evening surge peak', value: 1200, unit: 'req/s', how: '300 × 4', ask: true },
    { label: 'Documents stored', value: 10, unit: 'TB', how: '1.5M applicants × about 7 MB, approx.', ask: false }
  ],
  hints: [
    'Which work can wait a few minutes without anyone minding?',
    'Confirmation emails and big reports can use a queue and workers. Uploaded documents belong in object storage, not the database.',
    'The audit wants a signed-in identity, an audit log, key-managed encryption, backups and a retention rule. Connect servers to each.'
  ],
  editorial: {
    summary: 'This is a patient, correct system. The surge is slow and moderate, so a small autoscaled fleet and a cache are enough. The point is to build proof in from day one: identity, audit, encryption, backups, retention.',
    designs: [{
      name: 'Small, safe, audit-ready',
      why: 'A load balancer fronts three servers in two zones. Applications live in a two-zone SQL database; documents go to object storage; confirmation emails are queued. Identity, a key service, an audit log and backups give the auditor what they need.',
      graph: g([
        web, mobile, n('staff', 'admin-console', -480, 140),
        n('lb', 'regional-lb', -340, 0),
        n('app', 'vm-fleet', -200, 0, { units: 3, zones: 2, knobs: { autoscale: { on: true, min: 3, max: 10, targetUtil: 0.6 } } }),
        n('idp', 'identity-provider', -200, -140, { units: 2 }),
        n('cache', 'cache', -60, -40, { knobs: { ttlSec: 60 } }),
        n('db', 'sql-primary', 100, -40, { zones: 2, knobs: { replication: 'sync' } }),
        n('replica', 'sql-replica', 100, -150),
        n('docs', 'object-storage', 100, 60),
        n('q', 'queue', -60, 120),
        n('workers', 'worker-pool', 100, 150, { units: 2 }),
        n('mail', 'email-provider', 260, 150),
        n('kms', 'kms', -60, -150), n('audit', 'audit-log', -60, 240),
        n('bk', 'backups', 260, -40, { knobs: { retentionDays: 395 } })
      ], ['web>lb', 'mobile>lb', 'staff>lb', 'lb>app', 'app>idp', 'app>cache', 'cache>db', 'db>replica', 'app>replica', 'app>docs', 'app>q', 'q>workers', 'workers>mail', 'app>kms', 'app>audit', 'bk>db']),
      expect: { score: 890, costPerMonth: 1700 }
    }],
    tradeoffs: [
      'Pointing the caseworker reports at a replica keeps the heavy queries away from people saving forms, at the price of a second database.',
      'Synchronous copies make saves a few milliseconds slower and mean a zone failure cannot lose an application.',
      'Object storage for documents is a fraction of the cost of database storage and is retained cheaply for years.',
      'A modest 99.5 percent target is about 3.6 hours of downtime a month; going higher would need a second region and costs far more than this budget allows.'
    ],
    realWorld: 'State benefits systems are often judged on how they behave in the last days of a month or a sign-up period, not on average load (approx.). Many run on a few servers and one database and rely on queues for notices and on cloud storage for scanned documents.'
  },
  daily: true
};

export default {
  group: {
    id: 'health-gov-edu',
    title: 'Health, government and education',
    blurb: 'Systems where a mistake affects someone\'s care, money or exam: records, bookings, surges, deadlines and proof.'
  },
  problems: [
    appointmentBooking,
    labResults,
    benefitsPortal,
    healthRecords,
    telehealthVideo,
    pharmacyStock,
    courseEnrollmentDay,
    onlineExam,
    vaccineSignupSurge,
    taxDeadlineSurge
  ]
};
