# System Designer

**Build the system. Survive the day. See why it held.**

System Designer is a free, open-source browser game where you design real systems, from a URL shortener to a bank ledger to a concert ticket drop, then fast-forward through a traffic day full of viral spikes, outages and retry storms. Every request flows through your design as light you can watch, and a plain-words debrief shows what held, what broke, what it cost per month, and why.

Static site at https://systemdesigner.io (GitHub Pages, custom domain). No sign-up needed: progress lives in your browser and friends compete through links. An optional sign-in with Google or GitHub (a small service at https://api.systemdesigner.io, see API.md) keeps progress on every device and adds leaderboards; when that service is unreachable the game works exactly the same without it.

The name matches its home, https://systemdesigner.io (Adi bought the domain on Nov 3, 2026). The *hot path*, the route most requests take through a system, is literal in the game: the busiest edges glow.

---

## 1. Who it is for

| Player | What they get |
|---|---|
| Never heard of a load balancer | The 3-minute intro and the Learn track, in plain words, with live demos |
| Student or bootcamp grad | Easy problems that teach the building blocks one at a time |
| Interview candidate | The clarify, numbers, draw, failure, cost habit on 82 problems with editorials |
| Junior or senior engineer | Hard problems with real failure modes, real cost lines, and trade-offs to argue about |
| Product person, curious non-engineer | Sandbox and Learn: see why "just add servers" is not the whole answer |
| Friends | Daily challenge, personal bests, "beat my design" links and result cards |

---

## 2. Core loop

Every Practice and Challenge problem runs the same five steps. They are the interview habit, made into a game.

1. **Clarify** (30 s). Read the brief and requirements card. Tap 2 to 4 questions to reveal hidden facts ("Can a link change after it is made?" "No."). Each answer changes what a good design looks like.
2. **Numbers** (30 to 60 s). Estimate one to three figures on a log slider (peak reads per second, storage per year, bandwidth). Within 2 times of the worked answer counts as a good guess. Then the worked numbers are shown with the arithmetic.
3. **Draw** (build phase, untimed). Drag elements from the toolbar, connect them, tune knobs in the inspector. A live cost meter and a live "will it hold at peak?" check update as you build. Validation shows plain warnings ("Payments never reach a payment processor").
4. **Traffic day** (about 2.5 minutes at 1x). Press Start. The simulated clock runs 00:00 to 24:00 with the problem's daily traffic curve and its scheduled events. Requests flow as particles, busy parts glow, overloaded parts pulse and drop requests. Pause, change speed, and (in Practice only) adjust knobs during the day. Adding or removing elements is build-phase only.
5. **Debrief**. Score out of 1,000, stars, the four SLO cards, a timeline, the story of each event, the trade-offs you made, and one thing to try next. Then retry, read hints, open the editorial, share, or go to the next problem.

Loop length: a first attempt takes 5 to 8 minutes; a retry about 3.

---

## 3. Sections

### 3.1 Learn

41 lessons, one concept each. The original 24 take 2 to 4 minutes and use the real engine in a small embedded canvas. The 17 lessons in Go deeper and Lead the design take 5 to 8 minutes. They use worked examples where the engine cannot honestly show the mechanism, plus numbers, three reasoning quizzes, two written defenses and a transfer case.

Lesson shape: **hook** (one real situation) → **see it** (a running mini-system that breaks) → **try it** (one change with a clear goal, such as "get the database under 70 percent busy") → **numbers** (two or three real-world approximations) → **one quiz question** → **takeaway** (one sentence).

All lessons are open; the suggested path is shown as tracks.

| Track | Lessons (id: title) |
|---|---|
| Start | `intro`: Your first system (the 3-minute onboarding) · `requests-and-latency`: What a request is, and p50 versus p99 · `back-of-envelope`: Numbers you can do in your head |
| Scale the front | `load-balancing`: Spreading load · `caching`: Remembering answers · `cdn`: Copies near users · `autoscaling`: Adding servers, and why it is late |
| Scale the data | `replication-lag`: Copies are a little behind · `sharding`: Splitting data · `hot-keys`: When one item is popular · `search-indexing`: Search is a copy · `storage-tiers`: Hot, warm, cold and archive |
| Work later | `queues-backpressure`: Waiting instead of breaking · `fanout`: One post, millions of feeds · `realtime-connections`: Live sockets and presence |
| Stay correct | `consistency`: Which copy is the truth · `idempotency-retries`: Exactly once, on purpose |
| Stay up | `rate-limiting`: Saying "slow down" politely · `circuit-breakers`: Timeouts and failing fast · `multi-region`: Surviving a region · `observability`: Seeing problems early |
| Business | `cost`: Where the money goes · `security-compliance`: Proof built in · `ai-serving`: GPUs, tokens and fallbacks |
| Go deeper | `consistent-hashing`: Consistent hashing and moving data · `copies-quorums`: Copies and quorums · `leader-consensus`: Agreeing on one leader · `consistency-models`: What consistent really means · `storage-engine`: Inside a storage engine · `work-across-services`: Work across services · `ordering-time`: Ordering and time · `device-sync`: Syncing across devices · `privacy-design`: Privacy by design · `metrics-systems`: How metrics systems work · `logs-traces`: Logs and traces · `slos-error-budgets`: SLOs and error budgets · `multi-tenancy`: Many customers on one system |
| Lead the design | `lead-interview`: How to lead a design interview · `simplest-design`: The simplest thing that works · `running-migrations`: Changing a running system · `team-boundaries`: Designs that other teams must live with |

