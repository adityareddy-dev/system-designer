// The debrief: verdict, score dial, four SLO cards, timeline, event stories, trade-offs, one thing to try next.
import { loadSummary } from './load-labels.js';
import { h, iconEl, fmtNum, fmtUsd, fmtMs, fmtPct, clockLabel, minuteLabel, fill, approx } from './util.js';
import { eventDescription } from './event-copy.js';
import { renderCorrectness } from './correctness.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.forEach((k) => e.append(k));
  return e;
};

// share of the day the p99 must meet its target to pass (sim/score.js): 90 percent on Easy problems, else 95
const latBarOf = (problem) => problem?.requirements?.latencyBar ?? (problem?.difficulty === 'Easy' ? 0.9 : 0.95);
const STALE_MAX = 0.001; // read-your-writes problems: most stale own reads allowed (sim/score.js)

// Which lesson teaches the idea behind each event, and a fallback per kind of missed check.
const EVENT_LESSON = {
  'viral-spike': 'autoscaling', 'flash-crowd': 'autoscaling', 'deadline-surge': 'autoscaling', 'overseas-launch': 'autoscaling', 'cold-start': 'autoscaling',
  'hot-key': 'hot-keys', 'celebrity-fanout': 'fanout', 'cache-stampede': 'caching', 'thundering-herd': 'caching',
  'db-failover': 'replication-lag', 'replication-lag': 'replication-lag', 'schema-migration-lock': 'replication-lag',
  'zone-outage': 'multi-region', 'region-outage': 'multi-region', 'slow-dependency': 'circuit-breakers', 'dependency-outage': 'circuit-breakers',
  'retry-storm': 'idempotency-retries', 'duplicate-delivery': 'idempotency-retries', 'poison-message': 'queues-backpressure',
  'cost-blowout': 'cost', 'compliance-audit': 'security-compliance', 'key-leak': 'security-compliance', 'cert-expiry': 'security-compliance',
  'ddos-attack': 'rate-limiting', 'bot-scraping': 'rate-limiting', 'third-party-rate-limit': 'rate-limiting',
  'bad-deploy': 'observability', 'bad-config-push': 'observability', 'memory-leak': 'observability', 'disk-full': 'observability', 'dns-misconfig': 'observability',
  'cardinality-explosion': 'observability', 'data-corruption': 'observability', 'noisy-neighbor': 'load-balancing',
  'network-partition': 'consistency', 'gpu-shortage': 'ai-serving',
};
const CHECK_LESSON = { availability: 'load-balancing', latency: 'caching', safety: 'idempotency-retries', cost: 'cost' };
// The lesson behind a part a design left out (the part the "Try this next" advice says to add).
const MISSING_PART_LESSON = { 'search-index': 'search-indexing', 'object-storage': 'storage-tiers', 'payment-processor': 'idempotency-retries' };
const CHECK_NAME = { availability: 'Reliability', latency: 'Speed', safety: 'Data safety', cost: 'Cost' };

// Root cause from the headline and advice text: a part that is missing or not connected, a line that fell
// behind, or autoscaling that was late. Returns a lesson id, or null when an event is the real cause.
function rootCause(result, problem) {
  const v = String(result.verdict || '');
  const advice = [result.nextStep?.text, ...(result.events || []).map((e) => e.story?.fix)].filter(Boolean).join(' ');
  const ai = (problem?.concepts || []).includes('ai-serving');
  if (/not connected to anything|could not finish anywhere|^Nothing was served/.test(v)) {
    // a missing part points to the lesson about that part; anything else is the first lesson
    const byPart = MISSING_PART_LESSON[result.nextStep?.elementId];
    return byPart || (ai ? 'ai-serving' : 'intro');
  }
  if (/fell behind/.test(v)) return 'queues-backpressure';
  if (/Autoscaling had cut|new (ones|servers) take (2 to 4 )?minutes to start/i.test(v + ' ' + advice)) return 'autoscaling';
  return null;
}

