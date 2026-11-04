// Problems for the Media and streaming group and the Social and messaging group.
// default export  = media group ({ group, problems })
// named exports   = media, social (same shape), and groups = [media, social]
// All figures are rough real-world approximations for teaching.

const W = (ref, y = 0, extra = {}) => ({ ref, type: 'web-browser', x: -480, y, ...extra });
const A = (ref, y = 0, extra = {}) => ({ ref, type: 'mobile-app', x: -480, y, ...extra });
const T = (ref, y = 0, extra = {}) => ({ ref, type: 'tv-app', x: -480, y, ...extra });
const lock = (n) => ({ ...n, locked: true });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
// Watching tools shared by several designs: from -> metrics -> alerting -> pager
const watch = (from, x, y) => ({
  nodes: [N('metrics', 'metrics', x, y), N('alerting', 'alerting', x + 170, y), N('pager', 'pager', x + 340, y)],
  edges: [[from, 'metrics'], ['metrics', 'alerting'], ['alerting', 'pager']]
});
const AUTO = (min, max) => ({ autoscale: { on: true, min, max, targetUtil: 0.6 } });

// ---------------------------------------------------------------- MEDIA

const photoSharing = {
  id: 'photo-sharing',
  title: 'Photo sharing',
  difficulty: 'Easy',
  concepts: ['cdn', 'storage-tiers'],
  like: 'a photo app like Instagram',
  brief: 'You are building a photo app. People post pictures and everyone else scrolls through them. Almost all the traffic is people looking at photos, and the photos take up far more room than anything else you store.',
  clarify: [
    { q: 'Do people edit a photo after posting?', a: 'No. A photo never changes after it is posted, only its caption and likes do. That makes photos very safe to copy near users.' },
    { q: 'Can a photo be lost?', a: 'Never. People treat these as memories. Once the app says "posted", the photo must survive.' },
    { q: 'How fast must a photo open?', a: 'Most people leave if a photo takes more than about a third of a second to show up.' },
    { q: 'Do we keep every size of a photo?', a: 'Yes: the original plus a few smaller sizes. Together that is about 3 MB per photo.' }
  ],
  requirements: {
    users: '30 million people a month',
    monthlyUsers: 30000000,
    peakRps: 6000,
    mix: { read: 0.94, write: 0.05, upload: 0.01 },
    latencyP99Ms: { default: 300, upload: 4000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 8000,
    storageTb: 150,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 },
    homeRegion: 'us',
    notes: [
      'About 1 million photos are posted per day (approx.).',
      'The 150 TB figure is the busy recent set, not every photo ever posted (approx.).'
    ]
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.8, 'web-browser': 0.2 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'viral-spike', at: '20:00', params: { factor: 6 } },
    { id: 'cache-stampede', at: '14:00' }
  ],
  eventPool: ['cost-blowout', 'bot-scraping'],
  numbers: [
    { label: 'Photo views per second at peak', value: 5640, unit: 'req/s', how: '6,000 x 0.94 (approx.)', ask: true },
    { label: 'New photos per day', value: 1000000, unit: 'photos', how: 'about 1 in 30 people post each day (approx.)' },
    { label: 'Storage added per year', value: 1095, unit: 'TB', how: '1,000,000 x 3 MB x 365 = about 1,100 TB (approx.)', ask: true }
  ],
  hints: [
    'Photos never change. What does that let you do with copies of them?',
    'A CDN keeps copies of popular photos close to people, so most views never reach your own servers. Photo bytes belong in object storage, not in a database.',
    'Try: people -> CDN -> app servers -> object storage for the photos and a SQL database for captions and likes. Put a cache in front of the database for the busy rows.'
  ],
  editorial: {
    summary: 'Photos are big, never change and are viewed far more than they are posted. That is the perfect case for a CDN in front and cheap object storage behind. The app servers and database only handle small things: captions, likes and who follows whom.',
    designs: [
      {
        name: 'CDN, app servers, object storage',
        why: 'The CDN answers most photo views from a nearby copy. App servers handle uploads and small writes. Object storage keeps every photo safely and cheaply. A cache protects the database from repeat questions.',
        graph: {
          nodes: [A('app', -60), W('web', 60),
            N('cdn', 'cdn', -300, 0, { knobs: { ttlSec: 86400 } }),
            N('api', 'vm-fleet', -110, 0, { units: 4, zones: 2, knobs: AUTO(3, 16) }),
            N('cache', 'distributed-cache', 90, -90),
            N('db', 'sql-primary', 290, -90, { zones: 2 }),
            N('db2', 'sql-replica', 290, 20, { units: 2 }),
            N('photos', 'object-storage', 90, 120),
            ...watch('api', 90, 240).nodes],
          edges: [['app', 'cdn'], ['web', 'cdn'], ['cdn', 'api'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['api', 'photos'], ...watch('api', 90, 240).edges]
        },
        expect: { score: 900, costPerMonth: 6200 }
      },
      {
        name: 'The same design with backups',
        why: 'Same design, plus backups of the captions database, so a bad deploy or a deleted table can be rolled back. The photos already sit in object storage, which keeps several copies of every file.',
        graph: {
          nodes: [A('app', -60), W('web', 60),
            N('cdn', 'cdn', -300, 0, { knobs: { ttlSec: 86400 } }),
            N('api', 'vm-fleet', -110, 0, { units: 4, zones: 2, knobs: AUTO(3, 16) }),
            N('cache', 'distributed-cache', 90, -90),
            N('db', 'sql-primary', 290, -90, { zones: 2 }),
            N('db2', 'sql-replica', 290, 20, { units: 2 }),
            N('photos', 'object-storage', 90, 120),
            N('bk', 'backups', 480, -90)],
          edges: [['app', 'cdn'], ['web', 'cdn'], ['cdn', 'api'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['api', 'photos'], ['bk', 'db']]
        },
        expect: { score: 920, costPerMonth: 5400 }
      }
    ],
    tradeoffs: [
      'A long CDN cache time means more photo views are served from the edge and the bill is lower, but a deleted photo can stay visible for a while.',
      'Object storage is cheap per gigabyte but slower than a disk next to your server. It is the right home for photos and the wrong home for a like counter.',
      'Several app servers in two zones cost more than one big server, but one failed building no longer takes the app down.',
      'A cold archive cuts the storage bill but makes a rare old-photo view slower. Most people never notice.'
    ],
    realWorld: 'Large photo apps serve well over 90 percent of photo views from CDN caches (approx.), and store petabytes of photos in cheap object storage, with each photo kept in a handful of sizes.'
  },
  daily: true
};

const podcastHosting = {
  id: 'podcast-hosting',
  title: 'Podcast hosting',
  difficulty: 'Easy',
  concepts: ['cdn', 'cost'],
  like: 'a podcast host',
  brief: 'You host shows for creators. Listeners press play and download big audio files, and creators upload a new episode now and then. The audio is the bill: every episode downloaded costs bandwidth.',
  clarify: [
    { q: 'How often does an episode change?', a: 'Never after it is published. Audio files are the same for everyone, so copies are safe.' },
    { q: 'Do listeners all arrive at the same time?', a: 'Mostly in the morning commute. But a famous guest can send a huge crowd at once.' },
    { q: 'Are episodes uploaded often?', a: 'No. A few thousand a day across all shows. Uploads are few and can take a few seconds.' },
    { q: 'What matters most to the creator?', a: 'That the episode plays, and that the hosting bill leaves them something to keep.' }
  ],
  requirements: {
    users: '200 thousand listeners a month',
    monthlyUsers: 200000,
    peakRps: 40,
    mix: { stream: 0.8, read: 0.17, write: 0.02, upload: 0.01 },
    latencyP99Ms: { default: 400, stream: 1500, upload: 8000 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 5000,
    storageTb: 40,
    userRegions: { us: 0.6, eu: 0.3, apac: 0.1 },
    homeRegion: 'us',
    notes: ['An average episode is about 50 MB (approx.). The game groups it into 2 MB stream chunks.']
  },
  traffic: { curve: 'commute', sources: { 'mobile-app': 0.75, 'web-browser': 0.25 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'flash-crowd', at: '07:30', params: { factor: 10 } },
    { id: 'cost-blowout', at: '12:00' }
  ],
  eventPool: ['viral-spike', 'bot-scraping'],
  numbers: [
    { label: 'Audio chunks per second at peak', value: 32, unit: 'req/s', how: '40 x 0.8 (approx.)', ask: true },
    { label: 'Audio data leaving per second at peak', value: 64, unit: 'MB/s', how: '32 chunks x 2 MB, about 0.5 Gbps (approx.)', ask: true },
    { label: 'Storage for 10,000 episodes', value: 0.5, unit: 'TB', how: '10,000 x 50 MB = 500 GB (approx.)' }
  ],
  hints: [
    'Where does the money go in a service that sends big files? Think about what you pay per gigabyte sent.',
    'Episodes never change, so a CDN can hold them. Fewer trips to your own storage means a lower bill and a faster start.',
    'Try: listeners -> CDN -> object storage for the audio. Add one small API for show pages and uploads. You do not need many servers here.'
  ],
  editorial: {
    summary: 'Podcast hosting is a bandwidth business. The files are large, identical for everyone, and never change. Put the audio in object storage, put a CDN in front, and keep the servers tiny. The famous-guest crowd then costs almost nothing extra at the origin.',
    designs: [{
      name: 'CDN straight to object storage',
      why: 'The CDN reads audio from object storage and keeps it. A small API fleet handles show pages and uploads. There is nothing big to scale because the heavy part is the CDN.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('cdn', 'cdn', -300, 0, { knobs: { ttlSec: 86400, coalesce: true } }),
          N('api', 'vm-fleet', -110, 70, { units: 2, zones: 2 }),
          N('audio', 'object-storage', 100, 0),
          N('db', 'sql-primary', 100, 140, { zones: 2 }),
          ...watch('api', 100, 260).nodes],
        edges: [['app', 'cdn'], ['web', 'cdn'], ['cdn', 'audio'], ['cdn', 'api'], ['api', 'audio'], ['api', 'db'], ...watch('api', 100, 260).edges]
      },
      expect: { score: 920, costPerMonth: 3600 }
    }],
    tradeoffs: [
      'A very long cache time keeps the CDN bill down, but a creator who replaces an episode must wait or rename the file.',
      'Collapsing misses means ten thousand people asking for a brand-new episode produce one request to storage, not ten thousand.',
      'Two small servers in two zones cost little more than one and survive a building failure.',
      'Cheaper bandwidth from a bigger CDN contract needs a commitment. A small host pays list price.'
    ],
    realWorld: 'A popular episode is downloaded within hours of release by most of its audience, so a cache filled by the first few listeners serves almost everyone else. Typical CDN prices are around 2 to 8 cents per GB (approx.).'
  },
  daily: true
};

