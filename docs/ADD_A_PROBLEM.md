# Add a problem

Use Node 24. See [CONTRIBUTING.md](../CONTRIBUTING.md) for running the site.

## Pick your scenario

Begin by looking through `content/data/lite.json` for problems that already exist. A list of problems is also in section 5 of [DESIGN.md](../DESIGN.md).

Start with an Easy problem and only one constraint, such as many reads and few writes. From `content/problems/index.js`, pick a group. Then select the related lesson ids from `content/lessons/` for its `concepts`.

## Create the file

Create a new file called `content/problems/my-problems.js` with the starter below, and replace `my-problem` and the text describing your scenario. The initial reference design will need calibration. How to do that follows.

```js
// Community problems: one file per contributor or theme, listed in content/problems/index.js.
// Helpers for the starter and reference designs. S is a locked request source on the left, N is a part you place.
const S = (ref, type, y = 0, label) => ({ ref, type, x: -480, y, locked: true, ...(label ? { label } : {}) });
const N = (ref, type, x, y, o = {}) => ({ ref, type, x, y, ...o });
const X = [-480, -300, -120, 60, 240, 420, 600, 780];

export default {
  group: { id: 'core', title: 'Core building blocks', blurb: 'The small services every product leans on.' },
  problems: [
    {
      id: 'my-problem', title: 'My problem', difficulty: 'Easy',
      concepts: ['caching', 'back-of-envelope'],
      like: 'a service like Example',
      brief: 'You run the lookup service for a small product. People look things up all day and now and then someone adds a new item. Lookups must feel instant.',
      clarify: [
        { q: 'Can a lookup show an answer that is a minute old?', a: 'Yes. A minute old is fine, so a cache is safe for lookups.' },
        { q: 'Can a new item be lost?', a: 'No. Once added, an item must survive a server failure.' },
        { q: 'How many people look compared with people who add?', a: 'About 50 look for every 1 who adds (approx.).' }
      ],
      requirements: {
        users: '1 million people a month (approx.)', monthlyUsers: 1000000, peakRps: 1000,
        mix: { read: 0.98, write: 0.02 }, latencyP99Ms: { default: 300 }, availability: 0.999,
        dataSafety: 'no-loss', readYourWrites: false, compliance: [], budgetPerMonth: 3000, storageTb: 0.2,
        userRegions: { us: 1 }, homeRegion: 'us',
        notes: ['About 20 new items a second at the peak (approx.).', 'All numbers are rough approximations.']
      },
      traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },
      requires: {}, palette: null,
      starter: { nodes: [S('web', 'web-browser', -60, 'Website'), S('app', 'mobile-app', 80, 'Mobile app')], edges: [] },
      events: [{ id: 'viral-spike', at: '19:30', params: { factor: 3 } }],
      eventPool: ['cache-stampede'],
      numbers: [
        { label: 'Lookups per second at peak', value: 980, unit: 'req/s', how: '1,000 × 0.98 (approx.)', ask: true },
        { label: 'New items per second at peak', value: 20, unit: 'writes/s', how: '1,000 × 0.02 (approx.)', ask: true }
      ],
      hints: [
        'Most requests only look. Which part can answer them without asking the database?',
        'A cache can hold recent answers. Writes still have to reach the database.',
        'Load balancer, a few servers, a cache for lookups, and one SQL database.'
      ],
      editorial: {
        summary: 'Almost all traffic is lookups, so a cache answers it. The few writes go straight to the database.',
        designs: [{
          name: 'Cache for lookups, one database',
          why: 'The cache answers lookups from memory. Writes skip it and land in the database, so nothing is lost.',
          graph: {
            nodes: [S('web', 'web-browser', -60), S('app', 'mobile-app', 80),
              N('lb', 'regional-lb', X[1], 10, { zones: 2 }), N('api', 'vm-fleet', X[2], 10, { units: 3, zones: 2 }),
              N('cache', 'cache', X[3], -50, { knobs: { ttlSec: 60 } }), N('db', 'sql-primary', X[4], 10),
              N('metrics', 'metrics', X[3], 130), N('alerts', 'alerting', X[4], 130)],
            edges: [['web', 'lb'], ['app', 'lb'], ['lb', 'api'], ['api', 'cache'], ['cache', 'db'], ['api', 'db'], ['api', 'metrics'], ['metrics', 'alerts']]
          },
          expect: { score: 900, costPerMonth: 2000 }
        }],
        tradeoffs: [
          'A longer cache time saves the database but shows older answers.',
          'One database is simple and safe. Splitting it adds work you do not need yet.'
        ],
        realWorld: 'In this example, 98 of every 100 requests are lookups (approx.). A cache can serve repeated lookups.'
      }
    }
  ]
};
```

