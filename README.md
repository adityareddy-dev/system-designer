# System Designer

**Build the system. Survive the day. See why it held.**

System Designer is a free, open-source browser game for practising system design. You read a real problem (a URL shortener, a bank ledger, a concert ticket drop), draw an architecture from 99 building blocks, then fast-forward through a full day of traffic with viral spikes, outages and retry storms. Every request flows through your design as moving light. At the end a plain-words debrief scores uptime, speed, data safety and monthly cost, and explains each trade-off.

It is for everyone: students meeting a load balancer for the first time, interview candidates, junior and senior engineers, product people, and friends who want to beat each other's designs. On https://systemdesigner.io you sign in with a free Google or GitHub account to play, which keeps your progress on every device and puts your scores on the Challenge leaderboards. The problems, lessons and guides can be read without one. This code is MIT licensed: run your own copy and it plays with no account at all.

## How to play

1. **Clarify.** Read the brief and tap the questions to reveal facts that change the design.
2. **Numbers.** Estimate the key figures (requests per second, storage, bandwidth), then see the worked answer.
3. **Draw.** Drag parts from the toolbar onto the canvas and connect them. Drop a part on a connection to put it in between. Tune sizes and settings in the inspector. A live cost meter and a "will it hold at peak?" check update as you build.
4. **Traffic day.** Press Start. The clock runs from 00:00 to 24:00 with the problem's daily traffic and its events. Pause or change speed at any time.
5. **Debrief.** Score out of 1,000, stars, the story of each event, and one thing to try next. Then retry, read the hints, open the editorial with reference designs, or share your result.

Keyboard: `Enter` starts the day, `Space` pauses, `1` to `7` set the speed, `/` searches parts, `F` fits the view, `H` opens hints, `Ctrl+Z` undoes. Touch works too: drag to pan, pinch to zoom, long-press a part for its menu.

## Sections

- **Learn**: 41 lessons, one idea each (caching, load balancing, replication lag, sharding, queues and backpressure, consistency, idempotency and retries, rate limiting, CDNs, multi-region, observability, cost, AI serving and more), with live demos where the engine models the idea, worked examples for deeper mechanisms, and reasoning checks. Go deeper and Lead the design add 17 lessons of 5 to 8 minutes, with written choices to defend.
- **Practice**: 82 problems across 15 industries (commerce, telecom, media, social, finance, healthcare, government and education, mobility, travel, IoT, AI and ads, games, productivity, developer tools and core building blocks), filtered by difficulty, industry and concept. Every problem has hints and an editorial with at least one reference design measured in the engine.
- **Challenge**: one seeded scenario per day, the same for everyone, with personal bests and a streak. "Beat my design" links carry the whole architecture and score in the URL, and the receiver's browser replays the day to verify the score. A result card image can be saved or shared. Signed-in players also get leaderboards, one per day and one per problem; the server replays every submitted design with the same traffic and keeps its own score, so only the design counts (the editorial's own designs, and near copies of them, are not listed).
- **Sandbox**: any part, any traffic, any event, no game over. Five save slots and share links.

## About the numbers

Every price, capacity and latency in the game is a rounded real-world approximation, shown with ≈ and labelled as one. Prices follow public list prices of the large cloud providers; capacities and latencies follow commonly published figures. Problem budgets and targets were measured by playing each reference design through a full simulated day. Real systems vary, so treat the figures as a sense of scale, not a quote.

Real company names appear only as plain comparisons ("a video service like Netflix"), never as logos or branding. All icons, sounds, text and the element catalog are original to this project.

## Run it locally

It is a static site: plain HTML, CSS and JavaScript modules, with no build step and no install. Any static file server works, for example:

```sh
cd system-designer
python3 -m http.server 8000
# open http://localhost:8000/
```

Opening `index.html` straight from disk will not work, because browsers block module imports from `file://` URLs. The page loads PixiJS 8.6.6 from jsDelivr and fonts from Google Fonts; everything else is in this folder. It runs as is on GitHub Pages, including under a sub-path.

### Release build (optional)