The lesson ids (except `intro`) are also the **concept ids** used to tag problems. `content/problems/concept-links.js` adds relevant deeper lessons to existing problem tags without changing their saved ids or scoring.

### 3.2 Practice

The problem bank. 82 problems across 15 groups (section 5).

**List screen.** Filter chips: difficulty (Easy, Medium, Hard), group (industry), concept (multi-select), status (new, tried, solved). A search box matches titles, comparisons and concepts. Cards show title, the plain comparison ("a video service like Netflix"), difficulty, concept tags, best stars and best score. Default sort: suggested order (Easy first within each group, groups in the order of section 5).

**Problem screen.** The five steps of the core loop. Requirements card always visible (collapsible on phones): users, peak requests per second and mix, latency target (p99), availability target, data safety, budget per month, regions, compliance.

**New twist.** After a day, the debrief offers a calibrated quieter workload with a tighter cost ceiling. The original design must change to fit the new budget while preserving the same data and recovery promises. Before repairs on a failed twist, the player commits a changed tradeoff and an experiment that separates two explanations. It is practice only: traffic bests are unchanged, and an independent checked pass adds mastery credit.

**Hints.** Three tiers per problem, revealed one at a time: a nudge, the concept and element to consider, then a near-solution. Hints are free; the debrief and progress record how many were used.

**Editorial.** One to three strong reference designs with the reasoning, worked numbers, cost per month, and the trade-offs between them. Unlocked after one finished traffic day. If the player has not passed yet, a confirm says it contains spoilers. Each reference design can be loaded onto the canvas and run.

**Progress.** Saved locally: attempts, best score, stars, hints used, solved date, last design (auto-saved draft per problem). When signed in, local and server progress merge: union of solved problems and lessons, best score per problem, union of played days for the streak.

### 3.3 Challenge

**Daily challenge.** A new seeded scenario every local day. The date string (YYYY-MM-DD) seeds the choice of problem (a seeded shuffle of all problems flagged daily, so no repeat until the bank is exhausted) and a variant: event times shift by up to 60 minutes, magnitudes by up to 25 percent, and one extra event from the problem's pool. Everyone playing the same date gets the same scenario. No editing during the traffic day in Challenge: it is a pure design test.

**Personal bests.** Best score per day and per problem, a day streak, and a small history chart.

**Beat my design.** After any finished day, Share makes a link that encodes the problem, the seed, the full architecture and the score in the URL fragment (the link itself needs no server). Opening it shows the friend's score as the target and, on request, their design as a faint ghost overlay. When the friend finishes, the game replays the sender's design with the same seed and marks the sender's score "verified" if it matches.

**Leaderboards (optional sign-in).** Signed-in players get a leaderboard per daily challenge and per practice problem: top 50 plus your own rank, best score per player. The server never trusts a score from the browser: it decodes the same payload a "beat my design" link carries, rebuilds the scenario (base problem or that day's variant) and replays the day with the same deterministic engine, then stores its own score as verified. Changes made during a practice day are not replayed. The display name also goes on share links and result cards. Signing in is never a wall: a quiet button in the top bar, and at most one gentle nudge, once ever, after a finished day.

**Result card.** A 1200 by 630 image: title, date, score dial and stars, the four SLO chips, a thumbnail of the architecture, and the link. Uses the system share sheet where available, else downloads.

### 3.4 Sandbox

Every element, no budget, no game over, no score. Traffic panel with a log-scale slider per request type (1 to 10 million requests per second), a curve picker, region shares, and an event deck that fires any event on demand. Live meters only: success rate, p99, cost per month, busiest element. Five local save slots and share links.

---

## 4. Controls

| Action | Mouse and keyboard | Touch |
|---|---|---|
| Place | Drag from toolbar onto canvas, or click item then click canvas | Tap item, then tap canvas (ghost follows the finger) |
| Connect | Drag from a node's port ring to another node | Tap a node, drag from its port ring; or tap node A, tap "Connect", tap node B |
| Select | Click node | Tap node |
| Inspector | Opens on select (right panel) | Bottom sheet |
| Move | Drag node | Long-press then drag |
| Delete | Delete or Backspace; context menu | Long-press menu |
| Duplicate | Ctrl+D | Long-press menu |
| Pan | Drag empty canvas, or Space+drag | One-finger drag on empty canvas |
| Zoom | Wheel or Ctrl+wheel (toward cursor) | Pinch |
| Fit view | F | Double-tap empty canvas |
| Search toolbar | / | Search field at the top of the drawer |
| Undo, redo | Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y) | Buttons in the top bar |
| Start or pause the day | Enter to start, Space to pause | Big play button |
| Speed | 1 to 7 select 0, 0.25, 0.5, 1, 2, 4, 8 times | Speed pill |
| Hint | H | Hint button |
| Mute | M | Settings |
| Cancel | Esc | Tap empty canvas |

Every control has a visible button; keyboard shortcuts are accelerators only. The toolbar and inspector are fully keyboard navigable with visible focus rings.

---

## 5. Problem bank (as built)

82 problems across 15 groups, written to `content/data` by `tools/gen-content.mjs` from `content/problems/*.js`. "Events" are the scheduled signature events. Every problem also has a "new twist" replay (`content/problems/twists.js`, made by `tools/gen-twists.mjs`): its events move and one more is added, the reference design still passes it, and the day is practice only.