const newsSite = {
  id: 'news-site',
  title: 'News site',
  difficulty: 'Easy',
  concepts: ['caching', 'cdn'],
  like: 'a news site like the BBC or CNN',
  brief: 'You run a news site. Millions read the same few stories, and when something big happens almost everyone opens the same page in the same minute. Editors publish all day, and readers expect fresh headlines.',
  clarify: [
    { q: 'How fresh must the front page be?', a: 'A minute behind is fine. A headline that is an hour old is not.' },
    { q: 'Do readers log in?', a: 'Mostly not. Only a small group of subscribers and editors sign in.' },
    { q: 'Are most readers reading different stories?', a: 'No. A handful of stories get most of the views, especially during breaking news.' },
    { q: 'What happens if the site goes down during a big story?', a: 'Readers go elsewhere, and the editors are very unhappy. Breaking news is exactly when it must work.' }
  ],
  requirements: {
    users: '20 million readers a month',
    monthlyUsers: 20000000,
    peakRps: 8000,
    mix: { read: 0.95, search: 0.03, event: 0.01, write: 0.005, login: 0.005 },
    latencyP99Ms: { default: 300, search: 500 },
    availability: 0.999,
    dataSafety: 'rpo-1m',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 6000,
    storageTb: 4,
    userRegions: { us: 0.4, eu: 0.4, apac: 0.2 },
    homeRegion: 'eu',
    notes: ['A page is about 4 KB of data per request in the game (approx.); images are served separately.']
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.45, 'mobile-app': 0.55 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(W('web', -60)), lock(A('app', 60))], edges: [] },
  events: [
    { id: 'flash-crowd', at: '13:00', params: { factor: 25 } },
    { id: 'cache-stampede', at: '09:00' }
  ],
  eventPool: ['bot-scraping', 'ddos-attack'],
  numbers: [
    { label: 'Page views per second at peak', value: 7600, unit: 'req/s', how: '8,000 x 0.95 (approx.)', ask: true },
    { label: 'Page views per second in a breaking-news spike', value: 200000, unit: 'req/s', how: '8,000 x 25 (approx.)', ask: true },
    { label: 'Different stories getting most of the views', value: 50, unit: 'pages', how: 'a few dozen headlines (approx.)' }
  ],
  hints: [
    'Almost everyone reads the same few pages. How could you answer them without asking a database each time?',
    'A CDN with a short cache time (a minute or so) serves hot pages to everyone and still keeps headlines fresh. Collapsing misses protects you when the cache is empty.',
    'Try: readers -> CDN -> a small group of app servers -> database. Search goes to a search index.'
  ],
  editorial: {
    summary: 'A news site is a read-heavy site with a tiny number of very hot pages. Let the CDN absorb the crowd with a one-minute cache, and keep the database for editors and for cache misses. The classic failure is a cold cache and a huge crowd arriving together.',
    designs: [{
      name: 'Short-lived CDN cache',
      why: 'The CDN holds every page for about a minute and merges simultaneous misses, so the app servers see a trickle even in a spike. A search index handles search without hurting the database.',
      graph: {
        nodes: [W('web', -60), A('app', 60),
          N('cdn', 'cdn', -300, 0, { knobs: { ttlSec: 60, coalesce: true } }),
          N('api', 'vm-fleet', -110, 0, { units: 4, zones: 2, knobs: AUTO(3, 20) }),
          N('cache', 'distributed-cache', 90, -90, { knobs: { ttlSec: 60 } }),
          N('db', 'sql-primary', 290, -90, { zones: 2 }),
          N('db2', 'sql-replica', 290, 20),
          N('idx', 'search-index', 90, 110),
          ...watch('api', 90, 240).nodes],
        edges: [['web', 'cdn'], ['app', 'cdn'], ['cdn', 'api'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['api', 'idx'], ...watch('api', 90, 240).edges]
      },
      expect: { score: 930, costPerMonth: 4300 }
    }],
    tradeoffs: [
      'A one-minute cache means a correction can take up to a minute to appear. Clearing the cache on publish fixes that for important stories, at the cost of extra work for editors.',
      'Collapsing misses stops the stampede after a cold start, but one slow origin request now makes every reader of that page wait.',
      'Autoscaling helps with a slow ramp, but a 25 times spike arrives in seconds. The CDN, not the servers, is what saves you.',
      'A replica is a little behind the main database. For a news page that is fine. For an editor who just hit publish it is not.'
    ],
    realWorld: 'Big news sites often serve 95 to 99 percent of page views from CDN and edge caches (approx.), so the origin sees nearly the same load on a normal day and on a record-breaking one.'
  },
  daily: true
};