// For each missed check: the concept (lesson id) it points to and the event behind it when one is known.
export function missedConcepts(result, catalog, problem, lessons = []) {
  const have = new Set(lessons.map((l) => l.id));
  const mine = new Set(problem?.concepts || []);
  const sloMiss = result.checks || {};
  const miss = {
    availability: sloMiss.availability === false || (sloMiss.availability == null && result.slo.availability.actual < result.slo.availability.target),
    latency: sloMiss.latency === false || (sloMiss.latency == null && result.slo.latency.shareOk < latBarOf(problem)),
    safety: sloMiss.safety === false || (sloMiss.safety == null && result.score.safety < 150),
    cost: sloMiss.cost === false || (sloMiss.cost == null && result.slo.cost.perMonth > result.slo.cost.budget),
  };
  const evs = (result.events || []).filter((e) => EVENT_LESSON[e.id] && have.has(EVENT_LESSON[e.id]));
  const out = [];
  // speed, safety and cost show "Not measured" when almost nothing was served: no lesson link for a bar that says nothing
  const served = result.slo.availability.actual;
  const thin = !(served >= 0.5);
  for (const k of Object.keys(miss)) {
    if (!miss[k]) continue;
    if (thin && k !== 'availability') continue;
    let id = null, ev = null, part = null;
    // the debrief's own headline names the root cause: use it before any event name
    const root = rootCause(result, problem);
    // the advice under "Try this next" names the cause the same way: the part or event it blames picks the lesson
    const step = result.nextStep || null;
    const capacity = ['autoscaling', 'sharding', 'back-of-envelope'];
    const stepId = step ? (step.eventId ? EVENT_LESSON[step.eventId] : step.lesson) : null;
    const stepFits = !!stepId && ((k === 'availability' && step.kind === 'reliability') || (k === 'safety' && step.kind === 'safety') || (k === 'latency' && (step.kind === 'latency' || (step.kind === 'reliability' && capacity.includes(stepId)))));
    if (root && (k === 'availability' || (k === 'latency' && root === 'autoscaling'))) {
      id = root;
    } else if (stepFits && have.has(stepId)) {
      id = stepId;
      ev = step.eventId ? { id: step.eventId } : null;
      part = !step.eventId && step.nodeId != null ? (result.graph?.nodes || []).find((n) => n.id === step.nodeId)?.type : null;
    } else if (k === 'availability') {
      const m = result.minuteSuccess || [];
      const idx = m.findIndex((v) => v < Math.min(result.slo.availability.target, 0.99));
      const ms = idx * 60000;
      ev = idx >= 0 ? evs.find((e) => ms >= e.atMs - 60000 && ms <= (e.endMs || e.atMs) + 600000) : null;
      ev = ev || evs.find((e) => mine.has(EVENT_LESSON[e.id])) || evs[0] || null;
      id = ev ? EVENT_LESSON[ev.id] : CHECK_LESSON[k];
    } else if (k === 'safety' && (result.slo?.safety?.compliance?.failed || []).length && have.has('security-compliance')) {
      id = 'security-compliance';
    } else if (k === 'safety') {
      ev = evs.find((e) => ['idempotency-retries', 'replication-lag', 'consistency', 'security-compliance'].includes(EVENT_LESSON[e.id])) || null;
      id = ev ? EVENT_LESSON[ev.id] : CHECK_LESSON[k];
    } else {
      id = CHECK_LESSON[k];
    }
    if (!have.has(id)) id = [...mine].find((c) => have.has(c)) || null;
    if (!id) continue;
    if (out.some((o) => o.lessonId === id)) continue;
    out.push({ check: k, name: CHECK_NAME[k], lessonId: id, lesson: lessons.find((l) => l.id === id), event: ev ? catalog.eventById.get(ev.id)?.name : null, part: part ? catalog.elementById.get(part)?.name || null : null });
  }
  return out;
}

// Plain words for what a twist day changes: the events move and one more arrives.
function twistTip(problem, catalog) {
  const t = problem?.twist;
  if (!t) return '';
  const shift = Math.abs(t.shiftMin || 0);
  const when = shift ? `Events move ${shift >= 60 ? (shift / 60) + (shift === 60 ? ' hour' : ' hours') : shift + ' minutes'} ${t.shiftMin < 0 ? 'earlier' : 'later'}` : 'Events keep their times';
  const extra = t.extra ? ` and ${(catalog.eventById.get(t.extra.id)?.name || t.extra.id).toLowerCase()} is added at ${t.extra.at}` : '';
  return `${when}${extra}. Your design stays. Practice only, not saved.`;
}

export function verdictLine(result, catalog, problem) {
  const LAT_BAR = latBarOf(problem);
  const a = result.slo.availability;
  if (result.passed) return `Held. ${fmtPct(a.actual)} of requests succeeded against a ${fmtPct(a.target)} target.`;
  if (a.actual <= 0.001) return 'Nothing was served: no request reached a part that can finish it.';
  const checks = result.checks || {};
  if (checks.availability === false || (checks.availability == null && a.actual < a.target)) {
    // the simulation's own verdict names the cause (an event, a queue that fell behind, a missing part)
    if (result.verdict && /^(Broke|Nothing)/.test(result.verdict)) return result.verdict;
    const thresh = Math.min(a.target, 0.99);
    const idx = (result.minuteSuccess || []).findIndex((v) => v < thresh);
    if (idx >= 0) {
      const ms = idx * 60000;
      const ev = (result.events || []).find((e) => ms >= e.atMs - 60000 && ms <= (e.endMs || e.atMs) + 600000);
      const def = ev && catalog.eventById.get(ev.id);
      const nodeId = ev?.hurt?.[0];
      const node = nodeId && result.graph?.nodes?.find((n) => n.id === nodeId);
      const nm = node && catalog.elementById.get(node.type)?.name;
      const when = idx === 0 ? 'Broke from the start of the day' : `Broke at ${minuteLabel(idx)}`;
      return `${when}${def ? ` when ${def.name.toLowerCase()} hit${nm ? ` your ${nm.toLowerCase()}` : ' your design'}` : ''}. Only ${fmtPct(a.actual)} of requests succeeded against a ${fmtPct(a.target)} target.`;
    }
    return `Missed the uptime target: ${fmtPct(a.actual)} of requests succeeded against ${fmtPct(a.target)}.`;
  }
  if (result.verdict) return result.verdict;
  if (result.slo.latency.shareOk < LAT_BAR) return `Too slow: the speed target held for only ${fmtPct(result.slo.latency.shareOk, 0)} of the day (${Math.round(LAT_BAR * 100)}% needed).`;
  if (result.score.safety < 150) return 'Fast and up, but data was put at risk. Safety needs at least 150 of 200 points.';
  return `Over budget: about ${fmtUsd(result.slo.cost.perMonth)} a month against ${fmtUsd(result.slo.cost.budget)}.`;
}

