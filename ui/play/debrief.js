// End-of-day evidence and actions.
import { mountFeedback } from '../shell/feedback.js';
export const duration = sec => sec < 60 ? `${Math.round(sec)} ${Math.round(sec) === 1 ? 'second' : 'seconds'}` : `${Math.round(sec / 6) / 10} ${sec === 60 ? 'minute' : 'minutes'}`;
// The debrief: verdict, score dial, four SLO cards, timeline, event stories, trade-offs, one thing to try next.
import { renderRepair } from './repair.js';
import { failureEvidence } from './run-transition.js';
import { gateTransfer } from './transfer-reflection.js';
import { completionState } from './completion.js';
import { loadSummary } from './load-labels.js';
import { renderReflection } from './reflection.js';
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

// share of served interactive requests whose interval p99 must meet its target to pass (sim/score.js): 90 percent on Easy problems, else 95
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
  if (t.brief) return t.brief;
  const shift = Math.abs(t.shiftMin || 0);
  const when = shift ? `Events move ${shift >= 60 ? (shift / 60) + (shift === 60 ? ' hour' : ' hours') : shift + ' minutes'} ${t.shiftMin < 0 ? 'earlier' : 'later'}` : 'Events keep their times';
  const extra = t.extra ? ` and ${(catalog.eventById.get(t.extra.id)?.name || t.extra.id).toLowerCase()} is added at ${t.extra.at}` : '';
  return `${when}${extra}. Your design stays. Pass without hints after a checked original day to earn full mastery.`;
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
  if (result.slo.latency.shareOk < LAT_BAR) return `Too slow: the speed target held for only ${fmtPct(result.slo.latency.shareOk, 0)} of served interactive requests (${Math.round(LAT_BAR * 100)}% needed).`;
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

