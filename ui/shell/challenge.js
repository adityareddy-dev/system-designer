// Challenge view (daily scenario, streak, history) and the "beat my design" landing.
import { h, ico, clear, append, problemOf, diffBadge, scoreOf, buildHash, stars } from './dom.js';
import { mountPlayHost } from './playhost.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function prettyDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function variantLines(ctx, v) {
  if (!v) return [];
  const out = [];
  if (v.shiftMin) out.push(`Event times move ${v.shiftMin > 0 ? 'later' : 'earlier'} by ${Math.abs(Math.round(v.shiftMin))} minutes.`);
  if (v.magnitude != null && v.magnitude !== 1 && v.magnitude !== 0) {
    const pct = Math.abs(v.magnitude) < 3 ? Math.round((v.magnitude - 1) * 100) : Math.round(v.magnitude);
    if (pct) out.push(`Event strength is ${Math.abs(pct)} percent ${pct > 0 ? 'higher' : 'lower'} than usual.`);
  }
  if (v.extraEventId) {
    const e = ctx.catalog.eventById?.get ? ctx.catalog.eventById.get(v.extraEventId) : null;
    out.push(`A surprise: ${e?.name || v.extraEventId.replace(/-/g, ' ')} can hit today.`);
  }
  return out;
}

function noCompete(host) {
  host.append(h('div', { class: 'sh-page sh-page--narrow sh-empty' }, h('h1', { class: 'sh-h1', text: 'Challenge is not ready' }),
    h('p', { class: 'sh-muted', text: 'The daily challenge could not load. Practice is still available.' }), h('a', { class: 'sh-btn sh-btn--primary', href: '#/practice' }, 'Go to Practice')));
}

function playBar({ backHref, backLabel, title, sub, chip, right }) {
  return h('div', { class: 'sh-problem-bar' },
    h('a', { class: 'sh-back', href: backHref, 'aria-label': backLabel }, ico('ui.chevron-left', 18), h('span', { class: 'sh-hide-sm', text: backLabel })),
    h('div', { class: 'sh-problem-title' }, h('h1', { class: 'sh-problem-h1', text: title }), sub ? h('span', { class: 'sh-problem-like sh-hide-sm', text: sub }) : null),
    chip ? h('span', { class: 'sh-target-chip sh-num', text: chip }) : null,
    right || null);
}

// Days the player has finished (any history entry with a problem).
function items0(hist) { return (hist || []).filter((x) => x && (x.problemId || x.key)); }

function sparkBars(items) {
  const w = 14, gap = 4, H = 64;
  const svg = h('div', { class: 'sh-spark' });
  const bars = items.map((it, i) => {
    const hh = Math.max(3, Math.round((Math.min(1000, it.score) / 1000) * (H - 6)));
    return `<rect x="${i * (w + gap)}" y="${H - hh}" width="${w}" height="${hh}" rx="4" fill="var(--accent)" opacity="${0.35 + 0.65 * (i + 1) / items.length}"/>`;
  }).join('');
  const W = Math.max(1, items.length) * (w + gap) - gap;
  svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMinYMax meet" role="img" aria-label="Scores of your last ${items.length} challenge days">${bars}</svg>`;
  return svg;
}