const musicStreaming = {
  id: 'music-streaming',
  title: 'Music streaming',
  difficulty: 'Medium',
  concepts: ['cdn', 'caching', 'search-indexing'],
  like: 'a music service like Spotify',
  brief: 'People search for songs, build playlists and press play. The audio is the heavy part, and a hit song is played by millions at once. Playback must not stutter, even when part of your system fails.',
  clarify: [
    { q: 'Can the music keep playing if the playlist service is down?', a: 'It should. A song that has started must finish even when your database has a bad moment.' },
    { q: 'Where are the listeners?', a: 'Spread across three continents. A listener far from your servers waits longer to start a song.' },
    { q: 'What happens on a big album release day?', a: 'Millions press play on the same few songs within minutes. This is your hottest data of the year.' },
    { q: 'How good must search be?', a: 'Fast and forgiving. People mistype names. Results should arrive in well under half a second.' }
  ],
  requirements: {
    users: '1.5 million listeners a month',
    monthlyUsers: 1500000,
    peakRps: 500,
    mix: { stream: 0.5, search: 0.2, read: 0.2, event: 0.06, write: 0.02, login: 0.02 },
    latencyP99Ms: { default: 300, stream: 1000, search: 400 },
    availability: 0.995,
    dataSafety: 'rpo-1m',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 40000,
    storageTb: 60,
    userRegions: { us: 0.4, eu: 0.4, apac: 0.2 },
    homeRegion: 'us',
    notes: [
      'An average song is about 5 MB (approx.); the game counts 2 MB stream chunks.',
      'Playlist edits must show up for the person who made them straight away.'
    ]
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.65, 'web-browser': 0.2, 'tv-app': 0.15 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -90)), lock(W('web', 0)), lock(T('tv', 90))], edges: [] },
  events: [
    { id: 'hot-key', at: '10:00', params: { share: 0.35 } },
    { id: 'region-outage', at: '15:00', params: { durationSec: 1800 } }
  ],
  eventPool: ['viral-spike', 'cache-stampede', 'slow-dependency'],
  numbers: [
    { label: 'Song chunks per second at peak', value: 250, unit: 'req/s', how: '500 x 0.5 (approx.)', ask: true },
    { label: 'Searches per second at peak', value: 100, unit: 'req/s', how: '500 x 0.2 (approx.)', ask: true },
    { label: 'Audio data leaving per second at peak', value: 500, unit: 'MB/s', how: '250 chunks x 2 MB, about 4 Gbps (approx.)', ask: true }
  ],
  hints: [
    'What should still work if your main region goes dark for half an hour?',
    'Songs never change, so a CDN with a long cache time can keep music playing even when your database is down. Search is a separate copy of your catalog: use a search index.',
    'Try: listeners -> CDN -> app servers spread across zones -> cache -> database. Songs come from object storage. Search goes to a search index.'
  ],
  editorial: {
    summary: 'Split the system into two halves. The audio path (CDN and object storage) holds songs that never change, so it can survive without the playlist database. The account path (playlists, library, play counts) needs a database and care about who sees what. A hit song is just one very hot cached key.',
    designs: [{
      name: 'Audio on the CDN, accounts behind it',
      why: 'The CDN serves songs, so a regional outage or a hot album does not touch the origin. App servers in three zones handle search, playlists and play counts. A cache protects the database, and play events go through a queue so a busy minute never blocks playback.',
      graph: {
        nodes: [A('app', -90), W('web', 0), T('tv', 90),
          N('geo', 'geo-dns', -330, 0),
          N('cdn', 'cdn', -150, 0, { knobs: { ttlSec: 86400, coalesce: true } }),
          N('api', 'vm-fleet', 30, 0, { units: 4, zones: 3, knobs: AUTO(3, 16) }),
          N('cache', 'distributed-cache', 220, -110),
          N('db', 'sql-primary', 420, -110, { zones: 2 }),
          N('db2', 'sql-replica', 420, 0),
          N('songs', 'object-storage', 220, 120),
          N('idx', 'search-index', 220, 0, { units: 2 }),
          N('q', 'queue', 220, 230),
          N('wp', 'worker-pool', 400, 230, { units: 2 }),
          N('events', 'wide-column', 580, 230),
          ...watch('api', 30, 340).nodes],
        edges: [['app', 'geo'], ['web', 'geo'], ['tv', 'geo'], ['geo', 'cdn'], ['cdn', 'songs'], ['cdn', 'api'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['api', 'idx'], ['api', 'q'], ['q', 'wp'], ['wp', 'events'], ...watch('api', 30, 340).edges]
      },
      expect: { score: 880, costPerMonth: 34000 }
    }],
    tradeoffs: [
      'Keeping songs on the CDN with a long cache time makes playback survive almost any outage, but a song taken down for rights reasons needs an explicit purge.',
      'A search index is a copy of the catalog. It is fast and forgiving, but it can be a few seconds behind the real catalog.',
      'Reading playlists from a replica is cheaper, but it can show an old playlist right after an edit. The requirement asks you to show the editor their own change.',
      'Play counts go through a queue so a flood of "song played" events cannot slow down audio. The counts arrive a little late, and nobody minds.'
    ],
    realWorld: 'Large music services play most songs from CDN and on-device caches (approx.). A new release from a top artist can make one track account for a noticeable share of all plays for a day.'
  },
  daily: true
};

const videoOnDemand = {
  id: 'video-on-demand',
  title: 'Video streaming',
  difficulty: 'Medium',
  concepts: ['cdn', 'cost', 'storage-tiers'],
  like: 'a video service like Netflix',
  brief: 'You run a movie and series service for a growing audience. Each viewer pulls a few seconds of video at a time for two hours straight. Bandwidth is the largest cost by far, and everyone wants to start watching in the evening.',
  clarify: [
    { q: 'Is most of the library watched equally?', a: 'No. A few hundred titles get most of the viewing. The long tail is watched rarely.' },
    { q: 'How long can a viewer wait for the picture to start?', a: 'About a second for each chunk. More than that and the picture freezes.' },
    { q: 'Do viewers need to be signed in?', a: 'Yes. A subscription check happens once at the start, not for every chunk.' },
    { q: 'What if a new season launches?', a: 'A huge crowd presses play on the same episode in the same hour. It is the busiest night of the quarter.' }
  ],
  requirements: {
    users: '400 thousand subscribers',
    monthlyUsers: 400000,
    peakRps: 600,
    mix: { stream: 0.8, read: 0.1, search: 0.04, login: 0.02, event: 0.04 },
    latencyP99Ms: { default: 300, stream: 1000, search: 400 },
    availability: 0.999,
    dataSafety: 'rpo-1m',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 70000,
    storageTb: 250,
    userRegions: { us: 0.6, eu: 0.3, apac: 0.1 },
    homeRegion: 'us',
    notes: [
      'About 480 chunks per second at peak means roughly 2,000 people watching at once (approx.). Each chunk is 4 seconds of video, about 2 MB.',
      'Bandwidth is priced per gigabyte sent to viewers (about 4 cents at list price, approx.).'
    ]
  },
  traffic: { curve: 'consumer-evening', sources: { 'tv-app': 0.55, 'mobile-app': 0.25, 'web-browser': 0.2 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(T('tv', -90)), lock(A('app', 0)), lock(W('web', 90))], edges: [] },
  events: [
    { id: 'flash-crowd', at: '19:00', params: { factor: 8 } },
    { id: 'cache-stampede', at: '12:00' },
    { id: 'cost-blowout', at: '21:00' }
  ],
  eventPool: ['region-outage', 'viral-spike', 'dependency-outage'],
  numbers: [
    { label: 'Video chunks per second at peak', value: 480, unit: 'req/s', how: '600 x 0.8 (approx.)', ask: true },
    { label: 'Video data leaving at peak', value: 960, unit: 'MB/s', how: '480 chunks x 2 MB, about 7.7 Gbps (approx.)', ask: true },
    { label: 'Video sent to viewers in a month', value: 1300, unit: 'TB', how: 'about 0.5 GB/s average x 2.6 million seconds (approx.)', ask: true }
  ],
  hints: [
    'A few titles get most of the views. How can you use that to protect your storage and your bill?',
    'A CDN with an origin shield means one trip from storage serves thousands of viewers. Keep the library in object storage and move old titles to a colder tier.',
    'Try: viewers -> CDN -> origin shield -> object storage for video. App servers handle login, the catalog and playback events. Add a cache for catalog pages.'
  ],
  editorial: {
    summary: 'Video is a bandwidth problem. Put the video chunks on a CDN, add an origin shield so storage sees one request per chunk instead of thousands, and keep the long tail in cheaper storage. The account and catalog side is small and boring on purpose.',
    designs: [{
      name: 'CDN with origin shield',
      why: 'Popular titles live on the CDN and almost never reach storage. The shield merges misses from every edge so the origin sees one request per chunk. App servers only handle login, browsing and play events.',
      graph: {
        nodes: [T('tv', -90), A('app', 0), W('web', 90),
          N('cdn', 'cdn', -310, 0, { knobs: { ttlSec: 86400, coalesce: true } }),
          N('shield', 'origin-shield', -140, -90),
          N('video', 'object-storage', 40, -90),
          N('api', 'vm-fleet', -140, 80, { units: 3, zones: 2 }),
          N('idp', 'identity-provider', 40, 190),
          N('cache', 'distributed-cache', 40, 70),
          N('db', 'sql-primary', 230, 70, { zones: 2 }),
          N('db2', 'sql-replica', 230, 180),
          N('q', 'queue', 40, 300),
          N('events', 'wide-column', 230, 300),
          ...watch('api', -140, 400).nodes],
        edges: [['tv', 'cdn'], ['app', 'cdn'], ['web', 'cdn'], ['cdn', 'shield'], ['shield', 'video'], ['cdn', 'api'], ['api', 'idp'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['api', 'q'], ['q', 'events'], ...watch('api', -140, 400).edges]
      },
      expect: { score: 900, costPerMonth: 62000 }
    }],
    tradeoffs: [
      'Every extra copy layer (edge, shield, storage) lowers your storage load, but each one adds a little delay for a rare title nobody has watched yet.',
      'Serving fewer quality levels shrinks the bill but makes the picture worse on a fast connection.',
      'A cold tier for rarely watched titles cuts storage cost. The first viewer of a rare title waits a few seconds longer.',
      'Bandwidth cost dominates. Doubling the app servers barely changes the bill. Doubling the viewers doubles it.'
    ],
    realWorld: 'Large video services place their own cache boxes inside internet providers, so most of the traffic never crosses the public internet. Video can be well over a third of all downstream internet traffic in the evening (approx.).'
  },
  daily: true
};

const shortVideoFeed = {
  id: 'short-video-feed',
  title: 'Short-video feed',
  difficulty: 'Medium',
  concepts: ['cdn', 'caching', 'hot-keys'],
  like: 'a short-video app like TikTok',
  brief: 'People swipe through an endless feed of clips of 10 to 30 seconds. The next clip must already be on the phone before the swipe. One clip can suddenly get millions of views, and every view is a signal that picks what to show next.',
  clarify: [
    { q: 'Does the app start loading the next clip early?', a: 'Yes. The phone prefetches one or two clips ahead. That means fewer stalls but more data sent per viewer.' },
    { q: 'Is the feed the same for everybody?', a: 'No. Every person gets a ranked list picked just for them from a huge pool of clips.' },
    { q: 'How soon should a new clip show up?', a: 'Within a minute for the creator and their followers. Everyone else can wait a bit.' },
    { q: 'Can we lose a "like" or a view count?', a: 'A few can be late or missing. A posted clip itself must never be lost.' }
  ],
  requirements: {
    users: '2 million people a month',
    monthlyUsers: 2000000,
    peakRps: 1500,
    mix: { stream: 0.55, read: 0.25, event: 0.12, search: 0.04, write: 0.03, upload: 0.01 },
    latencyP99Ms: { default: 300, stream: 1000, upload: 6000 },
    availability: 0.998,
    dataSafety: 'rpo-1m',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 110000,
    storageTb: 120,
    userRegions: { us: 0.4, eu: 0.3, apac: 0.3 },
    homeRegion: 'us',
    notes: ['A short clip is about 6 MB in total, which the game counts as a few 2 MB chunks (approx.).']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.9, 'web-browser': 0.1 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'viral-spike', at: '20:15', params: { factor: 5 } },
    { id: 'hot-key', at: '20:20', params: { share: 0.4 } },
    { id: 'slow-dependency', at: '11:00' }
  ],
  eventPool: ['cache-stampede', 'cost-blowout', 'dependency-outage'],
  numbers: [
    { label: 'Clip chunks per second at peak', value: 825, unit: 'req/s', how: '1,500 x 0.55 (approx.)', ask: true },
    { label: 'Video data leaving at peak', value: 1650, unit: 'MB/s', how: '825 chunks x 2 MB, about 13 Gbps (approx.)', ask: true },
    { label: 'Feed requests per second at peak', value: 375, unit: 'req/s', how: '1,500 x 0.25 (approx.)' }
  ],
  hints: [
    'One clip can get a huge share of all views for an hour. Where in your design does that clip live?',
    'A CDN holds popular clips so they never reach your servers. Choosing the next clips is a recommender job: it is slow, so keep its answers in a cache and have a fallback if it is slow.',
    'Try: phones -> CDN -> app servers -> recommender behind a circuit breaker, a cache for feed answers, and a queue for view and like events. Clips live in object storage.'
  ],
  editorial: {
    summary: 'Short-video apps have two jobs with opposite shapes. Delivering the clip is a CDN job: big, identical, cacheable. Choosing the clip is a recommendation job: small, personal, slow, and exactly the part that must not block the swipe. Keep them apart, cache the ranking, and push the signals through a queue.',
    designs: [{
      name: 'CDN for clips, cached recommender for the feed',
      why: 'The CDN keeps the viral clip at the edge. The feed service asks a recommender for a short list, caches it for a short time, and falls back to a popular list if the recommender is slow. Views and likes go through a queue and arrive a little later.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('cdn', 'cdn', -310, 0, { knobs: { ttlSec: 3600, coalesce: true } }),
          N('shield', 'origin-shield', -130, -110),
          N('clips', 'object-storage', 50, -110),
          N('api', 'vm-fleet', -130, 60, { units: 6, zones: 3, knobs: AUTO(4, 24) }),
          N('cb', 'circuit-breaker', 50, 60),
          N('rec', 'recommender', 230, 60, { units: 3 }),
          N('cache', 'distributed-cache', 50, 170, { knobs: { ttlSec: 60 } }),
          N('db', 'document-db', 230, 170, { units: 3 }),
          N('q', 'queue', 50, 280),
          N('wp', 'worker-pool', 230, 280, { units: 2 }),
          N('events', 'wide-column', 410, 280),
          ...watch('api', -130, 390).nodes],
        edges: [['app', 'cdn'], ['web', 'cdn'], ['cdn', 'shield'], ['shield', 'clips'], ['cdn', 'api'], ['api', 'cb'], ['cb', 'rec'], ['api', 'cache'], ['cache', 'db'], ['api', 'db'], ['api', 'q'], ['q', 'wp'], ['wp', 'events'], ...watch('api', -130, 390).edges]
      },
      expect: { score: 880, costPerMonth: 95000 }
    }],
    tradeoffs: [
      'Prefetching the next clip makes swiping feel instant but sends data the viewer may never watch. That extra bandwidth is a real line on the bill.',
      'Caching the ranked feed for a minute is cheap but makes the feed slightly less fresh. A fresh-for-you feed costs a recommender call on every swipe.',
      'A circuit breaker returns a popular-clips list when the recommender is slow. The feed is a little less personal for a few minutes instead of broken.',
      'Counting views through a queue means view counts lag by seconds. A creator will not mind, but a payout calculation would need a more careful path.'
    ],
    realWorld: 'Short-video apps usually prefetch the next one or two clips (approx.). The most viewed clips of the day may account for a large share of all video bytes, which is why edge caches work so well.'
  },
  daily: true
};