export function dial(total) {
  const r = 54, C = 2 * Math.PI * r;
  const arc = svg('circle', { cx: 70, cy: 70, r, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', class: 'pl-dial-arc', transform: 'rotate(-90 70 70)', 'stroke-dasharray': `0 ${C}` });
  const num = h('div', { class: 'pl-dial-n pl-display' + (total >= 1000 ? ' pl-dial-n--4' : ''), text: '0' });
  const root = h('div', { class: 'pl-dial', role: 'img', 'aria-label': `Score ${total} out of 1000` },
    svg('svg', { viewBox: '0 0 140 140', width: 140, height: 140 }, svg('circle', { cx: 70, cy: 70, r, fill: 'none', 'stroke-width': 10, class: 'pl-dial-track' }), arc),
    h('div', { class: 'pl-dial-c' }, num, h('div', { class: 'pl-dial-of' }, 'points', h('br'), 'out of 1,000')));
  const set = (v) => { num.textContent = Math.round(v).toLocaleString('en-US'); arc.setAttribute('stroke-dasharray', `${(v / 1000) * C} ${C}`); };
  set(total);
  return root;
}

function sloCard({ key, title, iconId, pts, max, lines, ok, target, actual, flag }) {
  const state = flag === 'none' ? 'none' : ok ? 'ok' : 'bad';
  return h('div', { class: 'pl-slo pl-slo--' + state, 'data-slo': key },
    h('div', { class: 'pl-slo-top' }, iconEl(iconId, 18), h('b', { text: title }),
      h('span', { class: 'pl-slo-flag' }, iconEl(state === 'none' ? 'ui.info' : ok ? 'ui.check' : 'ui.warn', 14), state === 'none' ? 'Not measured' : ok ? 'Met' : 'Missed')),
    h('div', { class: 'pl-slo-pts pl-display' }, String(Math.round(pts)), h('span', { class: 'pl-muted', text: ` / ${max}` })),
    h('div', { class: 'pl-slo-ta' }, h('span', {}, h('i', { text: 'Target ' }), target), h('span', {}, h('i', { text: 'Actual ' }), actual)),
    h('ul', { class: 'pl-slo-why' }, lines.map((l) => h('li', {}, l))));
}

function timeline(result, catalog, onMarker) {
  const W = 720, H = 150, padL = 8, padR = 8, top = 22, bot = 22;
  const x = (ms) => padL + (ms / 86400000) * (W - padL - padR);
  const root = h('div', { class: 'pl-tl' });
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pl-tl-svg', role: 'img', 'aria-label': 'Traffic across the day with failed minutes in red stripes' });
  const defs = svg('defs', {}, (() => {
    const p = svg('pattern', { id: 'pl-stripe', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    p.append(svg('rect', { width: 6, height: 6, class: 'pl-tl-bad-bg' }), svg('rect', { width: 2.5, height: 6, class: 'pl-tl-bad-fg' }));
    return p;
  })());
  s.append(defs);
  const tl = result.timeline || [];
  const maxRps = Math.max(1, ...tl.map((t) => t.offeredRps));
  const y = (v) => top + (1 - v / maxRps) * (H - top - bot);
  const areaPath = (key) => {
    if (!tl.length) return '';
    let d = `M ${x(0)} ${H - bot}`;
    tl.forEach((t, i) => { d += ` L ${x((i + 0.5) * 3600000)} ${y(t[key])}`; });
    return d + ` L ${x(86400000)} ${H - bot} Z`;
  };
  for (let hr = 0; hr <= 24; hr += 3) {
    s.append(svg('line', { x1: x(hr * 3600000), x2: x(hr * 3600000), y1: top, y2: H - bot, class: 'pl-tl-grid' }));
    const t = svg('text', { x: x(hr * 3600000), y: H - 6, class: 'pl-tl-axis', 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle' });
    t.textContent = String(hr).padStart(2, '0') + ':00'; s.append(t);
  }
  s.append(svg('path', { d: areaPath('offeredRps'), class: 'pl-tl-offered' }), svg('path', { d: areaPath('successRps'), class: 'pl-tl-success' }));
  // failed runs
  const m = result.minuteSuccess || [];
  let start = -1;
  const flush = (end) => { if (start >= 0) { s.append(svg('rect', { x: x(start * 60000), y: top, width: Math.max(2, x(end * 60000) - x(start * 60000)), height: H - top - bot, fill: 'url(#pl-stripe)', class: 'pl-tl-fail' })); start = -1; } };
  m.forEach((v, i) => { if (v < 0.97) { if (start < 0) start = i; } else flush(i); });
  flush(m.length);
  root.append(s);
  (result.events || []).forEach((ev, i) => {
    const def = catalog.eventById.get(ev.id);
    const b = h('button', { class: 'pl-tl-mark', type: 'button', style: { left: (x(ev.atMs) / W) * 100 + '%' }, 'aria-label': `${def?.name || ev.id} at ${clockLabel(ev.atMs)}: jump to the story`, title: `${def?.name || ev.id} · ${clockLabel(ev.atMs)}`, onClick: () => onMarker(i) }, iconEl('ev.' + ev.id, 16));
    root.append(b);
  });
  root.append(h('div', { class: 'pl-tl-key' },
    h('span', {}, h('i', { class: 'pl-key pl-key--offered' }), 'Requests offered'), h('span', {}, h('i', { class: 'pl-key pl-key--ok' }), 'Served'),
    h('span', {}, h('i', { class: 'pl-key pl-key--bad' }), 'Failed minutes (striped)')));
  return root;
}

function eventStory(ev, i, result, catalog) {
  const def = catalog.eventById.get(ev.id);
  const inGraph = new Set((result.graph?.nodes || []).map((n) => n.type));
  // autoscaling set on a server counts as the autoscaler being there
  if ((result.graph?.nodes || []).some((n) => n.knobs?.autoscale?.on || n.autoscale?.on)) inGraph.add('autoscaler');
  const t = def?.debrief || {};
  const vars = { ...(ev.vars || {}) };
  if (vars.helper == null || vars.helper === '') vars.helper = 'Nothing in your design';
  const st = ev.story;
  const lines = st ? [st.headline, ev.durations ? st.hurt?.replace(/in the first (\S+) (minutes?)/, 'during $1 $2 of the observation window') : st.hurt, st.helped, st.fix] : [fill(t.headline, vars), fill(t.hurt, vars), fill(t.helped, vars), fill(t.fix, vars)];
  // An event the design never met still teaches: say what it would have done to a design that was exposed to it.
  const unreached = !!(st && (st.none || !lines[1] || (Array.isArray(ev.hurt) && ev.hurt.length === 0)));
  const would = unreached && def ? [eventDescription(def, vars), def.lesson].filter(Boolean).join(' ') : '';
  const missing = st && !st.fix && !unreached ? [] : (def?.counters || []).filter((c) => c.element && !inGraph.has(c.element));
  const card = h('article', { class: 'pl-story', id: 'pl-ev-' + i, tabindex: '-1' },
    h('header', { class: 'pl-story-head' }, iconEl('ev.' + ev.id, 28, 'pl-ic pl-story-ic'),
      h('div', {}, h('b', { text: def?.name || ev.id }), h('div', { class: 'pl-muted pl-small', text: `${clockLabel(ev.atMs)} to ${clockLabel(ev.endMs || ev.atMs)}` }))),
    h('div', { class: 'pl-story-body' },
      ev.durations ? h('p', { class: 'pl-muted', text: `Ramp: ${ev.durations.rampSec / 60} min. Spike duration at peak: ${ev.durations.spikeSec / 60} min. Traffic recovery duration: ${ev.durations.recoverySec / 60} min to return to normal. Overload duration: ≈ ${Math.round(ev.durations.overloadSec / 60)} min on the most overloaded part during the ${Math.round(ev.durations.observedSec / 60)} min observation window, including up to 10 min after the event. Recovery of your design may take longer.` }) : null,
      lines[0] && h('p', { class: 'pl-story-1', text: lines[0] }),
      lines[1] && h('p', {}, h('span', { class: 'pl-tag pl-tag--bad', text: 'What it did' }), lines[1]),
      would ? h('p', {}, h('span', { class: 'pl-tag pl-tag--info', text: 'What it would have done' }), would) : null,
      lines[2] && h('p', {}, h('span', { class: 'pl-tag pl-tag--ok', text: 'What helped' }), lines[2]),
      lines[3] && h('p', {}, h('span', { class: 'pl-tag pl-tag--info', text: 'What would help' }), lines[3]),
      missing.length ? h('div', { class: 'pl-counters' }, missing.slice(0, 5).map((c) => h('span', { class: 'pl-chip', title: c.how }, iconEl('el.' + c.element, 14), catalog.elementById.get(c.element)?.name || c.element))) : null,
      def?.realWorld ? h('p', { class: 'pl-muted pl-real' }, iconEl('ui.info', 14), ' ' + def.realWorld) : null));
  return card;
}

function versusCard(result, opp, handlers) {
  const mine = {
    score: Math.round(result.score.total),
    served: result.slo?.availability?.actual ?? null,
    p99: result.slo?.latency?.worstP99Ms ?? null,
    cost: result.slo?.cost?.perMonth ?? null,
  };
  const them = { score: Math.round(opp.score), served: opp.availability ?? null, p99: opp.p99 ?? null, cost: opp.cost ?? null };
  const diff = mine.score - them.score;
  const who = opp.name || 'Them';
  const win = diff > 0 ? 'You win' : diff === 0 ? 'A tie' : `${who} wins`;
  const f = {
    served: (v) => (v == null ? '–' : `≈ ${(v * 100).toFixed(2)}%`),
    p99: (v) => (v == null ? '–' : `≈ ${Math.round(v)} ms`),
    cost: (v) => (v == null ? '–' : `≈ $${Math.round(v).toLocaleString()}`),
  };
  const better = (k, a, b) => (a == null || b == null || a === b ? '' : ((k === 'p99' || k === 'cost') ? a < b : a > b) ? ' pl-vs--win' : '');
  const row = (label, k, fmt) => h('tr', {}, h('th', { scope: 'row', text: label }),
    h('td', { class: 'pl-vs-num' + better(k, mine[k], them[k]), text: fmt(mine[k]) }),
    h('td', { class: 'pl-vs-num' + better(k, them[k], mine[k]), text: fmt(them[k]) }));
  return h('section', { class: 'pl-versus', 'aria-label': 'You versus ' + who },
    h('div', { class: 'pl-versus-top' }, h('h3', { class: 'pl-versus-title', text: win }),
      h('span', { class: 'pl-muted pl-small', text: diff > 0 ? `by ${diff} ${diff === 1 ? 'point' : 'points'}` : diff < 0 ? `${-diff} ${diff === -1 ? 'point' : 'points'} ahead` : 'same score' })),
    h('table', { class: 'pl-versus-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), h('th', { scope: 'col', text: 'You' }), h('th', { scope: 'col', text: who }))),
      h('tbody', {}, row('Score', 'score', (v) => String(v)), row('Requests served', 'served', f.served), row('Slowest 1 in 100', 'p99', f.p99), row('Cost per month', 'cost', f.cost))),
    handlers?.onShare ? h('button', { class: 'pl-btn pl-btn--small', type: 'button', onClick: () => handlers.onShare() }, 'Send my design back') : null);
}

export function renderDebrief(host, { result, problem, catalog, ctx, hintsUsed = 0, prevBest = null, opponent = null, hasNext = false, reduced = false, handlers = {}, correctnessAnswer = null }) {
  host.replaceChildren();
  const sc = result.score;
  const slo = result.slo;
  const wld = catalog.world;
  const root = h('div', { class: 'pl-debrief' });

  // 1 + 2: verdict, dial, stars
  const stars = h('div', { class: 'pl-stars', role: 'img', 'aria-label': `${result.stars} of 3 stars` },
    [1, 2, 3].map((n) => iconEl(n <= result.stars ? 'ui.star' : 'ui.star-empty', 28, 'pl-ic pl-star' + (n <= result.stars ? ' pl-star--on' : ''))));
  const isBest = prevBest == null || sc.total > prevBest;
  const bestBadge = result.warmUp
    ? h('span', { class: 'pl-badge' }, iconEl('ui.info', 14), result.twistDay ? 'New twist day: practice only, not saved' : 'Warm-up: not saved')
    : result.reference
    ? h('span', { class: 'pl-badge' }, iconEl('ui.info', 14), 'Reference design: not saved to your results')
    : prevBest == null
    ? h('span', { class: 'pl-badge pl-badge--best' }, iconEl('ui.trophy', 14), 'First result saved')
    : isBest ? h('span', { class: 'pl-badge pl-badge--best' }, iconEl('ui.trophy', 14), `New personal best (was ${Math.round(prevBest)})`)
      : h('span', { class: 'pl-badge' }, iconEl('ui.trophy', 14), `Personal best ${Math.round(prevBest)}`);
  // One bar missed out of four: show it as a near miss, with the single change to try
  const ckm = result.checks || {};
  const missedKeys = Object.keys(CHECK_NAME).filter((k) => ckm[k] === false);
  const near = !result.passed && !result.reference && missedKeys.length === 1 && slo.availability.actual > 0.5;
  const passBadge = result.passed
    ? h('span', { class: 'pl-badge pl-badge--ok' }, iconEl('ui.check', 14), 'Passed')
    : near
    ? h('span', { class: 'pl-badge pl-badge--near', 'data-near': missedKeys[0] }, iconEl('ui.info', 14), `Almost there: one bar missed (${CHECK_NAME[missedKeys[0]]})`)
    : h('span', { class: 'pl-badge pl-badge--bad' }, iconEl('ui.warn', 14), 'Not passed yet');
  const TRY = {
    availability: 'Check that every part is connected, then add spare capacity so the busiest part stays under about 70 percent busy.',
    latency: 'Put a cache or a CDN in front of the slowest part so fewer requests wait in line.',
    safety: 'Add the missing proof parts or a copy of the data, so no acknowledged write can be lost.',
    cost: 'Look at the biggest line in the Cost card and trim it, or cache more so you need less.',
  };
  const tryText = result.nextStep?.text || (missedKeys.length ? TRY[missedKeys[0]] : null);
  const tryNext = !result.passed && !result.reference && tryText
    ? h('div', { class: 'pl-try' + (near ? ' pl-try--near' : ''), 'data-act': 'try-next' }, iconEl('ui.hint', 20),
      h('div', { class: 'pl-try-body' }, h('b', { text: near ? 'One change to pass' : 'Try this next' }), h('p', { text: tryText })),
      (result.nextStep?.elementId || result.nextStep?.nodeId) ? h('div', { class: 'pl-try-btns' },
        h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onShowNext?.(result.nextStep) }, 'Show me'),
        (() => { const f = handlers.nextFix?.(result.nextStep); return f ? h('button', { class: 'pl-btn pl-btn--primary', type: 'button', 'data-act': 'set-servers', onClick: () => handlers.onSetNext?.(f) }, f.label) : null; })()) : null)
    : null;
  root.append(h('section', { class: 'pl-verdict-sec' + (near ? ' pl-verdict-sec--near' : '') },
    h('div', { class: 'pl-kicker', text: 'Step 5 · Debrief' }),
    h('h2', { class: 'pl-verdict-line', text: `${result.passed ? 'Passed' : 'Not passed'}: ${verdictLine(result, catalog, problem)}` }),
    h('div', { class: 'pl-score-row' }, dial(Math.round(sc.total)),
      h('div', { class: 'pl-score-side' }, stars,
        passBadge,
        bestBadge,
        result.reference || result.warmUp ? null : h('button', { class: 'pl-btn pl-btn--primary pl-challenge-friend', type: 'button', 'data-act': 'challenge-friend', onClick: () => handlers.onShare?.() }, iconEl('ui.share', 16), 'Challenge a friend'),
        h('span', { class: 'pl-muted pl-small', text: `Hints used: ${hintsUsed}. Hints are free and never lower the score.` }))),
    tryNext,
    problem?.warmUp ? h('p', { class: 'pl-warmup', 'data-act': 'warm-up' }, iconEl('ui.info', 16), 'Warm-up done, now play the real day. This first day had no traffic spike, so its score is practice only: it is not saved, not posted and not shared. Retry plays the full day, spike included.') : null));
  if (opponent && typeof opponent.score === 'number') root.prepend(versusCard(result, opponent, handlers));
  if (result.warnings?.length) {
    root.append(h('section', { class: 'pl-watch' }, iconEl('ui.warn', 20), h('div', {}, h('b', { text: 'Held, but watch out' }),
      h('ul', { class: 'pl-slo-why' }, result.warnings.map((w) => h('li', { text: w.text }))))));
  }

  // Learn this: each missed check points to the lesson behind the idea
  const learn = result.passed || result.reference ? [] : missedConcepts(result, catalog, problem, ctx?.content?.lessons || []);
  if (learn.length) {
    root.append(h('section', { class: 'pl-learn', 'aria-label': 'Learn this' }, iconEl('ui.learn', 22),
      h('div', {}, h('b', { text: 'Learn this' }),
        h('ul', { class: 'pl-learn-list' }, learn.map((m) => h('li', { 'data-check': m.check },
          h('span', {}, `${m.name} missed${m.event ? ` around ${m.event.toLowerCase()}` : m.part ? `, mostly at ${m.part.toLowerCase()}` : ''}. `),
          h('a', { class: 'pl-learn-link', href: '#/learn/' + m.lessonId }, `Learn this: ${m.lesson?.title || m.lessonId}`)))))));
  }

  // 3: SLO cards
  const a = slo.availability, l = slo.latency, s = slo.safety, c = slo.cost;
  const nines = a.actual < a.target ? Math.log10((1 - a.actual) / Math.max(1e-9, 1 - a.target)) : 0;
  const worst = Object.entries(l.byType || {});
  const compNames = (s.compliance?.failed || []).map((id) => wld.complianceChecks.find((x) => x.id === id)?.name || id);
  const topCost = [...(c.lines || [])].sort((x, y) => y.usd - x.usd).slice(0, 2);
  const checks = result.checks || {};
  const LAT_BAR = latBarOf(problem);
  const okLat = checks.latency ?? l.shareOk >= LAT_BAR;
  // the targets the day was judged on, one per request type
  const tgts = [...new Set(Object.values(l.byType || {}).map((v) => v.targetMs))].sort((x, y) => x - y);
  const latTarget = tgts.length > 1 ? `p99 ≤ ${fmtMs(tgts[0])} to ${fmtMs(tgts[tgts.length - 1])} by type` : `p99 ≤ ${fmtMs(tgts[0] ?? l.targetMs)}`;
  const lateNote = result.lateRequests > 0 ? `${fmtNum(result.lateRequests)} requests failed because their work waited in a queue past its limit.` : null;
  const okSafe = checks.safety ?? sc.safety >= 150;
  const okCost = checks.cost ?? c.perMonth <= c.budget;
  const slowTypes = Object.entries(l.byType || {}).filter(([, v]) => v.measured !== false && v.shareOk < 0.8).map(([k]) => catalog.requestById.get(k)?.plural || k);
  const none = a.actual <= 0.001;
  const overTarget = Object.values(l.byType || {}).some((v) => (v.worstP99Ms ?? v.p99Ms) > v.targetMs);
  // almost nothing served: speed, safety and cost describe too little traffic to judge
  const thin = !none && a.actual < 0.5;
  const thinNote = thin ? `Not measured: only ${fmtPct(a.actual)} of requests were served, so this says little about a real day.` : null;
  const servedNote = a.actual < 0.999 ? `Points count only for the share of requests that were served (${fmtPct(a.actual)}).` : null;
  const safeWhy = [];
  if (!okSafe && !none && s.staleShare > STALE_MAX && problem?.requirements?.readYourWrites) {
    safeWhy.push(`${fmtPct(s.staleShare, 1)} of reads showed people an old copy of their own change; this problem allows at most ${fmtPct(STALE_MAX, 1)}.`);
  }
  const cards = h('section', { class: 'pl-slo-grid', 'aria-label': 'Score cards' },
    sloCard({ key: 'reliability', title: 'Reliability', iconId: 'ui.availability', pts: sc.reliability, max: 400, ok: a.actual >= a.target, target: fmtPct(a.target), actual: fmtPct(a.actual),
      lines: [a.actual >= a.target ? 'You met the uptime target.' : `${nines.toFixed(1)} "nines" short of the target. Each nine is ten times fewer failures.`, lateNote, 'Real user requests only; attacks and retries are not counted.'].filter(Boolean) }),
    sloCard({ key: 'latency', title: 'Speed', iconId: 'ui.latency', pts: sc.latency, max: 200, ok: okLat, flag: none || thin ? 'none' : null, target: latTarget, actual: none ? 'nothing served' : `${fmtPct(l.shareOk, 1)} (≈ ${Math.round(l.shareOk * 1440).toLocaleString()} of 1,440 equivalent minutes)`,
      lines: none ? ['Not measured: nothing was served, so there is no speed to score.'] : [thinNote, `Compliance uses served-request weighting; equivalent minutes scale that share to a 1,440-minute day. To pass: aggregate compliance must reach ${Math.round(LAT_BAR * 100)}%, and every request type at least 80%.`,
        `Slowest moment: ${fmtMs(l.worstP99Ms)} (p99, approx.).${okLat && overTarget ? ' That slow stretch is inside the allowance: the target only has to hold in most minutes.' : ''}`, ...worst.map(([t, v]) => v.measured === false ? `${catalog.requestById.get(t)?.name || t}: Not measured: no requests of this type were served. Target ${fmtMs(v.targetMs)}.` : `${catalog.requestById.get(t)?.name || t}: ${fmtPct(v.shareOk, 1)} within target (≈ ${Math.round(v.shareOk * 1440).toLocaleString()} of 1,440 equivalent minutes, weighted by served requests). ${fmtMs(v.worstP99Ms ?? v.p99Ms)} at the slowest, target ${fmtMs(v.targetMs)}${okLat && (v.worstP99Ms ?? v.p99Ms) > v.targetMs ? ` (over it in ${Math.max(1, Math.round((1 - (v.shareOk ?? 1)) * 1440))} of 1,440 equivalent minutes, within the allowance)` : ''}`),
        slowTypes.length ? `Too often slow: ${slowTypes.join(', ')}.` : null, servedNote].filter(Boolean) }),
    sloCard({ key: 'safety', title: 'Data safety', iconId: 'ui.safety', pts: sc.safety, max: 200, ok: okSafe, flag: none || thin ? 'none' : null, target: problem?.requirements?.dataSafety === 'no-loss' ? 'no lost writes' : problem?.requirements?.dataSafety === 'rpo-1m' ? 'lose at most a minute of writes' : problem?.requirements?.dataSafety || '–', actual: `${fmtNum(s.lostWrites)} lost · ${fmtNum(s.duplicates)} duplicate`,
      lines: none ? ['Not measured: nothing was served, so no data was kept to score. Safety points are only awarded for served requests.'] : [thinNote, s.lostWrites ? `${fmtNum(s.lostWrites)} acknowledged writes were lost.` : 'No acknowledged write was lost.', s.duplicates ? `${fmtNum(s.duplicates)} duplicate effects (such as a double charge).` : 'No duplicate effects.',
        s.staleReads ? `${fmtNum(s.staleReads)} stale reads.` : null, compNames.length ? `Missing proof: ${compNames.join(', ')}.` : null, ...safeWhy, servedNote].filter(Boolean) }),
    sloCard({ key: 'cost', title: 'Cost', iconId: 'ui.cost', pts: sc.cost, max: 200, ok: okCost, flag: none || thin ? 'none' : null, target: `≤ ${fmtUsd(c.budget)} a month`, actual: `≈ ${fmtUsd(c.perMonth)} a month`,
      lines: none ? ['Not measured: nothing was served, so the money bought nothing to score.', ...topCost.map((x) => `${x.label}: ≈ ${fmtUsd(x.usd)}`)] : [thinNote, c.perMonth <= c.budget ? (a.actual < 0.999 ? 'At or under budget.' : 'At or under budget: full points.') : `${Math.round((c.perMonth / c.budget - 1) * 100)}% over budget.`, ...topCost.map((x) => `${x.label}: ≈ ${fmtUsd(x.usd)}`), servedNote].filter(Boolean) }));
  root.append(cards, h('p', { class: 'pl-footnote' }, approx('Every dollar and millisecond here is a sensible real-world approximation, not a quote.')));
  const checkpoint = renderCorrectness(problem?.correctness, correctnessAnswer);
  if (checkpoint) root.append(checkpoint);

  root.append(h('p', { class: 'pl-muted', text: loadSummary(problem) }));

  // 4: timeline
  const stories = h('section', { class: 'pl-stories', 'aria-label': 'What happened' });
  root.append(h('section', { class: 'pl-sec' }, h('h3', { text: 'Your day' }),
    timeline(result, catalog, (i) => { const el = stories.querySelector('#pl-ev-' + i); el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); el?.focus({ preventScroll: true }); })));

  // 5: what happened
  stories.append(h('h3', { text: 'What happened' }));
  if (!(result.events || []).length) stories.append(h('p', { class: 'pl-muted', text: 'No events hit this day. Smooth traffic is the easy part.' }));
  (result.events || []).forEach((ev, i) => stories.append(eventStory(ev, i, result, catalog)));
  root.append(stories);

  // 6: trade-offs
  const tr = h('section', { class: 'pl-sec' }, h('h3', { text: 'Trade-offs you made' }));
  const list = h('ul', { class: 'pl-tradeoffs' });
  (result.tradeoffs || []).forEach((t) => {
    const n = (result.nodes || []).find((x) => x.id === t.nodeId);
    list.append(h('li', {}, iconEl('el.' + t.type, 22, 'pl-ic pl-to-ic'),
      h('div', {}, h('div', { text: t.text }), n ? h('div', { class: 'pl-muted pl-small', text: `Peak ${n.peakUtil > 5 ? 'over 500' : Math.round(n.peakUtil * 100)}% busy${n.usd ? ` · ≈ ${fmtUsd(n.usd)} a month` : ''}${n.minutesOverloaded ? ` · overloaded ${n.minutesOverloaded} min` : ''}` }) : null)));
  });
  if (!list.children.length) list.append(h('li', { class: 'pl-muted', text: 'Nothing stood out. Try a leaner or a sturdier design and compare.' }));
  tr.append(list);
  root.append(tr);

  // 7: next
  if (result.nextStep?.text && !tryNext) {
    const ns = result.nextStep;
    root.append(h('section', { class: 'pl-next' }, iconEl('ui.hint', 22), h('div', {}, h('b', { text: 'One thing to try next' }), h('p', { text: ns.text })),
      (ns.elementId || ns.nodeId) ? h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onShowNext?.(ns) }, 'Show me') : null));
  }

  // 8: actions
  root.append(h('div', { class: 'pl-actions' },
    h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: () => handlers.onRetry?.() }, iconEl('ui.restart', 16), 'Retry'),
    h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onHints?.() }, iconEl('ui.hint', 16), 'Hints'),
    h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onEditorial?.() }, iconEl('ui.editorial', 16), 'Editorial'),
    result.warmUp ? null : h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onShare?.() }, iconEl('ui.share', 16), 'Share'),
    handlers.onTwist ? h('button', { class: 'pl-btn', type: 'button', 'data-act': 'twist', title: problem?.twistDay ? 'Play the original day again' : twistTip(problem, catalog), onClick: () => handlers.onTwist() }, iconEl('ui.restart', 16), problem?.twistDay ? 'Original day' : 'New twist') : null,
    hasNext ? h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onNext?.() }, 'Next problem', iconEl('ui.chevron-right', 16)) : null,
    h('button', { class: 'pl-btn pl-btn--ghost', type: 'button', onClick: () => handlers.onBack?.() }, iconEl('ui.back', 16), 'Back to my design')));
  host.append(root);
}