export function renderChallenge(host, ctx, route0) {
  const compete = ctx.compete;
  if (!compete || !compete.daily) { noCompete(host); return {}; }
  let play = null;
  let board = null;
  let offAttach = null;
  let offAccount = null;
  let offProgress = null;
  let immersive = false;
  let lastRoute = route0;

  function teardown() {
    if (play) { play.destroy(); play = null; }
    if (board) { board.destroy(); board = null; }
    if (offAttach) { offAttach(); offAttach = null; }
    if (offAccount) { offAccount(); offAccount = null; }
    clear(host);
  }

  function draw(route) {
    lastRoute = route;
    teardown();
    const today = compete.daily.todayLocal();
    let date = route.parts[1];
    if (!date || !DATE_RE.test(date) || date > today) date = today;
    let daily, problem, variantProblem;
    try {
      daily = compete.daily.dailyFor(date);
      problem = problemOf(ctx, daily.problemId);
      variantProblem = problem ? compete.daily.applyVariant(problem, daily.variant) : null;
    } catch (err) { console.error(err); }
    if (!problem) { immersive = false; noCompete(host); return; }
    const key = `challenge:${daily.problemId}:${daily.seed}`;

    if (route.query.play === '1') {
      immersive = true;
      const wrap = h('div', { class: 'sh-problem' }, playBar({ backHref: buildHash('challenge/' + date), backLabel: 'Challenge', title: problem.title, sub: `Daily challenge, ${prettyDate(date)}`, right: diffBadge(problem.difficulty) }));
      host.append(wrap);
      play = mountPlayHost(wrap, ctx, { mode: 'challenge', problem: variantProblem, seed: daily.seed });
      return;
    }
    immersive = false;

    let best = null, streakN = 0, triedToday = false, hist = [];
    try { best = compete.bests.get(key); } catch { /* ignore */ }
    try { const s = compete.bests.streakInfo('challenge'); streakN = s?.current || 0; triedToday = !!s?.triedToday; } catch { /* ignore */ }
    try { hist = (compete.bests.historyByDay ? compete.bests.historyByDay(30) : compete.bests.history(30)) || []; } catch { /* ignore */ }

    const bestScore = best ? scoreOf(best) : 0;
    const isToday = date === today;
    const lines = variantLines(ctx, daily.variant);

    const streakText = streakN ? `${streakN} ${streakN === 1 ? 'day' : 'days'} in a row` : (triedToday && isToday ? "Pass today's challenge to start your streak" : "Play today's challenge to start your streak");

    const nav = h('div', { class: 'sh-date-nav' },
      h('a', { class: 'sh-icon-btn', href: buildHash('challenge/' + addDays(date, -1)), 'aria-label': 'Previous day' }, ico('ui.chevron-left', 20)),
      h('span', { class: 'sh-date-label', text: isToday ? `Today, ${prettyDate(date)}` : prettyDate(date) }),
      isToday ? h('span', { class: 'sh-icon-btn is-disabled', 'aria-hidden': 'true' }, ico('ui.chevron-right', 20))
        : h('a', { class: 'sh-icon-btn', href: buildHash('challenge/' + addDays(date, 1)), 'aria-label': 'Next day' }, ico('ui.chevron-right', 20)));

    const head = h('header', { class: 'sh-page-head' },
      h('div', null, h('p', { class: 'sh-eyebrow', text: 'Challenge' }), h('h1', { class: 'sh-h1', text: isToday ? 'Daily challenge' : 'Past challenge' }),
        h('p', { class: 'sh-lead sh-lead--sm', text: 'Everyone gets the same scenario on the same date. Design it, survive the day, then send a friend a link to beat you.' })),
      h('div', { class: 'sh-streak', role: 'img', 'aria-label': streakText }, ico('ui.streak', 28), streakN ? h('span', { class: 'sh-streak-num', text: String(streakN) }) : null, h('span', { class: 'sh-streak-label', text: streakN ? (streakN === 1 ? 'day in a row' : 'days in a row') : streakText })));

    const playHref = buildHash('challenge/' + date, { play: 1 });
    const playLabel = bestScore ? 'Try again' : isToday ? "Play today's challenge" : 'Play this day';
    // phones: the same button right under the date, so it is not pushed below the fold and the tab bar
    const solvedAny = items0(hist).length > 0;
    const hardNudge = problem.difficulty === 'Hard' && !solvedAny
      ? h('p', { class: 'sh-nudge' }, 'New here? ', h('a', { href: '#/learn/intro' }, 'Try the 3-minute lesson first'), ' (today is a Hard day).') : null;
    const diffRow = h('div', { class: 'sh-diff-row' }, diffBadge(problem.difficulty), h('span', { class: 'sh-muted', text: `${problem.difficulty} day` }));
    const quickPlay = h('a', { class: 'sh-btn sh-btn--primary sh-btn--lg sh-quickplay', href: playHref, 'data-quick': '1' }, ico('ui.play', 20), playLabel);

    const scenario = h('section', { class: 'sh-card sh-scenario' },
      h('img', { class: 'sh-bench-scene', src: new URL('../../assets/scenes/' + ((problem.concepts || []).includes('queues-backpressure') ? 'draining-queue' : (problem.concepts || []).includes('caching') ? 'cached-reads' : 'shared-load') + '.svg', import.meta.url).href, alt: 'A small system with calibrated capacity bars and visible request paths' }),
      h('div', { class: 'sh-scenario-top' }, diffBadge(problem.difficulty), h('span', { class: 'sh-muted', text: problem.like || '' })),
      h('h2', { class: 'sh-scenario-title', text: problem.title }),
      h('p', { class: 'sh-lp-text', text: problem.brief || '' }),
      lines.length ? h('div', { class: 'sh-variant' }, h('h3', { class: 'sh-h3', text: "What's different today" }), h('ul', { class: 'sh-list' }, lines.map((t) => h('li', { text: t })))) : null,
      h('div', { class: 'sh-scenario-foot' },
        h('a', { class: 'sh-btn sh-btn--primary sh-btn--lg sh-playmain', href: playHref }, ico('ui.play', 20), playLabel),
        best ? h('div', { class: 'sh-best' }, h('span', { class: 'sh-muted', text: 'Your best' }), h('span', { class: 'sh-best-num sh-num', text: String(bestScore) }), best.stars != null ? stars(best.stars) : null)
          : h('span', { class: 'sh-muted', text: 'No score yet for this day.' })),
      h('p', { class: 'sh-fine', text: 'No edits during the traffic day here: it is a pure design test.' }));

    const items = hist.map((x) => ({
      score: scoreOf(x), stars: x.stars ?? x.result?.stars, mode: x.mode, problemId: x.problemId ?? (x.key ? x.key.split(':')[1] : null),
      seed: x.seed ?? (x.key ? x.key.split(':').slice(2).join(':') : ''), at: x.at ?? x.date ?? x.t, attempts: x.attempts || 1,
    })).filter((x) => x.problemId);
    const recent = items.slice(0, 14).reverse();
    const history = h('section', { class: 'sh-card sh-history' }, h('h2', { class: 'sh-h2', text: 'Your history' }),
      items.length ? [sparkBars(recent), h('ul', { class: 'sh-hist-list' }, items.slice(0, 6).map((x) => {
        const dateStr = x.seed.startsWith('daily-') ? x.seed.slice(6) : null;
        const p = problemOf(ctx, x.problemId);
        const row = [h('span', { class: 'sh-hist-title', text: p?.title || x.problemId }), h('span', { class: 'sh-muted', text: (dateStr || x.mode || '') + (x.attempts > 1 ? ` · ${x.attempts} tries` : '') }), h('span', { class: 'sh-num', text: String(x.score) })];
        return h('li', null, dateStr ? h('a', { class: 'sh-hist-row', href: buildHash('challenge/' + dateStr) }, row) : h('div', { class: 'sh-hist-row' }, row));
      }))] : h('p', { class: 'sh-muted', text: 'Finish a day and it shows up here, with a count of the days you play in a row.' }));

    // Leaderboards appear only when the optional sign-in service is reachable. The account loads after the first
    // screen, so on a page opened directly or reloaded the card is added when the account arrives.
    const stack = h('div', { class: 'sh-stack' });
    const offline = h('section', { class: 'sh-card', role: 'status' });
    const accountInfo = h('li');
    const updateService = () => {
      const available = !!ctx.account?.available?.();
      const checking = ctx.account?.state?.().status === 'checking';
      offline.hidden = available;
      offline.replaceChildren(h('h2', { class: 'sh-h2', text: checking ? 'Checking online competition' : 'Playing offline' }),
        h('p', { class: 'sh-muted', text: checking ? 'Checking whether sign-in and leaderboards are available.' : 'Sign-in and leaderboards are unavailable. Your scores and streak stay in this browser. You can still play the daily challenge and share a link with a friend.' }));
      accountInfo.replaceChildren(h('strong', { text: available && ctx.account?.isSignedIn?.() ? 'You are signed in. ' : 'No account needed. ' }),
        available ? (ctx.account?.isSignedIn?.() ? 'Your score and streak follow you to every device. See the leaderboard above.' : 'Your score stays in this browser. Sign in through the leaderboard above to sync progress and join.') : 'Your score and streak stay in this browser.');
    };
    const mountBoard = () => {
      if (board || !ctx.account?.leaderboardCard) return;
      try { board = ctx.account.leaderboardCard({ date, problemId: daily.problemId }) || null; } catch { board = null; }
      if (board) stack.insertBefore(board.el, history);
    };
    const how = h('section', { class: 'sh-card sh-how' }, h('h2', { class: 'sh-h2', text: 'How it works' }),
      h('ol', { class: 'sh-steps' },
        h('li', null, h('strong', { text: 'Same day, same scenario. ' }), 'The date picks the problem and shifts its events a little.'),
        accountInfo,
        h('li', null, h('strong', { text: 'Beat my design. ' }), 'After a finished day, share a link. Your friend sees your score as the target.')));

    stack.append(offline, history, how);
    updateService();
    if (ctx.bus?.on) offAccount = ctx.bus.on('account', updateService);
    if (ctx.account?.leaderboardCard) mountBoard();
    else if (ctx.bus?.on) offAttach = ctx.bus.on('account:attached', () => { if (offAttach) { offAttach(); offAttach = null; } mountBoard(); updateService(); });

    append(host, [h('div', { class: 'sh-page sh-challenge-page' }, head, nav, diffRow, hardNudge, quickPlay, h('div', { class: 'sh-two-col' }, scenario, stack))]);
  }

  draw(route0);
  // A sign-in on this page merges the account's scores into this browser: redraw so the card, history and streak show them.
  let redrawTimer = 0;
  if (ctx.bus?.on) {
    offProgress = ctx.bus.on('progress:updated', () => {
      if (immersive) return;
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => { if (!immersive) draw(lastRoute); }, 120);
    });
  }
  return {
    get immersive() { return immersive; },
    title: 'Challenge',
    update: draw,
    destroy() { clearTimeout(redrawTimer); if (offProgress) { offProgress(); offProgress = null; } teardown(); },
    get play() { return play; },
  };
}