### core: Core building blocks

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| url-shortener | URL shortener | Easy | a link shortener like Bitly | caching, back-of-envelope | viral-spike, cache-stampede |
| rate-limiter-service | Rate limiter for a public API | Medium | the limits on a public API like GitHub's | rate-limiting, hot-keys | bot-scraping, retry-storm |
| search-autocomplete | Search autocomplete | Medium | suggestions as you type, like Google | caching, search-indexing | viral-spike, hot-key |
| notification-service | Notification service | Medium | the service that sends every push, email and text | queues-backpressure, idempotency-retries | third-party-rate-limit, duplicate-delivery, dependency-outage |
| login-sso | Login and single sign-on | Medium | the "Sign in with" button used by many apps | rate-limiting, security-compliance | bot-scraping, retry-storm |
| job-scheduler | Scheduled job service | Hard | a cron-as-a-service product | queues-backpressure, idempotency-retries | flash-crowd, duplicate-delivery |
| object-storage | Object storage service | Hard | a cloud file store like Amazon S3 | storage-tiers, sharding | viral-spike, zone-outage, cost-blowout |

### media: Media and streaming

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| photo-sharing | Photo sharing | Easy | a photo app like Instagram | cdn, storage-tiers | viral-spike, cache-stampede |
| podcast-hosting | Podcast hosting | Easy | a podcast host | cdn, cost | flash-crowd, cost-blowout |
| news-site | News site | Easy | a news site like the BBC or CNN | caching, cdn | flash-crowd, cache-stampede |
| music-streaming | Music streaming | Medium | a music service like Spotify | cdn, caching, search-indexing | hot-key, region-outage |
| video-on-demand | Video streaming | Medium | a video service like Netflix | cdn, cost, storage-tiers | flash-crowd, cache-stampede, cost-blowout |
| short-video-feed | Short-video feed | Medium | a short-video app like TikTok | cdn, caching, hot-keys | viral-spike, hot-key, slow-dependency |
| video-upload-pipeline | Video upload pipeline | Hard | uploads on a site like YouTube | queues-backpressure, idempotency-retries | viral-spike, poison-message, dependency-outage |
| live-streaming | Live streaming | Hard | a live platform like Twitch | cdn, realtime-connections, fanout | thundering-herd, flash-crowd, region-outage |

### social: Social and messaging

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| comments-and-likes | Comments and likes | Easy | the like counter under a post | hot-keys, caching | viral-spike, hot-key |
| chat-app | One-to-one chat | Medium | a chat app like WhatsApp | realtime-connections, idempotency-retries | thundering-herd, zone-outage, duplicate-delivery |
| stories | Disappearing stories | Medium | 24-hour stories | storage-tiers, cdn | viral-spike, cost-blowout |
| social-feed | Social feed | Hard | a home timeline like X or Facebook | fanout, caching, hot-keys | celebrity-fanout, hot-key, cache-stampede |
| group-chat-presence | Group chat and presence | Hard | team chat like Slack or Discord | realtime-connections, fanout, consistency | thundering-herd, celebrity-fanout, network-partition |

### fintech: Finance and payments

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| invoicing-billing | Invoicing and billing | Easy | an invoicing tool like QuickBooks | queues-backpressure, idempotency-retries | duplicate-delivery, deadline-surge, third-party-rate-limit |
| payroll-run | Payroll run | Easy | a payroll service like Gusto | idempotency-retries, queues-backpressure | deadline-surge, third-party-rate-limit, duplicate-delivery |
| payments-checkout | Checkout payments | Medium | a checkout like Stripe Checkout | idempotency-retries, circuit-breakers | duplicate-delivery, slow-dependency, dependency-outage |
| digital-wallet | Peer-to-peer wallet | Medium | a wallet app like Venmo | consistency, idempotency-retries, security-compliance | duplicate-delivery, compliance-audit, db-failover |
| insurance-claims | Insurance claims | Medium | filing a car insurance claim online | queues-backpressure, security-compliance | deadline-surge, dependency-outage, compliance-audit |
| bnpl-credit | Buy now, pay later | Medium | a pay-in-installments service like Klarna | circuit-breakers, queues-backpressure, idempotency-retries | third-party-rate-limit, compliance-audit, retry-storm |
| bank-ledger | Bank ledger | Hard | the core ledger of a bank | consistency, security-compliance, multi-region | db-failover, data-corruption, region-outage, compliance-audit |
| stock-order-matching | Stock order matching | Hard | an exchange like Nasdaq | consistency, queues-backpressure | flash-crowd, zone-outage, network-partition |
| fraud-detection | Real-time fraud detection | Hard | card fraud checks at a bank | ai-serving, circuit-breakers | bad-deploy, slow-dependency, viral-spike |
| crypto-exchange | Crypto exchange | Hard | a crypto exchange like Coinbase | rate-limiting, consistency, security-compliance | ddos-attack, flash-crowd, key-leak |

### health: Healthcare

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| appointment-booking | Clinic appointment booking | Easy | booking a doctor's visit online | consistency, queues-backpressure | flash-crowd, third-party-rate-limit |
| lab-results | Lab results portal | Easy | a patient portal that shows blood test results | caching, queues-backpressure, idempotency-retries | duplicate-delivery, flash-crowd |
| health-records | Patient health records | Medium | a hospital's electronic records | security-compliance, multi-region | key-leak, compliance-audit, region-outage |
| telehealth-video | Telehealth video visits | Medium | a video doctor visit | realtime-connections, multi-region | thundering-herd, zone-outage, dependency-outage |
| pharmacy-stock | Pharmacy stock and refills | Medium | a pharmacy chain's stock and refill system | replication-lag, search-indexing | noisy-neighbor, replication-lag, hot-key |
| vaccine-signup-surge | Vaccine sign-up surge | Hard | a county vaccine sign-up site | rate-limiting, queues-backpressure | flash-crowd, bot-scraping, db-failover |
| wearable-health | Health readings from a wearable | Hard | private health summaries from a wrist device | privacy-design, device-sync, storage-engine, ordering-time, slos-error-budgets | retry-storm, zone-outage, thundering-herd |