Development needs no build. For the live site, `node tools/release.mjs` (esbuild installed anywhere; point `ESBUILD_DIR` at the folder holding `node_modules/esbuild`) writes `dist/`: the modules bundled into a handful of files, one stylesheet, and one file holding every icon. PixiJS loads only when a page with a canvas opens. Publish `dist/`.

The release includes the readable `problems/`, `p/`, `learn/`, `guides/` and `d/` pages, their previews, `assets/site.css`, `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`. Publish the whole `dist/` folder so reading links and game links share the same base path.

After editing game content or guide prose in `tools/site-guides.mjs`, run `node tools/gen-site-pages.mjs` and commit the generated pages with the source. This requires only Node and leaves the game unchanged. It refreshes the home fallback, structured data, catalogue and crawler files. Last modification dates are recorded when each page's text changes, so rerunning it preserves dates. `node tools/gen-site-pages.mjs --check` checks deterministic output and drift without writing files.

`node tools/gen-daily-pages.mjs` also generates new daily dates and preview cards, reusing the same renderer for lessons. Pass `--no-images` to update text without a browser, or set `PUPPETEER_CORE` to an existing module and `CHROME` to Chrome's executable. Use `--from YYYY-MM-DD --days N` for a fixed date range, or `DAILY_FROM=YYYY-MM-DD` when running the release. Existing dated challenge links keep their forwarding behavior; problem pages forward only beat links.

`node tests/site-pages.mjs` checks generated content, metadata, structured data, local links and shared fragments. To check a release, run `node tests/site-pages.mjs dist` after the release build. The not-found recovery page is deliberately excluded from the sitemap.

## Project layout

| Folder | What it holds |
|---|---|
| `catalog/` | Elements, request types, events, regions, traffic curves and scoring rules as JSON |
| `sim/` | The traffic engine: a deterministic flow model in fixed 10-second ticks (runs in the browser and in Node) |
| `render/` | The PixiJS canvas: parts, connections, request particles, glow and input |
| `ui/shell/`, `ui/play/` | Pages, navigation, settings, and the in-problem workbench |
| `compete/` | Daily challenge, share links, personal bests and result cards |
| `content/` | Problems, lessons, design fixes and measured calibration |
| `account/` | Optional sign-in in the browser: the top-bar button, progress sync, leaderboards |
| `api/` | The optional sign-in service for https://api.systemdesigner.io (Node 24, no dependencies); see [API.md](API.md) |
| `assets/` | Icons (SVG), palette tokens, request shapes and the Web Audio synthesiser |
| `tests/` | Node and headless-browser checks |

## Checks

```sh
node sim/selftest.mjs          # engine checks, determinism, speed, and every reference design
node tests/assets-coverage.mjs # an icon or shape for every element, category, event and request type
node tests/content-run.mjs     # every problem and lesson against the catalog, every design played through a day
node tests/sim-checks.mjs      # edits during lessons, honest scores for empty designs, bounded retries, debrief wording
node tests/calibrate.mjs       # sizes reference designs, keeps uptime targets realistic, re-measures budgets
```

```sh
cd api && node --test test/*.test.js   # sign-in service: Google token checks, GitHub state, progress merge, replayed results, leaderboards, limits
```

`tests/account-qa.mjs` signs in with the test provider in headless Chrome, syncs progress between two devices, posts a daily result to the leaderboard, and checks that the game is unchanged when the service is unreachable or off. `tests/ui-checks.mjs` checks the play screen in headless Chrome: building during the intro, lesson goals, keyboard placement and connection, the phone layout, the debrief and sound levels. `tests/browser-qa.mjs` drives the game in headless Chrome through `window.__game` (load any problem, lesson or the sandbox, place and connect parts, start the day, step time) and reads `window.__perf` (rolling frame, simulation and render times).

## Contributing

I welcome new problems and clearer lesson wording. Start with [CONTRIBUTING.md](CONTRIBUTING.md), or go straight to [adding a problem](docs/ADD_A_PROBLEM.md).

## Privacy

The game's own usage counts and error reports are disabled on public sites. The hosted site is served through Cloudflare, which counts page visits with its Web Analytics script, without cookies. Feedback is optional and anonymous. Signing in stores your provider id, a display name, your avatar link, progress and scores; nothing is sold and you can delete it anytime. See [privacy.html](privacy.html).

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Aditya Reddy.
