# System Designer sign-in service

Optional accounts for System Designer, served at **https://api.systemdesigner.io**. The hosted site needs it to play. Copies that do not run on systemdesigner.io never need it: without the service the game works with no account and shows no sign-in button.

Signing in with Google or GitHub:
- saves progress across devices (local and server progress are merged: union of solved problems and finished lessons, best score per problem, union of played days for the streak),
- puts scores on the Challenge leaderboards (one per daily challenge, one per practice problem),
- puts the account's display name on "beat my design" links and result cards.

The service is a small Node 24 program in `api/`: `node:http`, `node:sqlite` and `node:crypto`, with no third-party packages.

## Anonymous counts and feedback

These work independently of account sign-in. Automatic usage counts and error reports are local-test-only. Public sites send neither, even with an older saved enabled setting. The live game supports optional feedback. Production page visits are counted by Cloudflare Web Analytics, not by this service (see Production setup below). Neither needs an account/config.js change.

For local testing, open localhost with `?measure=8794` (a local API port). Only local origins on 8765 or 8777 are accepted with `NODE_ENV=test DEV=1`. Preview sites send no automatic events. After its first paint, the local test game uses `navigator.sendBeacon` in batches of at most 20 events, after one second or when the page is hidden. Failed batches are dropped. Nothing runs in the simulation loop.

Local automatic events and errors are also suppressed by Do Not Track, Global Privacy Control, or Settings → Anonymous usage counts being off. Turning the setting off discards the pending batch. The only local measurement state is that preference and markers that a feedback prompt was shown. There is no local visitor id, measurement cookie or fingerprint. Explicit feedback still works with automatic counting off. Account cookies, if the browser attaches one to a beacon, are ignored by both anonymous routes; feedback uses `credentials: omit` and `referrerPolicy: no-referrer`.

| Route | Body and limits |
|---|---|
| `POST /e` | `{ events: [{ name, id?, screen, referrer? }] }`, at most 20 events and 8 KB. 30 requests per minute per address, plus the existing global route limit. Known fields only. `screen` is `phone` or `desktop`; `referrer` is a host or empty string, only on `app_opened`. Replies `202 { ok: true }`. |
| `POST /feedback` | `{ rating, comment, page, version, about?, quote? }`, at most 6,618 bytes, 5 requests per 10 minutes per address. Rating is an integer from 1 to 5; comment is at most 500 characters. Page is `general`, `problem:<known id>` or `lesson:<known id>`. Version comes from `core/version.js`, such as `2026.11.11`; bump it when publishing a changed game. Replies `202 { ok: true }`. |

Optional `about` keys are `helped` (`yes`, `a-bit`, `no`), `use` (`interview`, `class`, `work`, `curiosity`), `country` (one ISO 3166-1 alpha-2 code from `core/countries.js`) and `role` (`student`, `engineer`, `educator`, `other`). Omit unanswered keys and empty optional objects. Country is always chosen by the player; headers, IP, language and time zone supply no answers. Old four-field requests remain valid.

`quote` is sent only with the unchecked-by-default consent box selected and a nonblank comment. Its shape is `{ consent: true, consentVersion: "2026.11.11", name, title, email? }`. Name and title are trimmed, nonblank, at most 60 and 80 UTF-16 code units, and cannot contain control characters. Optional email is trimmed and lowercased, at most 254 code units, and must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Email is accepted only inside `quote`. Unknown keys, types, choices, country codes or consent versions return `400 bad-input`. The comment is never rewritten or trimmed. Supported line breaks and punctuation remain intact.

The single versioned permission in `core/feedback-contract.js` is shown verbatim beside the checkbox and stored with its version:

> Yes, you can quote my comment with my name and role on this site and in documents about System Designer and your work.

The 6,618-byte cap was measured with the longest known page id, a maximum version, every answer, 500 comment code units, 60 name code units, 80 title code units and 254 email code units, with every string character and key encoded as a six-byte JSON Unicode escape. The same maximum-length full request uses 2,958 bytes with UTF-8 non-ASCII field values. Boundary tests cover both encodings and rejection one byte over the limit.