### civic: Government and education

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| benefits-portal | Benefits application portal | Easy | a state benefits site | queues-backpressure, security-compliance | compliance-audit, deadline-surge |
| course-enrollment-day | Course enrollment day | Medium | a university's registration day | hot-keys, rate-limiting | flash-crowd, hot-key, retry-storm |
| online-exam | Online exam | Medium | a timed online exam for 200,000 students | realtime-connections, multi-region | thundering-herd, cert-expiry, zone-outage |
| tax-deadline-surge | Tax filing deadline | Hard | a national tax filing site | queues-backpressure, autoscaling, security-compliance | compliance-audit, deadline-surge, third-party-rate-limit |

### mobility: Mobility and logistics

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| package-tracking | Package tracking | Easy | parcel tracking like UPS | caching, queues-backpressure | dependency-outage, viral-spike |
| fleet-telemetry | Fleet telemetry | Medium | trucks reporting every few seconds | queues-backpressure, storage-tiers, observability | thundering-herd, cardinality-explosion, disk-full |
| food-delivery | Food delivery | Medium | an app like DoorDash | realtime-connections, idempotency-retries, circuit-breakers | viral-spike, slow-dependency, duplicate-delivery |
| ride-hailing-dispatch | Ride-hailing dispatch | Hard | an app like Uber | realtime-connections, hot-keys, sharding | zone-outage, hot-key, flash-crowd |
| maps-routing | Maps and routing | Hard | a maps app like Google Maps | cdn, caching, multi-region | overseas-launch, viral-spike, cache-stampede |

### travel: Travel and events

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| restaurant-reservations | Restaurant reservations | Easy | a booking site like OpenTable | consistency, caching | flash-crowd, cache-stampede |
| hotel-booking | Hotel booking | Medium | a site like Booking.com | search-indexing, consistency, rate-limiting | bot-scraping, slow-dependency, replication-lag |
| airline-booking | Airline booking | Hard | an airline's booking and seat system | consistency, circuit-breakers, security-compliance | slow-dependency, flash-crowd, third-party-rate-limit |
| concert-ticket-drop | Concert ticket drop | Hard | a ticket sale like Ticketmaster | queues-backpressure, rate-limiting, idempotency-retries | bot-scraping, flash-crowd, retry-storm |

### iot: IoT and devices

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| ev-charging-network | EV charging network | Easy | a public charger network | idempotency-retries, queues-backpressure | dependency-outage, thundering-herd |
| smart-home-hub | Smart home | Medium | lights and locks controlled from a phone | realtime-connections, multi-region, queues-backpressure | thundering-herd, region-outage |
| smart-power-grid | Smart power grid | Medium | a power company reading millions of smart meters | storage-tiers, queues-backpressure, security-compliance | network-partition, thundering-herd, compliance-audit |
| industrial-sensors | Factory sensors | Medium | sensors on a factory floor | storage-tiers, observability | thundering-herd, network-partition |
| firmware-rollout | Firmware rollout | Hard | an over-the-air update for a million smart devices | cdn, rate-limiting | thundering-herd, network-partition |

### ai: AI, ads and search

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| semantic-search | Semantic search | Easy | "search by meaning" on a help center | ai-serving, search-indexing | viral-spike, bad-deploy |
| recommendations | Recommendations | Medium | a "you may also like" row | caching, ai-serving | slow-dependency, cache-stampede, replication-lag |
| ad-serving | Ad serving | Hard | ad auctions on a news site | caching, cost, ai-serving | viral-spike, slow-dependency, cost-blowout, compliance-audit |
| ai-chatbot-serving | AI chatbot serving | Hard | a chat assistant like ChatGPT | ai-serving, cost, rate-limiting | gpu-shortage, third-party-rate-limit, cost-blowout |

### games: Games

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| leaderboards | Leaderboards | Easy | a global high-score table | hot-keys, caching | hot-key, viral-spike |
| matchmaking | Multiplayer matchmaking | Medium | finding a match in an online game | queues-backpressure, multi-region | overseas-launch, flash-crowd, zone-outage |
| game-patch-day | Patch day downloads | Medium | a big game update | cdn, cost | flash-crowd, cost-blowout |
| battle-royale | Battle royale launch | Hard | a 100-player last-one-standing game on launch night | realtime-connections, hot-keys | viral-spike, hot-key |

### productivity: Productivity

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| calendar-invites | Calendar and invites | Easy | a shared calendar | queues-backpressure, idempotency-retries | third-party-rate-limit, duplicate-delivery |
| file-sync | File sync | Medium | a file sync app like Dropbox | storage-tiers, consistency | thundering-herd, hot-key, disk-full |
| collaborative-docs | Collaborative documents | Hard | shared docs like Google Docs | realtime-connections, consistency | thundering-herd, zone-outage, network-partition |
| email-service | Email service | Hard | an email service like Gmail | search-indexing, storage-tiers, queues-backpressure | bot-scraping, disk-full, replication-lag |
| device-notes | Notes that sync across your devices | Hard | a private offline notebook like Standard Notes | device-sync, ordering-time, privacy-design, consistency-models, work-across-services | zone-outage, thundering-herd, retry-storm |