const videoUploadPipeline = {
  id: 'video-upload-pipeline',
  title: 'Video upload pipeline',
  difficulty: 'Hard',
  concepts: ['queues-backpressure', 'idempotency-retries'],
  like: 'uploads on a site like YouTube',
  brief: 'Creators upload videos that must be converted into several qualities before anyone can watch. Conversion is slow, costs real money per video, and the converter sometimes fails on a broken file. Nothing a creator uploads can be lost.',
  clarify: [
    { q: 'Must the creator wait while the video converts?', a: 'No. The upload is accepted right away. The video shows as "processing" and goes live when ready, within about ten minutes.' },
    { q: 'What if the same upload is sent twice because the connection dropped?', a: 'It must not be converted twice. Each conversion costs about a dollar.' },
    { q: 'What if one file is corrupted?', a: 'It will fail every time. It must not block the other uploads behind it.' },
    { q: 'What if the converter service is down for a while?', a: 'Uploads still succeed and wait in line. They convert once it comes back.' }
  ],
  requirements: {
    users: '8 million viewers a month, 15 thousand uploads a day',
    monthlyUsers: 8000000,
    peakRps: 150,
    mix: { read: 0.6, stream: 0.3, event: 0.078, write: 0.02, upload: 0.002 },
    latencyP99Ms: { default: 300, stream: 1000, upload: 5000, write: 500 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 500000,
    storageTb: 200,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 },
    homeRegion: 'us',
    notes: [
      'Converting one 10-minute video into five qualities costs about $1 at list price (approx.). Conversion is the largest line on the bill.',
      'One upload request in the game stands for one whole video handed over to be converted.'
    ]
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.5, 'mobile-app': 0.4, 'tv-app': 0.1 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(W('web', -90)), lock(A('app', 0)), lock(T('tv', 90))], edges: [] },
  events: [
    { id: 'viral-spike', at: '18:00', params: { factor: 6 } },
    { id: 'poison-message', at: '10:00' },
    { id: 'dependency-outage', at: '15:00', params: { durationSec: 2400 } }
  ],
  eventPool: ['duplicate-delivery', 'retry-storm', 'disk-full'],
  numbers: [
    { label: 'Uploads per second at peak', value: 0.3, unit: 'videos/s', how: '150 x 0.002 (approx.)', ask: true },
    { label: 'Uploads per day', value: 15000, unit: 'videos', how: 'about 0.17 per second on average (approx.)' },
    { label: 'Conversion cost per month', value: 450000, unit: 'dollars', how: '15,000 x 30 x $1 (approx.)', ask: true }
  ],
  hints: [
    'The converter is slow, costly and sometimes broken. What goes between the upload and the converter?',
    'A queue accepts the upload at once and hands videos to the converter at its own pace. A dead-letter queue catches the file that keeps failing. An idempotency store stops a repeated upload from converting twice.',
    'Try: creators -> app servers -> object storage (save the file first) -> queue -> workflow engine -> video transcoder, with a dead-letter queue beside the queue. Viewers read through a CDN.'
  ],
  editorial: {
    summary: 'Save the file first, then do the slow work later. Object storage keeps the original safe. A queue and workflow engine turn each upload into a job that survives a converter outage. A dead-letter queue isolates the one broken file. An idempotency store makes a repeated upload cost nothing. Viewing sits on a separate path through the CDN.',
    designs: [{
      name: 'Save first, convert later',
      why: 'The upload is acknowledged as soon as the original is stored. The queue and workflow engine feed the converter at its own pace and keep jobs during an outage. Broken files go to a dead-letter queue instead of blocking everything. Viewers never touch the upload path.',
      graph: {
        nodes: [W('web', -90), A('app', 0), T('tv', 90),
          N('cdn', 'cdn', -330, 0, { knobs: { ttlSec: 3600, coalesce: true } }),
          N('api', 'vm-fleet', -150, 0, { units: 4, zones: 3, knobs: AUTO(3, 16) }),
          N('idem', 'idempotency-store', 30, -160),
          N('raw', 'object-storage', 30, -60),
          N('q', 'queue', 30, 60),
          N('wf', 'workflow-engine', 210, 60),
          N('tw', 'worker-pool', 390, 60, { units: 2 }),
          N('tc', 'video-transcoder', 570, 60),
          N('dlq', 'dead-letter-queue', 210, 180),
          N('video', 'object-storage', 390, -60),
          N('cache', 'distributed-cache', 30, 200),
          N('db', 'sql-primary', 210, 290, { zones: 2 }),
          N('db2', 'sql-replica', 400, 290),
          N('bk', 'backups', 400, 190),
          ...watch('api', -150, 190).nodes],
        edges: [['web', 'cdn'], ['app', 'cdn'], ['tv', 'cdn'], ['cdn', 'video'], ['cdn', 'api'], ['api', 'idem'], ['api', 'raw'], ['api', 'q'], ['q', 'wf'], ['wf', 'tw'], ['tw', 'tc'], ['q', 'dlq'], ['api', 'cache'], ['cache', 'db2'], ['api', 'db'], ['db', 'db2'], ['bk', 'db'], ...watch('api', -150, 190).edges]
      },
      expect: { score: 850, costPerMonth: 470000 }
    }],
    tradeoffs: [
      'Accepting the upload before converting means a creator sees "processing" for minutes, but the upload never fails because the converter is slow.',
      'Retrying a failed conversion fixes temporary problems but wastes money on a broken file. A retry limit plus a dead-letter queue stops that.',
      'Keeping the original forever lets you convert again to a better format later, but originals are big and cost storage every month.',
      'Converting only the qualities people actually watch cuts the largest line on the bill, but the first viewer of a rare quality waits.',
      'Idempotency keys cost one fast lookup per upload and save a dollar every time a connection drops.'
    ],
    realWorld: 'Video sites receive hundreds of hours of new video per minute in total (approx.). Conversion is done by large pools of dedicated workers fed from queues, and failed jobs are retried a few times, then parked for a person to look at.'
  },
  daily: true
};