The extra block appears only after a rating, once across all pages and general forms, using only `feedback.more.asked` in browser storage. Opening a form without revealing the block does not consume it. It stays available through a failed send and retry. Clearing local data resets it. The existing per-page prompt markers remain separate.


Event names: `app_opened`, `intro_finished`, `lesson_finished`, `first_problem_started`, `first_problem_passed`, `problem_passed`, `daily_challenge_played`, `interview_finished`, `result_shared`, `beat_link_opened`, `error`. Problem events require a known problem id; lesson completion requires a known lesson id. Intro completion has no id. App opens, intro and lesson completions, shares and beat opens are counted once per page view and applicable id; first start and first pass occur once per page view. Every passed traffic day counts, including retries. Daily played means starting its traffic day. An interview finishes when its completed report is saved. A result is shared when its link is copied or its image shared or saved. A beat open means its payload decoded successfully. These are totals, not a history of individual players; the funnel cannot say that the same person reached each step.

An `error` event adds only `errorName`, `message` and `file`. The client sends at most one per page view. Messages come from a fixed short list, not the exception text; filenames must be in `api/error-files.js`. Unknown or bundled filenames become `unknown`. Startup module failures, uncaught errors, unhandled rejections and failed page/workbench imports are included. No stacks, URLs, route queries, written answers or designs are sent.

SQLite holds only daily totals by event, content id, size class and referring host (plus error category), a daily visitor total, and feedback rating, unchanged comment, page, game version, UTC day and optional helped/use/country/role answers. Existing feedback tables gain those four columns with blank defaults. Explicit inserts support both old and migrated rows. Distinct visitors are estimated using an HMAC of IP and user agent with a fresh random in-memory salt each UTC day. Both the salt and the set of hashes are discarded on rotation and restart; neither is written to the database or backups. A restart may overcount that day; shared browser/address combinations can undercount. Rate-limit addresses are held only in the existing expiring memory counters. No raw collection requests or account links are stored.

Hourly cleanup and startup remove counts older than 13 calendar months and feedback and quotes older than 24 calendar months. Quote email is cleared after 12 calendar months, using the same calendar cutoff function. The existing nightly backup job also runs cleanup before copying and scrubs every retained backup. It still keeps seven nightly copies. UTC dates are used throughout. Quotes live in a separate local `quotes` table, indexed by UTC day, with a local primary key, the entire response, chosen name/title, optional email, consent version and exact consent text. A consented submission inserts its ordinary feedback and complete quote in one transaction. No personal quote fields are stored when consent is omitted. Neither table contains account identities, addresses, user agents or exact timestamps. Named records stay out of anonymous reports. There is no public quote listing or automatic publication.

`node api/stats.js quotes N` exports JSONL only, ordered oldest day first then id, for 1–731 days (default 7). Each row contains `id, day, rating, page, version, comment, helped, use, country, role, name, title, email, consent_version, consent_text`. `JSON.stringify` escapes values without the text report sanitizer: decoding reproduces the stored comment and consent exactly. Each line is its own dated source record. Keep filed exports unchanged. Test fixtures are not feedback or evidence of use.