### commerce: Commerce and retail

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| shopping-cart | Shopping cart | Easy | the cart on an online store like Amazon | caching, consistency | flash-crowd, cache-stampede |
| flash-sale-inventory | Flash sale inventory | Medium | a limited-stock sale like a sneaker drop | hot-keys, queues-backpressure | thundering-herd, bot-scraping |
| black-friday-marketplace | Black Friday marketplace | Hard | the biggest sale day of an online marketplace like Amazon | caching, hot-keys, idempotency-retries | flash-crowd, hot-key, duplicate-delivery, dependency-outage |

### telecom: Telecom and messaging

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| otp-sms-delivery | One-time code by text | Easy | the login code text that arrives in seconds | idempotency-retries, rate-limiting | third-party-rate-limit, duplicate-delivery |
| call-routing | Voice and video call setup | Medium | the ringing part of a calling app or phone carrier | realtime-connections, multi-region | flash-crowd, zone-outage |
| bulk-sms-campaigns | Bulk text campaigns | Hard | the platform behind store coupons and delivery alerts, like Twilio or Braze | queues-backpressure, rate-limiting, idempotency-retries | third-party-rate-limit, duplicate-delivery, poison-message |

### devtools: Developer platforms

| id | Title | Diff | Comparison | Concepts | Events |
|---|---|---|---|---|---|
| status-page | Status page | Easy | a public status page | multi-region, cdn | flash-crowd, zone-outage |
| ci-cd-pipeline | CI/CD build system | Medium | build runners like GitHub Actions | queues-backpressure, cost, autoscaling | flash-crowd, poison-message, cost-blowout |
| feature-flag-service | Feature flag service | Medium | a flag service like LaunchDarkly | realtime-connections, cdn | thundering-herd, bad-config-push |
| clickstream-analytics | Clickstream analytics | Medium | the page-view tracking behind a product analytics tool | queues-backpressure, storage-tiers | viral-spike, cardinality-explosion, cost-blowout |
| observability-platform | Metrics platform | Hard | a metrics store like Mimir | sharding, observability, multi-region | cardinality-explosion, thundering-herd, zone-outage |
| logs-platform | Logs platform | Hard | a label-indexed log service like Loki | logs-traces, consistent-hashing, storage-engine, multi-tenancy, slos-error-budgets | noisy-neighbor, zone-outage, retry-storm |
| tracing-platform | Tracing platform | Hard | a trace store like Tempo | logs-traces, ordering-time, consistent-hashing, storage-engine, slos-error-budgets | zone-outage, thundering-herd, retry-storm |
| tenant-metrics | Metrics for many customers | Hard | a shared metrics service like Mimir | metrics-systems, multi-tenancy, copies-quorums, consistent-hashing, slos-error-budgets | cardinality-explosion, noisy-neighbor, zone-outage |

Totals: 19 Easy, 33 Medium, 30 Hard. Every group has at least one Hard problem.

## 6. The traffic day

- The clock runs 00:00 to 24:00 in the problem's home region. One simulation tick is 10 simulated seconds. At 1x, one simulated hour plays in 6 seconds, so a full day takes 144 seconds and the simulation advances exactly one tick per 60 fps frame.
- Speeds: pause, 0.25x, 0.5x, 1x, 2x, 4x, 8x. When an event starts at 1x or faster, the game eases to 1x for 3 seconds and shows the event banner, unless the player turned "auto slow-down" off.
- Load follows the problem's 24-hour curve (evening for consumer apps, office hours for B2B, commute for rides, meals for food, market hours for trading). Events stack on top.
- What the player sees: particles per request type along edges; each node's busy ring (0 to 100 percent and beyond); status glyphs; queue depth bars on queues; a HUD sparkline of success rate and p99 for the last 2 simulated hours; a cost meter in dollars per month; an event banner with the event's icon, name and one plain sentence.
- One visible dot stands for many requests. The legend shows the current scale, always a round number ("1 dot ≈ 500 req/s").

---

## 7. Scoring and the debrief

### 7.1 Score (out of 1,000)

| Part | Points | How |
|---|---|---|
| Reliability | 400 | Share of real user requests that succeeded, versus the availability target. Full points at or above target. One "nine" short scores 200, two nines short scores 0. |
| Latency | 200 | Traffic-weighted share of simulated minutes where the p99 met the target for interactive request types. |
| Data safety | 200 | Starts at 200. Minus 100 for any lost acknowledged write under a no-loss requirement; minus 50 for any duplicate payment, message or other non-idempotent effect; minus 30 for stale reads above 1 percent where read-your-writes is required; minus 40 per failed compliance check. |
| Cost | 200 | Full points at or under the monthly budget, falling linearly to 0 at twice the budget. |

**Pass** = availability at or above target; latency share at least 95 percent with every interactive type at least 80 percent; data safety at least 150 with no lost write beyond the rule, no duplicate, no failed compliance check and no stale reads over 1 percent where read-your-writes is required; cost at or under budget. Speed, safety and cost points are multiplied by the share of requests served. **Stars**: 1 for a pass, 2 for a pass with 800 or more, 3 for a pass with 920 or more.

Exact formulas live in `catalog/world.json` under `scoring`; sim and UI both read them from there.

### 7.2 Debrief layout (top to bottom)