const liveStreaming = {
  id: 'live-streaming',
  title: 'Live streaming',
  difficulty: 'Hard',
  concepts: ['cdn', 'realtime-connections', 'fanout'],
  like: 'a live platform like Twitch',
  brief: 'Streamers broadcast live and thousands watch together, with a chat on the side. Everyone wants the same piece of video at the same second, so nothing can be saved for later. When a big streamer goes live, the whole audience arrives at once.',
  clarify: [
    { q: 'How far behind real time may the video be?', a: 'About 3 to 5 seconds. Viewers tolerate that, but not freezes.' },
    { q: 'Is chat as important as the video?', a: 'Almost. Chat messages must arrive in a second or two, and a huge chat is mostly many people reading the same few messages.' },
    { q: 'What if a streamer is raided by another channel?', a: 'The audience can grow ten times in minutes. It will happen on the busiest night.' },
    { q: 'Do viewers need to sign in?', a: 'To chat, yes. To watch, no.' }
  ],
  requirements: {
    users: '1 million viewers a month, thousands live at once',
    monthlyUsers: 1000000,
    peakRps: 3200,
    mix: { live: 0.7, message: 0.2, read: 0.06, login: 0.02, write: 0.02 },
    latencyP99Ms: { default: 400, live: 1500, message: 600 },
    availability: 0.998,
    dataSafety: 'best-effort',
    readYourWrites: false,
    compliance: [],
    budgetPerMonth: 140000,
    storageTb: 20,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 },
    homeRegion: 'us',
    notes: [
      'One live request stands for a 2-second piece of the broadcast, about 1 MB (approx.).',
      'About 2,240 live pieces per second means roughly 4,500 people watching at once (approx.).'
    ]
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.5, 'mobile-app': 0.35, 'tv-app': 0.15 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(W('web', -90)), lock(A('app', 0)), lock(T('tv', 90))], edges: [] },
  events: [
    { id: 'thundering-herd', at: '20:00' },
    { id: 'flash-crowd', at: '20:30', params: { factor: 8 } },
    { id: 'region-outage', at: '21:30', params: { durationSec: 1200 } }
  ],
  eventPool: ['network-partition', 'ddos-attack', 'cache-stampede'],
  numbers: [
    { label: 'Live pieces per second at peak', value: 2240, unit: 'req/s', how: '3,200 x 0.7 (approx.)', ask: true },
    { label: 'Video data leaving at peak', value: 2240, unit: 'MB/s', how: '2,240 pieces x 1 MB, about 18 Gbps (approx.)', ask: true },
    { label: 'Chat messages per second at peak', value: 640, unit: 'msg/s', how: '3,200 x 0.2 (approx.)' }
  ],
  hints: [
    'Everyone wants the same piece of video at the same second. What does that mean for caching?',
    'A CDN with miss collapsing turns thousands of identical requests into one trip to the origin. Chat needs open connections, not normal web requests: use a websocket gateway.',
    'Try: viewers -> CDN -> origin shield -> ingest storage for video, and viewers -> websocket gateway -> chat service -> pub/sub for chat. Keep video and chat apart so a chat storm never stalls the picture.'
  ],
  editorial: {
    summary: 'Live video is cacheable for a few seconds and cacheable by everybody at once, which makes a CDN with collapsed misses the whole story for the picture. Chat is a different problem: many open connections and every message copied to every viewer. Run them as two separate systems so a chat flood never freezes the video.',
    designs: [{
      name: 'Two paths: picture on the CDN, chat on sockets',
      why: 'The CDN and shield merge all viewers into a single stream of requests to the ingest storage. Chat flows over a websocket gateway to a chat service, with pub/sub copying each message to the gateways that need it. The two paths share nothing.',
      graph: {
        nodes: [W('web', -90), A('app', 0), T('tv', 90),
          N('geo', 'geo-dns', -340, 0),
          N('cdn', 'cdn', -170, -110, { knobs: { ttlSec: 5, coalesce: true } }),
          N('shield', 'origin-shield', 10, -110),
          N('ingest', 'object-storage', 190, -110),
          N('ws', 'websocket-gateway', -170, 110, { units: 4, zones: 3 }),
          N('chat', 'vm-fleet', 10, 110, { units: 5, zones: 3, knobs: AUTO(4, 20) }),
          N('ps', 'pubsub', 190, 110),
          N('hist', 'wide-column', 370, 110),
          N('idp', 'identity-provider', 10, 230),
          N('api', 'vm-fleet', 10, 0, { units: 3, zones: 2 }),
          N('db', 'sql-primary', 190, 0, { zones: 2 }),
          ...watch('chat', 190, 260).nodes],
        edges: [['web', 'geo'], ['app', 'geo'], ['tv', 'geo'], ['geo', 'cdn'], ['geo', 'ws'], ['cdn', 'shield'], ['shield', 'ingest'], ['cdn', 'api'], ['api', 'db'], ['ws', 'chat'], ['chat', 'idp'], ['chat', 'ps'], ['ps', 'hist'], ...watch('chat', 190, 260).edges]
      },
      expect: { score: 850, costPerMonth: 125000 }
    }],
    tradeoffs: [
      'A 5-second cache is long enough to merge thousands of identical requests and short enough to keep the stream live. A longer cache would make the video lag.',
      'Collapsing misses protects the origin but makes everyone wait if the origin is slow. That is the right trade for live video, because they all wait together.',
      'Splitting chat from video costs more machines but means a spam attack on chat cannot freeze the picture.',
      'Chat history can lose a few messages without anyone noticing. Account data cannot. Treat them differently.',
      'When a region fails, viewers in other regions keep watching only if the CDN and ingest are already spread across regions.'
    ],
    realWorld: 'Live platforms commonly run 3 to 10 seconds behind real time (approx.). One top streamer can hold well over 100,000 viewers at once, while the chat for that stream carries hundreds of messages per second.'
  },
  daily: true
};

// ---------------------------------------------------------------- SOCIAL

