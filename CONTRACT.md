# System Designer: build contract

This file is binding for every builder. It fixes who owns which files, what each module exports, and the data shapes that cross module lines. If something you need is not here, do not reach into another builder's folder: write it down in your handoff note and the integrator decides.

Read `DESIGN.md` for the game itself and `catalog/*.json` for every element, request type, event, region, curve and scoring rule.

---

## 0. Rules for every builder

1. **Static files only.** No build step, no bundler, no npm in the app, no TypeScript. Plain modern JavaScript ES modules (`<script type="module">`), relative imports with the `.js` extension. Must run from GitHub Pages under a sub-path (never assume the site root; build URLs with `new URL(path, import.meta.url)`).
2. **PixiJS v8** is loaded once by `index.html` as a classic script from `https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js` and used through `globalThis.PIXI`. Only `render/` (and `compete/card.js` for its thumbnail, through the scene's snapshot) touches PIXI.
3. **Fonts** (Atkinson Hyperlegible 400/700 and IBM Plex Mono 400) are self-hosted WOFF2 files under `assets/fonts/`, with their OFL licenses and `font-display: swap`. Their combined initial transfer stays below 120 KB. `index.html` links `assets/fonts.css` once. No other external requests, except the optional sign-in in `account/` (section 15): its service, and Google's sign-in script loaded only when the sign-in panel opens.
4. **Work only in your own files** (section 1). Never edit another builder's file, including to "fix" it. Never edit `catalog/*.json` after Phase 0; request changes from the integrator.
5. **No globals.** The only globals are `window.__game` and `window.__perf`, created by `main.js`.
6. **Storage**: only through `ctx.store` (section 3), which wraps `localStorage` in try/catch. The game must work with storage blocked.
7. **Sound**: only through `ctx.audio`. **Colours**: only through CSS tokens or `ctx.palette()`. **Icons**: only through `assets/icons/index.js`.
8. **Originality**: do not open, read or copy any other game's code, assets, element lists, level lists, text, names or layout, including "Server Survival" by pshenok. Genre ideas only.
9. **No AI attribution** anywhere: code, comments, README, commit messages, page text.
10. **Testing runs on the server, never on the PC** (section 13).
11. **Numbers**: anything a player sees that comes from the catalog is shown with ≈ and an "approx." tooltip.
12. **Comments**: short, only where the code is not obvious. Every file starts with a one-line comment saying what it is.

---

## 1. File plan and owners

```
app/
  index.html                    integrator
  main.js                       integrator   boot, ctx, router wiring, window.__game, window.__perf
  README.md  LICENSE            integrator   (MIT, Aditya Reddy)
  DESIGN.md  CONTRACT.md        planner      (read-only for builders)
  catalog/
    elements.json               planner      99 elements, kinds, knobs, categories
    requests.json               planner      19 request types, families, shapes
    events.json                 planner      36 events, ops vocabulary, selectors
    world.json                  planner      regions, RTT, curves, sim constants, response times, compliance checks, scoring
  core/
    bus.js                      integrator
    store.js                    integrator
    router.js                   integrator
  assets/
    tokens.css                  assets       all CSS tokens (light, dark), base .hp-* components, reset
    palette.js                  assets       same tokens as numbers for PixiJS
    shapes.js                   assets       request particle shapes and node silhouettes
    sound.js                    assets       Web Audio synth
    icons/index.js              assets       icon(id) and ICON_IDS
    icons/elements.js           assets       99 element icons
    icons/categories.js         assets       9 category icons
    icons/events.js             assets       36 event icons
    icons/ui.js                 assets       interface icons (list in section 5.4)
    preview.html                assets       contact sheet of every icon, shape and swatch in both themes
  sim/
    catalog.js                  sim          loadCatalog(), createCatalog()
    rng.js                      sim          hashSeed(), mulberry32()
    engine.js                   sim          createSim()
    graph.js  route.js  flow.js  events.js  safety.js  cost.js  score.js  debrief.js   sim (internal split is the sim builder's choice; only engine.js, catalog.js and rng.js are imported by others)
    selftest.mjs                sim          node-runnable checks
  render/
    scene.js                    render       createScene()  (only file others import)
    nodes.js  edges.js  particles.js  fx.js  camera.js  textures.js  input.js   render (internal)
  ui/shell/
    shell.js                    shell        mountShell()   (only file main.js imports, plus settings.js and progress.js)
    home.js  learn.js  lesson-page.js  practice.js  problem-page.js  challenge.js  sandbox.js  settings.js  progress.js  shell.css   shell
  ui/play/
    play.js                     play         mountPlay()    (only file others import)
    hud.js  toolbar.js  inspector.js  steps.js  clarify.js  numbers.js  hints.js  debrief.js  editorial.js  traffic-panel.js  play.css   play
  compete/
    index.js                    compete      createCompete() (only file others import)
    daily.js  share.js  card.js  bests.js  compete.css   compete
  content/
    problems/index.js           integrator   imports the 13 group files below
    problems/core.js  media.js  social.js  fintech.js  health.js  civic.js  mobility.js  travel.js  iot.js  ai.js  games.js  productivity.js  devtools.js   one content builder per file
    lessons/index.js            integrator   imports the 24 lesson files in track order
    lessons/<lessonId>.js       lesson builders, one file per lesson id (DESIGN.md 3.1)
  account/
    index.js                    account      createAccount(ctx) (only file others import)
    ui.js  config.js  merge.js  account.css   account   (merge.js is pure and shared with api/)
  api/                          account      the optional sign-in service (Node 24), API.md
  privacy.html                  account
  tests/
    *.mjs                       integrator / QA  (copied into the server harness to run)
```

Each builder may add private helper files only inside their own folder.

---

## 2. Build order

1. **Phase 0, assets first.** Every element, category, event, request shape and interface action has its icon or shape, and the palette, tokens and sound are done, before any other module is built. Gate: `tests/assets-coverage.mjs` passes and `assets/preview.html` shows everything in both themes.
2. **Phase 1, in parallel**: sim, render, ui/shell, ui/play, compete, the 13 problem files, the 24 lessons. Each builder codes against this contract and uses a local stub of anything not yet built (stubs stay in the builder's own folder and are deleted before handoff).
3. **Phase 2, integration**: core/, index.html, main.js, the two content index files, README, LICENSE, `window.__game`, `window.__perf`.
4. **Phase 3, server QA**: smoke, determinism, content, perf (section 13).

---

## 3. Shared runtime (integrator)

### 3.1 core/bus.js
```js
export function createBus()
// → { on(name, fn) → off(), once(name, fn) → off(), emit(name, payload) }
```

Bus event names (fixed):

| Name | Payload | Emitted by |
|---|---|---|
| `route` | `{ path, parts, query }` | router |
| `settings` | `{ key, value }` | settings |
| `theme` | `{ theme: 'light' \| 'dark' }` | main.js |
| `toast` | `{ text, level: 'info' \| 'ok' \| 'warn' \| 'bad', ms? }` | anyone; shell renders |
| `play:loaded` | `{ mode, problemId \| null, lessonId \| null }` | play |
| `play:graph` | `{ graph }` (after any build change) | play |
| `play:select` | `{ nodeId \| null }` | play |
| `play:start` | `{ mode, problemId, seed }` | play |
| `play:event` | `{ eventId, phase: 'start' \| 'end', nodeIds }` | play |
| `play:day-end` | `{ mode, problemId, seed, result: DebriefData, hintsUsed }` | play |
| `progress:updated` | `{ problemId \| lessonId }` | shell/progress |
| `lesson:done` | `{ lessonId }` | play (lesson mode) |

### 3.2 core/store.js
```js
export function createStore(prefix = 'hotpath.v1.')
// → { get(key, fallback), set(key, value), remove(key) }   JSON values, every call in try/catch
```
Keys: `settings`, `progress`, `lessons`, `bests`, `draft.<mode>.<problemId>`, `sandbox.slots`, `seenIntro`.

### 3.3 core/router.js
```js
export function createRouter(bus)
// → { current() → { path, parts, query }, go(hash), back(), replace(hash) }
```
Hash routes:

| Route | View |
|---|---|
| `#/` | home |
| `#/intro` | the intro lesson, full screen |
| `#/learn` and `#/learn/<lessonId>` | lesson list, lesson |
| `#/practice?d=Easy&g=fintech&c=caching&s=solved&q=text` | problem list with filters |
| `#/practice/<problemId>` | problem |
| `#/challenge` and `#/challenge/<YYYY-MM-DD>` | daily challenge |
| `#/beat/<payload>` | a friend's shared design |
| `#/sandbox` and `#/sandbox/<slot>` | sandbox |
| `#/settings` | settings |

### 3.4 ctx (built in main.js, passed to every mount)
```js
ctx = {
  catalog,                 // sim/catalog.js loadCatalog()
  content: { groups, problems, problemById, lessons, lessonById },
  bus, store, router,
  settings,                // ui/shell/settings.js createSettings(store, bus)
  progress,                // ui/shell/progress.js createProgress(store, bus)
  audio,                   // assets/sound.js createAudio()
  compete,                 // compete/index.js createCompete(ctx)
  theme(),                 // 'light' | 'dark' (resolved from settings and system)
  reducedMotion(),         // boolean (resolved)
  palette(),               // assets/palette.js getPalette(theme())
}
```
Settings keys and defaults: `theme: 'system'`, `reducedMotion: 'system'`, `quality: 'auto'` (`auto | high | medium | low`), `soundMaster: 0.6`, `soundMuted: false`, `ambient: true`, `autoSlowOnEvent: true`, `highContrast: false`, `playerName: ''`.

main.js sets `document.documentElement.dataset.theme` to the resolved theme and `dataset.motion` to `reduce` or `full`.

---

## 4. Catalog (planner, read-only)

`sim/catalog.js` is the only loader; everyone uses its result.

```js
export async function loadCatalog(base = new URL('../catalog/', import.meta.url))  // fetches the 4 JSON files
export function createCatalog({ elements, requests, events, world })                // sync, for Node tests
// → Catalog {
//   elements: Element[], elementById: Map, elementByCode: Map, categories, kinds, knobs,
//   requests: RequestType[], requestById: Map, families, typeIndex: Map<typeId, int>,
//   events: EventDef[], eventById: Map, ops, selectors,
//   world, version
// }
```

Field meanings are in each file's `fieldGuide`. Key rules the engine and UI rely on:
- `handles: ["*"]` means every request type except `attack`. Elements that list `attack` also receive attack traffic.
- `completes` lists request types the element finishes. Anything else it handles is passed on.
- `capacity: null` and `latencyMs: null` mean the element is never in the request path (observer, control, source).
- `units.max === 1` means the element is elastic and managed; the inspector hides the units control.
- Element `code` (2 characters) is the stable id used in share links.

---

## 5. assets/ (Phase 0)

### 5.1 assets/tokens.css
All tokens from DESIGN.md 9.1 and 9.4 (colours, category tints, request families, fonts, radii 6/10/14/20 px, shadows, motion durations and easings, z-index scale below), light on `:root`, dark on `:root[data-theme="dark"]` and on `:root:not([data-theme="light"])` inside `@media (prefers-color-scheme: dark)`. `body` gets an explicit background. A minimal reset. Reduced motion: under `[data-motion="reduce"]` all `--dur-*` become `0ms` except fades capped at 120 ms.

z-index tokens: `--z-canvas: 0`, `--z-hud: 10`, `--z-panel: 20`, `--z-drawer: 30`, `--z-modal: 40`, `--z-toast: 50`.

Base components (the only shared classes, prefix `.hp-`): `.hp-glass`, `.hp-btn`, `.hp-btn--primary`, `.hp-btn--ghost`, `.hp-icon-btn`, `.hp-chip`, `.hp-chip--active`, `.hp-input`, `.hp-range`, `.hp-toggle`, `.hp-kbd`, `.hp-tooltip`, `.hp-badge`, `.hp-approx` (the ≈ marker with tooltip), `.hp-focus` ring. Every other class uses its owner's prefix (section 12).

### 5.2 assets/palette.js
```js
export function getPalette(theme)   // 'light' | 'dark'
// → {
//   theme,
//   css: { '--bg': '#F3F5FA', ... },                       // every token as a string
//   hex: { bg, bg2, canvas, gridDot, surfaceSolid, border, text, text2, text3, accent, accent2,
//          ok, warn, hot, bad, info, edgeIdle, edgeFlow,
//          cat: { clients, edge, compute, data, messaging, platform, ops, ai, external },
//          req: { read, write, media, trust, ai, realtime, background, attack } },   // 0xRRGGBB numbers
//   alpha: { gridDot, border, glass }                          // 0..1
// }
export function statusOf(util, down = false)   // → 'ok' | 'warn' | 'hot' | 'overload' | 'down' using world.sim.utilBands
export function requestColor(palette, requestType)   // → 0xRRGGBB via its family
```

### 5.3 assets/shapes.js
```js
export const SHAPES       // shapeId → { kind: 'circle' | 'ring' | 'poly' | 'capsule' | 'compound', points?: number[], inner?: number, parts?: [] }
                          // unit space, radius 1, centred at 0,0; one per request shape id in requests.json
export const NODE_SHAPES  // nodeShape id → same descriptor form; one per category nodeShape in elements.json
export function drawShape(g, shapeId, r)            // draws into a PIXI.Graphics (v8 API: g.circle/g.poly/g.roundRect then fill/stroke by caller)
export function drawNodeShape(g, nodeShapeId, w, h) // node silhouette
export function shapeSvg(shapeId, { size = 16, fill = 'currentColor', stroke = 'none', strokeWidth = 0 } = {})  // → '<svg ...>' for legends
export const STATUS_GLYPHS  // 'ok' | 'warn' | 'hot' | 'overload' | 'down' → SVG path strings
```
`drawShape` must not touch PIXI beyond the `g` it is given (so the file also works in the DOM for `shapeSvg`).

### 5.4 assets/icons/
```js
// icons/index.js
export function icon(id, { size = 24, title = '' } = {})   // → '<svg viewBox="0 0 24 24" ...>…</svg>' (aria-hidden unless title)
export function iconInner(id)                               // → inner markup only, for rasterising in render
export function hasIcon(id)
export const ICON_IDS                                        // every id below
```
Id namespaces: `el.<elementId>` (99), `cat.<categoryId>` (9), `ev.<eventId>` (36), `ui.<name>`.

Fixed `ui.` names: play, pause, step, speed, restart, undo, redo, delete, duplicate, connect, disconnect, search, filter, settings, theme-light, theme-dark, theme-system, sound-on, sound-off, hint, editorial, share, copy, download, close, back, home, learn, practice, challenge, sandbox, trophy, star, star-empty, streak, check, warn, error, info, lock, unlock, zoom-in, zoom-out, fit, grid, region, zone, units, clock, cost, latency, availability, safety, budget, users, rps, calendar, hot, shield, link, menu, more, chevron-left, chevron-right, chevron-up, chevron-down, plus, minus, drag, keyboard, motion, contrast, external, ghost, verified, approx.

Data files export `default` objects mapping the bare id (without namespace) to inner SVG markup. Rules from `elements.json` `iconStyle`.

### 5.5 assets/sound.js
```js
export function createAudio()
// → { unlock(), play(name, { pan = 0, intensity = 1, category } = {}), setMaster(v), setMuted(b), setAmbient(on), setLoad(level0to1), names }
```
`names`: `ui.tap, place, connect, remove, start, event.1, event.2, event.3, overload, recover, fail.burst, count, star, pass, miss`, plus the ambient bed controlled by `setAmbient`/`setLoad`. Recipes and limits in DESIGN.md 10. `play('place', { category })` picks the category's pitch. Safe to call before unlock (silently ignored).

### 5.6 assets/preview.html
Standalone page (its own doctype, imports tokens.css and icons/index.js) that renders every icon at 16, 24 and 48 px, every request shape in its colour, every node silhouette, and every swatch, in both themes side by side. Used for Phase 0 review.

---

## 6. sim/ (no DOM, no PIXI, runs in Node 24)

### 6.1 Public API
```js
// sim/rng.js
export function hashSeed(str)        // → uint32 (FNV-1a)
export function mulberry32(seed)     // → () => float in [0, 1)

// sim/engine.js
export function createSim({ catalog, problem, seed = 'practice', mode = 'practice' })   // mode: practice | challenge | sandbox | lesson | intro | beat
// → Sim
```

```js
Sim = {
  // build
  addNode(type, x, y, opts = {}) → nodeId            // opts: { id, units, zones, region, tier, knobs, label, locked }
  removeNode(id)
  moveNode(id, x, y)
  connect(fromId, toId) → edgeId                     // throws SimError { code: 'not-allowed' | 'exists' | 'self' | 'unknown-node', message }
  disconnect(edgeId)
  setKnob(nodeId, knob, value)                       // units, zones, region, tier, autoscale, ttlSec, coalesce, replication, readFrom, partitions,
                                                     // retentionDays, retries, backoff, timeoutMs, limitRps, warmPool, sampling, mode
  canConnect(fromType, toType) → { ok, kind, reason } // kind: flow | replication | tap | observe | control
  getGraph() → Graph                                 // plain JSON, stable order
  loadGraph(graph)                                   // replaces the graph
  validate() → Issue[]                               // { level: 'error' | 'warn' | 'info', code, message, nodeId? }
  estimate() → Estimate                              // build-phase: projected cost per month and "will it hold at peak?" per node
  // run
  start()                                            // phase build → running, clock 0
  pause()  resume()
  reset()                                            // back to build, graph kept
  tick()                                             // one tick = world.sim.tickMs (10,000 simulated ms)
  advance(simMs) → ticksRun                          // synchronous, deterministic
  get phase()                                        // 'build' | 'running' | 'paused' | 'done'
  get clockMs()
  state() → SimState                                 // reused object; copy before storing
  flows() → FlowFrame                                // reused typed arrays for render
  result() → DebriefData | null                      // after phase 'done'
  on(name, fn) → off                                 // 'tick', 'event' {eventId, phase, nodeIds}, 'status' {nodeId, status}, 'done' {result}
}
```

Node ids: starter and editorial nodes keep their `ref` as id; new nodes get `n1`, `n2`, … in creation order. Edge id: `${from}>${to}`. The same graph, problem and seed always produce the same result on any machine.

### 6.2 Data shapes
```js
Graph = {
  nodes: [{ id, type, x, y, units, zones, region, tier, knobs: {}, label?, locked? }],
  edges: [{ id, from, to, kind }]
}

FlowFrame = {
  version,                      // increments when the graph changes (render resyncs)
  nodeIds: string[], edgeIds: string[], typeIds: string[],
  edgeRps: Float32Array,        // edgeCount * typeCount, successful rps carried on the edge this tick
  nodeFailRps: Float32Array,    // nodeCount * typeCount, rps that failed at the node
  nodeHitRps: Float32Array,     // nodeCount * typeCount, rps completed by a cache hit at the node
  nodeUtil: Float32Array,       // nodeCount, 0..n (above 1 = overloaded)
  nodeStatus: Uint8Array,       // 0 ok, 1 warn, 2 hot, 3 overload, 4 down
  nodeQueue: Float32Array,      // nodeCount, queued messages (queues only)
  activeEvents: string[]        // event ids active now
}

SimState = {
  phase, clockMs, clockLabel,   // 'HH:MM'
  nodes: [{ id, type, util, status, p99Ms, failRps, queueDepth, units }],
  edges: [{ id, rps }],
  traffic: { offeredRps, successRps, failRps, byType: { [type]: { offered, success, failed } } },
  slo: { availability: { target, actual }, latency: { targetMs, p99Ms, shareOk },
         safety: { lostWrites, duplicates, staleReads, complianceFailed: [] } },
  cost: { perMonth, budget, lines: [{ id, label, usd, kind: 'fixed' | 'usage' }] },
  scoreLive: { total, reliability, latency, safety, cost },   // provisional during the day
  events: [{ id, name, atMs, endMs, active, done, nodeIds }]
}

DebriefData = {
  problemId, seed, mode, passed, stars,
  score: { total, reliability, latency, safety, cost },
  slo: { availability: { target, actual },
         latency: { targetMs, shareOk, worstP99Ms, byType: { [type]: { p99Ms, shareOk } } },
         safety: { lostWrites, duplicates, staleReads, compliance: { passed: [], failed: [] } },
         cost: { perMonth, budget, lines: [] } },
  timeline: [{ hour, offeredRps, successRps, failRps, p99Ms }],      // 24 entries
  minuteSuccess: number[],                                            // 1,440 entries, 0..1
  events: [{ id, atMs, endMs, nodeIds, helpers: [elementId], hurt: [nodeId], vars: { factor, peakRps, failed, minutes, node, helper, lostWrites, duplicates, ... } }],
  nodes: [{ id, type, peakUtil, minutesOverloaded, failed, usd }],
  tradeoffs: [{ nodeId, type, text }],
  nextStep: { text, nodeId?, elementId?, knob?, sizing?: { units, peakRps, activeUnits } },
  interventions,                                                      // knob changes during the day
  graph: Graph
}
```
`vars` keys are exactly the placeholders used in that event's `debrief` templates in `events.json`; numbers are pre-formatted strings ("1.2k", "18:42", "4"). Missing helpers use the text "Nothing in your design".

### 6.3 Connection rules (canConnect)
| From kind | May connect to | Edge kind |
|---|---|---|
| source | router, filter, cache, compute, queue, lookaside (identity-provider only) | flow |
| router, filter, cache, compute | router, filter, cache, compute, store, queue, lookaside, external | flow |
| router, filter, cache, compute | tap (audit-log) | tap |
| queue | compute, queue, store (managed sink) | flow |
| store | tap (cdc-connector, audit-log) | tap |
| store (`role: primary`) | store of the same `family` with `role: replica` | replication |
| tap | queue, store, cache, compute | flow |
| lookaside | external | flow |
| external | compute, router, queue (webhook type only) | flow |
| any element in the request path | observer | observe (direction normalised node → observer) |
| control | the element it governs: autoscaler → compute; backups → store; ci-cd, feature-flags, config-service, secrets-manager → compute; disaster-recovery → any | control |
| observer | observer (metrics → alerting → pager; metrics → dashboards) | observe |

Anything else is refused with a plain reason ("A database cannot call your servers; connect servers to the database instead.").

### 6.4 Flow model (one tick)
The engine is a flow model: it moves rates (requests per second per type), not individual requests.

1. **Offered load** per type = `peakRps × curve(hour) × mix[type] × event multipliers`, split across sources by `traffic.sources` and across user regions by `userRegions`. Attack traffic from events is added and routes like its `routesLike` type.
2. **Routing tables** (rebuilt only on graph change): edge u→v is eligible for type T if v handles T and v completes T or can reach a node that completes T. Back edges are ignored.
3. **Propagation** in topological order. At node u carrying rate f for type T:
   - **filter**: drop `blockAttackShare` of attack; rate-limiters drop rate above `limitRps × clients` and cap retries; circuit breakers fail fast when open.
   - **cache**: `hit = f × hitRate` (TTL-adjusted, cacheable types only) completes; the rest passes on. During `cacheFlush` hit rate follows the event; `coalesce` divides misses reaching the origin by 10 while refilling.
   - **lookaside** neighbours that handle T each receive `f × callShare`, add their latency to u's path, and fail the request if they fail.
   - **forward** neighbours (router, filter, cache, compute, store, queue, external) split f in proportion to their effective capacity for T. **Tap** neighbours receive a copy.
   - **queue**: accepts f at once (the caller's request is done), backlog grows by `f × tick`, drains to consumers at their capacity; `fanout` queues give every consumer a full copy; messages older than `retentionDays` are dropped (counted as lost).
   - **completes**: store, external, cache hit, or compute that lists T in `completes` (model servers and GPUs for inference).
4. **Capacity**: `C = units × capacity.rps × tierFactor × aliveShare` (`writeRps` for write-type requests). Utilisation ρ = load / C. If ρ > 1, the excess fails at that node and only the served share continues downstream.
   - **Keyed elements** under `hotKey`: one unit carries the hot share; per-key limits apply to key-value stores.
   - **Synchronous callers** lose capacity to slow dependencies by Little's law: `C_eff = C × p50 / (p50 + min(extraDownstreamMs, timeoutMs))`; an open circuit breaker removes that wait.
5. **Latency** per hop: `p50 × q(ρ)` and `p99 × q(ρ)` with `q(ρ) = 1 + 0.5 × ρ² / (1 − ρ)`, capped at `world.sim.queueingLatencyCap`. End-to-end p99 for a type = network RTT (user region → first node region, plus any cross-region hops) + the traffic-weighted sum of hop p50s + `sqrt(Σ (p99_i − p50_i)²)`. Requests beyond a caller's `timeoutMs` fail.
6. **Retries**: failed rate at a caller with `retries = r` returns next tick as `failed × r` (backoff `none`), `failed × r × 0.3` (exponential) or `failed × r × 0.15` spread over 6 ticks (exponential-jitter). Retries count toward load, not toward offered requests.
7. **Availability** = served real user requests / offered real user requests (attack and retries excluded). A request type whose problem `requires` groups are not all on some served path counts as failed (static check, explained in validate()).
8. **Zones and regions**: units spread round-robin over zones a, b, c (first `zones` of them). `managed: true` elements are multi-zone. A zone outage removes the units in that zone; a stateful element left with no units is down until the event ends; with `zones ≥ 2` a store fails over after `failoverSec` (halved with a db-proxy). Region outages take every node in that region down; geo-dns and global-lb reroute after their `failoverSec`; plain dns does not reroute.
9. **Data safety ledger**: lost writes on failover = write rps × replication lag (async) or 0 (sync, quorum); lost on single-zone failure with replication `none` = writes since the last backup (backups `rpoSec`, else the whole day); duplicates = duplicate share of non-idempotent types that reach a completing node without an idempotency-store on the path; stale reads = reads served by replicas or caches while lag exceeds 1 s where `readYourWrites` is set; compliance via `world.complianceChecks`.
10. **Incident response** (`untilFixed` effects): duration = detection + acknowledgement + repair from `world.response`, using the observers and controls connected anywhere in the graph.
11. **Cost per month** = Σ (`base` + `perUnit × units × tierCost`) + usage (per million, per GB, per GB-month from `storageTb`, per thousand users from `monthlyUsers`) projected from the simulated day × 30, + disaster-recovery `costShare` of the protected nodes. Event `costMultiplier` applies to its line for its duration.
12. **Score** from `world.scoring` at day end; `scoreLive` uses the same formulas on the day so far.

### 6.5 Event ops
`sim/events.js` implements each op in `events.json` `ops` exactly once and resolves `target` selectors with the seeded generator. Problem event entries `{ id, at: 'HH:MM', params }` override the event's default params (shallow merge per effect) and may set `params.target` to a node ref.

### 6.6 Done when
`node sim/selftest.mjs` (run on the server) passes: every op, every connection rule, determinism (same inputs, identical `result()` twice), a full day of a 30-node graph in under 400 ms, and each problem's first editorial design reaching at least its `expect.score` minus 50 once content exists.

---

## 7. render/ (only module that draws on the canvas)

```js
export async function createScene(hostEl, { catalog, palette, theme, reducedMotion, quality = 'auto' })
// → Scene
Scene = {
  sync(graph, flowVersion)                // diff-sync nodes and edges; cheap when unchanged
  setFlows(flowFrame, { speed, dtWallMs }) // after each frame's sim ticks
  setSelection(nodeId | null)
  setGhost(type | null, x, y)             // placement preview while dragging from the toolbar
  setOverlay(graph | null)                // faint ghost of a friend's design
  setValidation(issues)                   // small warning glyphs on nodes
  flashEvent(eventId, nodeIds, severity)
  setTheme(palette, theme)  setReducedMotion(bool)  setQuality(level)
  fit(padding = 80)  zoomBy(factor, cx, cy)  panBy(dx, dy)
  screenToWorld(x, y)  worldToScreen(x, y)
  onFrame(fn(dtWallMs)) → off              // called every frame before drawing; play runs the sim here
  on(name, fn) → off                       // 'node:tap' {id} · 'node:longpress' {id, x, y} · 'node:dragend' {id, x, y}
                                           // 'connect' {from, to} · 'canvas:tap' {x, y} · 'canvas:drop' {type, x, y} · 'edge:tap' {id}
  stats() → { particles, renderMs, quality }
  snapshot({ width, height, graph }) → Promise<HTMLCanvasElement>   // clean thumbnail for the result card
  destroy()
}
```
- World units: grid 20, node 72 by 72, origin at canvas centre, y down.
- Render owns pointer and touch input on the canvas (pan, pinch, drag, long-press 450 ms, port-ring drag to connect, double-tap to fit) and emits the events above; it never changes the graph itself.
- Particle, glow, status and motion rules: DESIGN.md 9.3 to 9.5 and 11. Icons are rasterised from `iconInner('el.<id>')` once per theme at 64 px times pixel ratio.
- Done when: a 40-node, 60-edge graph at 1,500 particles holds under 7 ms render time in the server's headless Chrome perf run, and every request shape and status reads correctly in both themes.

---

## 8. ui/shell/

```js
// shell.js
export function mountShell(rootEl, ctx) → { show(route), destroy() }
// settings.js
export function createSettings(store, bus) → { get(key), set(key, value), all() }
export function renderSettings(hostEl, ctx)
// progress.js
export function createProgress(store, bus) → {
  get(problemId) → { attempts, bestScore, stars, hintsUsed, solvedAt, lastResultAt } | null,
  all(), record(problemId, debriefData, hintsUsed),
  lessonDone(lessonId), isLessonDone(lessonId), stats() → { solved, stars, lessonsDone }
}
```
Shell owns: top bar (logo wordmark, section tabs, theme, sound, settings), home, Learn list and lesson page frame, Practice list with filters and search, the problem page frame, Challenge page (today, streak, history), Sandbox entry and save slots, settings view, toasts, modals, the `#/beat/` landing (decodes through `ctx.compete`). Wherever a canvas is needed, shell creates a host element and calls `mountPlay` from `ui/play/play.js`, and destroys it on route change. Shell listens to `play:day-end` to call `progress.record` and `compete.bests.record`.

Responsive: works from 320 px wide; 16 px side gutter on phones; no horizontal page scroll.

---

## 9. ui/play/

```js
export async function mountPlay(hostEl, ctx, {
  mode,              // 'practice' | 'challenge' | 'sandbox' | 'lesson' | 'intro' | 'beat'
  problem,           // Problem (practice, challenge, beat); challenge passes the variant-applied copy
  lesson, stepIndex, // lesson mode
  seed,              // string
  graph,             // optional initial graph (draft, share link, editorial)
  overlay,           // optional ghost graph and target score for 'beat'
}) → PlayController

PlayController = {
  loadProblem(id) → Promise<GameState>        // jumps straight to the Draw step (used by tests)
  placeComponent(type, x, y) → nodeId
  connect(fromId, toId) → edgeId
  setKnob(nodeId, knob, value)
  startTraffic()
  setSpeed(n)                                 // one of world.sim.speeds
  step(simMs) → GameState                     // advance simulated time synchronously, then draw one frame
  getState() → GameState
  pause()  reset()  destroy()
}
```
Play owns: the five problem steps (Clarify, Numbers, Draw, Traffic day, Debrief), the HUD (clock, speed pill, play/pause, success and p99 sparkline, cost meter, event banner, dot-scale legend), the searchable categorized toolbar built from the catalog (search matches name, description, goodAt; categories collapsible; respects `problem.palette`), the inspector (description, goodAt, tradeoff, capacity, latency, cost lines with ≈, live util, knobs from `element.knobs`), hints, debrief, editorial, the sandbox traffic panel and event deck, undo and redo (50 steps), draft autosave (`draft.<mode>.<problemId>`, 1 s debounce), lesson demo goals and the intro script.

**Frame loop** (inside `scene.onFrame`): `acc += dtWallMs × speed × (3,600,000 / (world.sim.wallSecPerSimHourAt1x × 1000))`; run `sim.tick()` while `acc ≥ tickMs`, at most `maxTicksPerFrame`; then `scene.setFlows(sim.flows(), …)`; HUD reads `sim.state()` at 4 Hz. Auto slow-down on event start per DESIGN.md 6.

---

## 10. compete/

```js
export function createCompete(ctx) → { daily, share, card, bests }

// daily.js
dailyFor(dateStr = todayLocal()) → { date, seed: 'daily-' + date, problemId, variant: { shiftMin, magnitude, extraEventId } }
applyVariant(problem, variant) → problem copy
todayLocal() → 'YYYY-MM-DD'

// share.js
encodeShare({ mode, problemId, seed, graph, score, name }) → Promise<string>   // payload for '#/beat/<payload>'
decodeShare(payload) → Promise<ShareData>                                    // throws ShareError on bad input
shareUrl(payload) → absolute URL (location without hash + '#/beat/' + payload)
verify(shareData, catalog, problem) → Promise<{ verified, replayScore }>      // replays with sim

// card.js
renderCard({ result, problem, catalog, palette, thumbCanvas, date, url, name }) → Promise<Blob>   // 1200 x 630 PNG, Canvas 2D
shareCard(blob, { title, text, url }) → Promise<'shared' | 'downloaded'>

// bests.js
createBests(store) → { get(key), record(key, debriefData) → { isBest, previous }, streak(), history(limit = 30) }
// key = `${mode}:${problemId}:${seed}`
```

**Share payload v1**: JSON `{ v: 1, m: mode, p: problemId, s: seed, n: [[code, gx, gy, units, zones, regionIdx, tierIdx, knobs]], e: [[i, j]], r: { t: total, a: availability, l: p99Ms, c: costPerMonth }, by: name }` where `gx, gy` are grid units (20), `knobs` is an object holding only non-default knob values, then deflate-raw with `CompressionStream` when available and base64url. Prefix `z` (compressed) or `j` (plain JSON, base64url). Target under 2,000 characters for 30 nodes. Decoding must reject unknown codes, more than 120 nodes, or more than 400 edges, with a plain message.

---

## 11. content/

### 11.1 Problem files: `content/problems/<group>.js`
```js
export default {
  group: { id: 'core', title: 'Core building blocks', blurb: 'One sentence.' },
  problems: [ /* Problem, in suggested order */ ]
}
```
Groups (id: title), in display order: `core`: Core building blocks · `media`: Media and streaming · `social`: Social and messaging · `fintech`: Finance and payments · `health`: Healthcare · `civic`: Government and education · `mobility`: Mobility and logistics · `travel`: Travel and events · `iot`: IoT and devices · `ai`: AI, ads and search · `games`: Games · `productivity`: Productivity · `devtools`: Developer platforms. Problem ids, titles, difficulties, comparisons, concepts and signature events are fixed in DESIGN.md section 5.

**Problem schema**
```js
{
  id: 'url-shortener',
  title: 'URL shortener',
  difficulty: 'Easy',                          // Easy | Medium | Hard
  concepts: ['caching', 'back-of-envelope'],   // concept ids = lesson ids except 'intro'
  like: 'a link shortener like Bitly',         // plain comparison; company names only here and in text
  brief: 'Two or three plain sentences in second person.',
  clarify: [ { q: 'Can a short link change after it is made?', a: 'No. Links never change, so caching them is safe.' } ],   // 2 to 4
  requirements: {
    users: '50 million people a month',        // display text
    monthlyUsers: 50000000,
    peakRps: 20000,                            // all real user requests at the daily peak
    mix: { read: 0.99, write: 0.01 },          // request type shares, sum to 1
    latencyP99Ms: { default: 150 },            // optional per-type keys, e.g. { default: 200, upload: 3000 }
    availability: 0.999,
    dataSafety: 'no-loss',                     // 'no-loss' | 'rpo-1m' | 'best-effort'
    readYourWrites: false,
    compliance: [],                            // ids from world.complianceChecks; checked by a compliance-audit event or at day end
    budgetPerMonth: 3000,
    storageTb: 2,                              // data at rest for per-GB-month prices
    userRegions: { us: 0.7, eu: 0.3 },
    homeRegion: 'us',
    notes: ['Short codes are 7 characters.']
  },
  traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} },   // curve id from world.curves
  requires: { },                               // optional: { payment: [['payment-processor'], ['ledger-db', 'sql-primary']] } any-of groups that must be on the path
  palette: null,                               // null = every element; or an array of element ids
  starter: { nodes: [ { ref: 'users', type: 'web-browser', x: -480, y: 0, locked: true } ], edges: [] },
  events: [ { id: 'viral-spike', at: '19:30', params: { factor: 5 } } ],
  eventPool: ['cache-stampede'],               // extra events the daily variant may draw from
  numbers: [ { label: 'Reads per second at peak', value: 19800, unit: 'req/s', how: '20,000 × 0.99', ask: true } ],   // 1 to 3 with ask: true
  hints: ['Nudge.', 'Concept and element to consider.', 'Near-solution.'],
  editorial: {
    summary: 'Short paragraph.',
    designs: [ {
      name: 'Lean and cached',
      why: 'Two or three sentences.',
      graph: { nodes: [ { ref: 'users', type: 'web-browser', x: -480, y: 0 }, { ref: 'cdn', type: 'cdn', x: -300, y: 0 } ], edges: [ ['users', 'cdn'] ] },   // nodes may carry units, zones, region, tier, knobs
      expect: { score: 900, costPerMonth: 1400 }
    } ],
    tradeoffs: ['One line each.'],
    realWorld: 'One or two sentences with approximate numbers.'
  },
  daily: true
}
```
Rules: every element id, event id, request type, curve and compliance id must exist in the catalog. Numbers must be sensible approximations and say so. Time strings are 'HH:MM' on the simulated clock. Editorial `expect` values are filled from real sim runs during Phase 3.

Advanced problems may include `workloadPlan: [{ sourceRef, entryRef, peakRps, mix, role? }]` to explain source-specific traffic. Rates sum to `requirements.peakRps` and reproduce its aggregate mix. This plan documents the workload; `traffic.sourceTypes` assigns the types the engine emits at each source. Each source enters a legitimate service path in the measured reference. Notes and editorials state the scored boundary and the protocol obligations outside it. The catalog's `batch` represents 100 MB, `telemetry` represents 1 KB or a time-series batch of 100 samples, and observers do not implement storage platforms.

### 11.2 Lesson files: `content/lessons/<lessonId>.js`
```js
export default {
  id: 'caching', title: 'Caching', track: 'Scale the front', minutes: 3,
  summary: 'One sentence for the list.',
  steps: [
    { kind: 'read', title: 'Hook', text: 'Short paragraph.', icon: 'el.cache' },
    { kind: 'demo', prompt: 'Put a cache between the servers and the database.',
      setup: { palette: ['cache'], requirements: { peakRps: 5000, mix: { read: 0.95, write: 0.05 }, latencyP99Ms: { default: 200 }, availability: 0.99, budgetPerMonth: 2000, userRegions: { us: 1 }, homeRegion: 'us' },
               traffic: { curve: 'flat', sources: { 'mobile-app': 1 } },
               starter: { nodes: [], edges: [] }, events: [] },
      goal: { metric: 'util', node: 'db', op: '<=', value: 0.7, holdSec: 60 },   // metric: availability | p99 | cost | util | hitRate | errors
      hint: 'Drag Cache from the Data group.' },
    { kind: 'numbers', rows: [ { label: 'Memory read', value: '≈ 0.5 ms', how: 'in-zone cache, approx.' } ] },
    { kind: 'quiz', q: 'Question?', choices: ['A', 'B', 'C'], answer: 1, why: 'One sentence.' }
  ],
  takeaway: 'One sentence.'
}
```
`intro` follows DESIGN.md section 8 and may use `{ kind: 'script', beats: [...] }` steps with `{ at: secondsOrTrigger, caption, highlight: elementId, waitFor: { action: 'place' | 'connect' | 'knob', type?, knob? } }`.

Advanced lessons may use a worked example in a `read` step instead of a `demo` when the engine does not model the mechanism. The `Go deeper` and `Lead the design` tracks follow Business; their lessons take 5 to 8 minutes and contain a numbers step, at least three reasoning quizzes, a transfer case and two or three defend steps.

```js
{ kind: 'defend', q: 'A sharp colleague asks you to justify a choice. What fails next?',
  checklist: ['A concrete failure case', 'The cost of the chosen guarantee'],
  model: 'A model answer in plain words, including the follow-up.' }
```

A defend step requires a nonblank typed answer before revealing the model and checklist. Continue becomes available on reveal. Players tick points they covered; zero ticks is a valid self review, not a failed quiz. Answers and ticks remain in memory while navigating the mounted lesson and are never added to saved or synced progress. Native textarea, button and checkbox controls support keyboard and touch, with visible labels and focus. Existing lesson ids and progress records keep their meaning.

---

## 12. DOM, CSS and naming ownership

- `index.html` has `<div id="app"></div>` and `<div id="overlay"></div>`. Shell renders into `#app` and owns `#overlay` (toasts, modals). Play renders only inside the host element shell gives it. Compete renders its modals inside a host shell gives it.
- CSS files and class prefixes: `assets/tokens.css` (`.hp-`), `ui/shell/shell.css` (`.sh-`), `ui/play/play.css` (`.pl-`), `compete/compete.css` (`.cp-`). No bare element selectors outside `tokens.css`. No `!important`.
- `index.html` links, in order: Google Fonts, tokens.css, shell.css, play.css, compete.css, pixi.min.js, then `main.js` as a module.
- IDs in the DOM are prefixed the same way. Every interactive element has an accessible name.

---

## 13. Test hooks and server QA (integrator)

### 13.1 window.__game
```js
window.__game = {
  loadProblem(id) → Promise<GameState>     // routes to #/practice/<id>, mounts play, skips to Draw
  placeComponent(type, x, y, edgeId?) → nodeId   // optional edgeId drops the part onto that connection (A>B becomes A>new>B)
  connect(fromId, toId) → edgeId
  setKnob(nodeId, knob, value)
  startTraffic()
  setSpeed(n)
  step(simMs) → GameState                  // synchronous simulated time
  getState() → GameState
  loadSandbox() → Promise<GameState>
  loadLesson(id) → Promise<GameState>
}

GameState = {
  route, mode, problemId, step,            // step: clarify | numbers | draw | day | debrief
  phase, clock: { simMs, label }, speed,
  nodes: [{ id, type, x, y, units, zones, region, tier, util, status, p99Ms, failRps, queueDepth }],
  edges: [{ id, from, to, kind, rps }],
  traffic, slo, cost,                      // as SimState
  score,                                   // DebriefData.score plus { stars, passed } after the day, else null
  scoreLive,
  events,                                  // as SimState
  errors: [{ code, message, nodeId? }]     // validate() issues plus any caught runtime error (window error and unhandledrejection)
}
```

### 13.2 window.__perf
A live object updated every frame: `{ frameMs, frameMsP95, simMs, renderMs, ticksPerFrame, droppedTicks, particles, fps, quality }`. `frameMs` and `simMs` are rolling means over the last 120 frames, in milliseconds.

### 13.3 Server runs
Never run or test on the PC. Copy, serve, drive headless on the server:
```sh
tar czf - -C path/to/app . | ssh vps "rm -rf /root/work/sdgame && mkdir -p /root/work/sdgame && tar xzf - -C /root/work/sdgame"
ssh vps "ss -ltn | grep -q ':8765 ' || (cd /root/work/sdgame && (python3 -m http.server 8765 >/dev/null 2>&1 &))"
ssh vps "mkdir -p /root/work/sdgame-harness && cd /root/work/sdgame-harness && ([ -d node_modules/puppeteer-core ] || npm i puppeteer-core) && cp /root/work/sdgame/tests/*.mjs . && node smoke.mjs"
```
Node 24, puppeteer-core, `/usr/bin/google-chrome`, page `http://localhost:8765/`.

Test files (`tests/`, integrator or QA):
- `assets-coverage.mjs`: every `el.`, `cat.`, `ev.` id and every request shape and node shape exists (Phase 0 gate).
- `catalog-check.mjs`: catalog cross-references (ids, codes, kinds, knobs, events, shapes, curves).
- `content-check.mjs`: every problem and lesson against the schema and the catalog; ids match DESIGN.md section 5.
- `smoke.mjs`: loads `url-shortener`, places and connects a design through `__game`, `startTraffic()`, `step(86400000)`, asserts phase `done`, a score, no `errors`, no console errors.
- `determinism.mjs`: same design twice gives an identical score; a share link round-trips and verifies.
- `perf.mjs`: 30 wall seconds at 8x on the heaviest editorial design; reports `__perf`; fails if `frameMs` mean is above 16.7 or `simMs` above 3.

---

## 14. Handoff note (every builder)

When done, reply with: files written (absolute paths), exports matching this contract, anything stubbed or not done, and any catalog change you need (with the reason). Nothing else.

---

## 15. account/ (optional sign-in)

```js
export function createAccount(ctx) → {
  ready,                                   // Promise, settles after the one /auth/config probe (or at once when there is no service)
  state() → { status: 'off' | 'checking' | 'ready' | 'unreachable', available, user, sync, syncedAt, providers },
  isSignedIn(), displayName(),             // '' when signed out
  mountHeader(slotEl),                     // shell puts an empty, hidden slot in the top bar
  leaderboardCard({ date, problemId }) → { el, destroy() },   // el stays hidden unless the service is available
  signOut(), deleteAccount(), rename(name), syncNow(), leaderboard({ daily } | { problem }),
}
```
- `ctx.account` may be null; every caller guards with `?.`. With no service the module makes no request and renders nothing.
- Bus events: `account` (state snapshot, after any change) and `account:result` (the service's answer to a posted result). It listens to `progress:updated`, `play:day-end` and `route`.
- Share links and result cards use `ctx.account?.displayName()` before `settings.playerName`.
- Progress sync writes only through `ctx.progress.importAll` and the `bests` store key, after merging with what is on the device (`account/merge.js`).
- CSS prefix `.ac-`; panels render into `#overlay` just below dialogs.


## 16. Measured checks and the signal bench

- Lesson goals require at least one simulated tick with offered and served requests. Zero latency before traffic is not evidence of success. `goal.maxUtil?` bounds app-server utilization and `goal.maxTtlSec?` bounds cache TTL in addition to the named metric, placement and hold duration. The numbers lesson requires 25% spare capacity; the cache lesson requires answers no more than 60 seconds old.
- `content/transfers.js` supplies a new situation, plausible plans and a numerical prediction for every non-intro lesson. A transfer check requires both the correct plan and a calculation within 5%. Lesson completion waits for that check. The written practice prediction is saved for comparison, not automatically graded. The visible Start action requires a plan and calculation check before the first practice run; repair buttons do not complete it. Traffic scores and deterministic reference replays retain their existing meaning.
- A sizing action uses `nextStep.sizing.units`, calculated from the same peak interval and active fleet used in its prose. Internal demand includes retries and repeated visits; arriving user demand is labeled separately. Limits and a need to reduce work are stated explicitly. Autoscaling fixes raise the minimum and ceiling as well as the starting fleet.
- The load-balancing pool is an explicitly labeled schematic. It shows per-server unfinished work, round-robin and least-requests allocation, a failed server being skipped, and recovery. Its illustrative clock never changes simulation results.
- Modules share a rectangular face, category stripe, ports, capacity bar, attached caption and one labeled exception. Zoom never relocates captions to other nodes. Caption size updates during camera movement, independently of delayed text texture refresh. The optional renderer fit argument `focusId` centers a selected part at the existing zoom when opening a phone inspector. Small phone starter graphs flow top to bottom. A current-step select exposes all five workflow steps on phones. Only the active sheet occupies the bottom workspace slot.
- Full motion uses short context-preserving entry and completion feedback. Packet counts are capped at 80 on phones and 160 on desktop independently of simulated traffic. Still flow bands, labels and instant values remain available with reduced motion. Pausing freezes decorative simulation motion too. Font, theme and category tokens apply to every screen and canvas.
- Generated icon and palette modules follow the SVG/CSS sources. Run `tools/gen-bench-assets.mjs` for bench symbols and original shared-load, cached-read and draining-queue scenes, then `tools/gen-asset-modules.mjs`. The content JSON and module preload lists must also match their source modules.


## Workload evidence and candidate-led practice

`traffic.sourceTypes` is optional: an object keyed by source node ref/id or source element id, with arrays of request type ids. With it present, only listed types are emitted by a source. The global requirements mix remains authoritative: each type is split among its assigned, capable sources in proportion to `traffic.sources`, and duplicate sources share their element weight. Without it, legacy splitting is unchanged. A positive type with no eligible source is an error. Validation checks every positive source/type assignment for a usable route, even when another source can finish the same type. Missing routes precede capacity advice. Capacity diagnoses require measured saturation and failed work; a route diagnosis has no sizing action.

A problem event can add `text: { name?, description?, debrief?: { headline?, hurt?, helped?, fix? } }`. These change presentation only. They do not change event timing, effects or seeded targets. Template variables remain preformatted. `DebriefData.events[].description` carries the resolved description. Durations in the interface use seconds below a minute and rounded minutes otherwise.

`Sim.state().nodes[]` additionally exposes `incomingRps` and `availableUnits`. Replica illustrations are aggregate evidence: the engine still models a pool as one endpoint with internal distribution, not individual replicas. The UI states that explicitly and asks candidates to explain discovery and health checks. `DebriefData.nodes[]` includes `peakRequests`, `peakUnits`, and `effectiveRpsPerUnit` for measured sizing. `tools/gen-sizing.mjs` writes `content/sizing.js`; regenerate it whenever reference graphs or simulation capacities change. Hard editorials explain base writes, reads, zones, copies, event load and measured headroom using those measurements. These figures do not alter scoring.

Practice routes for Medium and Hard problems accept `?interview=1`, off by default. This is a UI session over the same deterministic practice simulation. The candidate commits questions before keyword coverage and answers are revealed, writes scope before seeing requirements, and types all estimates before worked answers. The question matcher checks keywords only and makes no semantic claim. Draw has no hints, suggested fixes or editorial. A visible 45-minute guide never stops input. The day runs once with no structure or knob edits. Three to five follow-ups derive from graph, event evidence and actual cost. Answers must be typed before revealing models and self-assessed checklists. This problem defense is independent of lesson step types.

Interview records live under `progress[problemId].interview` with attempts, latest, bestCoverage and bestDay. Coverage is explicitly self-assessed and never changes the simulation score or ordinary solved progress. Existing progress fields remain valid. `createProgress.recordInterview(problemId, report)` persists through `ctx.store` and emits `progress:updated`. Best coverage ratio and best simulated day are kept separately. Interview drafts are not loaded from ordinary practice.

Explicit Fit always frames all parts. Automatic positioning can focus a selected part; edit gestures suppress automatic camera fitting. Large phone diagrams provide a complete overview plus a branch inspector. The selected pool panel displays no more than six illustrated groups, names unavailable capacity, and labels schematic work distribution. Concept SVGs use the same palette in both themes via `assets/scenes/index.js`, regenerated by `tools/gen-scene-index.mjs`.

`DebriefData.firstFailure` is null or `{ atMs, nodeId, kind, util }`, recorded at the first interval below 95% served. Routing gaps take precedence, then measured saturation, then dependency/outage loss. It describes a material observed failure, not a claim that smaller earlier losses never happened. Ordinary debriefs offer a checked part-and-metric diagnosis; the written pre-run prediction remains explicitly ungraded.

DNS mistakes expire on each affected router after the longest configured DNS TTL on its upstream flow path, capped at the event duration. Routers without a depicted upstream DNS keep the original duration; disconnected DNS parts never help. Event guidance distinguishes modeled controls from preventive production practices, and `events[].counters` contains only applicable modeled counters. Disk retention does not repair a full disk, CI/CD does not shorten a fixed table lock, and retry backoff does not remove a scheduled reconnect wave. Use `node tools/measure-references.mjs` to refresh measured expectations without resizing or changing budgets, then regenerate sizing and content.

## Product promises, efficient designs and checked mastery

- `requirements.queueDeadlineSec?: { [requestType]: seconds }` overrides `queueLimitMin` for that type. Both precede the 900-second interactive and 3,600-second back-office defaults. Mixed queues keep per-type arrival histories and charge late work to that type, never to a dominant type's looser deadline. The fixed 10-second tick is still the observation resolution. Waiting deadlines and interactive p99 are separate rules, both visible in Requirements. Provider notification latency measures acceptance, not device receipt.
- `requirements.retentionDays?: number` is the minimum history on active authoritative stores. Copies that can be rebuilt are excluded. Catalog stores expose `retentionDays`; options include 5, 2,555 and 3,650 days. A short history produces a validation warning and `slo.safety.promiseFailures: { code, nodeId, knob, message }[]`, loses safety points and prevents passing. This checks the configured policy, not deletion implementation or a local device's durability; those remain protocol checkpoints.
- `problem.services?: { [externalElementId]: { name?, description?, capacity?, latencyMs?, cost? } }` states a scenario dependency's quota, latency and price. Only authored external profiles apply; saved graphs cannot override them. They retain catalog kinds, request handling, controls, unit bounds and share codes. The inspector and simulation use the same profile. Scheduled-job customer endpoints have an aggregate quota and no card-processing fee. Provider throttles multiply configured capacity, including active sender units, rather than recent demand.
- Full points reward meeting the stated reliability and speed thresholds. Below reliability, other points still scale by served share. Cost points additionally deduct measured avoidable capacity: parts below 35% peak busy with a paid floor more than 1.5 times the measured requirement (70% busy, minimum two units, catalog and zone floors). At least two removable units and $20/month are material. The deduction is at least one point and at most half the Cost weight. `DebriefData.efficiency[]` carries `{ nodeId, label, units, suggestedUnits, peakUtil, savingPerMonth }`. Estimates propose a smaller-pool trial, not a guarantee of recovery after resizing. The debrief asks whether to test the cut or keep capacity for a stated requirement. Merely writing a reason does not restore score points. Every reference passes at 1,000 on the ordinary practice seed; measured budgets allow about 10% over the most expensive valid reference.
- Routing repairs preserve a reachable deferred path for the same type. `trace.repair` retains `{ from, to, path }` and may add `steps: [from,to][]` and `addNodes: { id, type }[]` for a complete queue-consumer-destination repair. Advice verifies proposed paths with the routing compiler. Duplicate source/type warnings are combined in the start dialog. Price advice follows actual billing dimensions and names only supported controls.
- Closing delivery links ignored by the routing compiler produce `flow-cycle` warnings. Debrief advice asks the player to remove those ambiguous loops before interpreting sizing experiments. External callback re-entry, replication, observation and control links are not classified as delivery loops.
- First practice attempts show failure facts and require a prediction before revealing repair hints or named next-part suggestions. `correctness.fields[]` has checked choices for concrete retry, crash, durability or ordering traces. All choices must be correct before starting through the normal practice controls. Written explanations remain explicitly ungraded. After a passed full day, `createProgress.recordCorrectness(problemId, checkpoint, answer, passed)` adds `progress[id].correctness: { version, checkedAt, choices, explanation }` without removing old scores or solved dates. Traffic scores and leaderboard replays depend only on the graph; mastery is separate. The documented `window.__game.startTraffic()` testing hook can run designs without learning dialogs.
- Sandbox drafts and named slots can include `traffic: { peakRps, mix, curve, userRegions }` beside their existing graph and seed. Older graph-only saves remain valid. Navigation flushes both current traffic and graph, including slider changes whose simulation update was still debounced.
- Bank-wide checks live in `tests/promise-sweep.mjs`, `tests/advice-sweep.mjs`, `tests/cost-advice-sweep.mjs` and `tests/transfer-sweep.mjs`. They cover every problem, removed reference parts and connections, direct-call graphs, undersized pools, all catalog price dimensions, distinct transfers and checked correctness choices. Regenerate content, sizing and preload data after changing the corresponding sources.
### Diagram presentation and earned motion

Insertion reserves 120 world units horizontally or 144 vertically between faces. Only the target endpoint and parts that collide with its displacement move; unrelated branches and the source stay fixed. Editing does not automatically refit the camera. Initial entry and explicit Fit frame the whole diagram inside measured panel bounds, without a minimum zoom that clips parts. Desktop lesson fits reserve the inspector and story space before arranging the graph. Placement folds the palette.

`scene.setFlows(frame, opts)` accepts optional `nodeStates`, the current `sim.state().nodes`, to render `units` and `availableUnits` without deriving availability from utilization. Fleet faces use at most 12 equal capacity buckets, labeled as groups above 12 units. Fill represents the aggregate busy share, crosses unavailable capacity. Lighting is schematic distribution, never independently simulated server histories. Motion pauses with the clock.

Phone captions shorten at small zoom and have an opaque ground so connections cannot obscure names. Selection exposes the full name in the inspector and an explicit Enlarge part control, alongside a persistent complete diagram that returns to Fit all.

Passing replays the actual changed route in request order, counts the previous and current day measurements for the improved limiting metric: served share, p99 latency or monthly cost (or explicitly compares target and current when no previous run exists), then settles the score. This is presentation only, leaves controls available, and has an immediate still version for reduced motion. Three stars with 1,000 points and no excess capacity or failed promises receive the clean-sweep treatment; other passes remain visibly quieter.

Phone lesson fits may pass `reserveY` in world units to leave one insertion row (two in the intro) below the opening graph. This reserves working room before edits; it never changes saved node coordinates or triggers a camera fit during an edit.

### Learning and usability checks

- Estimate rows keep canonical values in content and saved progress. Display shares (`of requests`, `of reads`, `of pieces`) as percent in both Practice and Interview, converting at the input boundary. Percent controls use 0–100 and state their unit. Unit slips receive explicit feedback.
- The build preview is a rough capacity snapshot, never a promise of a full-day result. State unchecked deadlines, retries and event recovery. Show computable latency and constant-rate queue deadline risks with their assumptions. This UI analysis does not change the deterministic simulation or its scoring.