1. **Verdict line**, plain words. "Held. 99.97 percent of requests succeeded against a 99.9 percent target." or "Broke at 18:42 when the viral spike hit your database."
2. **Score dial** (counts up), stars, pass or not, personal best badge.
3. **Four SLO cards**: Reliability, Latency, Data safety, Cost. Each shows target, actual, points, and one line of why. Every number carries ≈ and "approx." where it is an approximation.
4. **Timeline**: 24 hours, traffic curve, red bands where requests failed, event markers. Tap a marker to jump to its story.
5. **What happened**, one card per event: what hit you, what it did to your design (with numbers), what helped, what would have helped, and one real-world sentence. Text comes from the event's templates in `catalog/events.json`.
6. **Trade-offs you made**: one line per element worth discussing, built from the element's `tradeoff` line plus its cost line and peak busy level ("3 read replicas: +$1,350 a month, reads spread out; they can be up to 1 s behind").
7. **One thing to try next**: the single change that would have recovered the most points, chosen by the sim.
8. **Actions**: Retry, Hints, Editorial, Share, Next problem.

---

## 8. The first three minutes

For someone who has never heard of a load balancer. Plain words only; each new word is explained the first time it appears. The intro is the `intro` lesson and starts automatically on first visit (skippable, replayable from Learn).

| Time | What happens on screen | What the player does |
|---|---|---|
| 0:00 | A dark, calm canvas. A phone on the left, one server in the middle, one database on the right. Soft dots flow phone to server to database and back. Caption: "Every dot is someone tapping 'open' in your app." | Nothing. Watch for 8 seconds. |
| 0:10 | Morning arrives (clock in the corner speeds up). Dots multiply. The server's ring fills amber, then red; dots start popping. Caption: "One server handles about 1,000 requests a second (approx.). You now have 3,000." | Tap the glowing "+" on the server twice. Now 3 servers. |
| 0:35 | Dots still only go to the first server; the others sit idle. Caption: "Your app knows only one address. A **load balancer** is a receptionist that hands each request to a free server." The Load balancer item pulses in the toolbar. | Drag the load balancer between phone and servers. It snaps in and connects itself. Dots split evenly; all green. A soft chime. |
| 1:15 | The database ring turns amber. Caption: "Most people ask for the same few things. A **cache** remembers recent answers, so the database is not asked again." Numbers chip: "cache ≈ 1 ms, database ≈ 5 ms (approx.)." | Drag the cache onto the line between servers and database. 90 percent of dots now bounce back from the cache with a small sparkle. The database calms down. |
| 2:05 | Banner: "Viral spike! Traffic is 5 times normal." Rings climb. Caption: "New servers take 2 to 4 minutes to start. Keep some spare room, or let an **autoscaler** add servers for you." | Toggle Autoscale on the servers, or add units. Survive the spike. |
| 2:40 | Mini debrief: "Held. 99.9 percent of requests worked. About $900 a month (approx.). You just did system design." Three stars burst softly. | Pick: "Learn the building blocks" (Learn) or "Try a real problem: URL shortener" (Practice, Easy). |

Rules for the intro: no score pressure, no failure state (if the player waits, the caption repeats and the target item pulses), every caption under 25 words, total under 3 minutes.

---

## 9. Art direction

Modern, calm, precise. Think instrument panel at night in dark mode and a clean architect's table in light mode. Never blocky, never pixel art, never retro.

### 9.1 Palette tokens

Defined once in `assets/tokens.css` (CSS) and `assets/palette.js` (the same values as numbers for PixiJS). Light is the default; dark applies with `[data-theme="dark"]`, or with the system setting when the player chose "system" (`@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`).

| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #F3F5FA | #0A0E18 | Page background |
| --bg-2 | #E8ECF5 | #111827 | Background gradient end |
| --canvas | #F6F8FC | #0C111D | Play canvas |
| --grid-dot | rgba(30,41,59,0.10) | rgba(226,232,240,0.07) | Canvas dot grid |
| --surface | rgba(255,255,255,0.72) | rgba(20,26,42,0.66) | Glass panels (with 16 px backdrop blur) |
| --surface-strong | rgba(255,255,255,0.92) | rgba(24,31,50,0.88) | Panels when blur is off |
| --surface-solid | #FFFFFF | #151B2C | Node cards, menus |
| --border | rgba(15,23,42,0.08) | rgba(255,255,255,0.08) | Hairlines |
| --border-strong | rgba(15,23,42,0.16) | rgba(255,255,255,0.16) | Inputs, focused panels |
| --text | #0E1525 | #E9EDF5 | Primary text |
| --text-2 | #3A4458 | #B7C0D1 | Secondary text |
| --text-3 | #6B7486 | #8590A6 | Hints, labels |
| --accent | #5146E5 | #8B85FF | Primary action, selection |
| --accent-2 | #0E9F94 | #2DD4BF | Secondary highlight |
| --accent-soft | rgba(81,70,229,0.12) | rgba(139,133,255,0.16) | Selected backgrounds |
| --ok | #138A4B | #3DD68C | Healthy |
| --warn | #B7791F | #F5B544 | Busy (70 to 90 percent) |
| --hot | #D9622B | #FF8A4C | Very busy (90 to 100 percent) |
| --bad | #C9372C | #FF6B6B | Overloaded, down, failed |
| --info | #2563EB | #60A5FA | Notes |
| --edge-idle | #C5CCDA | #2A3347 | Edges with no traffic |
| --edge-flow | #8A93A6 | #46516A | Edges with traffic |

Category tints (node badge and silhouette accent; silhouette shape also differs by category):