const commentsAndLikes = {
  id: 'comments-and-likes',
  title: 'Comments and likes',
  difficulty: 'Easy',
  concepts: ['hot-keys', 'caching'],
  like: 'the like counter under a post',
  brief: 'Under every post sits a like counter and a comment list. Millions tap the heart on the same famous post at the same moment. Showing the exact number is not essential, but showing the person their own like is.',
  clarify: [
    { q: 'Must the like count be exact?', a: 'No. A count that is a few seconds behind or off by a few is fine. It rounds to "1.2M" anyway.' },
    { q: 'Must I see my own like straight away?', a: 'Yes. If you tap the heart and it does not light up, you will tap again.' },
    { q: 'Can a comment be lost?', a: 'Comments should be kept, but losing the last few seconds in a rare crash is acceptable.' },
    { q: 'Do all posts get the same traffic?', a: 'No. One post may get 30 percent of all likes for an hour while a million others get none.' }
  ],
  requirements: {
    users: '10 million people a month',
    monthlyUsers: 10000000,
    peakRps: 30000,
    mix: { read: 0.8, write: 0.18, event: 0.02 },
    latencyP99Ms: { default: 150, write: 300 },
    availability: 0.999,
    dataSafety: 'rpo-1m',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 9000,
    storageTb: 3,
    userRegions: { us: 0.5, eu: 0.3, apac: 0.2 },
    homeRegion: 'us',
    notes: ['A like is only a few bytes. The count is what people keep asking for.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.8, 'web-browser': 0.2 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'viral-spike', at: '20:00', params: { factor: 5 } },
    { id: 'hot-key', at: '13:00', params: { share: 0.1 } }
  ],
  eventPool: ['cache-stampede', 'replication-lag', 'bot-scraping'],
  numbers: [
    { label: 'Reads per second at peak', value: 24000, unit: 'req/s', how: '30,000 x 0.8 (approx.)', ask: true },
    { label: 'Likes and comments per second at peak', value: 5400, unit: 'writes/s', how: '30,000 x 0.18 (approx.)', ask: true },
    { label: 'Taps per second on the single hottest post', value: 3000, unit: 'req/s', how: '30,000 × 0.1 (approx.)' }
  ],
  hints: [
    'What if one row in your database got 10,000 writes per second?',
    'A cache in front handles repeat reads of the same count. A queue turns a burst of writes into a steady drip that workers apply in batches.',
    'Try: app servers -> distributed cache -> key-value store for reads. For writes: app servers -> queue -> worker pool -> key-value store. Show the user their own like from the app, not from the cache.'
  ],
  editorial: {
    summary: 'A like counter is a hot key in disguise. The fix is to stop treating each tap as a database write. Absorb the burst in a queue, add the taps up in workers, and serve the number from a cache. The database sees a few updates per second per post instead of thousands.',
    designs: [{
      name: 'Cache for reads, queue and batch for writes',
      why: 'Reads of counts and comments come from a distributed cache. Likes go into a queue, and workers apply them in batches, so the hot post becomes a handful of updates per second. The key-value store stays comfortable even when the hottest post takes a tenth of all taps.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('api', 'vm-fleet', -300, 0, { units: 10, zones: 2, knobs: AUTO(6, 30) }),
          N('cache', 'distributed-cache', -100, -90, { units: 3, knobs: { ttlSec: 5 } }),
          N('kv', 'kv-store', 100, -20, { units: 4 }),
          N('q', 'queue', -100, 90),
          N('wp', 'worker-pool', 100, 90, { units: 4 }),
          ...watch('api', -300, 200).nodes],
        edges: [['app', 'api'], ['web', 'api'], ['api', 'cache'], ['cache', 'kv'], ['api', 'q'], ['q', 'wp'], ['wp', 'kv'], ...watch('api', -300, 200).edges]
      },
      expect: { score: 900, costPerMonth: 7400 }
    }],
    tradeoffs: [
      'A five-second cache keeps counts cheap but means a count can be five seconds old. Rounding to "1.2M" hides it.',
      'Batching likes in workers saves the database but means a crash can lose the last few seconds of taps. That is the "lose up to a minute" trade the requirement allows.',
      'Showing the user their own like from the app, and not from the cache, avoids the double tap at no cost.',
      'Splitting a hot counter into several parts spreads the writes but makes the total a sum of parts.'
    ],
    realWorld: 'Counters for the most liked posts are commonly kept in memory and written to the database in batches of seconds (approx.). The same post can take well over 10,000 taps per second in a burst.'
  },
  daily: true
};

const chatApp = {
  id: 'chat-app',
  title: 'One-to-one chat',
  difficulty: 'Medium',
  concepts: ['realtime-connections', 'idempotency-retries'],
  like: 'a chat app like WhatsApp',
  brief: 'People send short messages to each other from their phones. A message must arrive once, in order, even when the phone is on a bad connection and sends it again. If the other person is offline, the message waits and a notification goes out.',
  clarify: [
    { q: 'What if the phone loses signal mid-send?', a: 'The app retries. The message must still arrive exactly once.' },
    { q: 'What if the other person is offline?', a: 'Save the message and send a push notification. They get it when they open the app.' },
    { q: 'Can a message ever be lost?', a: 'Never. Once the app shows one tick, the message is safe on your side.' },
    { q: 'What happens in the morning?', a: 'Millions of phones wake up and reconnect in the same minute and ask what they missed.' }
  ],
  requirements: {
    users: '10 million people a month',
    monthlyUsers: 10000000,
    peakRps: 20000,
    mix: { message: 0.55, sync: 0.15, read: 0.1, event: 0.1, login: 0.02, notify: 0.08 },
    latencyP99Ms: { default: 400, message: 300 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 25000,
    storageTb: 30,
    userRegions: { us: 0.3, eu: 0.3, apac: 0.4 },
    homeRegion: 'us',
    notes: ['A message is about 1 KB (approx.).', 'A delivery receipt ("delivered", "read") counts as an event.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.9, 'web-browser': 0.1 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'thundering-herd', at: '08:00' },
    { id: 'zone-outage', at: '14:00' },
    { id: 'duplicate-delivery', at: '19:00' }
  ],
  eventPool: ['third-party-rate-limit', 'retry-storm', 'network-partition'],
  numbers: [
    { label: 'Messages per second at peak', value: 11000, unit: 'msg/s', how: '20,000 x 0.55 (approx.)', ask: true },
    { label: 'Messages stored per day', value: 400000000, unit: 'messages', how: 'about 40 per person per day x 10 million (approx.)' },
    { label: 'Storage added per year', value: 146, unit: 'TB', how: '400 million x 1 KB x 365 = about 146 TB (approx.)', ask: true }
  ],
  hints: [
    'What stops the same message from showing up twice when the phone retries?',
    'Give every message an id made by the phone. An idempotency store remembers ids already seen, so a retry changes nothing.',
    'Try: phones -> websocket gateway -> chat servers -> idempotency store, then a wide-column store for messages and a push service for offline people. Spread everything over three zones.'
  ],
  editorial: {
    summary: 'The hard part of chat is not volume, it is "exactly once" on a bad network. The phone gives each message an id; the server checks a fast store of ids before saving. Messages go to a store built for huge appends. A held-open connection delivers to online people, and a push notification reaches the offline ones.',
    designs: [{
      name: 'Sockets, idempotency and a message log',
      why: 'The websocket gateway holds the connections and delivers instantly to people online. Chat servers check the idempotency store, write to a wide-column store, and ask the push service to nudge offline recipients. Three zones keep it running when a building fails.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('ws', 'websocket-gateway', -300, 0, { units: 4, zones: 3 }),
          N('chat', 'vm-fleet', -110, 0, { units: 6, zones: 3, knobs: AUTO(4, 20) }),
          N('idem', 'idempotency-store', 80, -140),
          N('msgs', 'wide-column', 80, -30, { units: 4, zones: 3 }),
          N('cache', 'distributed-cache', 80, 80),
          N('push', 'push-service', 80, 190),
          N('q', 'queue', 80, 290),
          N('wp', 'worker-pool', 260, 290, { units: 2 }),
          N('bk', 'backups', 260, -30),
          ...watch('chat', -110, 190).nodes],
        edges: [['app', 'ws'], ['web', 'ws'], ['ws', 'chat'], ['chat', 'idem'], ['chat', 'msgs'], ['chat', 'cache'], ['cache', 'msgs'], ['chat', 'push'], ['chat', 'q'], ['q', 'wp'], ['wp', 'msgs'], ['bk', 'msgs'], ...watch('chat', -110, 190).edges]
      },
      expect: { score: 900, costPerMonth: 21000 }
    }],
    tradeoffs: [
      'Storing each message in three zones before saying "sent" costs a few milliseconds but means a failed building loses nothing.',
      'The idempotency store adds one quick lookup per message. It is the price of "never twice".',
      'Holding open connections costs memory on the gateways, but is far cheaper than phones asking "any news?" every few seconds.',
      'A morning reconnect surge can be absorbed with spare gateway capacity, or spread out by having phones wait a random moment before reconnecting.'
    ],
    realWorld: 'A single well-built chat server can hold several hundred thousand open connections (approx.). Large messaging apps handle tens of billions of messages a day, mostly small and mostly delivered within a second.'
  },
  daily: true
};