For another Easy example, read `restaurant-reservations` in `content/problems/more-easy.js`.

## Fill in the fields

| Field | What to use |
|---|---|
| `id` | A unique id, lowercase with hyphens. |
| `difficulty` | `Easy`, `Medium` or `Hard`. |
| `concepts` | Lesson file names without `.js`. |
| `like` | A plain comparison. Put real company names only here. |
| `brief` | A short explanation addressed to the player as "you". |
| `clarify` | Questions whose answers affect the design. Aim for 2 to 4. |
| `requirements.mix` | Request ids from `catalog/requests.json`. Their shares must add up to 1. |
| `requirements.peakRps` | Total real user requests per second at the daily peak. |
| `traffic.curve` | A curve from `catalog/world.json`, or a supported special curve such as `deadline`. |
| `events` | Event ids from `catalog/events.json`, with scheduled times. |
| `eventPool` | Extra events available for variants. |
| `numbers` | 1 to 3 rows with `ask: true`. Show the arithmetic in `how`. |
| `hints` | Exactly 3, from a nudge to a near answer. |
| `editorial.designs` | At least one reference design, using parts from `catalog/elements.json`. |

Place "(approx.)" after rounded numbers. Identify assumptions for the scenario as assumptions, and give a source for claims about real-world systems.

Leave space for at least 132 px between parts horizontally or 112 px vertically so they don't overlap. The `X` array creates the column spacing. Request sources are locked on the left at `x: -480`.

Leave `daily` out. Adding a problem to the daily pool changes which challenges will be drawn in the future. Daily eligibility needs its own review.

## Register and measure it

In `content/problems/index.js`, import your new file and append it to `files`:

```js
import myProblems from './my-problems.js';
// ...
const files = [...mediaSocial, money, /* ... */ deeper, myProblems];
```

The group comes from `group.id` in your new file. Preserve the existing line endings. The diff for `index.js` should show just the import and list addition.

Run these from the root of the repository with your problem id:

```sh
node tests/content-run.mjs my-problem
node tests/calibrate.mjs --write my-problem
node tools/gen-twists.mjs --resume
node tools/gen-content.mjs
node tests/content-run.mjs my-problem
```

`--resume` adds a twist to problems that don't have one yet. Without `--resume`, `gen-twists` recalculates each problem and updates files you did not alter.

The reference from your starter may fail before calibration. Calibration runs a full day, sizes the design, sets the budget and records measured expectations. The reference must pass and there must be no entries in the `issues` list afterward. Read any additional failures and correct the problem before proceeding.

Add your new file and the `index.js` modification along with:

- `content/problems/calibration.js`
- `content/problems/twists.js`
- `content/data/lite.json`
- `content/data/p/my-problem.json`

Review the generated diff for unrelated modifications.

## Play and check it

Serve the site and open http://localhost:8000/#/practice/my-problem. Read the brief in the game. Attempt a failing design and check that the debrief explains why it failed. Check that the reference is readable by opening the editorial.

Next, check the entire bank:

```sh
node tests/content-refs.mjs my-problem
node tests/content-run.mjs
node tests/correctness-checks.mjs
node tests/promise-sweep.mjs
```

## Generate the readable page

```sh
node tools/gen-site-pages.mjs
node tests/site-pages.mjs
```

This generates `p/my-problem/index.html` and updates problem listings: `index.html`, `problems/index.html`, the guides, lesson pages for your `concepts`, related problem pages, `sitemap.xml`, `llms.txt`, `llms-full.txt` and `tools/site-pages-manifest.json`. Include all of them.

Don't use `tools/gen-daily-pages.mjs` for this. It will generate new dates under `d/` that do not belong in your pull request.

The generated page has no `preview.jpg`, so `tests/daily-pages.mjs` reports the missing image. Note that in your pull request so it can be added before publication.

Update the problem counts in `README.md` and `DESIGN.md`, and include a row for your problem in its group in `DESIGN.md` section 5.

## Open the pull request

One problem per pull request. Give its name and difficulty, and describe the design constraint. Say which checks you ran and where a preview image is missing. If any steps in this guide were confusing, include those too so I can fix them.