| Token | Light | Dark | Node silhouette |
|---|---|---|---|
| --cat-clients | #64748B | #94A3B8 | circle |
| --cat-edge | #5146E5 | #8B85FF | hexagon |
| --cat-compute | #0E9F94 | #2DD4BF | rounded square |
| --cat-data | #C47F12 | #F2B544 | cylinder (rounded rect with top ellipse) |
| --cat-messaging | #C2417E | #F472B6 | pill |
| --cat-platform | #7C3AED | #A78BFA | shield |
| --cat-ops | #15803D | #4ADE80 | dashed rounded square |
| --cat-ai | #A21CAF | #E879F9 | octagon |
| --cat-external | #0369A1 | #38BDF8 | double-outline square |

Request families (particle colours; every request type also has its own shape, see `catalog/requests.json`). Based on the Okabe-Ito colour-blind-safe set, adjusted for contrast per theme:

| Token | Light | Dark | Types |
|---|---|---|---|
| --req-read | #0072B2 | #4FA8E8 | read (circle), search (diamond), report (octagon) |
| --req-write | #B86E00 | #F2B33D | write (square), sync (bowtie) |
| --req-media | #A8538A | #E59AC6 | upload (triangle up), stream (capsule), live (ring) |
| --req-trust | #00805C | #2FD1A0 | payment (hexagon), login (pentagon) |
| --req-ai | #6A4BE8 | #A794FF | inference (star) |
| --req-realtime | #2C8FC9 | #8FD4FF | message (chevron), location (triangle down), notify (dome) |
| --req-background | #64748B | #94A3B8 | telemetry (dash), event (plus), batch (crate), webhook (trapezoid) |
| --req-attack | #C2410C | #FF7A3D | attack (x) |

**Colour-blind safety.** Status is always shape plus colour: ok is a check in a circle, busy is a triangle, overloaded is an octagon with an x, down is a slashed circle. Request types are told apart by shape first. A "high contrast" setting thickens outlines and adds pattern fills to busy rings.

### 9.2 Typography (Google Fonts)

One `<link>` with `display=swap`:
- **Sora** 600 and 700 for display: titles, the score, big numbers on cards.
- **Inter** 400, 500 and 600 for all interface text.
- **JetBrains Mono** 500 for live numbers in the HUD and inspector, with tabular figures.

Scale: 12, 13, 15, 17, 20, 24, 32, 44 px. Body 15 px. Line height 1.45 for text, 1.15 for display. Fallbacks: system-ui stacks.

### 9.3 Nodes, edges, panels

- **Nodes**: 72 by 72 world units, glass card in `--surface-solid` with soft shadow, silhouette by category, our SVG icon at 28 px in the category tint, label below in 12 px Inter. A busy ring hugs the silhouette and fills clockwise with the status colour; above 100 percent it turns `--bad` and pulses. Units show as a small "x3" chip; zones as 1 to 3 tiny dots under the chip. Locked starter nodes show a small lock.
- **Edges**: smooth cubic curves with horizontal tangents between ports. 2 px idle; thickness grows with log of requests per second up to 6 px. Faint direction chevrons every 80 px. Control and observer links are dashed and never carry particles.
- **Panels**: glass with 16 px backdrop blur (falls back to `--surface-strong` when blur is unsupported or quality is low), 14 px radius, 1 px `--border`, soft shadow. Toolbar 280 px left, inspector 320 px right, HUD strip bottom. Phones (under 720 px wide): toolbar becomes a bottom drawer with category tabs, the inspector becomes a bottom sheet, the HUD compacts to the top.

### 9.4 Motion

| Token | Value | Use |
|---|---|---|
| --dur-1 | 120 ms | Hover, press |
| --dur-2 | 200 ms | Toggles, chips, small panels |
| --dur-3 | 320 ms | Page and panel transitions |
| --dur-4 | 900 ms | Score count-up |
| --ease-out | cubic-bezier(0.22, 1, 0.36, 1) | Entrances |
| --ease-in-out | cubic-bezier(0.65, 0, 0.35, 1) | Moves |

- Node placement uses a spring (stiffness 320, damping 24) with at most 6 percent overshoot and settles within 300 ms.
- Camera pans with inertia (friction 0.92 per frame); zoom eases over 200 ms toward the cursor or pinch centre.
- Nothing moves linearly except particles along edges.
- **Reduced motion** (system setting or toggle): particles are replaced by static flow bands whose thickness shows load; no inertia, no springs, no pulsing; fades only, at most 120 ms; event banners appear without sliding.

### 9.5 Particles and glow rules

- Each request type has a pre-baked shape texture (10 px, 12 px on touch devices) tinted with its family colour and a 1.5 px outline in `--canvas` for separation.
- Particles travel at constant screen speed (240 px per second at 1x, scaling with the square root of game speed), easing in over the first 80 ms.
- **Cache hit**: the particle turns back from the cache with a tiny sparkle. **Completed** at a store or external service: shrinks into the node over 120 ms. **Failed**: bursts into 4 shards in `--bad` and fades over 300 ms. **Attack dropped** by a filter: the x fizzles at the filter.
- Emission per edge and type is proportional to requests per second divided by the dot scale; the dot scale is a round number (1, 2 or 5 times a power of 10) chosen so the busiest edge emits at most 12 dots per second.
- **Glow** appears only on (a) hot paths, meaning edges into elements above 70 percent busy, with strength growing to 100 percent; (b) the selected node; (c) elements hit by an active event, as a pulsing ring in the event's severity colour. At most 12 glowing edges at once (the busiest win). Glow is pre-baked gradient textures with additive blending; no runtime blur filters.
- Overloaded elements pulse at 1.2 Hz and show a small pile of waiting particles at their input.