const stories = {
  id: 'stories',
  title: 'Disappearing stories',
  difficulty: 'Medium',
  concepts: ['storage-tiers', 'cdn'],
  like: '24-hour stories',
  brief: 'People post photos and short clips that vanish after 24 hours. Followers tap through a tray of stories every day, and the poster sees who looked. Deleting on time matters: storage must not grow forever.',
  clarify: [
    { q: 'What happens at hour 24?', a: 'The story must stop being visible and the files should be deleted soon after to save money.' },
    { q: 'Who sees the "seen by" list?', a: 'Only the poster. Every view tap is an event that has to be recorded, though it can arrive a few seconds late.' },
    { q: 'Is a story a hot item?', a: 'Sometimes. A celebrity story can be viewed by millions in an hour. Most stories are seen by a few friends.' },
    { q: 'Do stories have to be kept for anyone later?', a: 'No. They disappear for everyone, which makes the storage story easy: nothing is kept forever.' }
  ],
  requirements: {
    users: '5 million people a month',
    monthlyUsers: 5000000,
    peakRps: 3000,
    mix: { read: 0.67, stream: 0.1, upload: 0.02, write: 0.03, event: 0.18 },
    latencyP99Ms: { default: 300, stream: 1000, upload: 5000 },
    availability: 0.998,
    dataSafety: 'rpo-1m',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 45000,
    storageTb: 120,
    userRegions: { us: 0.4, eu: 0.3, apac: 0.3 },
    homeRegion: 'us',
    notes: ['Each story is about 3 MB in total (approx.).', 'Stories are deleted after 24 hours. Storage depends on how well you expire them.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.9, 'web-browser': 0.1 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'viral-spike', at: '19:00', params: { factor: 5 } },
    { id: 'cost-blowout', at: '13:00' }
  ],
  eventPool: ['cache-stampede', 'hot-key', 'bad-deploy'],
  numbers: [
    { label: 'Story views and tray loads per second at peak', value: 2010, unit: 'req/s', how: '3,000 x 0.67 (approx.)', ask: true },
    { label: 'Stories posted per day', value: 1500000, unit: 'stories', how: 'about 1 in 3 people posts one (approx.)' },
    { label: 'Storage in use at any time', value: 4.5, unit: 'TB', how: '1,500,000 x 3 MB, only the last day is kept (approx.)', ask: true }
  ],
  hints: [
    'What makes this storage cheaper than a photo app? Think about what happens to a story after one day.',
    'Object storage can delete files by age on its own. A short retention keeps the storage bill flat instead of growing every day.',
    'Try: phones -> CDN -> app servers -> key-value store for the tray and view lists, object storage with a 1-day retention for the files. View events go through a queue.'
  ],
  editorial: {
    summary: 'A story app stores a lot of media but only keeps it for one day, so the cheapest design is the one that deletes on time. Let object storage expire files by itself, serve the media through a CDN, keep the tray of stories in a fast key-value store, and push "seen" events through a queue.',
    designs: [{
      name: 'One-day storage, CDN, event queue',
      why: 'The retention setting deletes old stories without any code. The CDN keeps today\'s hot stories at the edge. The tray and the seen list are tiny records in a key-value store, and view events flow through a queue so a celebrity story does not overwhelm the database.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('cdn', 'cdn', -310, 0, { knobs: { ttlSec: 3600, coalesce: true } }),
          N('api', 'vm-fleet', -130, 0, { units: 4, zones: 2, knobs: AUTO(3, 16) }),
          N('files', 'object-storage', 50, -100, { knobs: { retentionDays: 1 } }),
          N('cache', 'distributed-cache', 50, 0, { knobs: { ttlSec: 60 } }),
          N('kv', 'kv-store', 230, 0, { units: 3 }),
          N('q', 'queue', 50, 110),
          N('wp', 'worker-pool', 230, 110, { units: 2 }),
          ...watch('api', -130, 230).nodes],
        edges: [['app', 'cdn'], ['web', 'cdn'], ['cdn', 'files'], ['cdn', 'api'], ['api', 'files'], ['api', 'cache'], ['cache', 'kv'], ['api', 'kv'], ['api', 'q'], ['q', 'wp'], ['wp', 'kv'], ...watch('api', -130, 230).edges]
      },
      expect: { score: 900, costPerMonth: 36000 }
    }],
    tradeoffs: [
      'A retention rule makes storage flat, but it also makes deletion permanent. A "save my story" feature needs a separate copy.',
      'A one-hour CDN cache keeps the bandwidth bill low, but a story deleted early can stay visible for a while. Short caches cost more and are safer.',
      'View events can arrive late, so the "seen by" list may be a few seconds behind. Nobody notices.',
      'A cold archive makes no sense here. The whole point is that stories disappear.'
    ],
    realWorld: 'Stories apps are among the heaviest media-upload workloads: hundreds of millions of stories a day across the largest apps (approx.). Because everything expires after a day, storage grows with the daily upload rate and not with the age of the service.'
  },
  daily: true
};

