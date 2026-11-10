<!-- Plan for readable, generated discovery pages. -->
# Readable site pages

Goal: make the game's own teaching content readable before JavaScript runs, while preserving play, storage and shared URLs.

Use plain generated HTML from the authoritative problem and lesson modules and catalog. A shared template supplies navigation, metadata, breadcrumbs and the reading layout. Keep authored guide prose in a separate module whose numbers and links come from content lookups. Use the existing preview renderer for lessons. Keep development unbuilt.

The requested worktree and branch are already provided. No app engine, account configuration, API or deployment changes are needed. The documented publish input is `dist/`; the release script must copy all discovery assets there.

1. Add failing coverage checks for every problem and lesson, metadata, sitemap membership, local links, content drift, deterministic output and beat forwarding under a subpath.
2. Build the shared template and styles, problem and lesson pages, indexes and nine useful guides. Generate home fallback and FAQ from the same counts. Preserve daily forwarding and use authoritative dates already on disk.
3. Generate structured data, sitemap, crawler files and compact/full text catalogues. Reuse previews and include every new asset in releases. Verify source and release links.
4. Inspect all requested pages at both widths, themes and script settings, exercise a real shared design and a complete traffic day, run the supplied suite and commit all output.

Review focus: no redirects on ordinary problem visits; unchanged beat payload; subpath links; all request types' actual latency and queue targets; no full solution graphs on problem pages; no hidden dependence on script for reading; no preview generator overwriting rich pages; stable last-modified dates and idempotent writes.

ARTICLE.md was absent at initial inspection. Unless supplied during work, the launch guide uses the README's voice and facts. Sign-in is enabled in this branch. Counts and scenario numbers are read from the game rather than duplicated.