function eventStory(ev, i, result, catalog, demanding = false) {
  const def = catalog.eventById.get(ev.id);
  const inGraph = new Set((result.graph?.nodes || []).map((n) => n.type));
  // autoscaling set on a server counts as the autoscaler being there
  if ((result.graph?.nodes || []).some((n) => n.knobs?.autoscale?.on || n.autoscale?.on)) inGraph.add('autoscaler');
  const t = def?.debrief || {};
  const vars = { ...(ev.vars || {}) };
  if (vars.helper == null || vars.helper === '') vars.helper = 'Nothing in your design';
  const st = ev.story;
  const lines = st ? [st.headline, ev.durations ? st.hurt?.replace(/in the first (\S+) (minutes?)/, 'during $1 $2 of the observation window') : st.hurt, st.helped, st.fix] : [fill(t.headline, vars), fill(t.hurt, vars), fill(t.helped, vars), fill(t.fix, vars)];
  if (demanding) lines[3] = 'Choose a repair and predict its effect in the next experiment. Measure this event again after changing one boundary.';
  // An event the design never met still teaches: say what it would have done to a design that was exposed to it.
  const unreached = !!(st && (st.none || !lines[1] || (Array.isArray(ev.hurt) && ev.hurt.length === 0)));
  const would = unreached && def ? [eventDescription(def, vars, ev.description), def.lesson].filter(Boolean).join(' ') : '';
  const missing = demanding ? [] : st && !st.fix && !unreached ? [] : (ev.counters || def?.counters || []).filter((c) => c.element && !inGraph.has(c.element));
  const card = h('article', { class: 'pl-story', id: 'pl-ev-' + i, tabindex: '-1' },
    h('header', { class: 'pl-story-head' }, iconEl('ev.' + ev.id, 28, 'pl-ic pl-story-ic'),
      h('div', {}, h('b', { text: ev.name || def?.name || ev.id }), h('div', { class: 'pl-muted pl-small', text: `${clockLabel(ev.atMs)} to ${clockLabel(ev.endMs || ev.atMs)}` }))),
    h('div', { class: 'pl-story-body' },
      ev.durations ? h('p', { class: 'pl-muted', text: `Ramp: ${duration(ev.durations.rampSec)}. Spike duration at peak: ${duration(ev.durations.spikeSec)}. Traffic recovery duration: ${duration(ev.durations.recoverySec)} to return to normal. Overload duration: ≈ ${Math.round(ev.durations.overloadSec / 60)} min on the most overloaded part during the ${Math.round(ev.durations.observedSec / 60)} min observation window, including up to 10 min after the event. Recovery of your design may take longer.` }) : null,
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
    cost: (v) => (v == null ? '–' : `≈ $${Math.round(v).toLocaleString('en-US')}`),
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

// Plain words for where the day stood: how busy a part got at its worst.
const busyWords = (u) => (u > 5 ? 'over 500%' : `${Math.round((u || 0) * 100)}%`);
const partLabel = (n, catalog) => n?.label || catalog?.elementById?.get(n?.type)?.name || n?.type || 'a part';
// The busiest part of the day that carried traffic (sources and idle parts are left out).
function busiestPart(result, catalog) {
  let best = null;
  for (const m of result.nodes || []) {
    const g = (result.graph?.nodes || []).find((n) => n.id === m.id);
    if (!g || !(m.peakRequests > 0) || catalog?.elementById?.get(g.type)?.kind === 'source') continue;
    if (!best || m.peakUtil > best.m.peakUtil) best = { g, m, name: partLabel(g, catalog) };
  }
  return best;
}
// One plain line that answers the player's prediction with what was measured.
export function predictionVerdict(prediction, result, catalog) {
  const text = String(prediction || '').toLowerCase();
  const STOP = new Set(['primary', 'replica', 'service', 'services']);
  let said = null, score = 0;
  for (const g of result.graph?.nodes || []) {
    const m = (result.nodes || []).find((x) => x.id === g.id);
    if (!m || !(m.peakRequests > 0) || catalog?.elementById?.get(g.type)?.kind === 'source') continue;
    const clean = partLabel(g, catalog).toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const words = clean.split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !STOP.has(w));
    const hit0 = clean && text.includes(clean) ? clean.length + 100 : Math.max(0, ...words.filter((w) => text.includes(w.replace(/s$/, ''))).map((w) => w.length));
    const el = catalog?.elementById?.get(g.type), isDb = /\b(database|databases|db|datastore|data store)\b/.test(text) && el?.category === 'data' && !/cache|search|object|archive|file/.test(g.type);
    const hit = Math.max(hit0, isDb ? 5 : 0);
    if (hit > score || (hit === score && hit > 0 && m.peakUtil > said.m.peakUtil)) { said = { g, m, name: partLabel(g, catalog) }; score = hit; }
  }
  const busy = busiestPart(result, catalog);
  if (result.passed) {
    if (!busy) return 'Nothing reached its limit.';
    if (said && said.g.id !== busy.g.id) return `${said.name} peaked at ${busyWords(said.m.peakUtil)} busy and held. The busiest part was ${busy.name}, at ${busyWords(busy.m.peakUtil)}. Nothing reached its limit.`;
    return `The busiest part was ${busy.name}, at ${busyWords(busy.m.peakUtil)} busy, and it held. Nothing reached its limit.`;
  }
  const ev = failureEvidence(result, catalog);
  const lim = (result.graph?.nodes || []).find((n) => n.id === ev.nodeId);
  const limM = (result.nodes || []).find((x) => x.id === ev.nodeId);
  if (!lim) return `Measured cause: ${ev.detail}`;
  const limName = partLabel(lim, catalog);
  const first = ev.heading === 'The part that reached its limit' ? 'The first limit was' : 'The first part to fail was';
  const tail = `${first} ${limName}${limM ? ` (peak ${busyWords(limM.peakUtil)} busy)` : ''}.`;
  if (!said) return tail;
  if (said.g.id === lim.id) return `You named ${said.name}. It peaked at ${busyWords(said.m.peakUtil)} busy, and it is where the day broke, so your prediction held.`;
  if (said.m.peakUtil >= 1) return `${said.name} also reached its limit (peak ${busyWords(said.m.peakUtil)} busy), but it was not the first. ${tail}`;
  return `${said.name} peaked at ${busyWords(said.m.peakUtil)} busy, so it was not the limit. ${tail}`;
}

export function renderDebrief(host, { result, problem, catalog, ctx, hintsUsed = 0, prevBest = null, opponent = null, hasNext = false, reduced = false, handlers = {}, correctnessAnswer = null, assistWhy = [] }) {
  host.replaceChildren();
  const sc = result.score;
  const slo = result.slo;
  const wld = catalog.world;
  const root = h('div', { class: 'pl-debrief' });

  // 1 + 2: verdict, dial, stars
  const stars = h('div', { class: 'pl-stars', role: 'img', 'aria-label': `${result.stars} of 3 stars` },
    [1, 2, 3].map((n) => iconEl(n <= result.stars ? 'ui.star' : 'ui.star-empty', 28, 'pl-ic pl-star' + (n <= result.stars ? ' pl-star--on' : ''))));
  // The warm-up is a practice run: it shows no stars or points and says plainly that the full day is next.
  const warm = !!problem?.warmUp && !problem.twistDay;
  const isBest = prevBest == null || sc.total > prevBest;
  const bestBadge = result.warmUp
    ? h('span', { class: 'pl-badge' }, iconEl('ui.info', 14), result.twistDay ? 'New twist: mastery check, traffic best unchanged' : 'Warm-up: not saved')
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
  const demanding = !!problem?.difficulty && problem.difficulty !== 'Easy';
  const completion = completionState(problem, { ...result, learning: { ...result.learning, assisted: result.learning?.assisted || hintsUsed >= 3 } }, correctnessAnswer, ctx?.progress?.get?.(problem.id));
  const { traceChecked, assisted, message: learningMessage } = completion;
  root.dataset.credit = !traceChecked ? 'trace-open' : assisted ? 'assisted' : 'checked';
  root.dataset.completion = completion.key;
  const assistParts = [...(hintsUsed >= 3 ? [`you used ${hintsUsed} hints`] : []), ...assistWhy];
  const assistNote = result.passed && assisted && !warm && !result.reference
    ? h('span', { class: 'pl-muted pl-small pl-assist-why', text: `Passed with assistance: ${assistParts.length ? assistParts.join(' and ') : 'you used a worked answer'}.` })
    : null;
  const passBadge = warm && result.passed
    ? h('span', { class: 'pl-badge' }, iconEl('ui.info', 14), 'Practice run: not saved')
    : result.passed
    ? h('span', { class: 'pl-badge pl-badge--ok' }, iconEl('ui.check', 14), completion.label)
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
  const tryNext = demanding && !result.passed && !result.reference ? renderRepair(result, problem, catalog, handlers) : !result.passed && !result.reference && tryText
    ? h('div', { class: 'pl-try' + (near ? ' pl-try--near' : ''), 'data-act': 'try-next' }, iconEl('ui.hint', 20),
      h('div', { class: 'pl-try-body' }, h('b', { text: 'Next experiment' }), h('p', { text: tryText.split(/(?<=\.)\s+/).slice(0, 2).join(' ') }), h('details', { class: 'pl-sizing-detail' }, h('summary', { text: 'Evidence and sizing assumptions' }), h('p', { text: tryText }))),
      (result.nextStep?.elementId || result.nextStep?.nodeId) ? h('div', { class: 'pl-try-btns' },
        h('button', { class: 'pl-btn', type: 'button', onClick: () => handlers.onShowNext?.(result.nextStep) }, 'Show me'),
        (() => { const f = handlers.nextFix?.(result.nextStep); return f ? h('button', { class: 'pl-btn pl-btn--primary', type: 'button', 'data-act': 'set-servers', onClick: () => handlers.onSetNext?.(f) }, f.label) : null; })()) : null)
    : null;
  root.append(h('section', { class: 'pl-verdict-sec' + (near ? ' pl-verdict-sec--near' : '') },
    h('div', { class: 'pl-kicker', text: 'Step 5 · Debrief' }),
    h('h2', { class: 'pl-verdict-line', text: warm && result.passed ? 'Warm-up passed. Now run the full day.' : `${result.passed ? 'Passed' : 'Not passed'}: ${verdictLine(result, catalog, problem)}` }),
    h('div', { class: 'pl-score-row' + (warm ? ' pl-score-row--practice' : '') }, warm ? null : dial(Math.round(sc.total)),
      h('div', { class: 'pl-score-side' }, warm ? null : stars,
        passBadge,
        warm ? null : bestBadge,
        result.reference || result.warmUp ? null : h('button', { class: 'pl-btn pl-btn--primary pl-challenge-friend', type: 'button', 'data-act': 'challenge-friend', onClick: () => handlers.onShare?.() }, iconEl('ui.share', 16), 'Challenge a friend'),
        h('span', { class: 'pl-muted pl-small', text: `Hints used: ${hintsUsed}. Hints are free and never lower the score.` }),
        assistNote)),
    result.passed && problem?.correctness && !problem?.warmUp ? h('p', { class: 'pl-learning-status', role: 'status', text: learningMessage }) : null,
    result.passed && completion.next === 'twist' && handlers.onTwist ? h('button', { class: 'pl-btn pl-btn--primary', type: 'button', 'data-act': 'mastery-twist', onClick: handlers.onTwist, text: 'Next: New twist without hints' }) : null,
    result.passed && ['original','retry'].includes(completion.next) ? h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: completion.next === 'original' ? handlers.onTwist : handlers.onIndependentRetry, text: completion.next === 'original' ? 'Next: Pass the original day with its trace' : 'Next: Retry twist without hints' }) : null,
    result.passed && completion.next === 'practice' ? h('a', { class: 'pl-btn pl-btn--primary', href: '#/practice/' + problem.id, text: 'Next: Check the trace in Practice' }) : null,
    tryNext,
    problem?.warmUp ? h('div', { class: 'pl-warmup', 'data-act': 'warm-up' }, iconEl('ui.info', 16),
      h('p', { text: result.passed ? 'This first day had no traffic spike, so it is practice only: no stars or points, and it is not saved, posted or shared. The full day adds the spike.' : 'This first day had no traffic spike, so it is practice only: no stars or points, and it is not saved, posted or shared. Retry plays the full day, spike included.' }),
      warm && result.passed ? h('button', { class: 'pl-btn pl-btn--primary', type: 'button', 'data-act': 'run-full-day', onClick: () => handlers.onRetry?.() }, iconEl('ui.restart', 16), 'Run the full day') : null) : null));
  const reflection = renderReflection(result, catalog);
  if (reflection) root.append(reflection);
  if (result.efficiency?.length) {
    const choice = h('select', { class: 'pl-input', 'aria-label': 'Capacity decision' }, h('option', { value: '', text: 'Choose your next experiment' }), h('option', { value: 'cut', text: 'Test the smaller pool on the full day' }), h('option', { value: 'keep', text: 'Keep the spare capacity for a stated requirement' }));
    const reason = h('textarea', { class: 'pl-input', rows: 2, 'aria-label': 'Reason to keep spare capacity', placeholder: 'Name a burst, failure or recovery requirement, and how you would test it.' });
    const feedback = h('p', { role: 'status', class: 'pl-muted' });
    root.append(h('section', { class: 'pl-sec', 'aria-label': 'Capacity tradeoff' }, h('h3', { text: 'Choose what the spare capacity buys' }),
      result.efficiency.map(item => h('p', { text: demanding ? `${item.label}: ${item.units} units at about ${Math.round(item.peakUtil * 100)}% peak busy. Work out a trial size at 70% utilization, round up and check the failure floor. Then compare the full day and cost.` : `${item.label} used about ${Math.round(item.peakUtil * 100)}% of its capacity at peak. Testing ${item.suggestedUnits} instead of ${item.units} units could save about $${item.savingPerMonth.toLocaleString('en-US')}/month. This estimate keeps 30% headroom for the measured peak; rerun to verify recovery and dependencies.` })),
      h('p', { text: 'Idle capacity reduces Cost points even below budget. A stated reason records your tradeoff; only testing the workload can establish whether it is worth paying for.' }), choice, reason,
      h('button', { class: 'pl-btn', type: 'button', text: 'Record decision', onclick: () => {
        if (!choice.value || (choice.value === 'keep' && reason.value.trim().length < 20)) { feedback.textContent = 'Choose an experiment, or give a concrete requirement and test for keeping the spare capacity.'; return; }
        ctx?.store?.set(`capacityDecision.${problem.id}`, { choice: choice.value, reason: reason.value.trim() });
        feedback.textContent = choice.value === 'cut' ? 'Decision recorded. Return to Draw, reduce one pool, then compare the full day.' : 'Reason recorded. Test that requirement in Sandbox before relying on the extra capacity.';
      } }), feedback));
  }
  if (opponent && typeof opponent.score === 'number') root.prepend(versusCard(result, opponent, handlers));
  const loops = (result.warnings || []).filter(w => w.code === 'flow-cycle');
  if (loops.length) {
    const warning = h('section', { class: 'pl-watch pl-loop-warning', role: 'status' }, iconEl('ui.warn', 20), h('div', {}, h('b', { text: 'Remove ignored delivery loops first' }),
      h('ul', { class: 'pl-slo-why' }, loops.map(w => h('li', { text: w.text })))));
    root.querySelector('.pl-verdict-sec').after(warning);
  }
  const otherWarnings = (result.warnings || []).filter(w => w.code !== 'flow-cycle');
  if (otherWarnings.length) {
    root.append(h('section', { class: 'pl-watch' }, iconEl('ui.warn', 20), h('div', {}, h('b', { text: 'Held, but watch out' }),
      h('ul', { class: 'pl-slo-why' }, otherWarnings.map((w) => h('li', { text: w.text }))))));
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
  const costNote = 'Each amount is the part\'s monthly price for the units you set, plus storage and usage at your traffic, so it can be above the price in the parts list.';
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
  const servedNote = a.actual < a.target ? `Points count only for the share of requests that were served (${fmtPct(a.actual)}).` : null;
  const safeWhy = [];
  for (const f of s.promiseFailures || []) safeWhy.push(f.message);
  if (!okSafe && !none && s.staleShare > STALE_MAX && problem?.requirements?.readYourWrites) {
    safeWhy.push(`${fmtPct(s.staleShare, 1)} of reads showed people an old copy of their own change; this problem allows at most ${fmtPct(STALE_MAX, 1)}.`);
  }
  const cards = h('section', { class: 'pl-slo-grid', 'aria-label': 'Score cards' },
    sloCard({ key: 'reliability', title: 'Reliability', iconId: 'ui.availability', pts: sc.reliability, max: 400, ok: a.actual >= a.target, target: fmtPct(a.target), actual: fmtPct(a.actual),
      lines: [a.actual >= a.target ? 'You met the uptime target.' : `${nines.toFixed(1)} "nines" short of the target. Each nine is ten times fewer failures.`, lateNote, 'Real user requests only; attacks and retries are not counted.'].filter(Boolean) }),
    sloCard({ key: 'latency', title: 'Speed', iconId: 'ui.latency', pts: sc.latency, max: 200, ok: okLat, flag: none || thin ? 'none' : null, target: latTarget, actual: none ? 'nothing served' : `${fmtPct(l.shareOk, 1)} of served interactive requests`,
      lines: none ? ['Not measured: nothing was served, so there is no speed to score.'] : [thinNote, `Compliance weights each interval by its served requests. To pass: aggregate compliance must reach ${Math.round(LAT_BAR * 100)}%, and every request type at least 80%.`,
        `Slowest moment: ${fmtMs(l.worstP99Ms)} (p99, approx.).${okLat && overTarget ? ' That slow stretch is inside the allowance: the required share of served requests still met the target.' : ''}`, ...worst.map(([t, v]) => v.measured === false ? `${catalog.requestById.get(t)?.name || t}: Not measured: no requests of this type were served. Target ${fmtMs(v.targetMs)}.` : `${catalog.requestById.get(t)?.name || t}: ${fmtPct(v.shareOk, 1)} of served requests within target. ${fmtMs(v.worstP99Ms ?? v.p99Ms)} at the slowest, target ${fmtMs(v.targetMs)}${okLat && (v.worstP99Ms ?? v.p99Ms) > v.targetMs ? ` (over it in ${fmtPct(1 - (v.shareOk ?? 1), 1)} of served requests, within the allowance)` : ''}`),
        slowTypes.length ? `Too often slow: ${slowTypes.join(', ')}.` : null, servedNote].filter(Boolean) }),
    sloCard({ key: 'safety', title: 'Data safety', iconId: 'ui.safety', pts: sc.safety, max: 200, ok: okSafe, flag: none || thin ? 'none' : null, target: problem?.requirements?.dataSafety === 'no-loss' ? 'no lost writes' : problem?.requirements?.dataSafety === 'rpo-1m' ? 'lose at most a minute of writes' : problem?.requirements?.dataSafety || '–', actual: `${fmtNum(s.lostWrites)} lost · ${fmtNum(s.duplicates)} duplicate`,
      lines: none ? ['Not measured: nothing was served, so no data was kept to score. Safety points are only awarded for served requests.'] : [thinNote, s.lostWrites ? `${fmtNum(s.lostWrites)} acknowledged writes were lost.` : 'No acknowledged write was lost.', s.duplicates ? `${fmtNum(s.duplicates)} duplicate effects (such as a double charge).` : 'No duplicate effects.',
        s.staleReads ? `${fmtNum(s.staleReads)} stale reads.` : null, compNames.length ? `Missing proof: ${compNames.join(', ')}.` : null, ...safeWhy, servedNote].filter(Boolean) }),
    sloCard({ key: 'cost', title: 'Cost', iconId: 'ui.cost', pts: sc.cost, max: 200, ok: okCost, flag: none || thin ? 'none' : null, target: `≤ ${fmtUsd(c.budget)} a month`, actual: `≈ ${fmtUsd(c.perMonth)} a month`,
      lines: none ? ['Not measured: nothing was served, so the money bought nothing to score.', ...topCost.map((x) => `${x.label}: ≈ ${fmtUsd(x.usd)}`), costNote] : [thinNote, c.perMonth <= c.budget ? (result.efficiency?.length ? 'Under budget, with avoidable idle capacity. See the capacity decision above.' : a.actual < a.target ? 'At or under budget.' : 'At or under budget: full points.') : `${Math.round((c.perMonth / c.budget - 1) * 100)}% over budget.`, ...topCost.map((x) => `${x.label}: ≈ ${fmtUsd(x.usd)}`), topCost.length ? costNote : null, servedNote].filter(Boolean) }));
  root.append(cards, h('p', { class: 'pl-footnote' }, approx('Every dollar and millisecond here is a sensible real-world approximation, not a quote.')));
  const checkpoint = renderCorrectness(problem?.correctness, correctnessAnswer, completion);
  if (checkpoint) root.append(checkpoint);

  root.append(h('p', { class: 'pl-muted', text: loadSummary(problem) }));

  // 4: timeline
  const stories = h('section', { class: 'pl-stories', 'aria-label': 'What happened' });
  root.append(h('section', { class: 'pl-sec' }, h('h3', { text: 'Your day' }),
    timeline(result, catalog, (i) => { const el = stories.querySelector('#pl-ev-' + i); el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); el?.focus({ preventScroll: true }); })));

  // 5: what happened
  stories.append(h('h3', { text: 'What happened' }));
  if (!(result.events || []).length) {
    const busy = busiestPart(result, catalog);
    stories.append(h('p', { class: 'pl-muted', text: 'No events hit this day. Smooth traffic is the easy part.' }));
    if (result.passed && busy) stories.append(h('p', { class: 'pl-muted pl-held', text: `Everything held. The busiest part was ${busy.name}, at ${busyWords(busy.m.peakUtil)} busy at its peak.` }));
  }
  (result.events || []).forEach((ev, i) => stories.append(eventStory(ev, i, result, catalog, demanding)));
  root.append(stories);
  const evidence = root.querySelector('.pl-sec:has(.pl-tl)');
  const summary = root.querySelector('.pl-verdict-sec');
  if (evidence) summary.after(evidence, stories);
  if (tryNext) summary.after(tryNext);
  const loopWarning = root.querySelector('.pl-loop-warning');
  if (loopWarning) summary.after(loopWarning);
  const details = h('details', { class: 'pl-score-details' }, h('summary', { text: 'Score details and calculations' }), cards);
  root.querySelector('.pl-learn')?.after(details);
  if (!details.isConnected) root.append(details);
  if (!result.passed && !warm) { const row = root.querySelector('.pl-score-row'); if (row) details.append(row); summary.append(h('p', { class: 'pl-small pl-muted', text: `Traffic score: ${Math.round(sc.total).toLocaleString('en-US')} / 1,000. Full score details below.` })); }

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
  if (result.nextStep?.text && !tryNext && !demanding) {
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
  gateTransfer(root, problem, result, catalog);
  host.append(root);
  mountFeedback(root, ctx, 'problem:' + problem.id, result);
}