const socialFeed = {
  id: 'social-feed',
  title: 'Social feed',
  difficulty: 'Hard',
  concepts: ['fanout', 'caching', 'hot-keys'],
  like: 'a home timeline like X or Facebook',
  brief: 'Every person opens the app and sees a feed of posts from the people they follow. Most people have a few hundred followers, but a few have millions, and when they post, millions of feeds must change. The feed must be fast and your own post must show up at once.',
  clarify: [
    { q: 'Must the feed be perfectly fresh?', a: 'A few seconds behind is fine, except for your own posts, which must show at once.' },
    { q: 'How many followers does a typical account have?', a: 'About 200. A few thousand accounts have over a million.' },
    { q: 'How often do people read versus post?', a: 'Roughly 40 reads for every post. Reading is the hot path.' },
    { q: 'Are feeds ranked or in order of time?', a: 'In order of time to start with. Ranking can come later.' }
  ],
  requirements: {
    users: '50 million people a month',
    monthlyUsers: 50000000,
    peakRps: 60000,
    mix: { read: 0.8, event: 0.12, notify: 0.03, write: 0.02, search: 0.02, login: 0.01 },
    latencyP99Ms: { default: 300, search: 500 },
    availability: 0.999,
    dataSafety: 'rpo-1m',
    readYourWrites: true,
    compliance: [],
    budgetPerMonth: 90000,
    storageTb: 60,
    userRegions: { us: 0.4, eu: 0.3, apac: 0.3 },
    homeRegion: 'us',
    notes: ['About 20 million posts are made per day (approx.).', 'A post is about 1 KB. Media is handled by a different system.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'mobile-app': 0.75, 'web-browser': 0.25 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(A('app', -60)), lock(W('web', 60))], edges: [] },
  events: [
    { id: 'celebrity-fanout', at: '12:00' },
    { id: 'hot-key', at: '17:30', params: { share: 0.3 } },
    { id: 'cache-stampede', at: '08:15' }
  ],
  eventPool: ['replication-lag', 'viral-spike', 'bad-deploy'],
  numbers: [
    { label: 'Feed loads per second at peak', value: 48000, unit: 'req/s', how: '60,000 x 0.8 (approx.)', ask: true },
    { label: 'Posts per second on average', value: 230, unit: 'posts/s', how: '20 million per day / 86,400 (approx.)', ask: true },
    { label: 'Feed updates per second with fanout on write', value: 46000, unit: 'writes/s', how: '230 posts/s x 200 followers (approx.)', ask: true }
  ],
  hints: [
    'There are many more reads than posts. Would you rather do the work when someone posts, or when someone reads?',
    'Pushing a post into every follower\'s ready-made feed makes reads very fast. But a celebrity with 5 million followers makes one post become 5 million writes. Handle big accounts differently.',
    'Try: a queue and worker pool that push each post into followers\' feeds held in a distributed cache. For accounts with more than a few thousand followers, skip the push and merge their posts when the feed is read.'
  ],
  editorial: {
    summary: 'The standard answer is a hybrid. For normal accounts, push each new post into every follower\'s ready-made feed, so reading is one cache lookup. For celebrities, do not push: merge their latest posts into the feed at read time. A queue absorbs the burst of work that a post causes.',
    designs: [{
      name: 'Hybrid fanout: push for most, pull for celebrities',
      why: 'Feeds are held in a distributed cache so each read is one lookup. A queue and workers apply the push for normal accounts. Posts from very large accounts are fetched when needed and merged, so one celebrity post does not become millions of writes.',
      graph: {
        nodes: [A('app', -60), W('web', 60),
          N('gw', 'api-gateway', -320, 0),
          N('api', 'vm-fleet', -150, 0, { units: 20, zones: 3, knobs: AUTO(12, 60) }),
          N('feeds', 'distributed-cache', 40, -150, { units: 8, zones: 3 }),
          N('posts', 'wide-column', 230, -60, { units: 6, zones: 3 }),
          N('graph', 'graph-db', 230, 60, { units: 3 }),
          N('q', 'queue', 40, 50),
          N('fan', 'worker-pool', 40, 150, { units: 10, knobs: AUTO(6, 40) }),
          N('idx', 'search-index', 40, 250, { units: 2 }),
          N('push', 'push-service', 230, 250),
          N('bk', 'backups', 410, -60),
          ...watch('api', -150, 360).nodes],
        edges: [['app', 'gw'], ['web', 'gw'], ['gw', 'api'], ['api', 'feeds'], ['feeds', 'posts'], ['api', 'posts'], ['api', 'q'], ['q', 'fan'], ['fan', 'posts'], ['fan', 'graph'], ['api', 'idx'], ['api', 'push'], ['bk', 'posts'], ...watch('api', -150, 360).edges]
      },
      expect: { score: 850, costPerMonth: 82000 }
    }],
    tradeoffs: [
      'Pushing into feeds makes reads very fast but multiplies every post by its follower count. That is cheap at 200 followers and ruinous at 5 million.',
      'Merging a celebrity\'s posts at read time makes reads a little slower but avoids millions of writes. It is the price of treating big accounts differently.',
      'Keeping feeds only in a cache is fast but risky. A lost feed can be rebuilt from the posts, so the cache is the shortcut and the posts are the truth.',
      'Your own post should be added to your own feed in the request itself, so you see it at once, while the push to followers can happen a few seconds later.',
      'A queue between "post saved" and "feeds updated" means a spike of posts becomes a short delay and not an outage.'
    ],
    realWorld: 'Big timelines are commonly built from cached lists of post ids per person, so a read touches memory and not a disk (approx.). Accounts with millions of followers are usually handled apart from the rest.'
  },
  daily: true
};

const groupChatPresence = {
  id: 'group-chat-presence',
  title: 'Group chat and presence',
  difficulty: 'Hard',
  concepts: ['realtime-connections', 'fanout', 'consistency'],
  like: 'team chat like Slack or Discord',
  brief: 'Teams talk in channels with many people. Everyone sees messages in the same order, sees who is online and who is typing, and gets notified when mentioned. At nine every morning thousands of workplaces start at once, and one announcement can reach a channel of tens of thousands.',
  clarify: [
    { q: 'Must everyone see messages in the same order?', a: 'Yes. A conversation that reads differently for two people is broken.' },
    { q: 'Is "online" status worth saving forever?', a: 'No. It is a guess that expires in half a minute. It is gone if nobody refreshes it.' },
    { q: 'How big is the biggest channel?', a: 'A company-wide channel might have 50,000 members. A message there reaches everyone online.' },
    { q: 'What do businesses ask for?', a: 'A record of who did what, and proof that their messages are encrypted with keys managed in a key service.' }
  ],
  requirements: {
    users: '3 million people a month',
    monthlyUsers: 3000000,
    peakRps: 25000,
    mix: { message: 0.45, event: 0.2, read: 0.15, write: 0.05, sync: 0.05, notify: 0.05, search: 0.03, login: 0.02 },
    latencyP99Ms: { default: 400, message: 300, search: 700 },
    availability: 0.999,
    dataSafety: 'no-loss',
    readYourWrites: true,
    compliance: ['audit-log', 'encryption'],
    budgetPerMonth: 40000,
    storageTb: 25,
    userRegions: { us: 0.5, eu: 0.35, apac: 0.15 },
    homeRegion: 'us',
    notes: [
      'Presence updates ("online", "typing") are the biggest source of events (approx.).',
      'A message sent in a 50,000-person channel becomes up to 50,000 deliveries.'
    ]
  },
  traffic: { curve: 'business-hours', sources: { 'web-browser': 0.5, 'mobile-app': 0.5 }, params: {} },
  requires: {},
  palette: null,
  starter: { nodes: [lock(W('web', -60)), lock(A('app', 60))], edges: [] },
  events: [
    { id: 'thundering-herd', at: '09:00' },
    { id: 'celebrity-fanout', at: '14:00', params: { factor: 20 } },
    { id: 'network-partition', at: '16:00' }
  ],
  eventPool: ['compliance-audit', 'replication-lag', 'zone-outage'],
  numbers: [
    { label: 'Messages per second at peak', value: 11250, unit: 'msg/s', how: '25,000 x 0.45 (approx.)', ask: true },
    { label: 'Presence and typing events per second at peak', value: 5000, unit: 'events/s', how: '25,000 x 0.2 (approx.)', ask: true },
    { label: 'Deliveries from one message in the biggest channel', value: 50000, unit: 'deliveries', how: '50,000 members online (approx.)' }
  ],
  hints: [
    'Presence changes constantly and is worthless after a minute. Should it live in the same database as messages?',
    'Keep presence in a cache with a short expiry and let it fade on its own. Messages need a store that keeps order. Pub/sub copies one message to every gateway that has a member of the channel.',
    'Try: websocket gateways -> chat servers -> pub/sub for fanout, wide-column for messages in order, a distributed cache for presence. Add a key service and an audit log for the compliance asks.'
  ],
  editorial: {
    summary: 'Treat three kinds of data as three systems. Messages are durable and ordered: a store built for appends, one writer per channel. Presence is temporary: a cache with expiry. Delivery is a fanout: pub/sub copies each message once per gateway, and each gateway pushes to its own connections. The compliance asks are met by a key service and an audit log.',
    designs: [{
      name: 'Messages, presence and fanout kept apart',
      why: 'The gateways hold the connections. Chat servers order and save each message, then publish it once. Pub/sub hands it to each gateway that needs it. Presence lives in a cache and fades by itself. A key service and audit log cover the compliance checks.',
      graph: {
        nodes: [W('web', -60), A('app', 60),
          N('ws', 'websocket-gateway', -320, 0, { units: 6, zones: 3 }),
          N('chat', 'vm-fleet', -140, 0, { units: 10, zones: 3, knobs: AUTO(6, 30) }),
          N('ps', 'pubsub', 50, -150),
          N('msgs', 'wide-column', 50, -40, { units: 4, zones: 3 }),
          N('presence', 'distributed-cache', 50, 70, { units: 3 }),
          N('idx', 'search-index', 50, 170, { units: 2 }),
          N('push', 'push-service', 50, 270),
          N('kms', 'kms', 230, -40),
          N('audit', 'audit-log', 230, 70),
          N('idp', 'identity-provider', 230, 170),
          N('bk', 'backups', 230, -150),
          ...watch('chat', -140, 380).nodes],
        edges: [['web', 'ws'], ['app', 'ws'], ['ws', 'chat'], ['chat', 'ps'], ['ps', 'idx'], ['chat', 'msgs'], ['chat', 'presence'], ['chat', 'idx'], ['chat', 'push'], ['chat', 'kms'], ['chat', 'audit'], ['chat', 'idp'], ['bk', 'msgs'], ...watch('chat', -140, 380).edges]
      },
      expect: { score: 850, costPerMonth: 36000 }
    }],
    tradeoffs: [
      'One writer per channel keeps order simple, but a very busy channel is then limited by that writer. Splitting a channel breaks the order guarantee.',
      'Presence in a cache with an expiry is cheap and self-cleaning, but it can be wrong for up to half a minute after a phone vanishes.',
      'Delivering a message to 50,000 people costs 50,000 pushes. Sending it to a gateway once and letting the gateway fan out keeps the central servers calm.',
      'A partition forces a choice: keep chatting on both sides and fix the order afterwards, or pause one side. Chat usually keeps sending and merges later.',
      'Encryption and audit logs add a small cost and a lookup per message, and they are what a business customer asks for first.'
    ],
    realWorld: 'Team chat apps hold millions of connections open at the same time (approx.), with presence kept in memory and messages kept in sharded stores. A company-wide message can reach tens of thousands of people in about a second.'
  },
  daily: true
};

// ---------------------------------------------------------------- EXPORT

export const media = {
  group: { id: 'media', title: 'Media and streaming', blurb: 'Photos, music, podcasts, news and video: big files, huge crowds, and a bandwidth bill.' },
  problems: [photoSharing, podcastHosting, newsSite, musicStreaming, videoOnDemand, shortVideoFeed, videoUploadPipeline, liveStreaming]
};

export const social = {
  group: { id: 'social', title: 'Social and messaging', blurb: 'Likes, chats, stories and feeds: tiny messages, enormous fanout.' },
  problems: [commentsAndLikes, chatApp, stories, socialFeed, groupChatPresence]
};

export const groups = [media, social];
export default media;