### 9.6 Icons

All icons are our own SVGs per the briefs in the catalog: 24 by 24 viewBox, 1.75 px round strokes in `currentColor`, an optional duotone fill at 18 percent, no text, no logos or brand marks. They must read at 16 px. Coverage is total: every element, category, event and interface action has an icon before any other module is built.

---

## 10. Audio direction

All sounds are synthesised with Web Audio; there are no audio files. The mood is soft, glassy and musical, never arcade bleeps.

- **Chain**: voices → bus gain → gentle compressor → master gain → output. Master default 60 percent; mute with M; a separate ambient toggle.
- **Unlock** on the first tap or click; no sound before that.
- **Voices**: at most 10 at once; each sound has a 60 ms cooldown; crackle and error sounds are rate-limited to 4 per second in total.

| Name | Recipe | When |
|---|---|---|
| ui.tap | Sine 1,800 Hz gliding to 1,200 Hz, 25 ms | Buttons |
| place | Triangle plus sine an octave up, 140 ms exponential decay, 3 percent pitch drop. Pitch by category on a pentatonic scale (clients C5, edge D5, compute E5, data G4, messaging A4, platform G5, ops A5, ai D5, external E4) so building sounds musical | Element placed |
| connect | Two soft sines a fifth apart, 70 ms apart | Edge made |
| remove | Descending minor third with a short low-passed noise puff | Delete |
| start | Band-passed noise sweep 200 Hz to 3 kHz over 600 ms plus a low sine swell | Day starts |
| event.1 / event.2 / event.3 | Two soft pings / two low 220 Hz pulses / three deep 150 Hz pulses with filtered noise | Event starts, by severity |
| overload | Short noise bursts band-passed at 2 kHz, volume by overload share | Element over 100 percent |
| recover | Soft major-third arpeggio up | Element back to healthy |
| fail.burst | Muted 140 Hz triangle buzz, 120 ms | Large failure spike |
| count | Very soft ticks, at most 20 | Score count-up |
| star | Bell-like C5, E5, G5, one note per star | Stars |
| pass / miss | Bright open chord / two gentle descending notes (never harsh) | Debrief verdict |
| ambient | Two detuned sines (55 and 82.5 Hz) through a low-pass whose cutoff follows total load (200 to 1,200 Hz), very quiet | During the day, if on |

---

## 11. Performance budget

Target: a steady 60 fps on a mid laptop (4 cores, integrated graphics) and smooth play on phones and tablets (60 target, 45 floor).

| Budget per 16.7 ms frame | Limit |
|---|---|
| Simulation | at most 3 ms average, even at 8x (8 ticks per frame) |
| Rendering | at most 7 ms |
| DOM and UI | at most 2 ms |
| Slack | about 4.7 ms |

- **Fixed-step simulation, decoupled from rendering.** The sim advances in fixed 10-second simulated ticks from an accumulator fed by wall time times speed; at most 16 ticks per frame (beyond that the game slows rather than stutters, and `__perf` reports it). Rendering interpolates particle positions in wall time. The sim is deterministic: seeded random numbers only, no `Date.now` or `Math.random`, arrays iterated in id order.
- **No per-tick allocation.** Per-node and per-type values live in typed arrays allocated on graph change. Routing tables are rebuilt only when the graph changes.
- **Pooling.** Particles, shard bursts, glow sprites and labels come from pools created at scene start; nothing is created or destroyed per frame.
- **Particle caps**: high 1,500, medium 800, low 400 live particles; at most 48 per edge.
- **Rendering**: one PixiJS application; static edge geometry rebuilt only on graph or theme change; particle shapes, node backgrounds and glows pre-baked to textures per theme; particles in a ParticleContainer; no runtime filters; off-screen culling; device pixel ratio capped at 2 (1.5 on low).
- **UI throttling**: HUD and inspector numbers update at 4 Hz, charts at 2 Hz, DOM writes batched in one animation frame.
- **Auto quality**: if the rolling frame time is above 20 ms for 2 seconds, step down (halve particles, glow off, pixel ratio 1); if below 13 ms for 10 seconds, step back up.
- **Load**: first paint under 1.5 s on a 4G phone; our own JavaScript under 400 KB uncompressed for v1; the catalog JSON (about 210 KB, about 40 KB compressed) loads once.
- **Memory**: JavaScript heap under 150 MB, textures under 64 MB.
- **`window.__perf`** exposes rolling frame time, p95 frame time, sim time and render time per frame in ms, ticks per frame, live particles, fps and the current quality level.

---

## 12. Teaching accuracy

- Every number shown is a sensible real-world approximation, marked with ≈ and an "approx." tooltip that shows the element's note from the catalog.
- Prices are rough 2026 public list prices and are always called rough.
- Each problem's Numbers step shows the arithmetic, the way an interviewer would want it said out loud: rate, size per unit, total per day, total stored, copies.
- When the model simplifies something (for example, the flow model treats traffic as rates rather than individual requests), the Learn lesson says so in one sentence.
- Accuracy beats flash: if an effect would mislead, it is cut.

---

## 13. Originality

The genre (build an architecture, then survive the traffic) is shared with other games. System Designer uses genre-level ideas only. Nobody on the team opens, reads or copies any other game's code, assets, element lists, level lists, text, names or layout. All names, text, icons, sounds, the element catalog, the problem bank and the UI here are original.

## 14. License and credits

MIT license. Published under Aditya Reddy's name. No AI attribution anywhere in the game, code comments, README or commits.