// ----- "Beat my design" -----

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);

function normShare(d) {
  const r = d.r || (typeof d.score === 'object' ? d.score : null) || {};
  return {
    mode: d.mode ?? d.m ?? 'challenge',
    problemId: d.problemId ?? d.p,
    seed: d.seed ?? d.s ?? 'practice',
    name: (d.name ?? d.by ?? '').toString().slice(0, 24),
    graph: d.graph ?? null,
    score: num(typeof d.score === 'number' ? d.score : r.t ?? r.total) ?? 0,
    availability: num(r.a ?? r.availability), p99: num(r.l ?? r.p99Ms ?? r.p99), cost: num(r.c ?? r.costPerMonth),
  };
}

export function renderBeat(host, ctx, route0) {
  const compete = ctx.compete;
  if (!compete || !compete.share) { noCompete(host); return {}; }
  let play = null;
  let immersive = route0.query.go === '1';
  let dead = false;
  const notify = () => host.dispatchEvent(new CustomEvent('sh:immersive', { bubbles: true }));
  let offDay = null;
  let cache = null; // { raw, s, problem }

  function teardown() { if (offDay) { offDay(); offDay = null; } if (play) { play.destroy(); play = null; } clear(host); }

  function broken(msg) {
    immersive = false;
    notify();
    host.append(h('div', { class: 'sh-page sh-page--narrow sh-empty' }, ico('ui.link', 36),
      h('h1', { class: 'sh-h1', text: 'This link does not open' }),
      h('p', { class: 'sh-muted', text: msg }),
      h('div', { class: 'sh-btn-row' }, h('a', { class: 'sh-btn sh-btn--primary', href: '#/challenge' }, "Today's challenge"), h('a', { class: 'sh-btn', href: '#/practice' }, 'Practice'))));
  }

  async function load(route) {
    const payload = route.parts.slice(1).join('/');
    if (cache && cache.payload === payload) return cache;
    const raw = await compete.share.decodeShare(payload);
    if (raw.mode === 'sandbox') { ctx.router.replace('#/sandbox?d=' + payload); throw new Error('Opening the sandbox design.'); }
    const s = normShare(raw);
    let problem = ctx.content.ensureProblem ? await ctx.content.ensureProblem(s.problemId) : problemOf(ctx, s.problemId);
    if (!problem) throw new Error('That problem is not in this version of the game.');
    if (s.seed.startsWith('daily-')) {
      try { problem = compete.daily.applyVariant(problem, compete.daily.dailyFor(s.seed.slice(6)).variant); } catch { /* use base problem */ }
    }
    // The score in a link is only a claim: replay the design here, and when the replay differs lead with what it really scored.
    let v = null;
    try { v = await compete.share.verify(raw, ctx.catalog, problem); } catch { v = null; }
    if (v && !v.verified && v.replay && Number.isFinite(v.replayScore)) {
      s.claimed = s.score;
      s.edited = true;
      s.score = v.replayScore;
      s.availability = v.replay.availability;
      s.p99 = v.replay.p99Ms;
      s.cost = v.replay.costPerMonth;
    }
    cache = { payload, raw, s, problem, v };
    return cache;
  }

  async function draw(route) {
    teardown();
    immersive = route.query.go === '1';
    const loading = h('div', { class: 'sh-page sh-page--narrow sh-empty', role: 'status' }, h('p', { class: 'sh-muted', text: 'Opening your friend\'s design' }));
    host.append(loading);
    let c;
    try { c = await load(route); } catch (err) {
      if (dead) return;
      clear(host);
      broken(err && err.message ? err.message : 'The link is damaged or too old.');
      return;
    }
    if (dead) return;
    clear(host);
    const { raw, s, problem } = c;
    // The name in a link is free text anyone can type: show it as typed, marked unchecked unless it is the signed-in player's own.
    let own = ''; try { own = ctx.account?.displayName?.() || ''; } catch { /* ignore */ }
    const named = !!s.name;
    const trusted = named && own && own === s.name;
    const who = named ? s.name : 'A friend';
    const mode = route.query.go === '1' ? 'play' : 'landing';

    if (mode === 'play') {
      immersive = true;
      notify();
      const ghost = route.query.ghost === '1' && s.graph;
      const wrap = h('div', { class: 'sh-problem' }, playBar({ backHref: buildHash('beat/' + route.parts.slice(1).join('/')), backLabel: 'Back', title: problem.title, sub: (s.edited ? `Beat ${who}, target ${s.score} (link edited)` : `Beat ${who}, target ${s.score}`), chip: `${who} ${s.score}`, right: diffBadge(problem.difficulty) }));
      host.append(wrap);
      play = mountPlayHost(wrap, ctx, {
        mode: 'beat', problem, seed: s.seed,
        overlay: { graph: ghost ? s.graph : null, score: s.score, name: named && !trusted ? who + ' (name unchecked)' : who, share: raw, availability: s.availability, p99: s.p99, cost: s.cost },
      });
      offDay = ctx.bus.on('play:day-end', (e) => {
        if (e.mode !== 'beat' || !e.result) return;
        const mine = Math.round(e.result.score?.total ?? 0);
        const diff = mine - s.score;
        ctx.bus.emit('toast', diff > 0 ? { text: `You beat ${who} by ${diff} ${diff === 1 ? 'point' : 'points'}.`, level: 'ok', ms: 3200 }
          : diff === 0 ? { text: `A tie with ${who} at ${mine}.`, level: 'info', ms: 5000 }
            : { text: `${who} is ahead by ${-diff}. One more try?`, level: 'info', ms: 5000 });
      });
      return;
    }

    immersive = false;
    notify();
    const verifiedEl = h('span', { class: 'sh-badge' });
    if (c.v && c.v.verified) { verifiedEl.className = 'sh-badge sh-badge--ok'; verifiedEl.replaceChildren(ico('ui.verified', 14), 'Score checked by replay'); }
    else if (s.edited) { verifiedEl.className = 'sh-badge sh-badge--warn'; verifiedEl.replaceChildren(ico('ui.warn', 14), `Link edited: it said ${Math.round(s.claimed)}, the replay scored ${Math.round(s.score)}`); }
    else { verifiedEl.className = 'sh-badge sh-badge--warn'; verifiedEl.replaceChildren(ico('ui.warn', 14), 'Could not verify this score'); }

    const ghostBox = h('input', { type: 'checkbox', class: 'sh-switch-input', id: 'sh-ghost', role: 'switch' });
    ghostBox.disabled = !s.graph;
    const metric = (label, val) => (val == null ? null : h('div', { class: 'sh-metric' }, h('span', { class: 'sh-muted', text: label }), h('span', { class: 'sh-num', text: val })));
    const card = h('section', { class: 'sh-card sh-beat' },
      h('p', { class: 'sh-eyebrow', text: `${who} challenges you` }),
      named && !trusted ? h('p', { class: 'sh-fine', text: 'The name comes from the link and is not checked.' }) : null,
      h('h1', { class: 'sh-h1', text: problem.title }),
      h('p', { class: 'sh-muted', text: problem.like || '' }),
      h('div', { class: 'sh-beat-score' }, h('span', { class: 'sh-beat-num sh-num', text: String(s.score) }), h('span', { class: 'sh-muted', text: s.edited ? 'replayed score to beat, out of 1000' : 'score to beat, out of 1000' }), verifiedEl),
      h('div', { class: 'sh-metrics' },
        metric('Requests served', s.availability != null ? `≈ ${(s.availability * 100).toFixed(2)}%` : null),
        metric('Slowest 1 in 100', s.p99 != null ? `≈ ${Math.round(s.p99)} ms` : null),
        metric('Cost per month', s.cost != null ? `≈ $${Math.round(s.cost).toLocaleString()}` : null)),
      h('label', { class: 'sh-row', for: 'sh-ghost' },
        h('span', { class: 'sh-row-text' }, h('span', { class: 'sh-row-title', text: 'Show their design as a faint ghost' }), h('span', { class: 'sh-row-desc', text: s.graph ? 'A peek at how they built it. Off by default so you can try your own idea first.' : 'Their design is not included in this link.' })),
        h('span', { class: 'sh-switch' }, ghostBox, h('span', { class: 'sh-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'sh-switch-thumb' })))),
      h('div', { class: 'sh-btn-row' },
        h('button', { type: 'button', class: 'sh-btn sh-btn--primary sh-btn--lg', onclick: () => ctx.router.go(buildHash('beat/' + route.parts.slice(1).join('/'), { go: 1, ghost: ghostBox.checked ? 1 : undefined })) }, ico('ui.play', 20), 'Beat it'),
        h('a', { class: 'sh-btn sh-btn--lg', href: '#/practice/' + problem.id }, 'Practice it first')),
      h('p', { class: 'sh-fine', text: 'Same problem, same seed, same traffic. The score is replayed in your browser, nothing is sent anywhere.' }));
    host.append(h('div', { class: 'sh-page sh-page--narrow' }, card));
  }

  draw(route0);
  return {
    get immersive() { return immersive; },
    title: 'Beat my design',
    update: (r) => draw(r),
    destroy() { dead = true; teardown(); },
    get play() { return play; },
  };
}