Owner-only removal: `DB_PATH=<service database> node api/quotes.js remove <id>`. It deletes just that quote and confirms its id; ordinary anonymous feedback remains. Account deletion and clearing browser data cannot identify or delete a separately submitted quote. Players request removal through [repository issues](https://github.com/adityareddy-dev/system-designer/issues), without posting private details. The nightly job retains seven copies; a removed quote rolls out of all retained backups within seven days, not immediately. Retention cleanup scrubs expired quotes and email from every retained copy too.

Owner reports run locally on the server and expose no public statistics route:

```sh
cd /srv/systemdesigner-api
sudo -u sdapi env DB_PATH=/var/lib/systemdesigner-api/systemdesigner.db node api/stats.js 7
sudo -u sdapi env DB_PATH=/var/lib/systemdesigner-api/systemdesigner.db node api/stats.js feedback 30
sudo -u sdapi env DB_PATH=/var/lib/systemdesigner-api/systemdesigner.db node api/stats.js quotes 30
sudo env WEB_LOG_PATH=/var/log/caddy/systemdesigner-web.log node api/stats.js web 14
```

`days` defaults to 7 and includes today, in UTC (1 to 731 accepted). The first report prints estimated visitors and events per day, the open/start/pass funnel, top passed problems, finished lessons, referrers and error categories. Feedback prints recent ratings, comments and the four optional answers, without quote names, titles or emails. Web mode needs the optional page log, which the live site does not write. It streams the current Caddy JSON log and rotated `.log`/`.gz` files, counts page GETs including failed loads, skips assets, and prints dates, paths and referring hosts. Web counts include bots and reloads and must not be added to visitor counts. Broken or partial JSON lines are skipped and counted.

### Production setup

The live server, checked on November 10, 2026, runs Caddy 2.6.2 and serves game version `2026.11.10`:

- The `systemdesigner.io` site block has no `log` directive, so no page log is written. Page visits are counted only by Cloudflare Web Analytics. `node api/stats.js web` has no live log to read.
- The `api.systemdesigner.io` access log, `/var/log/caddy/systemdesigner-api.log`, deletes `request>remote_ip`, `request>remote_port` and `request>headers`, and the GitHub `code` and `state` query values. Caddy 2.6.2 has no `log_skip`, so `/e` and `/feedback` requests still appear in that log, without addresses, ports or request headers.
- Feedback is live through the API service. Usage counts and error reports stay off on public sites.

To update the live service and game:

1. Run `sh api/deploy/install.sh` as root to copy the updated API, migrate its database on startup and restart the service. Keep the existing backup timer enabled.
2. Bump `APP_VERSION` in `core/version.js` for a changed game, then publish the static site (or use the optional release script).
3. Play on the live site and confirm that no automatic `/e` requests are sent, including with an older enabled usage-count setting. Submit feedback, then check `node api/stats.js feedback 1` with `DB_PATH` set and confirm the new version. Check `systemctl status systemdesigner-api-backup.timer` and run `systemctl start systemdesigner-api-backup.service` once to verify backup cleanup.

The optional page log is not installed. `api/deploy/systemdesigner-web-observation.caddy` writes a filtered page log for `systemdesigner.io` that `node api/stats.js web` reads. `api/deploy/systemdesigner-api-anonymous.caddy` keeps `/e` and `/feedback` out of the API access log. Both need a Caddy version with `log_skip`, `log_append` and daily `roll_at` rotation, which 2.6.2 lacks. After a Caddy upgrade, copy them to `/etc/caddy/`, import the first inside the `systemdesigner.io` block and the second inside the `api.systemdesigner.io` block, and run `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. Do not add a second site block for either hostname. Check the page log with a request that carries a test query and referrer: it should hold no query, address, cookie, browser string or full referrer. See the [Caddy log documentation](https://caddyserver.com/docs/caddyfile/directives/log).

For local end-to-end checks, serve this worktree on 8777, run `NODE_ENV=test DEV=1 PORT=8794 DB_PATH=<temporary file> node api/server.js`, and open `http://localhost:8777/?measure=8794`. Check `node api/stats.js 1` with that temporary `DB_PATH` for local events and error reports. Those counts do not describe production players. No scratch database belongs in the checkout. `tests/observation-qa.mjs` starts its own temporary API, drives both screen sizes and themes, and stops it on completion.

## Score honesty

The simulation (`sim/`) is pure and deterministic: seeded random numbers, no clock, no DOM. So the service does not trust any score a browser sends. A result is the same "beat my design" payload the game already makes for share links; the service decodes it, rebuilds the exact scenario (the base problem for `seed=practice`, or that date's daily variant for `seed=daily-YYYY-MM-DD`), replays the full day with the game's own engine in a worker thread, and stores **its own** score, marked `replayed`. The score inside the payload is only reported back as `clientScore`. Changes made during a practice day are not replayed: the leaderboard scores the design as submitted.

"Replayed" means the number is the design's real score. It does not say who drew the design: a design copied from a friend's link counts, and the leaderboard card says so. What the game ships itself is not listed (`api/similar.js`): each problem's editorial designs and near copies of them (the same wiring shape whatever the sizes, zones or settings, parts swapped for ones that do the same job, extra parts that connect to nothing, or a few parts such as monitoring taken out), and the bare starter. Those answer `200` with `listed: false` and are not stored.

Daily boards accept results only while that date is "today" somewhere on Earth: from 14 hours before its UTC midnight (UTC+14) until 36 hours after it (UTC-12), plus one hour for a day finished just after midnight. The daily variant is computed in the browser, so the game keeps working with no service at all; it is not secret, and a day opens for scores only when its date has started somewhere. Each player keeps their best score per board.

## Routes

All bodies are JSON. Every response has `Cache-Control: no-store`. Mutating routes need `Content-Type: application/json` and, from a browser, an allowed `Origin`.

| Route | Auth | What it does |
|---|---|---|
| `GET /health` | none | `{ ok: true }` |
| `GET /probe` | none | A tiny HTML page that posts the public settings to its parent with `postMessage`. Only https://systemdesigner.io may frame it (CSP `frame-ancestors`), and its one script is pinned by hash. The site checks reachability with it because a frame that cannot load leaves no error in the console, where a failed fetch would. |
| `GET /auth/config` | none | `{ google: { clientId } \| null, github: bool, fake: bool }`. Only providers that are fully set up. Client ids are public; no secret is ever returned. |
| `POST /auth/google/nonce` | none | `{ nonce }`, a random one-time value for Google's token request, and an `sd_g_nonce` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/auth/google; Max-Age=600`) holding it with its expiry, signed with `SESSION_SECRET`. The page passes the nonce to `google.accounts.id.initialize`. |
| `POST /auth/google` | nonce cookie | `{ credential }` from Google Identity Services. Verifies the RS256 signature against Google's JWKS (cached by `kid`, fetched again on an unknown `kid` at most once a minute; after a failed fetch it waits 5 s, doubling up to 5 minutes, and cached keys are used at most 6 hours past their cache time), `aud` = `GOOGLE_CLIENT_ID`, `iss` = `accounts.google.com` or `https://accounts.google.com`, `exp`, `email_verified`, and that the token's `nonce` equals the one in this browser's unexpired `sd_g_nonce` cookie. Each nonce signs in once. A token taken from another browser has no matching cookie and is refused. Sets the session cookie, clears the nonce cookie, returns `{ user }`. |
| `GET /auth/github/start?return=#/path` | none | Redirects to GitHub's authorize page with no scopes, `redirect_uri=https://api.systemdesigner.io/auth/github/callback` and a random `state` bound to a signed, httpOnly, 10-minute cookie. |
| `GET /auth/github/callback` | state cookie | Checks the state, exchanges the code with `GITHUB_CLIENT_SECRET`, reads the public profile (id, login, name, avatar_url), forgets the token, sets the session cookie, and redirects only to `https://systemdesigner.io/?signin=<github\|cancelled\|failed\|unavailable>#/path`. The return path must be a plain in-app route; anything else becomes `#/`. |
| `POST /auth/fake` | none | `{ id, name }`. Exists only with `AUTH_FAKE=1` and `NODE_ENV=test` or `development` (headless tests). |
| `POST /auth/signout` | session | Ends this session and clears the cookie. |
| `GET /me` | optional | `{ user: { name, avatar, providers, since } }` or `{ user: null }`. |
| `PATCH /me` | session | `{ name }`, a string of 1 to 24 printable characters (anything else is `400`). Names that pass for the project, its author or staff (`reserved-name`) or contain rude words (`rude-name`) are `400` too; a provider name that fails either check becomes `Player`. |
| `DELETE /me` | session | Deletes the user, identities, sessions, progress and scores at once. |
| `GET /progress` | session | `{ progress }` |
| `PUT /progress` | session | `{ progress }` from the browser; merged with the stored copy (`account/merge.js`, shared with the browser) and returned. Max 256 KB. |
| `POST /results` | session | `{ payload }` (a design link payload, max 24,000 characters). Checks it first (format, scenario, starting parts, size, open day, shipped design), then replays it and returns `{ listed: true, board, kind, date, problemId, score, stars, passed, replayed, clientScore, improved, best, rank, total }`. A shipped design answers `{ listed: false, reason: 'editorial-design' \| 'starter-design', message }`. A design over 40 parts, 60 connections or 2,400 units in all (autoscale counted at its maximum) is `422 too-big`. `429 scoring` while this player's previous result is still being scored; `503 busy` when the scorer is full. |
| `GET /leaderboard?daily=YYYY-MM-DD` or `?problem=ID` | optional | Top 50, designs that passed first and then by score, `{ rank, name, score, stars, passed, replayed, at, you }`, plus `you: { rank, score, ... }` when signed in, and `total`. Public. |
| `POST /report` `{ uid, reason }` | required | Reports a leaderboard row (`uid` comes from the row; `reason` is `name`, `cheating` or `other`). One report per player pair, 10 per 10 minutes per user. Stored for review only. |

Sessions: a random 256-bit token in the `sd_session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`, 30 days). The database keeps only an HMAC-SHA-256 of it keyed with `SESSION_SECRET`.

CORS: only `https://systemdesigner.io`, with credentials. With `DEV=1` also `http://localhost:8765` and `http://127.0.0.1:8765`.

Limits: body size per route (8 KB, progress 256 KB, results 32 KB); requests per address and per user in fixed windows (all routes 300 a minute per address; sign-in 20 a minute per address and 600 a minute for everyone together; results 30 per 10 minutes per user, 60 per 10 minutes per address and 300 a minute for everyone together; progress 30 a minute per user; account changes 10 a minute per user; leaderboards 120 a minute per address); 429 with `Retry-After`. An IPv6 address counts by its /64 (one home or phone usually has a whole /64); IPv4 counts per address. The shared caps count only requests that passed their own limits. Each route group keeps its own counters, capped at 100,000 keys: a full table drops expired entries first, then the oldest ones still under their limit, so a flood of new addresses never resets anyone's limit. Behind Caddy the address is the last `X-Forwarded-For` entry; it is trusted only from 127.0.0.1.

The scorer: replays run on `REPLAY_WORKERS` worker threads (default 2). Jobs wait in the service, daily boards first, and addresses take turns (fewest jobs running, then served longest ago). A job's 10-second limit starts when it starts running; a stuck replay ends only its own worker, and the jobs waiting behind it run on a fresh one. Each player may have one result in the scorer at a time (`429 scoring`) and each address three; at most 24 wait, and a job that cannot start within 12 seconds is answered `503 busy`. With the size cap above the heaviest accepted design replays in about a second on the server.

## Settings

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID` | Web client id from Google Cloud (`...apps.googleusercontent.com`). Empty: Google sign-in is off. No client secret is used. |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client id. GitHub sign-in is on only when this and the secret are both set. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret. Never logged or returned. |
| `SESSION_SECRET` | At least 32 random characters; keys the session hashes and the GitHub state cookie. Required unless `DEV=1` (then a throwaway one is made per process). |
| `DB_PATH` | SQLite file, for example `/var/lib/systemdesigner-api/systemdesigner.db`. |
| `PORT` | Default 8791. |
| `REPLAY_WORKERS` | Scorer threads, 1 to 8. Default 2. |
| `HOST` | Default and production value `127.0.0.1` (Caddy is in front). |
| `NODE_ENV` | `production` on the server. `DEV` and `AUTH_FAKE` work only when it is exactly `development` or `test`; any other value, empty or misspelt, counts as production and the service refuses to start with them. |
| `DEV` | `1` adds the two local origins to CORS and the GitHub return list. Needs `NODE_ENV=development` or `test`. |
| `AUTH_FAKE` | `1` adds `POST /auth/fake` for headless tests. Needs `NODE_ENV=development` or `test` and the service listening on 127.0.0.1. |
| `BACKUP_DIR` | For `backup.js` only; default `backups/` next to the database. |

## The browser side

`account/config.js` decides where the service is. On https://systemdesigner.io it is used only when `API_LIVE` is `true` (so the live site makes no request to a service that does not answer yet). A local copy on port 8765 opts in with `?api` (port 8792) or `?api=<port>`; without it, local runs never contact a service. Elsewhere (forks, previews) accounts are off.

The site checks for the service once per page load with a hidden frame of `/probe` (no console noise when it is down). When the service answers, the top bar shows a quiet "Sign in" button: Google's own button (the script from `https://accounts.google.com/gsi/client` loads only when the panel opens and Google is set up) and "Continue with GitHub". Each provider's button is hidden when `/auth/config` says it is not set up, and the whole sign-in UI stays hidden when the service is unreachable. A signed-out player sees one gentle nudge after their first finished day, once ever. The Challenge page gets a leaderboard card (today, or any problem). `privacy.html` says what is stored.

## Run and test

```sh
cd api
NODE_ENV=test DEV=1 AUTH_FAKE=1 PORT=8792 DB_PATH=./data/dev.db node server.js     # local service with the test provider
node --test test/*.test.js                                          # all service tests
```

Then open `http://127.0.0.1:8765/?api` (the game served on port 8765) and sign in as a test player. Designs played signed in reach the leaderboard only when they are not the editorial's.

`api/test/` covers Google token checks against a locally generated RSA key and JWKS (valid, wrong audience, wrong issuer, expired, bad signature, `alg: none`, unverified email, the nonce and its cookie, key rotation, stale keys and back-off), the GitHub state cookie and callback, the progress merge, replayed results, shipped designs and near copies not listed, the daily window, size caps, the scorer pool (time limit from the start of a run, a stuck job, one per player, turns per address, daily lane), leaderboards (top 50 plus your rank), account deletion, CORS, the `NODE_ENV` guard, and rate limits (per /64, shared caps, floods). `tests/account-qa.mjs` drives the game in headless Chrome: fake sign-in, progress sync between two devices, a daily result on the leaderboard, the name on share links, sign-out and delete, and the game with the service reachable, unreachable and off.

## Server layout (staged, not live)

| Path | What |
|---|---|
| `/srv/systemdesigner-api/` | `api/`, `account/`, `sim/`, `catalog/`, `content/`, `compete/` and a `package.json` with `"type": "module"`, owned by the `sdapi` system user (no login shell). The service unit makes it read-only to the process. |
| `/var/lib/systemdesigner-api/` | The SQLite database and `backups/` (mode 700). |
| `/etc/systemdesigner-api/env` | Settings, `root:sdapi`, mode 640. |
| `systemdesigner-api.service` | `node api/server.js` as `sdapi` on 127.0.0.1:8791, sandboxed (`ProtectSystem=strict`, `NoNewPrivileges`, no capabilities). |
| `systemdesigner-api-backup.timer` | Nightly `VACUUM INTO` copy, keeps 7. |
| `/etc/caddy/sites-pending/systemdesigner-api.caddy` | `api.systemdesigner.io` reverse proxy with security headers; not imported by the live Caddyfile until go-live. |

`api/deploy/` holds the unit files, the Caddy block and `install.sh`, which copies a checkout into place and restarts the service without touching the settings file or the database.

## Go live

1. Point DNS for `api.systemdesigner.io` at the server.
2. Google Cloud console: create an OAuth client of type "Web application" with authorized JavaScript origin `https://systemdesigner.io` (no redirect URI needed). Put its client id in `GOOGLE_CLIENT_ID`.
3. GitHub: Settings, Developer settings, OAuth Apps, New OAuth App: homepage `https://systemdesigner.io`, callback `https://api.systemdesigner.io/auth/github/callback`. Put the client id in `GITHUB_CLIENT_ID` and paste a new client secret into `GITHUB_CLIENT_SECRET` (`/etc/systemdesigner-api/env`).
4. Add `import /etc/caddy/sites-pending/systemdesigner-api.caddy` to `/etc/caddy/Caddyfile`, then `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.
5. `systemctl restart systemdesigner-api`, then check `curl https://api.systemdesigner.io/auth/config`.
6. Set `API_LIVE = true` in `account/config.js` and publish the site.
