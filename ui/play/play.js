// In-problem screen: mountPlay() builds the canvas, toolbar, inspector, HUD, steps, hints, debrief and editorial.
import { metrics } from '../../core/metrics.js';
import { mountFeedback } from '../shell/feedback.js';
import { twistProblem } from '../../content/problems/twist.js';
import { createInterview, renderInterviewPrep, renderInterviewResult } from './interview.js';
import { pathLayout } from '../../render/layout.js';
import { fitInsets } from '../../render/fit.js';
import { renderDesignCheck } from './design-check.js';
import { createSim } from '../../sim/engine.js';
import { createScene } from '../../render/scene.js';
import { h, iconEl, clamp, clockLabel, snd as sndRaw, debounce, STATUS_NAMES, fmtMs, fmtPct } from './util.js';
import { createSteps } from './steps.js';
import { createReqCard } from './req-card.js';
import { renderClarify } from './clarify.js';
import { renderNumbers } from './numbers.js';
import { createToolbar } from './toolbar.js';
import { createInspector } from './inspector.js';
import { createHud } from './hud.js';
import { createHints } from './hints.js';
import { renderDebrief } from './debrief.js';
import { renderEditorial } from './editorial.js';
import { createTrafficPanel, DEFAULT_TRAFFIC, trafficInput } from './traffic-panel.js';
import { queueDrainAdvice } from './lesson-queue.js';
import { createRouteTrace } from './route-trace.js';
import { learningCredit } from './mastery.js';
import { previewLimits } from './capacity-preview.js';
import { renderCheckpointForm } from './correctness.js';
import { introPathHolds, repairInsertion } from './intro-path.js';
import { showVictory } from './victory.js';
import { carryRunIntoReport } from './run-transition.js';
import { transitionScreen } from '../shell/motion.js';
import { insertionLayout, createInsertionPlanner } from '../../render/placement.js';
import { connectionCaption } from './connection-caption.js';
import { goalPassed } from './goal-feedback.js';
import { replicaReadsActive, replicaWiringAdvice } from './lesson-replica.js';

const GRID = 20;
let connectTipShown = false; // the how-to-connect line shows once per visit outside lessons
const snap = (v) => Math.round(v / GRID) * GRID;

export async function mountPlay(hostEl, ctx, opts = {}) {
  const { catalog, bus, store } = ctx;
  const world = catalog.world;
  const mode = opts.mode || 'practice';
  const interview = !!opts.interview && mode === 'practice' && ['Medium', 'Hard'].includes(opts.problem?.difficulty);
  const interviewState = interview ? createInterview(opts.problem) : null;
  const isSandbox = mode === 'sandbox';
  const isLesson = mode === 'lesson' || mode === 'intro';
  const stepped = !isSandbox && !isLesson;          // the five-step flow
  const freeEdit = isSandbox || isLesson;           // structure can change while running
  const simMsPerWallMs = 3600000 / (world.sim.wallSecPerSimHourAt1x * 1000);
  const tickMs = world.sim.tickMs;
  const snd = (n, o) => sndRaw(ctx, n, o);
  const toast = (text, level = 'info', ms) => bus.emit('toast', { text, level, ms });

  // ---- state
  const S = {
    mode, seed: opts.seed || (isSandbox ? 'sandbox' : 'practice'), problem: null, sim: null, step: 'draw',
    selected: null, connectFrom: null, result: null, speed: 1, acc: 0, slowUntil: 0, sinceHud: 0, hintsUsed: 0,
    revealed: new Set(), guesses: {}, undo: [], redo: [], cur: '', errors: [], activeEvents: new Set(), destroyed: false,
    goalMs: 0, goalMet: false, lastClock: 0, prevBest: null, sandboxEvents: [], traffic: null, lastStatus: new Map(),
  };
  const perf = { simMs: 0, ticksPerFrame: 0, droppedTicks: 0 };
  const offs = [];
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  // ---- problem construction
  function baseRequirements(over = {}) {
    return { users: '', monthlyUsers: 0, peakRps: 1000, mix: { read: 0.8, write: 0.2 }, latencyP99Ms: { default: 300 }, availability: 0.99, dataSafety: 'best-effort', readYourWrites: false, compliance: [], budgetPerMonth: 5000, storageTb: 1, userRegions: { us: 1 }, homeRegion: 'us', ...over };
  }
  function pseudoProblem() {
    if (isSandbox) {
      const t = trafficInput(opts.traffic || (!opts.graph && store.get('draft.sandbox.sandbox', null)?.traffic));
      const sum = Object.values(t.rps).reduce((a, b) => a + b, 0);
      return { id: 'sandbox', title: 'Sandbox', difficulty: 'Easy', concepts: [], brief: 'Any component, any traffic, no game over.', clarify: [], numbers: [], hints: [], events: [], eventPool: [],
        requirements: baseRequirements({ peakRps: sum, mix: Object.fromEntries(Object.entries(t.rps).map(([k, v]) => [k, v / sum])), userRegions: t.regions, budgetPerMonth: 1e9 }),
        traffic: { curve: t.curve, sources: { 'web-browser': 0.6, 'mobile-app': 0.4 }, params: {} }, palette: null, starter: { nodes: [{ ref: 'web', type: 'web-browser', x: -400, y: -100, locked: true }, { ref: 'mobile', type: 'mobile-app', x: -400, y: 100, locked: true }, { ref: 'app', type: 'vm-fleet', x: -140, y: 0, units: 3 }, { ref: 'db', type: 'sql-primary', x: 100, y: 0 }], edges: [['web', 'app'], ['mobile', 'app'], ['app', 'db']] } };
    }
    const lesson = opts.lesson;
    const step = lesson?.steps?.[opts.stepIndex || 0] || {};
    const setup = step.setup || {};
    return { id: lesson?.id || mode, title: lesson?.title || 'Lesson', difficulty: 'Easy', concepts: [], brief: step.prompt || '', clarify: [], numbers: [], hints: step.hint ? [step.hint] : [],
      requirements: baseRequirements(setup.requirements), traffic: setup.traffic || { curve: 'flat', sources: { 'mobile-app': 1 } },
      starter: setup.starter || { nodes: [], edges: [] }, events: setup.events || [], eventPool: [], palette: setup.palette || null, goal: step.goal };
  }
  function withSource(p) {
    if (!(isSandbox || isLesson)) return p;
    const hasSource = p.starter.nodes.some((n) => catalog.elementById.get(n.type)?.kind === 'source');
    if (hasSource) return p;
    const srcs = Object.keys(p.traffic?.sources || { 'mobile-app': 1 });
    const nodes = srcs.map((t, i) => ({ ref: 'src' + i, type: t, x: -480, y: (i - (srcs.length - 1) / 2) * 170, locked: true }));
    return { ...p, starter: { nodes: [...nodes, ...p.starter.nodes], edges: p.starter.edges } };
  }

  // ---- DOM skeleton
  const root = h('div', { class: 'pl-root', 'data-mode': mode, 'data-step': 'draw', 'data-phase': 'build' });
  const stage = h('div', { class: 'pl-stage' });
  const top = h('div', { class: 'pl-top' });
  const left = h('div', { class: 'pl-left' });
  const right = h('div', { class: 'pl-right' });
  const panel = h('section', { class: 'pl-panel', hidden: '', 'aria-live': 'polite' });
  const scrim = h('div', { class: 'pl-scrim', hidden: '' });
  const debriefWrap = h('div', { class: 'pl-overlay pl-overlay--debrief', hidden: '', role: 'dialog', 'aria-label': 'Debrief' });
  const editorialWrap = h('div', { class: 'pl-overlay pl-overlay--editorial', hidden: '', role: 'dialog', 'aria-label': 'Editorial' });
  const goalChip = h('div', { class: 'pl-goal', hidden: '', role: 'status' });
  const caption = h('div', { class: 'pl-caption', hidden: '', role: 'status', 'aria-live': 'polite' });
  const slowNote = h('div', { class: 'pl-slow', hidden: '', role: 'status', 'aria-live': 'polite' });
  const issuesBox = h('div', { class: 'pl-issues', hidden: '' });
  const menu = h('div', { class: 'pl-menu', hidden: '', role: 'menu' });
  const modal = h('div', { class: 'pl-modal', hidden: '', role: 'dialog' });
  // Keyboard access to the diagram: a focusable layer over the canvas (arrows pick a part, C connects, Delete removes).
  const kb = h('div', { class: 'pl-kb', tabindex: '0', role: 'application', 'aria-label': 'Diagram. Arrow keys pick a part, C connects it to another part, Enter confirms, Delete removes, Escape cancels.' });
  const kbLive = h('div', { class: 'pl-sr', 'aria-live': 'polite' });
  const skip = h('button', { class: 'pl-skip', type: 'button', onClick: () => kb.focus() }, 'Skip to the diagram');
  if (interview) root.dataset.interview = 'true';
  root.append(skip, stage, kb, kbLive, scrim, top, left, right, panel, issuesBox, goalChip, caption, slowNote, menu, debriefWrap, editorialWrap, modal);
  hostEl.append(root);

  // ---- scene
  const scene = await createScene(stage, { catalog, palette: ctx.palette(), theme: ctx.theme(), reducedMotion: ctx.reducedMotion(), quality: ctx.settings.get('quality') || 'auto' });
  const routeTrace = createRouteTrace(root, catalog, scene);
  function refreshTrace() { routeTrace.update(S.sim, S.problem?.requirements?.mix, !isLesson && !interview && S.step === 'draw' && S.sim?.phase === 'build', adviceReady() && (mode !== 'practice' || S.problem?.difficulty === 'Easy')); }

  // ---- sim
  function makeSim(problem, graph) {
    const sim = createSim({ catalog, problem, seed: S.seed, mode });
    if (graph) sim.loadGraph(graph);
    sim.on('event', onSimEvent);
    sim.on('status', onSimStatus);
    return sim;
  }
  function onSimEvent({ eventId, phase, nodeIds }) {
    const base = catalog.eventById.get(eventId);
    const def = base && { ...base, ...(S.problem.events.find(e => e.id === eventId)?.text || {}) };
    if (!def) return;
    if (phase === 'start') {
      S.activeEvents.add(eventId);
      note('event-start', eventId);
      hud.showBanner(def, def.severity, ctx.reducedMotion());
      try { scene.flashEvent(eventId, nodeIds || [], def.severity); } catch { /* render optional */ }
      snd('event.' + clamp(def.severity, 1, 3));
      if (ctx.settings.get('autoSlowOnEvent') !== false && S.speed > 1) S.slowUntil = performance.now() + 3000;
    } else {
      S.activeEvents.delete(eventId);
      try { scene.flashEvent(eventId, null, 0); } catch { /* render optional */ }
      if (!S.activeEvents.size) hud.hideBanner();
    }
    bus.emit('play:event', { eventId, phase, nodeIds: nodeIds || [] });
  }
  function onSimStatus({ nodeId, status }) {
    const s = typeof status === 'number' ? STATUS_NAMES[status] : status;
    const prev = S.lastStatus.get(nodeId);
    S.lastStatus.set(nodeId, s);
    if (s === 'overload' && prev !== 'overload') snd('overload', { intensity: 0.6 });
    else if (prev === 'overload' && s === 'ok') snd('recover', { intensity: 0.6 });
  }

  // ---- history, graph changes
  const saveDraft = debounce(() => {
    if (isLesson || interview) return;
    const id = S.problem?.id;
    if (!id) return;
    store.set(`draft.${mode}.${id}`, { graph: S.sim.getGraph(), seed: S.seed, ...(isSandbox ? { traffic: trafficPanel?.get() || S.traffic } : {}), savedAt: Date.now() });
  }, 1000);

  function graph() { return S.sim.getGraph(); }
  let graphVersion = 0;
  function flowVersion() { try { return S.sim.flows().version; } catch { return 0; } }

  function afterChange() {
    graphVersion++;
    const g = graph();
    try { scene.sync(g, flowVersion()); } catch (e) { S.errors.push({ code: 'render', message: String(e?.message || e) }); }
    bus.emit('play:graph', { graph: g });
    saveDraft();
    refreshChecks();
    if (S.selected && !g.nodes.some((n) => n.id === S.selected)) select(null);
    else { inspector.refresh(); if (S.selected) inspector.update(S.sim.state().nodes.find(n => n.id === S.selected)); }
    if (isPhone() && S.selected) showFocusMap(S.selected, true);
    syncUndoButtons();
    releaseHold();
  }
  function releaseHold() {
    if (!S.hold || !S.booted || S.destroyed) return;
    if (isLesson && !ctx.reducedMotion()) {
      if (S.releasePending) return;
      S.releasePending = true;
      later(() => { S.releasePending = false; if (S.hold && !S.destroyed) startTraffic(); }, 220);
    } else startTraffic();
  }
  function commit() {
    S.editUntil = performance.now() + 1800;
    scene.stopCamera();
    const next = JSON.stringify(graph());
    if (next === S.cur) return;
    if (S.sim.phase === 'build' || freeEdit) { S.undo.push(S.cur); if (S.undo.length > 50) S.undo.shift(); S.redo.length = 0; }
    S.cur = next;
    afterChange();
    later(() => { if (!S.destroyed && performance.now() >= S.editUntil && nodesHidden()) refitSoon(); }, 1850);
  }
  function restore(json) {
    S.sim.loadGraph(JSON.parse(json));
    S.cur = json;
    afterChange();
  }
  function undo() { if (!canStructure() || !S.undo.length) return; S.redo.push(S.cur); restore(S.undo.pop()); snd('ui.tap'); }
  function redo() { if (!canStructure() || !S.redo.length) return; S.undo.push(S.cur); restore(S.redo.pop()); snd('ui.tap'); }
  const canStructure = () => S.sim.phase === 'build' || (freeEdit && S.sim.phase !== 'done');
  function structureBlocked() {
    if (canStructure()) return false;
    toast('Adding and removing parts is for the Draw step. Press the back arrow to return to drawing.', 'warn');
    snd('miss');
    return true;
  }

  function refreshChecks() {
    let issues = [], est = null;
    try { issues = S.sim.validate() || []; } catch (e) { S.errors.push({ code: 'validate', message: String(e?.message || e) }); }
    try {
      est = S.sim.estimate();
      if (S.problem.warmUp) {
        const normal = createSim({ catalog, problem: { ...S.problem, requirements: { ...S.problem.requirements, peakRps: S.problem.normalPeakRps } } });
        normal.loadGraph(graph());
        est = { ...normal.estimate(), perMonth: est.perMonth, lines: est.lines };
      }
    } catch { /* estimate is a nicety */ }
    S.issues = issues;
    S.est = est;
    S.nodeStates = S.sim.state().nodes;
    try { scene.setValidation(issues); } catch { /* render optional */ }
    let sizes = []; try { sizes = riskyIssues().filter((i) => i.fix); } catch { /* optional */ }
    hud.setBuild(est, diagnosticIssues(), interview ? [] : sizes, { advice: !interview && adviceReady(), limits: previewLimits(S.problem, graph(), est, catalog) });
    paintIssues();
    let overview = root.querySelector('.pl-overview');
    if (!overview) { overview = h('div', { class: 'pl-overview' }); root.append(overview); }
    if (isPhone() && graph().nodes.length) {
      const choose = h('select', { class: 'pl-input', 'aria-label': 'Inspect a branch', onChange: e => {
        const id = e.target.value; if (!id) return;
        select(id); inspector.fold(true);
        const g = graph(), nodeIds = [id, ...g.edges.filter(e => e.kind === 'flow' && (e.from === id || e.to === id)).flatMap(e => [e.from,e.to])];
        const a = freeArea(); scene.fit({ l: 36, r: 36, t: a.t + 28, b: a.b + 32 }, true, { nodeIds, minZ: .55, maxZ: .9 });
      } }, h('option', { value: '', text: 'Inspect a branch…' }), graph().nodes.map(n => h('option', { value: n.id, text: `${n.id} · ${catalog.elementById.get(n.type)?.name || n.type}` })));
      overview.replaceChildren(...(graph().nodes.length > 1 ? [cameraMap()] : []), choose, h('button', { class: 'pl-btn', type: 'button', onClick: () => { select(null); fitAll(); }, text: 'Fit all' }));
    }
    overview.hidden = !isPhone();
    updateCameraMap();
    refreshTrace();
  }
  // Parts the peak estimate says will run past 100 percent, as list items that select the part.
  // What to change on a part that will not hold: more of its units (named the way the part names them), a bigger size,
  // or less load.
  function lever(type, compute) {
    const el = catalog.elementById.get(type);
    const knobs = el?.knobs || [];
    const l = el?.units?.label || 'unit';
    const word = /s$/.test(l) ? l : l + 's';
    if (knobs.includes('units') && (el?.units?.max ?? 1) > 1) return `Add ${word}${compute && knobs.includes('autoscale') ? ' or turn on autoscaling' : ''}, or take load off it.`;
    if (knobs.includes('tier')) return 'Use a bigger size, or take load off it.';
    return 'Take load off it, for example with a cache or a queue in front.';
  }
  // a server group that is too small: name the setting and the count that would keep it near 70 percent busy
  function sizeFixFor(nodeId, util) {
    const g = graph().nodes.find((x) => x.id === nodeId), el = g && catalog.elementById.get(g.type);
    if (!el || el.kind !== 'compute' || !(el.knobs || []).includes('units') || !((el.units?.max ?? 1) > 1) || !(util > 0.85)) return null;
    const need = Math.min(el.units.max, Math.max((g.units || 1) + 1, Math.ceil((util * (g.units || 1)) / 0.7)));
    if (!(need > (g.units || 1))) return null;
    const lw = el.units.label || 'unit', word = (/s$/.test(lw) ? lw : lw + 's').replace(/^./, (c) => c.toUpperCase());
    return { nodeId, units: need, label: `Set ${word} to ${need}`, word, now: g.units || 1 };
  }
  function riskyIssues() {
    const arr = Array.isArray(S.est?.nodes) ? S.est.nodes : [];
    const nameOf2 = (n) => { const g = graph().nodes.find((x) => x.id === n.id); return g?.label || catalog.elementById.get(n.type)?.name || n.type; };
    // a server group that is too small: name the setting and offer the count that would keep it near 70 percent busy
    const sizeFix = (n) => sizeFixFor(n.id, n.util);
    const out = arr.filter((n) => n.holds === false).map((n) => {
      const fix = interview || S.problem.difficulty !== 'Easy' || !adviceReady() ? null : sizeFix(n);
      const base = `${nameOf2(n)} would run at about ${Math.round(n.util * 100)} percent at the normal peak. `;
      return { level: 'warn', code: 'peak-risk', nodeId: n.id, ...(fix ? { fix } : {}),
        message: base + (interview || !adviceReady() ? 'Predict how that affects requests before choosing a repair.' : fix ? `Open its ${fix.word} setting (now ${fix.now}) and raise it to about ${fix.units}. If Autoscale is on, raise "Never fewer than" too.` : lever(n.type, catalog.elementById.get(n.type)?.kind === 'compute')) };
    });
    const sp = S.est?.spike;
    if (!out.length && sp && !sp.holds) {
      const f = Math.round(sp.factor * 10) / 10;
      for (const n of sp.nodes || []) {
        out.push({ level: 'warn', code: 'spike-risk', nodeId: n.id,
          message: `${nameOf2(n)} would run at about ${Math.round(n.util * 100)} percent in the ${sp.name.toLowerCase()} (${f} times the traffic).${interview || !adviceReady() ? '' : ' ' + lever(n.type, catalog.elementById.get(n.type)?.kind === 'compute')}` });
      }
      if (!out.length) out.push({ level: 'warn', code: 'spike-risk', message: `About ${Math.round((sp.successShare ?? 1) * 1000) / 10} percent of requests would succeed in the ${sp.name.toLowerCase()} (${f} times the traffic).` });
    }
    return out;
  }
  function diagnosticIssues() {
    if (!interview && adviceReady()) return S.issues || [];
    const facts = {
      'no-source': 'No request sources are present.',
      'no-source-type': 'No source emits this request type.',
      'source-type-unserved': 'This source has no usable route for this request type.',
      'type-unserved': 'This request type has no usable route.',
      'requires-missing': 'This request type does not reach all required destinations.',
      disconnected: 'This part has no connections.',
      'zones-units': 'The configured zone count exceeds the unit count.',
      'queue-no-consumer': 'This queue has no consumers.',
      'replica-unattached': 'This replica has no primary connection.',
      'observer-needs': 'This observer has an unmet connection requirement.',
      'no-standby': 'This part has no replicated standby.',
      'db-connections': 'Estimated connections exceed this part’s connection limit.',
      'dr-same-region': 'The standby and protected parts use the same region.',
      'cache-no-origin': 'Cache misses have no origin on this path.',
      'flow-cycle': 'A delivery loop includes a closing link that the run ignores. Trace where a request would repeat.',
      'compliance-missing': 'A required compliance check has no proof in this graph.',
    };
    return (S.issues || []).map(i => {
      const n = graph().nodes.find(n => n.id === i.nodeId);
      const label = n && (n.label || catalog.elementById.get(n.type)?.name);
      const proof = i.code === 'compliance-missing' && /Missing proof for "([^"]+)"/.exec(i.message)?.[1];
      return { level: i.level, code: i.code, nodeId: i.nodeId, type: i.type, source: i.source,
        message: [label, i.type && catalog.requestById.get(i.type)?.plural, proof ? `${proof}: required proof is missing from this graph.` : facts[i.code] || 'A design check is unresolved.'].filter(Boolean).join(': ') };
    });
  }
  function adviceReady() {
    if (transferPending()) return false;
    return mode !== 'practice' || S.triedId === S.problem?.id || ctx.progress?.get?.(S.problem?.id)?.attempts > 0;
  }
  function transferPending() { return S.problem?.twistDay && S.pendingTransfer && !S.pendingTransfer.transferReflection; }
  function paintIssues() {
    issuesBox.replaceChildren();
    // errors first, then missing proof (it costs Data safety points), then the rest
    const rank = (i) => (i.level === 'error' ? 0 : i.code === 'compliance-missing' ? 1 : 2);
    const all = [...diagnosticIssues(), ...riskyIssues()].map((i, k) => [i, k]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
    const list = all.filter((i) => i.level !== 'info' || all.length < 5);
    if (!list.length) { issuesBox.hidden = true; return; }
    issuesBox.append(h('div', { class: 'pl-issues-h' }, iconEl('ui.warn', 16), h('b', { text: 'Heads up' }),
      h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Hide', onClick: () => { issuesBox.hidden = true; } }, iconEl('ui.close', 16))));
    const rows = h('div', { class: 'pl-issues-list' });
    list.slice(0, 10).forEach((i) => {
      const row = h('button', { class: 'pl-issue pl-issue--' + i.level, type: 'button', onClick: () => i.nodeId && select(i.nodeId) }, iconEl(i.level === 'error' ? 'ui.error' : i.level === 'warn' ? 'ui.warn' : 'ui.info', 14), h('span', { class: 'pl-issue-msg', text: i.message }));
      if (!i.fix) { rows.append(row); return; }
      const apply = h('button', { class: 'pl-issue-fix', type: 'button', 'aria-label': i.fix.label, onClick: () => applySizeFix(i.fix) }, i.fix.label);
      rows.append(h('div', { class: 'pl-issue-wrap' }, row, apply));
    });
    issuesBox.append(rows);
  }

  // ---- visible canvas area (the parts of the stage not covered by panels)
  const isPhone = () => !!globalThis.matchMedia?.('(max-width: 719px)').matches;
  function freeArea() {
    const r = stage.getBoundingClientRect();
    const box = (el) => (el && !el.hidden && el.offsetParent ? el.getBoundingClientRect() : null);
    let l = 0, t = 0, rr = 0, b = 0;
    // a small panel in a corner (a folded card, the Add component button) covers only itself, not a band of the canvas
    const blocks = [];
    const corner = (x) => blocks.push({ x: x.left - r.left, y: x.top - r.top, width: x.width, height: x.height });
    const hb = box(hud.el), tb = box(top);
    if (isPhone()) {
      if (hb) t = Math.max(t, hb.bottom - r.top);
      const traceBox = box(root.querySelector('.pl-trace'));
      if (traceBox) t = Math.max(t, traceBox.bottom - r.top);
      if (tb) t = Math.max(t, tb.bottom - r.top);
      for (const el of [caption, goalChip, bannerEl()]) { const overlay = box(el); if (overlay && overlay.top < r.top + r.height / 2) t = Math.max(t, overlay.bottom - r.top + 4); }
      b = 72;
      // an open parts drawer, and the Add component button riding on its edge, are not free canvas either
      const tbBox = box(toolbar.el);
      if (tbBox && tbBox.height > 120 && toolbar.el.classList.contains('pl-toolbar--open')) b = Math.max(b, r.bottom - tbBox.top + 56);
      // whatever floats at the bottom (the folded requirements strip, the sandbox traffic panel) is not free canvas
      const low = [...right.children].map(box).filter((x) => x && x.height);
      if (low.length) b = Math.max(b, r.bottom - Math.min(...low.map((x) => x.top)));
    } else {
      if (tb) t = Math.max(t, tb.bottom - r.top);
      if (hb) b = Math.max(b, r.bottom - hb.top);
      const goalBox = box(goalChip);
      if (goalBox) t = Math.max(t, goalBox.bottom - r.top + 8);
      const lb = box(toolbar.el);
      // a folded parts list that is only a button (small tablets) takes a corner of the top, not the whole left side
      if (lb && lb.width && lb.height < r.height * 0.3) corner(lb);
      else if (lb && lb.width) l = Math.max(l, lb.right - r.left);
      if (isLesson) { const cb = box(caption); if (cb) b = Math.max(b, r.bottom - cb.top + 12); }
      const rightKids = [...right.children].map(box).filter(Boolean);
      // a short stack of panels (a folded traffic panel) only takes the top corner; a tall one takes the whole right side
      const rightLow = rightKids.length ? Math.max(...rightKids.map((x) => x.bottom)) - r.top : 0;
      if (rightKids.length && rightLow < r.height * 0.3) {
        const left = Math.min(...rightKids.map((x) => x.left)), topEdge = Math.min(...rightKids.map((x) => x.top));
        corner({ left, top: topEdge, width: r.right - left, height: rightLow + r.top - topEdge });
      } else if (rightKids.length) rr = Math.max(rr, r.right - Math.min(...rightKids.map((x) => x.left)));
    }
    const area = { l, t, r: rr, b, w: r.width, h: r.height, blocks };
    // Extra room a fit keeps free beyond the panels (worked out only when a fit asks for it).
    area.room = () => {
      // where a day can start at any moment (the sandbox), the status bar's running height is kept free from the start
      const grow = !stepped && !isLesson ? hudGrowth() : 0, phone = isPhone();
      // while a day runs, the event banner drops into the top row: the diagram starts below where it will sit
      return { t: Math.max(t, bannerReserve(area)) + (phone ? grow : 0), b: b + (phone ? 0 : grow) };
    };
    scene.setCaptionArea?.({ l: l + 8, t: t + 8, r: rr + 8, b: b + 8, ...(blocks.length ? { blocks: blocks.map((k) => ({ x: k.x - 8, y: k.y - 8, width: k.width + 16, height: k.height + 16 })) } : {}) });
    return area;
  }
  // The layout of the panels changed with the step (the parts list folds, the status bar grows): the diagram follows,
  // unless the player has taken the view over by panning or zooming.
  function refitForStep() {
    if (!stepped || S.destroyed || S.viewManual || !graph().nodes.length) return;
    try { syncHud(); } catch { /* not laid out yet */ }
    fitView(true);
  }
  const bannerEl = () => root.querySelector('.pl-banner');
  // How much taller the status bar becomes once a day runs: measured in place, between two frames.
  function hudGrowth() {
    if (S.sim?.phase !== 'build') return 0;
    try {
      const el = hud.el, was = el.dataset.phase, before = el.offsetHeight;
      el.dataset.phase = 'running';
      const after = el.offsetHeight;
      el.dataset.phase = was;
      // the meters gain a history line with the first measurements
      return after > before ? after - before + 28 : 0;
    } catch { return 0; }
  }
  // Whether a part, or the name under it, now sits under a panel.
  function diagramCovered() {
    try {
      const a = freeArea(), o = scene.worldToScreen(0, 0), half = 36 * (scene.worldToScreen(1, 0).x - o.x);
      const room = a.room();
      return graph().nodes.some((n) => {
        const p = scene.worldToScreen(n.x, n.y);
        return p.x - half < a.l + 4 || p.x + half > a.w - a.r - 4 || p.y - half < room.t + 2 || p.y + half + 22 > a.h - room.b - 8
          || a.blocks.some((k) => p.x + half > k.x && p.x - half < k.x + k.width && p.y + half > k.y && p.y - half < k.y + k.height);
      });
    } catch { return false; }
  }
  function bannerReserve(a) {
    if (!stepped || !['running', 'paused'].includes(S.sim?.phase)) return 0;
    // on a phone the event strip is one line under the status bar
    if (isPhone()) { const shown = bannerEl(); return shown && !shown.hidden ? 0 : a.t + 44; }
    const docked = root.classList.contains('pl-slot');
    const width = Math.min(560, docked ? parseFloat(root.style.getPropertyValue('--pl-slot-w')) || 0 : a.w - 32);
    if (!(width > 0)) return 0;
    // a title line and a description of about 110 characters, at the banner's type size; the fit adds its own padding below
    const lines = Math.max(1, Math.ceil(110 / Math.max(20, (width - 74) / 6.6)));
    return (docked ? 12 : 118) + 41 + lines * 19 + 12 - 20;
  }
  function fitView(animate = true, minZoom = null, automatic = false) {
    if (S.connectFrom || (automatic && (S.booted || performance.now() < Math.max(S.editUntil || 0, S.manualViewUntil || 0)))) return;
    const a = freeArea();
    const phone = isPhone();
    // clear space kept above the first row and below the last name
    const pad = phone ? 10 : 20, low = phone ? 24 : 30;
    // names sit under the parts and are about 80 px wide, so the sides keep room for half a name and the bottom for a name line
    const side = phone ? 40 : Math.max(pad, 46);
    const room = a.room ? a.room() : a;
    let insets = { l: a.l + side, t: room.t + pad, r: a.r + side, b: room.b + low };
    // a big build zooms out far enough to sit between the panels instead of running underneath them; on a big screen the panels
    // are scaled up, so a small diagram may grow with them
    const uiScale = () => Math.min(2, Math.max(1, parseFloat(globalThis.getComputedStyle?.(root)?.getPropertyValue?.('--z')) || 1));
    const zoom = phone ? { minZ: minZoom ?? 0, maxZ: 0.9, reserveY: 0 } : { minZ: minZoom ?? 0, maxZ: (mode === 'lesson' ? 1.35 : 1.4) * uiScale() };
    S.viewManual = false;
    try {
      const bounds = phone || a.blocks?.length ? scene.bounds?.() : null;
      // On a phone a design far too wide for the screen opens at a size where names still fit under their parts, and
      // pans; Fit all shows the whole of it.
      if (phone && bounds && minZoom == null) {
        const natural = Math.min((a.w - insets.l - insets.r) / (bounds.maxX - bounds.minX), (a.h - insets.t - insets.b) / (bounds.maxY - bounds.minY));
        if (natural < 0.21) zoom.minZ = 0.25;
      }
      const box = a.blocks?.length ? bounds : null;
      if (box) insets = fitInsets(box, { w: a.w, h: a.h }, insets, a.blocks, zoom.maxZ, { x: side, y: pad });
      scene.fit(insets, animate, zoom);
    } catch { try { scene.fit(); } catch { /* optional */ } }
  }
  function fitEntry() {
    syncHud();
    fitView(false);
  }
  let fitAllTimer = 0;
  function fitAll() {
    S.manualViewUntil = performance.now() + 4000;
    if (isPhone()) { inspector.fold(true); toolbar.el.classList.remove('pl-toolbar--open'); reqCard?.toggle(false); trafficPanel?.fold(true); }
    clearTimeout(fitAllTimer); timers.delete(fitAllTimer);
    fitAllTimer = later(() => { fitAllTimer = 0; fitView(true, 0); }, 40);
  }
  function placeAtCentre(type) {
    const a = freeArea();
    const cx = a.l + (a.w - a.l - a.r) / 2, cy = a.t + (a.h - a.t - a.b) / 2;
    const w = scene.screenToWorld(cx, cy);
    // a tap places the part in the nearest free spot; on a phone the settings sheet stays closed so the part is visible
    const id = placeComponent(type, w.x, w.y, null, { select: !isPhone(), autoPlace: true });
    if (id) { announce(`${catalog.elementById.get(type)?.name || type} placed. Press C on the diagram to connect it.`);  }
    return id;
  }

  // ---- spacing for automatic placement and insertion
  const GAP_X = 180, GAP_Y = 160; // centre to centre, so icons and their labels stay readable
  const overlaps = (x, y, skip) => graph().nodes.some((n) => n.id !== skip && Math.abs(n.x - x) < GAP_X && Math.abs(n.y - y) < GAP_Y);
  function freeSpot(x, y, skip) {
    x = snap(x); y = snap(y);
    if (!overlaps(x, y, skip)) return { x, y };
    const cand = [];
    for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) if (i || j) cand.push([i * 40, j * 40]);
    cand.sort((p, q) => Math.hypot(p[0], p[1] * 1.2) + (p[0] < 0 ? 1 : 0) - Math.hypot(q[0], q[1] * 1.2) - (q[0] < 0 ? 1 : 0)); // ties go to the right, away from the clients
    for (const [dx, dy] of cand) if (!overlaps(x + dx, y + dy, skip)) return { x: x + dx, y: y + dy };
    return { x, y };
  }
  // Insertion keeps the source anchored and pushes only faces that need room.
  function makeRoomOnEdge(edgeId) {
    const layout = insertionLayout(graph(), edgeId);
    if (!layout) return null;
    for (const n of layout.moves) S.sim.moveNode(n.id, n.x, n.y);
    return layout;
  }

  // A part that lands under a panel (the brief, the inspector) is brought into the free part of the canvas.
  function revealIfHidden(x, y) {
    try {
      const sp = scene.worldToScreen ? scene.worldToScreen(x, y) : null;
      if (!sp) return;
      const a = freeArea();
      const under = (k) => sp.x > k.x - 30 && sp.x < k.x + k.width + 30 && sp.y > k.y - 30 && sp.y < k.y + k.height + 30;
      if (!isPhone()) {
        // the part steps out from under the panel that covers it; the rest of the view keeps its place and its zoom
        const cover = a.blocks.find(under);
        const insets = { l: a.l, t: a.t, r: a.r, b: a.b };
        if (cover) { if (cover.x + cover.width / 2 > a.w / 2) insets.r = Math.max(insets.r, a.w - cover.x); else insets.l = Math.max(insets.l, cover.x + cover.width); }
        // room for the part, its connect handle and its name at the current zoom
        const zoom = scene.worldToScreen(1, 0).x - scene.worldToScreen(0, 0).x, edge = 74 * zoom + 14;
        later(() => { if (!S.destroyed && !S.connectFrom) { try { scene.reveal(x, y, insets, { l: edge, r: edge, t: 36 * zoom + 44, b: 36 * zoom + 56 }); } catch { /* optional */ } } }, 60);
        return;
      }
      if (sp.x < a.l + 30 || sp.x > a.w - a.r - 30 || sp.y < a.t + 30 || sp.y > a.h - a.b - 30) later(() => {
        if (S.destroyed || S.connectFrom || performance.now() < (S.editUntil || 0)) return;
        if (S.selected) {
          const area = freeArea();
          scene.fit({ l: 38, r: 38, t: area.t + 26, b: area.b + 26 }, true, { focusId: S.selected, maxZ: .9 });
        } else fitView(true);
      }, 60);
    } catch { /* optional */ }
  }
  let announcementTimer = null;
  function announce(text) {
    clearTimeout(announcementTimer); timers.delete(announcementTimer);
    kbLive.textContent = '';
    announcementTimer = later(() => { kbLive.textContent = text; }, 30);
  }

  // ---- building actions
  function placeComponent(type, x, y, edgeId = null, opt = {}) {
    if (structureBlocked()) return null;
    const el = catalog.elementById.get(type);
    if (!el) { toast('Unknown component.', 'warn'); return null; }
    if (opts.lesson?.id === 'replication-lag' && type === 'sql-replica' && edgeId && !canSplice(type, edgeId)) {
      showCaption(replicaWiringAdvice);
      toast(replicaWiringAdvice, 'info', 7000);
      return null;
    }
    try {
      let pos = null;
      const wiring = wiringFor(type, edgeId);
      if (wiring?.kind === 'side') pos = wiring.position;
      else if (wiring) pos = makeRoomOnEdge(edgeId);
      else edgeId = null;
      const want = { x: snap(pos ? pos.x : x), y: snap(pos ? pos.y : y) };
      const covers = !edgeId && graph().nodes.some((n) => Math.abs(n.x - want.x) < 40 && Math.abs(n.y - want.y) < 40);
      const at = (opt.autoPlace && !edgeId) || covers ? freeSpot(want.x, want.y, null) : want;
      const id = S.sim.addNode(type, at.x, at.y, {});
      if (edgeId) spliceInto(id, type, edgeId);
      toolbar.clearTransient();
      toolbar.el.classList.add('pl-toolbar--folded');
      commit();
      snd('place', { category: el.category });
      note('place', type);
      if (!edgeId && !opt.autoPlace) showCaption('Placed here. Select the part and use "Connect to…" to wire it. Drag it to leave room for its name.', 7000);
      if (opt.select !== false && mode !== 'lesson') { select(id); if (isLesson && isPhone()) setTimeout(() => { if (S.selected === id) select(null); }, 1400); }
      connectCoach(id, el);
      revealIfHidden(at.x, at.y);
      if (S.sim.phase !== 'build') {
        const c = el.cost || {};
        const n = graph().nodes.find((q) => q.id === id);
        const fixed = (c.base || 0) + (c.perUnit || 0) * (n?.units || 1);
        toast(fixed > 0 ? `${el.name} added: about +${fmtMoney(fixed)} a month (approx.).` : `${el.name} added: billed by use.`, 'info', 2200);
      }
      return id;
    } catch (e) { toast(e.message || 'Could not place that.', 'warn'); snd('miss'); return null; }
  }
  function connect(from, to) {
    if (structureBlocked()) return null;
    try {
      const id = S.sim.connect(from, to);
      commit();
      snd('connect');
      note('connect', { from, to });
      scene.confirmConnection(id);
      const edge = graph().edges.find(e => e.id === id);
      showCaption(connectionCaption(edge, graph(), catalog), 2600);
      // once a part is connected its description has done its job: fold it so it stops covering the part the learner just placed
      if (isLesson && (S.selected === from || S.selected === to)) { try { inspector.fold(true); } catch { /* optional */ } }
      return id;
    } catch (e) { toast(e.message || 'Those cannot be connected.', 'warn'); snd('miss'); return null; }
  }
  function canSplice(type, edgeId) {
    return !!wiringFor(type, edgeId);
  }
  const wiringFor = createInsertionPlanner({ graph, version: () => graphVersion, catalog,
    canConnect: (a, b) => S.sim.canConnect(a, b), freeSpot });
  scene.setInsertionPreview(wiringFor);
  // A part placed on its own gets one line on how to connect it: the first time in a session, and every time in a lesson.
  function connectCoach(id, el) {
    if (opts.lesson?.id === 'replication-lag' && el.id === 'sql-replica') { showCaption(replicaWiringAdvice); return; }
    if (waiters.some(w => w.spec.path && w.spec.type === el.id)) { S.insertionRetry?.(); return; }
    const g = graph();
    if (g.edges.some((e) => e.from === id || e.to === id)) return;
    if (!isLesson && (connectTipShown || store.get('seenConnectHandle', false))) return;
    connectTipShown = true;
    if (!isLesson) store.set('seenConnectHandle', true);
    const lessonTip = isLesson ? ` ${el.name} is not connected yet: drop it onto the line where it belongs, or connect it.` : '';
    const touch = isPhone() || !!globalThis.matchMedia?.('(pointer: coarse)').matches;
    showCaption((touch ? `${lessonTip} Tap the part, then "Connect to…", then tap the next part.` : `${lessonTip} Drag from the arrow dot on a part's edge to the next part, or select it and press "Connect to…".`).trim(), 7000);
  }
  // Side calls return to the caller and keep its delivery route.
  function spliceInto(id, type, edgeId) {
    const plan = wiringFor(type, edgeId);
    if (!plan) return;
    const e = plan.edge;
    try {
      S.sim.connect(e.from, id);
      if (plan.kind === 'route') { S.sim.connect(id, e.to); S.sim.disconnect(edgeId); }
      note('connect', { from: e.from, to: id });
    } catch { /* keep the plain placement */ }
  }
  const fmtMoney = (v) => '$' + Math.round(v).toLocaleString('en-US');
  function setKnob(nodeId, knob, value) {
    if (S.sim.phase !== 'build' && !editableKnobs()) return;
    const before = graph().nodes.find((q) => q.id === nodeId);
    try { S.sim.setKnob(nodeId, knob, value); } catch (e) { toast(e.message || 'That setting is not allowed.', 'warn'); return; }
    if (knob === 'units' && before && S.sim.phase !== 'build') {
      const el = catalog.elementById.get(before.type);
      const d = (el?.cost?.perUnit || 0) * ((Number(value) || 0) - (before.units || 0));
      if (d) toast(`${d > 0 ? '+' : '−'}${fmtMoney(Math.abs(d))} a month for ${Math.abs((Number(value) || 0) - (before.units || 0))} ${d > 0 ? 'more' : 'fewer'} (approx.)`, 'info', 2000);
    }
    commit();
    snd('ui.tap', { intensity: 0.4 });
    note('knob', { knob, nodeId, value: knob === 'units' ? Number(value) : value });
  }
  // One tap from a heads-up: more units, and a higher autoscale floor when autoscaling is on.
  function applySizeFix(fix) {
    if (S.problem.difficulty === 'Easy') S.workedRepair = true;
    if (interview) return;
    const n = graph().nodes.find((x) => x.id === fix.nodeId);
    if (!n) return;
    setKnob(fix.nodeId, 'units', fix.units);
    const a = n.knobs?.autoscale;
    if (a?.on) setKnob(fix.nodeId, 'autoscale', { ...a, min: Math.max(a.min || 1, fix.units), max: Math.max(a.max || 1, fix.units) });
    announce(`${fix.word} set to ${fix.units}.`);
    scene.confirmRepair(fix.nodeId);
  }
  function editableKnobs() { return !interview && mode !== 'challenge'; }
  function removeNode(id) {
    if (structureBlocked()) return;
    const n = graph().nodes.find((x) => x.id === id);
    if (!n || n.locked) return;
    try { S.sim.removeNode(id); } catch (e) { toast(e.message, 'warn'); return; }
    commit(); snd('remove');
  }
  function removeEdge(id) {
    if (structureBlocked()) return;
    try { S.sim.disconnect(id); } catch (e) { toast(e.message, 'warn'); return; }
    commit(); snd('remove');
    note('connect', {});
  }
  function duplicate(id) {
    if (structureBlocked()) return;
    const n = graph().nodes.find((x) => x.id === id);
    if (!n || n.locked) return;
    try {
      const at = freeSpot(n.x + 40, n.y + 40, null);
      const nid = S.sim.addNode(n.type, at.x, at.y, { units: n.units, zones: n.zones, region: n.region, tier: n.tier, knobs: { ...(n.knobs || {}) } });
      commit(); snd('place', { category: catalog.elementById.get(n.type)?.category }); select(nid);
    } catch (e) { toast(e.message, 'warn'); }
  }
  function moveNode(id, x, y) {
    const at = { x: snap(x), y: snap(y) };
    try { S.sim.moveNode(id, at.x, at.y); } catch { return; }
    if (overlaps(at.x, at.y, id)) showCaption('Placed here. Drag the part to leave room for its name.', 5000);
    commit();
  }

  function designToGraph(design) {
    const starterRefs = new Set((S.problem.starter?.nodes || []).filter((n) => n.locked).map((n) => n.ref));
    const types = new Map(design.graph.nodes.map((n) => [n.ref, n.type]));
    return {
      nodes: design.graph.nodes.map((n) => {
        const el = catalog.elementById.get(n.type);
        return { id: n.ref, type: n.type, x: n.x, y: n.y, units: n.units ?? el?.units?.default ?? 1, zones: n.zones ?? 1, region: n.region ?? 'problem', tier: n.tier ?? 'M', knobs: n.knobs || {}, ...(starterRefs.has(n.ref) ? { locked: true } : {}) };
      }),
      edges: design.graph.edges.map(([a, b]) => {
        let kind = 'flow';
        try { kind = S.sim.canConnect(types.get(a), types.get(b))?.kind || 'flow'; } catch { /* default */ }
        return { id: `${a}>${b}`, from: a, to: b, kind };
      }),
    };
  }
  // a design with no player changes since "Load and run it" is a reference run: shown, never recorded
  function graphSig() {
    try {
      const g = S.sim.getGraph();
      const ord = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().map((k) => [k, ord(o[k])]) : o);
      return JSON.stringify([
        (g.nodes || []).map((n) => [n.id, n.type, n.units, n.zones, n.region, n.tier, ord(n.knobs)]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        (g.edges || []).map((e) => `${e.from}>${e.to}`).sort(),
      ]);
    } catch { return null; }
  }
  function loadDesign(design, { run = false } = {}) {
    S.workedRepair = true;
    closeEditorial();
    if (S.sim.phase !== 'build' && resetToDraw() === false) return;
    S.sim.loadGraph(designToGraph(design));
    for (const n of pathLayout(graph(), catalog)) S.sim.moveNode(n.id, n.x, n.y);
    commit();
    S.refSig = graphSig();
    fitView();
    go('draw');
    toast(`Loaded "${design.name}". You can change it and run it.`, 'ok');
    if (run) startTraffic();
  }

  // ---- selection and interaction
  function select(id) {
    const was = S.selected;
    S.selected = id;
    try { scene.setSelection(id); } catch { /* render optional */ }
    if (id) { inspector.show(id); inspector.update(S.sim.state().nodes.find(n => n.id === id)); toolbar.el.classList.remove('pl-toolbar--open'); try { reqCard?.toggle(false); } catch { /* not built yet */ } } else inspector.hide();
    // on small screens the sheet that opens must not cover the part it is about
    if (id) {
      later(() => { const n = graph().nodes.find((q) => q.id === id); if (n && !S.destroyed && S.selected === id) revealIfHidden(n.x, n.y); }, 120);
    }
    root.classList.toggle('pl-has-selection', !!id);
    if (id && canStructure() && !S.captionNext && caption.hidden && !store.get('seenConnectHandle', false)) {
      store.set('seenConnectHandle', true);
      showCaption('Drag the port to connect. Drag the body to move.', 6500);
    }
    // in a lesson the diagram steps out from under the settings panel, and settles back once it closes
    if (isPhone()) showFocusMap(id);
    bus.emit('play:select', { nodeId: id });
  }
  function cameraMap() {
    const button = h('button', { class: 'pl-camera-map', type: 'button', 'aria-label': 'System overview. Fit the whole diagram', onClick: () => { select(null); fitAll(); } });
    const g = graph(), minX = Math.min(...g.nodes.map(n => n.x))-70, minY = Math.min(...g.nodes.map(n => n.y))-70;
    const width = Math.max(...g.nodes.map(n => n.x))-minX+70, height = Math.max(...g.nodes.map(n => n.y))-minY+100;
    const byId = new Map(g.nodes.map(n => [n.id,n]));
    // Parts and wires are drawn big enough to read at 64 by 44 pixels: a part is about an eighth of the longer side.
    const unit = Math.max(44, Math.max(width, height) / 8), half = unit / 2;
    button.innerHTML = `<svg viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="pl-cm-wires" stroke-width="${unit / 5}">${g.edges.map(e => { const a=byId.get(e.from),b=byId.get(e.to); return a&&b?`<path d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`:''; }).join('')}</g>${g.nodes.map(n=>`<rect class="pl-cm-part" x="${n.x-half}" y="${n.y-half}" width="${unit}" height="${unit}" rx="${unit / 6}" stroke-width="${unit / 12}"/>`).join('')}<rect class="pl-camera-window" vector-effect="non-scaling-stroke"/></svg>`;
    return button;
  }
  function updateCameraMap() {
    const rect = root.querySelector('.pl-camera-window'); if (!rect) return;
    const a = freeArea(), p = scene.screenToWorld(a.l, a.t), q = scene.screenToWorld(a.w-a.r, a.h-a.b);
    for (const [key,value] of Object.entries({ x:p.x,y:p.y,width:q.x-p.x,height:q.y-p.y })) rect.setAttribute(key,value);
  }
  // The red badge on a part is a warning, not a Delete button: hovering it says what is wrong.
  const badgeTip = (e) => {
    let tip = '';
    try {
      if (S.issues?.length && !e.buttons) {
        const r = stage.getBoundingClientRect(), w = scene.screenToWorld(e.clientX - r.left, e.clientY - r.top);
        const n = graph().nodes.find((n) => Math.abs(w.x - (n.x + 29)) < 11 && Math.abs(w.y - (n.y - 29)) < 11);
        const hit = n && S.issues.find((i) => i.nodeId === n.id && i.level === 'error');
        if (hit) tip = /no route|not connected|no connection/i.test(hit.message) ? 'Not connected. ' + hit.message : hit.message;
      }
    } catch { /* a tooltip is a nicety */ }
    if (stage.title !== tip) stage.title = tip;
  };
  stage.addEventListener('pointermove', badgeTip);
  offs.push(scene.on('view', updateCameraMap));
  offs.push(scene.on('view:manual', () => { S.viewManual = true; }));
  function showFocusMap(id, refresh = false) {
    const zoomed = refresh && root.querySelector('.pl-focus-map .pl-btn')?.dataset.zoomed;
    root.querySelector('.pl-focus-map')?.remove();
    if (!id) return;
    const g = graph(), n = g.nodes.find(n => n.id === id);
    if (!n) return;
    const minX = Math.min(...g.nodes.map(n => n.x)) - 60, minY = Math.min(...g.nodes.map(n => n.y)) - 60;
    const width = Math.max(...g.nodes.map(n => n.x)) - minX + 60, height = Math.max(...g.nodes.map(n => n.y)) - minY + 60;
    const map = h('div', { class: 'pl-focus-map' });
    // A selection tap can finish over the overview that it just opened.
    let pressed = false;
    map.addEventListener('pointerdown', () => { pressed = true; });
    map.addEventListener('click', e => {
      if (e.detail && !pressed) { e.preventDefault(); e.stopPropagation(); }
      pressed = false;
    }, true);
    const drawing = h('button', { class: 'pl-map-drawing', type: 'button', 'aria-label': 'Return to the whole diagram', onClick: () => { select(null); fitAll(); } });
    drawing.innerHTML = `<svg viewBox="${minX} ${minY} ${width} ${height}" aria-hidden="true"><g stroke="var(--edge-idle)" stroke-width="6">${g.edges.map(e => { const a = g.nodes.find(n => n.id === e.from), b = g.nodes.find(n => n.id === e.to); return a && b ? `<path d="M${a.x} ${a.y}L${b.x} ${b.y}"/>` : ''; }).join('')}</g>${g.nodes.map(p => `<rect x="${p.x - 26}" y="${p.y - 26}" width="52" height="52" rx="8" fill="${p.id === id ? 'var(--accent)' : 'var(--surface-solid)'}" stroke="var(--text-2)" stroke-width="4"/>`).join('')}</svg>`;
    const enlarge = h('button', { class: 'pl-btn', type: 'button', text: 'Enlarge part', onClick: () => {
      if (enlarge.dataset.zoomed) { select(null); fitAll(); return; }
      const a = freeArea();
      scene.fit({ l: 38, r: 38, t: a.t + 24, b: a.b + 28 }, true, { focusId: id, maxZ: 1.35 });
      enlarge.dataset.zoomed = 'true'; enlarge.textContent = 'Show whole diagram';
    } });
    if (zoomed) { enlarge.dataset.zoomed = 'true'; enlarge.textContent = 'Show whole diagram'; }
    map.append(drawing, enlarge); root.append(map);
    syncFocusMap();
  }
  function syncFocusMap() {
    const map = root.querySelector('.pl-focus-map');
    if (!map || !isPhone()) return;
    const r = root.getBoundingClientRect();
    let top = hud.el.getBoundingClientRect().bottom;
    for (const el of [caption, goalChip]) {
      if (!el.hidden && el.offsetParent) top = Math.max(top, el.getBoundingClientRect().bottom);
    }
    map.classList.remove('is-compact');
    if (map.parentElement !== root) root.append(map);
    const bottom = parseFloat(getComputedStyle(right).bottom) || 0;
    const compact = r.bottom - bottom - (top + 10 + map.offsetHeight + 8) < 148;
    root.style.setProperty('--pl-focus-top', Math.ceil(top - r.top + 10) + 'px');
    root.style.setProperty('--pl-focus-end', Math.ceil(top - r.top + 10 + map.offsetHeight + 8) + 'px');
    if (compact) { map.classList.add('is-compact'); right.prepend(map); }
  }
  function startConnect(from) {
    S.connectFrom = from;
    // Clear the target area and stop any fit already moving the phone diagram.
    scene.stopCamera();
    root.classList.add('pl-connecting');
    showCaption('Now tap the part it should send requests to. Esc cancels.', 0);
  }
  function cancelModes() {
    S.connectFrom = null; root.classList.remove('pl-connecting');
    toolbar.clearTransient(); toolbar.setArmed(null); toolbar.armedType = null;
    try { scene.setGhost(null); } catch { /* optional */ }
    if (!isLesson) hideCaption();
    closeMenu();
  }

  const nodeOrder = () => graph().nodes.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const nameOf = (id) => { const n = graph().nodes.find((q) => q.id === id); return n ? (n.label || catalog.elementById.get(n.type)?.name || n.type) : ''; };
  let kbTarget = null;
  kb.addEventListener('keydown', (ev) => {
    const list = nodeOrder();
    if (!list.length) return;
    const k = ev.key;
    const step = (dir) => {
      const cur = S.connectFrom ? (kbTarget || S.connectFrom) : S.selected;
      let i = list.findIndex((n) => n.id === cur);
      for (let k = 0; k < list.length; k++) {
        i = (i + dir + list.length) % list.length;
        if (!S.connectFrom || list[i].id !== S.connectFrom) break;
      }
      return list[i].id;
    };
    let handled = true;
    if (k === 'ArrowRight' || k === 'ArrowDown') {
      if (S.connectFrom) { kbTarget = step(1); try { scene.setSelection(kbTarget); } catch { /* optional */ } announce(`Connect to ${nameOf(kbTarget)}? Press Enter.`); } else { select(step(1)); announce(nameOf(S.selected)); }
    } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
      if (S.connectFrom) { kbTarget = step(-1); try { scene.setSelection(kbTarget); } catch { /* optional */ } announce(`Connect to ${nameOf(kbTarget)}? Press Enter.`); } else { select(step(-1)); announce(nameOf(S.selected)); }
    } else if ((k === 'c' || k === 'C') && S.selected && !S.connectFrom) {
      startConnect(S.selected); kbTarget = null; announce(`Connecting from ${nameOf(S.selected)}. Use the arrow keys to pick where requests go, then Enter.`);
    } else if (k === 'Enter' && S.connectFrom && kbTarget) {
      const f = S.connectFrom, t = kbTarget; kbTarget = null; cancelModes();
      if (connect(f, t)) announce(`Connected ${nameOf(f)} to ${nameOf(t)}.`);
      select(f);
    } else if (k === 'Escape') {
      kbTarget = null; cancelModes(); try { scene.setSelection(S.selected); } catch { /* optional */ }
    } else handled = false;
    if (handled) { ev.preventDefault(); ev.stopPropagation(); }
  });
  kb.addEventListener('focus', () => { if (!S.selected && graph().nodes.length) { select(nodeOrder()[0].id); announce(nameOf(S.selected)); } });

  scene.on('node:tap', ({ id }) => {
    closeMenu();
    if (S.connectFrom && S.connectFrom !== id) { const f = S.connectFrom; cancelModes(); connect(f, id); return; }
    select(id);
  });
  scene.on('canvas:tap', ({ x, y, edgeId }) => {
    closeMenu();
    const armed = toolbar.armed();
    if (armed) { placeComponent(armed, x, y, edgeId || edgeAt(x, y, armed)); cancelModes(); return; }
    if (S.connectFrom) { cancelModes(); return; }
    select(null);
  });
  scene.on('canvas:drop', ({ type, x, y, edgeId }) => { placeComponent(type, x, y, edgeId || edgeAt(x, y, type)); cancelModes(); });
  // The line a part dropped at (x, y) goes into: the one under it, or when it lands on or beside a part, the line next to
  // that part that the new part can sit in (the one coming in is preferred).
  function edgeAt(x, y, type) {
    let id = null;
    try { id = scene.edgeAt ? scene.edgeAt(x, y) : null; } catch { id = null; }
    if (id || !type) return id;
    const g = graph();
    const near = g.nodes.filter((n) => Math.abs(n.x - x) < GAP_X * 0.7 && Math.abs(n.y - y) < GAP_Y * 0.7)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!near) return null;
    const pos = new Map(g.nodes.map((n) => [n.id, n]));
    const cand = g.edges.filter((e) => (e.from === near.id || e.to === near.id) && canSplice(type, e.id))
      .map((e) => ({ id: e.id, into: e.to === near.id ? 0 : 1, d: Math.hypot((pos.get(e.from).x + pos.get(e.to).x) / 2 - x, (pos.get(e.from).y + pos.get(e.to).y) / 2 - y) }))
      .sort((a, b) => a.into - b.into || a.d - b.d);
    return cand.length ? cand[0].id : null;
  }
  scene.on('connect', ({ from, to }) => connect(from, to));
  scene.on('node:dragstart', () => inspector.fold(true));
  scene.on('node:dragend', ({ id, x, y }) => moveNode(id, x, y));
  scene.on('edge:tap', ({ id }) => {
    const e = graph().edges.find((x) => x.id === id);
    if (!e) return;
    const armed = toolbar.armed();
    if (armed) {
      const g = graph(), a = g.nodes.find((n) => n.id === e.from), b = g.nodes.find((n) => n.id === e.to);
      if (a && b) { placeComponent(armed, (a.x + b.x) / 2, (a.y + b.y) / 2, id); cancelModes(); }
      return;
    }
    if (S.connectFrom) return;
    openMenu(null, [['Remove this connection', () => removeEdge(id), 'ui.disconnect']], { edge: e });
  });
  scene.on('node:longpress', ({ id, x, y }) => {
    select(id);
    const n = graph().nodes.find((q) => q.id === id);
    openMenu({ x, y }, [
      ['Connect to…', () => startConnect(id), 'ui.connect'],
      ['Duplicate', () => duplicate(id), 'ui.duplicate'],
      ...(n?.locked ? [] : [['Delete', () => removeNode(id), 'ui.delete']]),
    ]);
  });

  stage.addEventListener('pointermove', (ev) => {
    const armed = toolbar.armed();
    if (!armed || ev.pointerType === 'touch') return;
    const r = stage.getBoundingClientRect();
    const w = scene.screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
    try { scene.setGhost(armed, w.x, w.y); } catch { /* optional */ }
  });

  function openMenu(pos, items) {
    menu.replaceChildren();
    items.forEach(([label, fn, ic]) => menu.append(h('button', { class: 'pl-menu-b', type: 'button', role: 'menuitem', onClick: () => { closeMenu(); fn(); } }, iconEl(ic, 16), label)));
    menu.hidden = false;
    const r = stage.getBoundingClientRect();
    const x = pos ? clamp(pos.x, 8, r.width - 190) : r.width / 2 - 90;
    const y = pos ? clamp(pos.y, 8, r.height - 150) : r.height / 2 - 40;
    menu.style.transform = `translate(${x}px, ${y}px)`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }
  function closeMenu() { menu.hidden = true; }

  // ---- captions and goals
  let captionTimer = 0;
  const isCoarse = () => !!globalThis.matchMedia?.('(pointer: coarse)').matches || isPhone();
  // On touch there is no dragging from a list: the lesson wording asks for a tap on the part, then a tap on the line.
  const touchWords = (t) => (isCoarse()
    ? String(t).replace(/\bDrag (?:the |a |an )?(.+?) (?:onto|to|into) the line\b/i, (m, part) => `Tap the ${part.toLowerCase()}, then tap the line`)
        .replace(/\bDrag (?:the |a |an )?(.+?) between\b/i, (m, part) => `Tap the ${part.toLowerCase()}, then tap the line between`)
    : t);
  function showCaption(text, ms = 0, actions = []) {
    text = touchWords(text);
    if (S.captionNext) { toast(text, 'info', ms || 7000); return; }
    caption.hidden = false;
    // the buttons sit in their own row under the sentence, right-aligned like every other panel's actions
    caption.replaceChildren(h('span', { class: 'pl-caption-t', text }),
      ...(actions.length ? [h('div', { class: 'pl-caption-acts' }, ...actions.map((a) => h('button', { class: 'pl-btn pl-btn--small' + (a.primary ? ' pl-btn--primary' : ''), type: 'button', onClick: a.onClick }, a.label)))] : []));
    clearTimeout(captionTimer);
    if (ms) captionTimer = setTimeout(hideCaption, ms);
  }
  function hideCaption() { if (!S.captionNext) caption.hidden = true; }

  // The control a lesson step names is scrolled into view inside the inspector and highlighted until it is used.
  function pointAtKnob(knob) {
    let seen = null, stopped = false;
    try { inspector.setFocus(knob); } catch { /* inspector not built yet */ }
    const tick = () => {
      if (stopped || S.destroyed) return;
      const row = right.querySelector(`.pl-knob[data-knob="${knob}"]`);
      if (row && !row.classList.contains('pl-knob--point')) {
        right.querySelectorAll('.pl-knob--point').forEach((n) => n.classList.remove('pl-knob--point'));
        row.classList.add('pl-knob--point');
      }
      if (row && seen !== S.selected) { seen = S.selected; try { row.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* optional */ } }
      later(tick, 350);
    };
    tick();
    return () => { stopped = true; try { inspector.setFocus(null); } catch { /* gone */ } right.querySelectorAll('.pl-knob--point').forEach((n) => n.classList.remove('pl-knob--point')); };
  }

  // intro script: beats that wait for an action
  const waiters = [];
  function note(action, detail) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.spec.path || (mode === 'intro' && w.spec.action === 'knob')) {
        if (alreadyHolds(w.spec)) { waiters.splice(i, 1); w.resolve(); }
        continue;
      }
      const okType = !w.spec.type || w.spec.type === detail || w.spec.type === detail?.type;
      const okKnob = !w.spec.knob || w.spec.knob === detail?.knob;
      const okMin = w.spec.min == null || Number(detail?.value) >= w.spec.min;
      if (w.spec.action === action && okType && okKnob && okMin) { waiters.splice(i, 1); w.resolve(); }
    }
  }
  // True when the graph already shows what the beat asks for (the player acted while the previous caption was up).
  function alreadyHolds(spec) {
    try {
      if (spec.action === 'day-end') return S.sim.phase === 'done';
      if (spec.action === 'event-start') return S.sim.state().events.some(e => e.active || e.done) || S.sim.phase === 'done';
      const g = graph();
      if (mode === 'intro' && spec.action === 'knob') return introPathHolds(g, spec);
      if (spec.action === 'place') return introPathHolds(g, spec);
      if (spec.action === 'connect') return false;
      if (spec.action === 'knob') {
        return g.nodes.some((n) => {
          if (spec.knob === 'units') return spec.min != null && Number(n.units) >= spec.min;
          if (spec.knob === 'autoscale') return !!(n.knobs?.autoscale?.on || n.autoscaler >= 0 || n.autoscaleKnob?.on);
          return false;
        });
      }
    } catch { /* fall through to waiting */ }
    return false;
  }
  const waitFor = (spec) => (alreadyHolds(spec) ? Promise.resolve() : new Promise((resolve) => waiters.push({ spec, resolve })));
  const sleep = (ms) => new Promise((r) => later(r, ms));
  // A beat that only explains waits for Next; a beat that asks for an action pauses the day until it is done;
  // waiting for a moment in the day (the spike, the end) offers a fast-forward.
  const nextClick = () => new Promise((resolve) => { S.captionNext = resolve; });
  async function waitTrigger(spec, text) {
    const p = waitFor(spec);
    const before = S.speed;
    let fast = false;
    // nothing to do but watch: the day moves at 4 times by itself, and Fast-forward goes to 8
    const auto = S.speed < 4;
    if (auto) setSpeed(4);
    if (text) {
      showCaption(text, 0, [{ label: 'Fast-forward', onClick: () => { if (!fast) { fast = true; setSpeed(8); showCaption(text, 0); } } }]);
    }
    await p;
    if ((fast || auto) && !S.destroyed) setSpeed(before);
  }
  async function runScript(beats) {
    // the intro holds the clock until the first thing to do, so the meters do not read as failure while the player is only reading
    let held = false;
    // the day runs slowly behind the first cards, so dots are moving from the first second; it speeds up once the player acts
    if (mode === 'intro' && S.sim.phase === 'running') { try { setSpeed(0.5); } catch { pause(); held = true; } }
    for (const b of beats) {
      if (S.destroyed) return;
      if (typeof b.at === 'number') { if (b.at > 0) await sleep(b.at * 1000); }
      else if (b.at === 'trigger:event-start') { if (!S.activeEvents.size) await waitTrigger({ action: 'event-start' }, b.waitCaption); }
      else if (b.at === 'trigger:day-end') await waitTrigger({ action: 'day-end' }, b.waitCaption);
      if (S.destroyed) return;
      let text = b.caption || '';
      if (b.at === 'trigger:day-end' && S.lastDay) {
        const ok = S.lastDay.availability >= S.lastDay.target;
        text = (ok ? b.captionOk : b.captionBad) || text;
        text = text.replace('{pct}', String(Math.round(S.lastDay.availability * 1000) / 10));
        if (S.lastDay.cost != null) text += ' Running it costs about $' + Math.round(S.lastDay.cost).toLocaleString('en-US') + ' a month (approx.), against a $' + Number(S.problem.requirements?.budgetPerMonth || 0).toLocaleString('en-US') + ' budget.';
      }
      if (b.highlight) toolbar.pulse(b.highlight);
      if (isPhone() && b.waitFor?.action === 'knob') {
        const part = graph().nodes.find(n => n.type === (b.waitFor.type || 'vm-fleet'));
        if(part) { const a=freeArea(); scene.fit({l:42,r:42,t:a.t+24,b:a.b+36},true,{focusId:part.id,maxZ:.9}); }
      }
      if (b.waitFor) {
        // the day waits while the player does what the caption asks
        const paused = (held || S.sim.phase === 'running') && b.pause !== false;
        if (paused) pause();
        held = false;
        const showInstruction = () => showCaption(b.waitFor.path && graph().nodes.some(n => n.type === b.waitFor.type) && !alreadyHolds(b.waitFor)
          ? `${text} This part is not on the path yet. Drag it onto the line, or connect both sides and remove the original line.` : text, 0, b.waitFor.path ? [{ label: 'Retry insertion', onClick: () => {
          const spec = b.waitFor;
          const id = repairInsertion(S.sim, spec, makeRoomOnEdge);
          if (id) { commit(); note('place', spec.type); select(id); }
        } }] : []);
        S.insertionRetry = b.waitFor.path ? showInstruction : null;
        showInstruction();
        const stopKnob = b.waitFor.action === 'knob' ? pointAtKnob(b.waitFor.knob) : null;
        await waitFor(b.waitFor);
        S.insertionRetry = null;
        stopKnob?.();
        if (mode === 'intro' && S.speed === 0.5) { try { setSpeed(1); } catch { /* keep going */ } }
        if (paused && !S.destroyed) resume();
      } else if (b.at === 'trigger:day-end') {
        showCaption(text, 0);
        await sleep(2500);
      } else {
        const wasRunning = S.sim.phase === 'running';
        if (wasRunning) pause();
        showCaption(text, 0, [{ label: 'Next', primary: true, onClick: () => S.captionNext?.() }]);
        await nextClick();
        S.captionNext = null;
        if (wasRunning && !S.destroyed) resume();
      }
      toolbar.pulse(null);
    }
    if (mode === 'intro') {
      let missing;
      // Recheck the built path; autoscaling may have reduced the earlier server count.
      while ((missing = beats.find(b => b.waitFor && b.waitFor.knob !== 'units' && !alreadyHolds(b.waitFor)))) {
        const b = missing;
        showCaption(b.caption + ' Keep this change on the request path before continuing.', 0);
        await waitFor(b.waitFor);
        if (S.destroyed) return;
      }
      hideCaption();
    }
    hostEl.dispatchEvent(new CustomEvent('pl:script-done', { bubbles: true }));
    if (opts.lesson?.id) bus.emit('lesson:done', { lessonId: opts.lesson.id, result: S.lastDay || null });
  }

  function metricValue(goal, st) {
    const nodeOf = () => (st.nodes || []).find((n) => n.id === goal.node) || (st.nodes || []).find((n) => n.type === goal.node);
    switch (goal.metric) {
      // live share served this moment, so a fix shows at once and earlier calm hours do not count
      case 'availability': { const off = st.traffic?.offeredRps || 0; return off > 0 ? (st.traffic.successRps || 0) / off : 1; }
      case 'p99': return st.slo?.latency?.p99Ms;
      case 'cost': return st.cost?.perMonth;
      case 'errors': {
        const off = st.traffic?.offeredRps || 0;
        // Stale reads count as errors when the lesson asks for read-your-writes; only new ones since the last check.
        const staleTotal = st.slo?.safety?.staleReads || 0;
        const fresh = S.problem.requirements?.readYourWrites && staleTotal > (S.staleSeen ?? staleTotal) ? 1 : 0;
        S.staleSeen = staleTotal;
        return off > 0 ? (st.traffic.failRps || 0) / off + fresh : fresh;
      }
      case 'duplicates': {
        // only duplicates that went through since the last check, so adding the fix mid-event can still succeed
        const total = st.slo?.safety?.duplicates ?? 0;
        const fresh = Math.max(0, total - (S.dupSeen ?? total));
        S.dupSeen = total;
        return fresh;
      }
      case 'compliance': {
        const need = (S.problem.requirements?.compliance || []).length;
        const failed = (st.slo?.safety?.complianceFailed || []).length;
        return need ? Math.max(0, need - failed) / need : 1;
      }
      case 'util': return nodeOf()?.util;
      case 'hitRate': {
        const n = nodeOf();
        if (!n) return undefined;
        if (n.hitRate != null) return n.hitRate;
        const f = S.sim.flows();
        const ni = f.nodeIds.indexOf(n.id);
        const T = f.typeIds.length;
        let hit = 0, into = 0;
        for (let t = 0; t < T; t++) hit += f.nodeHitRps[ni * T + t];
        f.edgeIds.forEach((eid, ei) => { if (eid.endsWith('>' + n.id)) for (let t = 0; t < T; t++) into += f.edgeRps[ei * T + t]; });
        return into > 0 ? hit / into : 0;
      }
      default: return undefined;
    }
  }
  // A goal can name a position ("between the servers and the database"): is a part of that type on the way from A to B?
  function reach(g, from) {
    const seen = new Set([from]); const q = [from];
    while (q.length) { const u = q.pop(); for (const e of g.edges) if (e.from === u && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
    return seen;
  }
  function placedOk(goal) {
    if (opts.lesson?.id === 'replication-lag' && !replicaReadsActive(graph(), S.sim.flows())) return false;
    const w = goal?.between;
    if (!w) return true;
    const g = graph();
    const ids = (k) => g.nodes.filter((n) => n.id === k || n.type === k).map((n) => n.id);
    if (goal.drain && !queuesHaveReaders()) return false;
    const types = w.types || [w.type];
    const mids = g.nodes.filter((n) => types.includes(n.type)).map((n) => n.id);
    if (!mids.length) return false;
    const froms = ids(w.from), tos = ids(w.to);
    return mids.some((m) => froms.some((f) => reach(g, f).has(m)) && tos.some((t) => reach(g, m).has(t)));
  }
  // A queue goal also asks that the line can be emptied: the work waiting should be minutes of traffic, not hours.
  // Every queue needs a worker part wired after it, or nothing ever reads the line.
  function queuesHaveReaders() {
    const g = graph();
    const qs = g.nodes.filter((n) => n.type === 'queue');
    return qs.every((q) => { const r = reach(g, q.id); return g.nodes.some((n) => n.type === 'worker-pool' && r.has(n.id)); });
  }
  function drained(goal, st) {
    if (!goal?.drain) return true;
    if (!queuesHaveReaders()) return false;
    const off = st.traffic?.offeredRps || 0;
    const waiting = (st.nodes || []).reduce((x, n) => x + (n.queueDepth || 0), 0);
    return off <= 0 || waiting / off <= 600;
  }
  // What is still missing when the goal is not met, in plain words.
  function goalGap(goal, st, v) {
    if (opts.lesson?.id === 'replication-lag' && !replicaReadsActive(graph(), S.sim.flows())) return replicaWiringAdvice;
    const g = graph();
    if (goal?.drain && !queuesHaveReaders()) return 'A queue has no workers wired after it, so nothing reads the line. Connect Background workers after the queue.';
    if (!drained(goal, st)) return queueDrainAdvice(g, st, catalog, S.problem.requirements.mix);
    if (!placedOk(goal)) return goal.between.note || 'The numbers look fine, but this part belongs in a different spot. Move it onto the line the hint names.';
    const loose = g.nodes.find((n) => !n.locked && !g.edges.some((e) => e.from === n.id || e.to === n.id));
    if (loose) return `${nameOf(loose.id)} is not connected to anything yet. Drop it onto a line, or use "Connect to…".`;
    if (v == null) return '';
    const word = { '<=': 'at most', '<': 'under', '>=': 'at least', '>': 'over', '==': 'exactly' }[goal.op] || '';
    const fmt = { util: fmtPct, availability: fmtPct, hitRate: fmtPct, errors: fmtPct, p99: fmtMs, cost: (x) => '$' + Math.round(x).toLocaleString('en-US') }[goal.metric];
    if (!fmt) return '';
    const what = { util: `${nameOf(goal.node) || 'That part'} is busy`, availability: 'Requests served', hitRate: 'Cache hit rate', errors: 'Failed requests', p99: 'Slowest requests (p99)', cost: 'Cost a month' }[goal.metric];
    return `${what}: ${fmt(v)} now, the goal is ${word} ${fmt(goal.value)}.`;
  }
  // In a lesson the page above already states the goal, so the chip on the canvas only reports progress.
  const goalLabel = () => (mode === 'lesson' ? 'Lesson goal: hold the current state' : S.problem.brief || 'Reach the goal');
  function checkGoal(st) {
    const goal = S.problem?.goal;
    if (!goal || S.goalMet) return;
    if (!(st.clockMs > 0) || !(st.traffic?.offeredRps > 0) || !(st.traffic?.successRps > 0)) {
      S.goalMs = 0; S.lastClock = st.clockMs || 0;
      goalChip.classList.remove('pl-goal--ok');
      goalChip.replaceChildren(iconEl('ui.clock', 16), h('span', { text: 'Waiting for served traffic. Run the experiment to measure it.' }));
      return;
    }
    // A demo with an event is judged while the event runs (after it has had a few minutes to build), not in the calm before it.
    const evs = st.events || [];
    const act = evs.find((e) => e.active);
    const from = act ? act.atMs + Math.min(300000, Math.max(0, (act.endMs - act.atMs) / 2)) : 0;
    if ((S.problem.events || []).length && act && (st.clockMs || 0) < from) {
      S.goalMs = 0; S.lastClock = st.clockMs || 0;
      metricValue(goal, st);
      const def = catalog.eventById.get(act.id);
      goalChip.hidden = false;
      goalChip.classList.remove('pl-goal--ok');
      goalChip.replaceChildren(iconEl('ui.clock', 16), h('span', { text: `${goalLabel()}. ${def ? def.name + ' is building up.' : ''}`.trim() }));
      return;
    }
    if ((S.problem.events || []).length && !evs.some((e) => e.active || e.done)) {
      S.goalMs = 0; S.lastClock = st.clockMs || 0;
      metricValue(goal, st);
      const next = evs.find((e) => !e.active && !e.done);
      const def = next && catalog.eventById.get(next.id);
      goalChip.hidden = false;
      goalChip.classList.remove('pl-goal--ok');
      goalChip.replaceChildren(iconEl('ui.clock', 16), h('span', { text: `${goalLabel()}. ${def ? `${def.name} arrives at ${clockLabel(next.atMs)}.` : ''}`.trim() }));
      return;
    }
    const v = metricValue(goal, st);
    if (S.goalBefore == null && v != null) S.goalBefore = v;
    const dt = Math.max(0, (st.clockMs || 0) - Math.max(S.lastClock, from));
    S.lastClock = st.clockMs || 0;
    // Spare capacity must hold at the stated peak as well as during the measured traffic.
    const spare = goal.maxUtil == null || (st.nodes || []).filter(n => n.type === 'vm-fleet').every(n =>
      n.util <= goal.maxUtil && S.est?.nodes?.find(peak => peak.id === n.id)?.util <= goal.maxUtil);
    const fresh = goal.maxTtlSec == null || graph().nodes.filter(n => n.type === 'cache' && st.nodes?.some(live => live.id === n.id && live.incomingRps > 0)).every(n => (n.knobs?.ttlSec ?? catalog.knobs.ttlSec.default) <= goal.maxTtlSec);
    const ok = spare && fresh && v != null && placedOk(goal) && drained(goal, st) && { '<=': v <= goal.value, '>=': v >= goal.value, '<': v < goal.value, '>': v > goal.value, '==': v === goal.value }[goal.op];
    if (opts.lesson?.id === 'replication-lag' && replicaReadsActive(graph(), S.sim.flows())) hideCaption();
    S.goalMs = ok ? S.goalMs + dt : 0;
    const need = (goal.holdSec || 0) * 1000;
    goalChip.hidden = false;
    goalChip.classList.toggle('pl-goal--ok', S.goalMs > 0);
    const gap = !spare ? `Leave at least ${Math.round((1 - goal.maxUtil) * 100)}% spare app capacity at peak. Serving every request at full capacity is fragile.` : !fresh ? `Answers may be at most ${goal.maxTtlSec} seconds old. Shorten the cache TTL and measure again.` : !ok ? goalGap(goal, st, v) : '';
    goalChip.title = gap;
    goalChip.replaceChildren(iconEl(S.goalMs > 0 ? 'ui.check' : 'ui.hint', 16),
      h('span', { text: gap ? `${goalLabel()}. ${gap}` : ok ? goalPassed(goal, v, nameOf(goal.node) || 'The part') : goalLabel() }),
      ...(need ? [h('span', { class: 'pl-goal-bar' }, h('i', { style: { width: clamp(S.goalMs / need, 0, 1) * 100 + '%' } }))] : []));
    if (ok && S.goalMs >= need) {
      S.goalMet = true;
      if (opts.lesson?.id === 'replication-lag') hideCaption();
      goalChip.classList.add('pl-goal--done');
      const passedText = goalPassed(goal, v, nameOf(goal.node) || 'The part', st);
      goalChip.replaceChildren(iconEl('ui.check', 16), h('span', { text: mode === 'lesson' ? passedText : 'Goal reached. Nicely done.' }));
      const before = S.goalBefore;
      if (before != null && Math.abs(before - v) > 0.000001) {
        const unit = ['availability', 'util', 'hitRate', 'errors', 'compliance'].includes(goal.metric) ? '%' : goal.metric === 'p99' ? ' ms' : '';
        const fmt = n => Math.round(n * (unit === '%' ? 100 : 1) * 10) / 10;
        hideCaption();
        goalChip.replaceChildren(iconEl('ui.check', 16), h('span', { text: `${passedText} Before this repair: ${fmt(before)}${unit}; measured now: ${fmt(v)}${unit}.` }));
      }
      root.classList.add('pl-goal-celebrate'); later(() => root.classList.remove('pl-goal-celebrate'), 900);
      snd('pass');
      // the goal is met: close the inspector and the parts sheet so the Continue button is never covered
      try { select(null); toolbar.el.classList.remove('pl-toolbar--open'); } catch { /* optional */ }
      hostEl.dispatchEvent(new CustomEvent('pl:goal', { bubbles: true, detail: { lessonId: opts.lesson?.id, stepIndex: opts.stepIndex || 0 } }));
      bus.emit('lesson:goal', { lessonId: opts.lesson?.id, stepIndex: opts.stepIndex || 0 });
      // the picture holds at the moment the goal was met, so the meters keep showing the fixed state instead of drifting back to red
      if (mode === 'lesson') pause();
    }
  }

  // ---- steps
  const stepsBar = stepped ? createSteps(top, { onGo: (s) => go(s, true) }) : null;
  const tools = h('div', { class: 'pl-tools' });
  const btn = (iconId, label, fn, cls = '') => h('button', { class: 'pl-icon-btn ' + cls, type: 'button', 'aria-label': label, title: label, onClick: fn }, iconEl(iconId, 20));
  const undoBtn = btn('ui.undo', 'Undo (Ctrl+Z)', () => undo());
  const redoBtn = btn('ui.redo', 'Redo (Ctrl+Shift+Z)', () => redo(), 'pl-tool--redo');
  const fitBtn = btn('ui.fit', 'Fit to screen (F)', fitAll, 'pl-tool--fit');
  const hintBtn = btn('ui.hint', 'Hints (H)', () => hints.toggle(), 'pl-tool--hint');
  const edBtn = btn('ui.editorial', 'Editorial (after one finished day)', () => openEditorial(), 'pl-tool--editorial');
  tools.append(undoBtn, redoBtn, fitBtn);
  if (!isLesson) {
    const inspection = h('details', { class: 'pl-diagram-options' }, h('summary', { class: 'pl-btn pl-btn--small' }, 'Diagram tools'));
    const options = h('div', { class: 'pl-diagram-options-body' });
    inspection.addEventListener('toggle', () => top.classList.toggle('pl-top--tools-open', inspection.open));
    for (const event of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel']) options.addEventListener(event, e => e.stopPropagation());
    inspection.append(options); tools.append(inspection);
    if (stepped && !interview) options.append(h('button', { class: 'pl-btn pl-btn--small', type: 'button', onClick: () => {
      inspection.open = false;
      top.classList.remove('pl-top--tools-open');
      hints.open();
    } }, 'Hints'));
    // the phone's top row has no room for the editorial button, so the editorial opens from this list there
    if (stepped && !interview) options.append(h('button', { class: 'pl-btn pl-btn--small pl-opt--phone', type: 'button', onClick: () => {
      inspection.open = false;
      top.classList.remove('pl-top--tools-open');
      openEditorial();
    } }, 'Editorial'));
    const toggle = (label, action) => {
      let on = false;
      const button = h('button', { class: 'pl-btn pl-btn--small', type: 'button', 'aria-pressed': 'false', onClick: () => {
        on = !on; button.setAttribute('aria-pressed', String(on)); action(on);
      } }, label);
      options.append(button);
    };
    toggle('Isolate paths', on => { scene.setPathIsolation(on); if (on) showCaption('Select a part to follow its upstream and downstream connections. Traffic dots are hidden while a path is selected.', 6000); });
    toggle('Larger diagram', on => { root.classList.toggle('pl-diagram-large', on); later(() => fitView(), 60); });
    toggle('Hide parts panel', on => { root.classList.toggle('pl-parts-hidden', on); later(() => fitView(), 60); });
    toggle('Hide details panel', on => { root.classList.toggle('pl-details-hidden', on); later(() => fitView(), 60); });
    toggle('Region boundaries', on => { scene.setRegionGroups(on); if (on) showCaption('Cross-region labels show approximate round-trip latency. Tidy request paths makes room between parts.', 6000); });
    options.append(h('button', { class: 'pl-btn pl-btn--small', type: 'button', title: 'Tidy the request paths from clients to stores. Undo restores your positions.', onClick: () => {
      if (structureBlocked()) return;
      inspection.open = false;
      top.classList.remove('pl-top--tools-open');
      select(null); inspector.fold(true); hideCaption();
      for (const n of pathLayout(graph(), catalog)) S.sim.moveNode(n.id, n.x, n.y);
      toolbar.el.classList.add('pl-toolbar--folded'); trafficPanel?.fold(true);
      commit(); fitView(true, 0);
    } }, 'Tidy request paths'));
  }
  if (stepped && !interview) tools.append(hintBtn, edBtn);
  const interviewClock = interview ? h('output', { class: 'pl-interview-clock', title: '45-minute guide. Play continues after time runs out.', text: 'Interview · 45:00' }) : null;
  if (interviewClock) tools.append(interviewClock);
  top.append(tools);
  let ghostBtn = null;
  if (mode === 'beat' && opts.overlay?.graph) {
    let on = false;
    ghostBtn = h('button', { class: 'pl-btn pl-btn--small', type: 'button', 'aria-pressed': 'false', onClick: () => { on = !on; ghostBtn.setAttribute('aria-pressed', String(on)); ghostBtn.classList.toggle('pl-btn--on', on); scene.setOverlay(on ? opts.overlay.graph : null); } }, iconEl('ui.ghost', 16), 'Show their design');
    tools.append(ghostBtn);
  }
  function syncUndoButtons() {
    undoBtn.disabled = !canStructure() || !S.undo.length;
    redoBtn.disabled = !canStructure() || !S.redo.length;
  }

  function showPanel(on) { panel.hidden = !on; scrim.hidden = !on; }
  function go(step, animate = false) {
    if (!stepped) return;
    if (interview && interviewState.run && step !== 'debrief') return;
    if (interview && interviewState.stage !== 'ready' && step !== 'clarify') return;
    if (step === 'day' || (step === 'debrief' && !S.result)) return;
    if ((step === 'clarify' || step === 'numbers') && S.sim.phase !== 'build') return;
    if (animate && S.step !== step) {
      const order = ['clarify', 'numbers', 'draw', 'day', 'debrief'];
      const back = order.indexOf(step) < order.indexOf(S.step);
      go(step);
      if (!ctx.reducedMotion()) {
        const entering = panel.hidden ? stage : panel;
        const base = getComputedStyle(entering).transform;
        entering.animate([{ opacity: .3, transform: `${base === 'none' ? '' : base} translateX(${back ? -24 : 24}px)` }, { opacity: 1, transform: base }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      return;
    }
    S.step = step;
    root.dataset.step = step;
    closeMenu();
    debriefWrap.hidden = step !== 'debrief';
    showPanel(step === 'clarify' || step === 'numbers');
    if (interview && step === 'clarify') renderInterviewPrep(panel, S.problem, interviewState, () => go('draw', true), syncInterviewRequirements);
    if (!interview && step === 'clarify') renderClarify(panel, { problem: S.problem, revealed: S.revealed, snd, warm: !!S.problem?.warmUp, onNext: () => go('numbers', true) });
    if (!interview && step === 'numbers') renderNumbers(panel, { problem: S.problem, guesses: S.guesses, snd, progress: ctx.progress, onBack: () => go('clarify', true), onNext: () => go('draw', true) });
    if (step === 'draw') { toolbar.setEnabled(canStructure(), ''); }
    stepsBar.set(step, { clarify: S.sim.phase === 'build', numbers: S.sim.phase === 'build', draw: true, debrief: !!S.result });
    if (step === 'debrief') showDebrief();
    updateEditable();
  }
  function updateEditable() {
    const can = canStructure();
    toolbar.setEnabled(can, can ? '' : 'The day is running. Press "Back to drawing" beside the clock to change parts.');
    const knobsOk = S.sim.phase === 'build' || (editableKnobs() && S.sim.phase !== 'done');
    if (mode === 'lesson') inspector.setFocus(({ 'requests-and-latency': 'region', 'back-of-envelope': 'units', caching: 'ttlSec', 'load-balancing': 'units', autoscaling: 'autoscale' })[opts.lesson?.id] || null);
    inspector.setEditable(knobsOk, mode === 'challenge' ? 'Challenge days run without changes.' : 'This day has finished. Go back to drawing to change it.');
    root.dataset.phase = S.sim.phase;
    refreshTrace();
    // the parts list folds to a strip while a day runs (and opens again after), so the diagram is fitted to the new free area
    const slim = toolbar.el.classList.contains('pl-toolbar--slim');
    if (slim !== S.slimWas) { const first = S.slimWas === undefined; S.slimWas = slim; if (!first && !isPhone() && !S.destroyed) later(() => { if (!S.destroyed) fitView(true, null, true); }, 80); }
    syncUndoButtons();
  }

  // ---- traffic day
  // Messages that differ only in the request type they name ("Reads need X", "Writes need X") become one line.
  function mergeByCause(errs) {
    errs = errs.filter(e => e.code !== 'source-type-unserved' || !errs.some(other => other.type === e.type && other.code === 'type-unserved'));
    const groups = new Map();
    for (const e of errs) {
      const pl = e.type ? catalog.requestById.get(e.type)?.plural : null;
      const cap = pl ? pl.charAt(0).toUpperCase() + pl.slice(1) : null;
      const rest = cap && e.message.startsWith(cap) ? e.message.slice(cap.length) : null;
      const key = rest ?? e.message;
      if (!groups.has(key)) groups.set(key, { rest, names: [], msg: e.message });
      if (pl) groups.get(key).names.push(pl);
    }
    return [...groups.values()].map((g) => {
      if (g.rest == null || g.names.length < 2) return g.msg;
      const list = g.names.length === 2 ? g.names.join(' and ') : g.names.slice(0, -1).join(', ') + ' and ' + g.names[g.names.length - 1];
      return list.charAt(0).toUpperCase() + list.slice(1) + g.rest;
    });
  }
  // Start from the screen: a design where some request type has nowhere to go gets one question first.
  function startFromUi() {
    if (!interview && mode === 'practice' && S.sim.phase === 'build' && !S.designChecked) {
      modal.replaceChildren(renderDesignCheck(S.problem, answer => {
        S.designChecked = true; S.prediction = answer.text; modal.hidden = true; startFromUi();
      }, () => { modal.hidden = true; }));
      modal.hidden = false;
      modal.querySelector('button')?.focus();
      return getState();
    }
    if (S.sim.phase === 'build' && stepped) {
      const issues = diagnosticIssues();
      const errs = issues.filter((i) => i.level === 'error' || (i.code === 'disconnected' && i.source));
      const proofs = issues.filter((i) => i.code === 'compliance-missing');
      if (errs.length || proofs.length) {
        modal.replaceChildren(h('div', { class: 'pl-modal-card', style: { maxHeight: '100%', overflowY: 'auto' } },
          h('div', { class: 'pl-ed-top' }, h('b', { text: errs.length ? 'Some requests have nowhere to go' : 'Some required proofs are missing' })),
          h('ul', { class: 'pl-list' }, mergeByCause(errs).slice(0, 4).map((m) => h('li', { text: m }))),
          proofs.length ? h('div', {}, h('b', { text: 'Missing proofs' }), h('ul', { class: 'pl-list' }, proofs.map((i) => h('li', { text: i.message }))), h('p', { class: 'pl-muted', text: (interview ? '' : 'Open each Must prove requirement for wiring guidance. ') + 'Missing proofs prevent a pass and reduce Data safety points.' })) : null,
          h('p', { class: 'pl-muted', text: (errs.length ? 'Those requests will fail all day. ' : '') + 'Start anyway, or keep drawing?' }),
          h('div', { class: 'pl-actions' },
            h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: () => { modal.hidden = true; } }, 'Keep drawing'),
            h('button', { class: 'pl-btn', type: 'button', onClick: () => { modal.hidden = true; startTraffic(); } }, 'Start anyway'))));
        modal.hidden = false;
        modal.querySelector('button')?.focus();
        return getState();
      }
    }
    return startTraffic();
  }
  function startTraffic(testHook = false) {
    if (interview && (interviewState.stage !== 'ready' || (interviewState.run && S.sim.phase === 'build'))) return getState();
    if (!testHook && !interview && mode === 'practice' && S.sim.phase === 'build' && S.problem?.correctness && S.checkpointReady !== S.problem.id) {
      modal.replaceChildren(renderCheckpointForm(S.problem.correctness, S.correctnessAnswer, (answer) => {
        S.correctnessAnswer = answer;
        S.checkpointReady = S.problem.id;
        modal.hidden = true;
        startTraffic();
      }, () => { modal.hidden = true; }));
      modal.hidden = false;
      modal.querySelector('select, input')?.focus();
      return getState();
    }
    const wasHeld = S.hold;
    S.hold = false;
    if (S.sim.phase !== 'build') { if (S.sim.phase === 'paused') resume(); return getState(); }
    if (stepped && S.step !== 'draw') go('draw');
    cancelModes();
    if (!isLesson) hideCaption();
    if (S.selected && !isLesson) select(null);
    S.result = null;
    S.acc = 0;
    S.activeEvents.clear();
    hud.hideBanner();
    hud.resetHistory();
    S.sim.start();
    if (interview) interviewState.run = true;
    S.checkpointReady = null;
    if (wasHeld) lessonLeadIn();
    S.lastClock = wasHeld ? S.sim.clockMs : 0; S.goalMs = 0;
    if (stepped) { S.step = 'day'; root.dataset.step = 'day'; stepsBar.set('day', { draw: false, debrief: false }); showPanel(false); reqCard?.toggle(false); }
    hud.setPhase('running');
    hud.setSpeed(S.speed);
    updateEditable();
    closeHints();
    snd('start');
    bus.emit('play:start', { mode, problemId: S.problem.id, seed: S.seed });
    refitForStep();
    return getState();
  }
  function pause() { if (S.sim.phase === 'running') { S.sim.pause(); hud.setPhase('paused'); hud.setSpeed(0); updateEditable(); } }
  function resume() { if (S.sim.phase === 'paused') { S.sim.resume(); hud.setPhase('running'); hud.setSpeed(S.speed); updateEditable(); } }
  function setSpeed(n) {
    if (!world.sim.speeds.includes(n)) return;
    if (n === 0) { pause(); return; }
    S.speed = n;
    hud.setSpeed(n);
    if (S.sim.phase === 'paused') resume();
  }
  function resetToDraw() {
    if (interview && interviewState.run) { toast('The interview day runs once. Finish your defense to review it.', 'info'); return; }
    if (transferPending()) {
      S.result = S.pendingTransfer;
      go('debrief');
      toast('Commit the changed tradeoff and experiment before starting another drawing.', 'info');
      return false;
    }
    if (S.warm && S.fullEvents) {
      // the second run is the full day, spike included
      const full = S.fullEvents, fullReq = S.fullRequirements;
      S.warm = false; S.fullEvents = null; S.fullRequirements = null;
      rebuildSim({ events: full, warmUp: false, ...(fullReq ? { requirements: fullReq } : {}) });
      toast('Now the full day: the traffic spike is back.', 'info', 5000);
    }
    S.sim.reset();
    S.result = null; S.acc = 0; S.activeEvents.clear(); S.lastStatus.clear();
    hud.hideBanner(); hud.setPhase('build'); hud.resetHistory();
    try { scene.setFlows(null, { speed: 0, dtWallMs: 16, nodeStates: S.sim.state().nodes }); } catch { /* optional */ }
    debriefWrap.hidden = true;
    S.goalMet = false; S.goalMs = 0;
    if (stepped) { S.step = 'draw'; root.dataset.step = 'draw'; stepsBar.set('draw', { clarify: true, numbers: true, draw: true, debrief: !!S.result }); }
    updateEditable();
    refreshChecks();
    refitForStep();
  }
  function reset() { if (resetToDraw() !== false && stepped) go('draw'); }

  function bestOf(x) {
    if (x == null) return null;
    if (typeof x === 'number') return x;
    return x.bestScore ?? x.score ?? x.total ?? x.best?.total ?? x.best?.score ?? null;
  }
  function finish() {
    const result = S.sim.result();
    if (!result) return;
    S.triedId = S.problem.id;
    const isRef = !!S.refSig && S.refSig === graphSig();
    const warm = !!S.problem?.warmUp || !!S.problem?.twistDay;
    const credit = learningCredit(S.problem, S.correctnessAnswer, { passed: result.passed, hintsUsed: hints.used(), workedRepair: S.workedRepair, reference: isRef }, ctx.progress?.get(S.problem.id)?.learning);
    S.result = isRef ? { ...result, reference: true } : warm ? { ...result, warmUp: true, ...(S.problem?.twistDay ? { twistDay: true } : {}) } : result;
    S.result = { ...S.result, learning: credit };
    if (S.problem.twistDay && !result.passed) {
      S.pendingTransfer = S.result;
      closeHints(); closeEditorial();
    }
    refreshSuggestions();
    reqCard?.setAdvice(!interview && adviceReady());
    if (mode === 'practice' && !interview && !isRef && !S.problem.warmUp) ctx.progress?.recordLearning?.(S.problem.id, credit);
    toolbar.clearTransient();
    hud.setPhase('done');
    hud.hideBanner();
    root.dataset.phase = 'done';
    S.winBefore = S.lastDayProblem === S.problem.id ? S.lastDay : null;
    S.winOriginal = S.lastDayProblem === S.problem.id ? S.previousRunGraph : S.entryGraph;
    S.previousRunGraph = result.graph; S.lastDayProblem = S.problem.id;
    S.lastDay = { availability: result.slo?.availability?.actual ?? 0, target: result.slo?.availability?.target ?? 0.99, passed: !!result.passed, p99: result.slo?.latency?.worstP99Ms ?? null, cost: result.slo?.cost?.perMonth ?? result.cost?.perMonth ?? result.metrics?.perMonth ?? result.perMonth ?? S.sim.state?.()?.cost?.perMonth ?? null };
    note('day-end', null);
    if (!stepped) {
      if (mode === 'intro') return;
      later(() => { if (!S.destroyed) { S.sim.reset(); S.sim.start(); S.goalMs = 0; S.lastClock = 0; lessonLeadIn(); S.acc = 0; hud.resetHistory(); hud.setPhase('running'); if (isLesson) showCaption('Restarting the example with your changes. This is a fresh trial: the clock and backlog reset; the previous backlog was not drained.', 12000); } }, 600);
      S.result = null;
      return;
    }
    try {
      S.prevBest = mode === 'practice' ? bestOf(ctx.progress?.get(S.problem.id)) : bestOf(ctx.compete?.bests?.get?.(`${mode}:${S.problem.id}:${S.seed}`));
    } catch { S.prevBest = null; }
    S.step = 'debrief';
    if (result.passed && !warm) { metrics.track('problem_passed', S.problem.id); metrics.once('first_problem_passed', S.problem.id); }
    const traces = result.passed ? Object.entries(S.problem.requirements.mix).filter(([, share]) => share > 0).map(([type]) => S.sim.trace(type)) : [];
    carryRunIntoReport({ host: debriefWrap, stage, scene, result: S.result, catalog, traces, interview, reduced: ctx.reducedMotion(), render: () => {
      if (S.destroyed || S.step !== 'debrief' || S.result?.graph !== result.graph) return false;
      root.dataset.step = 'debrief';
      stepsBar.set('debrief', { clarify: false, numbers: false, draw: true, debrief: true });
      showDebrief();
      root.dataset.outcome = result.passed ? 'pass' : 'fail';
      updateEditable();
    } });
    snd(result.passed ? 'pass' : 'miss');
    if (creditForVictory()) for (let i = 0; i < result.stars; i++) later(() => snd('star'), 500 + i * 220);
    // A passed warm-up leaves a mark in the list (a tick and 'Warm-up passed'), but no score is saved.
    if (!isRef && S.problem?.warmUp && !S.problem?.twistDay && result.passed && mode === 'practice') {
      try { store.set('warmups', { ...(store.get('warmups', {}) || {}), [S.problem.id]: Date.now() }); bus.emit('progress:updated', { problemId: S.problem.id, warmUp: true }); } catch { /* optional */ }
    }
    if (!interview && !isRef && !warm) {
      if (mode === 'practice') ctx.progress?.recordCorrectness?.(S.problem.id, S.problem.correctness, S.correctnessAnswer, result.passed);
      bus.emit('play:day-end', { mode, problemId: S.problem.id, seed: S.seed, result: S.result, hintsUsed: hints.used() });
    }
  }
  function creditForVictory() { return S.result.learning?.traceChecked && !S.result.learning?.assisted; }
  function showDebrief() {
    if (!S.result) return;
    if (interview) {
      renderInterviewResult(debriefWrap, S.problem, interviewState, S.result, catalog, report => {
        if (S.interviewSaved) return;
        S.interviewSaved = true;
        ctx.progress.recordInterview(S.problem.id, report);
        metrics.track('interview_finished', S.problem.id);
        mountFeedback(debriefWrap.querySelector('.pl-debrief'), ctx, 'problem:' + S.problem.id, S.result);
      });
      debriefWrap.hidden = false; debriefWrap.scrollTop = 0; return;
    }
    const list = ctx.content?.problems || [];
    const idx = list.findIndex((p) => p.id === S.problem.id);
    renderDebrief(debriefWrap, {
      result: S.result, problem: S.problem, catalog, ctx, hintsUsed: hints.used(), prevBest: S.prevBest, reduced: ctx.reducedMotion(), correctnessAnswer: mode === 'practice' ? S.correctnessAnswer : null,
      opponent: mode === 'beat' && opts.overlay ? opts.overlay : null,
      hasNext: mode === 'practice' && idx >= 0 && idx < list.length - 1,
      handlers: {
        onRetry: () => transitionScreen(reset, { direction: 'back', reduced: ctx.reducedMotion() }),
        onIndependentRetry: () => transitionScreen(() => { hints.reset(); S.workedRepair = false; S.correctnessAnswer = undefined; S.checkpointReady = null; reset(); }, { direction: 'back', reduced: ctx.reducedMotion() }),
        onBack: () => transitionScreen(reset, { direction: 'back', reduced: ctx.reducedMotion() }),
        onHints: () => { hints.open(); hints.el.focus?.(); },
        onEditorial: () => openEditorial(),
        onShare: () => openShare(),
        onNext: () => { const n = list[idx + 1]; if (n) ctx.router.go('#/practice/' + n.id); },
        onTwist: mode === 'practice' && S.problem.twist ? () => transitionScreen(() => {
          const p = ctx.content?.problemById?.get(S.problem.id);
          if (!p?.twist) return;
          const g = graph(), on = !S.twist;
          resetHostForProblem({ preserveReference: true }); S.twist = on;
          configure(p, g); go('draw'); fitView(false);
          toast(on ? 'New twist: a quieter workload and a tighter cost ceiling. Reconsider the paid reserve and test failure headroom.' : 'Back to the original day.', 'info', 5000);
        }, { direction: 'back', reduced: ctx.reducedMotion() }) : null,
        onShowNext: (ns) => transitionScreen(() => { reset(); if (ns.nodeId) select(ns.nodeId); if (ns.elementId) toolbar.pulse(ns.elementId); }, { direction: 'back', reduced: ctx.reducedMotion() }),
        nextFix: (ns) => { const rn = ns?.nodeId != null ? (S.result?.nodes || []).find((x) => x.id === ns.nodeId) : null; const fix = rn && ['units', 'autoscale'].includes(ns?.knob) && editableKnobs() ? sizeFixFor(ns.nodeId, rn.peakUtil) : null; if (fix && ns.sizing) { fix.units = ns.sizing.units; fix.label = `Set ${fix.word.toLowerCase()} to ${fix.units}`; } return fix; },
        onAssisted: () => { S.workedRepair = true; },
        onSetNext: (fix) => transitionScreen(() => { reset(); applySizeFix(fix); select(fix.nodeId); }, { direction: 'back', reduced: ctx.reducedMotion() }),
      },
    });
    if (S.prediction) debriefWrap.querySelector('.pl-verdict-sec')?.append(h('p', { class: 'pl-prediction' }, h('b', { text: 'Your prediction before this run: ' }), S.prediction, ' Compare it with the measured cause below.'));
    if (S.result.passed && !S.problem.warmUp && creditForVictory()) showVictory(debriefWrap, { result: S.result, before: S.winBefore, original: S.winOriginal, catalog, reduced: ctx.reducedMotion() });
    debriefWrap.hidden = false;
    debriefWrap.scrollTop = 0;
    debriefWrap.querySelector('.pl-transfer-reflection h2')?.focus({ preventScroll: true });
  }

  // ---- editorial
  function openEditorial() {
    if (transferPending()) { toast('Commit the changed tradeoff and experiment in the report first.', 'info'); return; }
    if (!stepped || interview) return;
    if (!S.result && !(ctx.progress?.get?.(S.problem.id)?.attempts > 0)) { toast('The editorial unlocks after one finished traffic day.', 'info'); return; }
    renderEditorial(editorialWrap, {
      problem: S.problem, catalog, passed: !!(S.result?.passed || ctx.progress?.get?.(S.problem.id)?.stars > 0),
      onClose: closeEditorial, onLoad: loadDesign, onShown: () => { S.workedRepair = true; },
    });
    editorialWrap.hidden = false; editorialWrap.scrollTop = 0;
  }
  function closeEditorial() { editorialWrap.hidden = true; }

  // ---- share
  async function openShare() {
    const r = S.result;
    if (!r) return;
    const c = ctx.compete;
    // the fuller dialog: card preview, name field, link and share buttons
    if (c?.ui?.openShareDialog) {
      try {
        const thumb = await scene.snapshot({ ...c.card.THUMB, graph: r.graph });
        const isDaily = S.seed.startsWith('daily-');
        const shareMode = mode === 'beat' ? (isDaily ? 'challenge' : 'practice') : mode;
        const d = isDaily ? S.seed.slice(6) : new Date().toISOString().slice(0, 10);
        c.ui.openShareDialog(root, { result: r, problem: S.problem, graph: r.graph, thumbCanvas: thumb, mode: shareMode, seed: S.seed, date: d });
        return;
      } catch { /* the simple dialog below still works */ }
    }
    const status = h('div', { class: 'pl-muted pl-small', 'aria-live': 'polite' });
    const urlBox = h('input', { class: 'pl-input', readonly: '', 'aria-label': 'Share link', hidden: '' });
    // signed in: the account's display name goes on the link and the card
    const name = ctx.account?.displayName?.() || ctx.settings.get('playerName') || '';
    const dateStr = S.seed.startsWith('daily-') ? S.seed.slice(6) : new Date().toISOString().slice(0, 10);
    const makeUrl = async () => {
      const score = c.share.scoreOf ? c.share.scoreOf(r) : { total: r.score.total };
      const payload = await c.share.encodeShare({ mode: mode === 'beat' ? (S.seed.startsWith('daily-') ? 'challenge' : 'practice') : mode, problemId: S.problem.id, seed: S.seed, graph: r.graph, score, result: r, name });
      return c.share.shareUrl(payload, S.seed, S.problem.id);
    };
    modal.replaceChildren(h('div', { class: 'pl-modal-card' },
      h('div', { class: 'pl-ed-top' }, h('b', { text: 'Share this result' }), h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Close', onClick: () => { modal.hidden = true; } }, iconEl('ui.close', 18))),
      h('p', { class: 'pl-muted', text: 'Friends can open the link, see your score and try to beat it. Nothing is uploaded; the design travels inside the link.' }),
      h('div', { class: 'pl-actions' },
        h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: async () => {
          try {
            const url = await makeUrl();
            urlBox.hidden = false; urlBox.value = url; urlBox.select();
            try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied.'; } catch { status.textContent = 'Copy the link below.'; }
          } catch (e) { status.textContent = 'Could not make the link: ' + (e.message || e); }
        } }, iconEl('ui.link', 16), 'Copy "beat my design" link'),
        h('button', { class: 'pl-btn', type: 'button', onClick: async () => {
          try {
            status.textContent = 'Drawing the card…';
            const url = await makeUrl();
            const thumb = await scene.snapshot({ ...c.card.THUMB, graph: r.graph });
            const blob = await c.card.renderCard({ result: r, problem: S.problem, catalog, palette: ctx.palette(), thumbCanvas: thumb, date: dateStr, url, name });
            const how = await c.card.shareCard(blob, { title: `${S.problem.title}: ${Math.round(r.score.total)} points`, text: `I scored ${Math.round(r.score.total)} on ${S.problem.title}. Can you beat it?`, url });
            status.textContent = how === 'shared' ? 'Shared.' : 'Card saved to your downloads.';
          } catch (e) { status.textContent = 'Could not make the card: ' + (e.message || e); }
        } }, iconEl('ui.download', 16), 'Save result card')),
      urlBox, status));
    modal.hidden = false;
    modal.querySelector('button.pl-btn')?.focus();
  }

  // ---- hints
  const hints = createHints(root, {
    getNotice: () => transferPending() ? 'Commit the changed tradeoff, two explanations and a discriminating experiment in the report before opening repair guidance.' : '',
    getHints: () => adviceReady() ? S.problem?.hints || [] : ['Before choosing another part, trace one request through your design. Where does it wait, what happens if that step crashes, and what evidence would disprove your prediction? Run a day first; repair hints open after your attempt.'],
    snd, onUse: (n) => { S.hintsUsed = n; }
  });
  function closeHints() { hints.close(); }

  // ---- toolbar, inspector, HUD, requirements, traffic panel
  const toolbar = createToolbar(left, {
    catalog,
    palette: null,
    onArm: (type) => { toolbar.armedType = type; if (!type) { try { scene.setGhost(null); } catch { /* optional */ } } else showCaption(`Click the canvas to place "${catalog.elementById.get(type)?.name}". Esc cancels.`, 4000); },
    onPlace: (type) => {
      // touch, lesson step asking for a part on a line: pick the part, then tap the line (the sheet closes after the pick)
      if (isLesson && isCoarse() && waiters.some((w) => w.spec.action === 'place' && (!w.spec.type || w.spec.type === type))) {
        toolbar.setArmed(type); toolbar.armedType = type;
        showCaption(`Now tap the line where the ${catalog.elementById.get(type)?.name?.toLowerCase() || 'part'} goes.`, 0);
        return;
      }
      placeAtCentre(type);
    },
    onDrag: (type, cx, cy) => {
      // an open settings panel would hide the line the part is meant to land on
      if (S.selected && (isLesson || isPhone())) select(null);
      const r = stage.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) { try { scene.setGhost(null); } catch { /* optional */ } return; }
      const w = scene.screenToWorld(cx - r.left, cy - r.top);
      try { scene.setGhost(type, w.x, w.y); } catch { /* optional */ }
    },
    onDrop: (type, cx, cy) => {
      try { scene.setGhost(null); } catch { /* optional */ }
      const r = stage.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return;
      const w = scene.screenToWorld(cx - r.left, cy - r.top);
      placeComponent(type, w.x, w.y, edgeAt(w.x, w.y, type));
    },
    onDragEnd: () => { try { scene.setGhost(null); } catch { /* optional */ } },
  });
  const inspector = createInspector(right, {
    catalog,
    getNode: (id) => graph().nodes.find((n) => n.id === id),
    getHome: () => S.problem?.requirements?.homeRegion,
    getProblem: () => S.problem,
    onKnob: setKnob, onDelete: removeNode, onDuplicate: duplicate, onConnect: startConnect, onClose: () => select(null), lesson: isLesson,
  });
  const hud = createHud(root, {
    catalog, mode,
    onStart: () => startFromUi(), onPause: pause, onResume: resume, onSpeed: setSpeed,
    onReset: () => reset(),
  });
  hud.el.querySelector('.pl-buildnote').addEventListener('click', () => { const rk = riskyIssues().find((i) => i.nodeId != null); if (rk && !S.issues?.some((i) => i.level === 'error')) select(rk.nodeId); if (S.issues?.length || riskyIssues().length) { paintIssues(); issuesBox.hidden = !issuesBox.hidden; } });
  let reqCard = null;
  let trafficPanel = null;
  function syncInterviewRequirements() {
    if (interview && reqCard) reqCard.el.hidden = ['questions', 'answers', 'requirements'].includes(interviewState.stage);
  }

  // Easy problems open the palette with a short "start with these" list: the parts of the simplest reference design.
  // Medium and Hard problems get the usual starting parts plus what the brief says must be there (its required parts
  // and its "Must prove" controls), without giving the reference design away.
  function suggestedParts(problem) {
    if (mode !== 'practice' && mode !== 'challenge') return null;
    const designs = problem?.editorial?.designs || [];
    const allowed = problem?.palette && problem.palette.length ? new Set(problem.palette) : null;
    const ok = (t) => catalog.elementById.has(t) && (!allowed || allowed.has(t));
    if (problem?.difficulty !== 'Easy' || !designs.length) {
      const list = ['regional-lb', 'vm-fleet', 'cache', 'sql-primary', 'queue', 'worker-pool'].filter(ok);
      for (const groups of Object.values(problem?.requires || {})) for (const g of groups) if (g[0] && ok(g[0]) && !list.includes(g[0])) list.push(g[0]);
      for (const c of problem?.requirements?.compliance || []) {
        const def = world.complianceChecks.find((x) => x.id === c);
        const id = def?.satisfiedBy?.[0];
        if (id && ok(id) && !list.includes(id)) list.push(id);
      }
      return list.length ? { list: list.slice(0, 10), title: 'Common starting parts' } : null;
    }
    // the intro's four parts first, then what the first reference design adds
    const list = ['regional-lb', 'vm-fleet', 'cache', 'sql-primary'].filter(ok);
    const skip = new Set(['source', 'observer', 'control']);
    for (const n of designs[0].graph.nodes.slice().sort((a, b) => a.x - b.x)) {
      const k = catalog.elementById.get(n.type)?.kind;
      if (!k || skip.has(k) || list.includes(n.type) || !ok(n.type)) continue;
      list.push(n.type);
    }
    return { list: list.slice(0, 6), title: 'Start with these' };
  }

  // ---- configure for a problem (also used by loadProblem)
  // The very first Practice day a player ever plays is a warm-up: an Easy problem runs without its traffic spike,
  // so a plain design earns an early pass. Retrying plays the full day.
  // The locked client nodes of a starter sit at least one label height apart, so a two-line label never touches the next client.
  function spreadClients(problem) {
    try {
      const nodes = problem.starter?.nodes || [];
      const src = nodes.filter((n) => catalog.elementById.get(n.type)?.kind === 'source').sort((a, b) => a.y - b.y);
      if (src.length < 2) return problem;
      const GAP = 200;
      if (!src.some((n, i) => i && n.y - src[i - 1].y < GAP)) return problem;
      const mid = src.reduce((s, n) => s + n.y, 0) / src.length;
      const at = new Map(src.map((n, i) => [n, Math.round((mid + (i - (src.length - 1) / 2) * GAP) / 20) * 20]));
      return { ...problem, starter: { ...problem.starter, nodes: nodes.map((n) => (at.has(n) ? { ...n, y: at.get(n) } : n)) } };
    } catch { return problem; }
  }
  function warmUpOf(problem) {
    S.warm = false; S.fullEvents = null; S.fullRequirements = null;
    if (problem.twistDay) return problem;
    try {
      if (interview || mode !== 'practice' || problem.difficulty !== 'Easy' || !(problem.events || []).some((e) => e.id === 'viral-spike')) return problem;
      if (Object.keys(store.get('progress', {}) || {}).length) return problem;
      if (Object.keys(store.get('warmups', {}) || {}).length) return problem;
    } catch { return problem; }
    S.warm = true; S.fullEvents = problem.events; S.fullRequirements = problem.requirements;
    return { ...problem, events: problem.events.filter((e) => e.id !== 'viral-spike'), requirements: { ...problem.requirements, peakRps: Math.max(1, Math.round((problem.requirements?.peakRps || 1000) * 0.25)) }, normalPeakRps: problem.requirements.peakRps, warmUp: true };
  }
  function configure(problem, initialGraph) {
    graphVersion++;
    // a twist day plays the same problem on its other event list (content/problems/twists.js); it is practice only
    const base = S.twist && problem.twist ? twistProblem(problem) : problem;
    S.problem = withSource(spreadClients(warmUpOf(base)));
    S.result = null;
    S.pendingTransfer = null;
    S.undo.length = 0; S.redo.length = 0;
    S.lastStatus.clear();
    if (S.sim) { try { S.sim.pause?.(); } catch { /* old sim */ } }
    S.sim = makeSim(S.problem, null);
    let g = initialGraph || null;
    if (!g && !isLesson && !interview && S.problem.id) {
      const d = store.get(`draft.${mode}.${S.problem.id}`, null);
      if (d?.graph && (mode !== 'challenge' || d.seed === S.seed)) g = d.graph;
    }
    if (g) { try { S.sim.loadGraph(g); } catch (e) { toast('Could not restore that design: ' + (e.message || e), 'warn'); } }
    if (!g) for (const n of pathLayout(graph(), catalog)) S.sim.moveNode(n.id, n.x, n.y);
    S.entryGraph = graph();
    S.cur = JSON.stringify(graph());
    toolbar.setPalette(S.problem.palette || null);
    refreshSuggestions();
    reqCard?.el.remove();
    if (stepped) reqCard = createReqCard(right, { catalog, problem: S.problem, advice: !interview && adviceReady() });
    syncInterviewRequirements();
    right.prepend(...(reqCard ? [reqCard.el] : []));
    hud.setPhase('build'); hud.setSpeed(S.speed);
    S.hintsUsed = hints.used();
    if (isPhone()) trafficPanel?.fold(true);
    scene.sync(graph(), flowVersion());
    refreshChecks();
    const goal = S.problem.goal;
    if (goal) {
      const measured = S.est?.nodes?.find(n => n.id === goal.node || n.type === goal.node);
      S.goalBefore = goal.metric === 'util' ? measured?.util : goal.metric === 'availability' ? S.est?.successAtPeak :
        goal.metric === 'errors' ? 1 - (S.est?.successAtPeak || 0) : goal.metric === 'p99' ? Math.max(0, ...Object.values(S.est?.p99AtPeak || {})) : goal.metric === 'cost' ? S.est?.perMonth : null;
    }
    updateEditable();
  }

  function refreshSuggestions() {
    const sug = !interview && adviceReady() ? suggestedParts(S.problem) : null;
    toolbar.setSuggested(sug?.list || null, sug?.title);
  }

  // A lesson demo on a flat day skips the quiet hours: its clock starts two minutes before the first event.
  function lessonLeadIn() {
    if (!isLesson || mode === 'intro' || S.problem.traffic?.curve !== 'flat') return;
    const evs = S.problem.events || [];
    if (!evs.length) return;
    const first = Math.min(...evs.map((e) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(e.at || '')); return m ? (Number(m[1]) * 60 + Number(m[2])) * 60000 : 0; }));
    const lead = first - 120000;
    if (lead > tickMs) { try { S.sim.advance(lead); } catch { /* keep the plain start */ } }
    S.lastClock = S.sim.clockMs;
  }

  // ---- frame loop
  const effectiveSpeed = () => (S.slowUntil > performance.now() ? Math.min(S.speed, 1) : S.speed);
  let hudAt = performance.now();
  offs.push(scene.onFrame((dtRaw) => {
    if (S.destroyed) return;
    const dt = Math.min(dtRaw || 16.7, 100);
    const sim = S.sim;
    let n = 0;
    if (sim.phase === 'running') {
      S.acc += dt * effectiveSpeed() * simMsPerWallMs;
      const t0 = performance.now();
      while (S.acc >= tickMs && n < world.sim.maxTicksPerFrame && sim.phase === 'running') {
        sim.tick(); S.acc -= tickMs; n++;
        if (n > 1 && performance.now() - t0 > 2.5) break; // keep the sim share of a frame inside its 3 ms budget on slow machines
      }
      if (S.acc >= tickMs) { perf.droppedTicks += Math.floor(S.acc / tickMs); S.acc %= tickMs; }
      perf.simMs = performance.now() - t0;
      if (sim.phase === 'done') finish();
    } else perf.simMs = 0;
    perf.ticksPerFrame = n;
    if (perf.droppedTicks !== (S.dropSeen || 0)) S.slowAt = performance.now();
    // the note waits while a coaching caption is up, so it never covers the caption's first line
    const slowOn = S.slowAt > 0 && performance.now() - S.slowAt < 2500 && sim.phase === 'running' && caption.hidden;
    if (!slowNote.hidden !== slowOn) {
      const on = slowOn;
      slowNote.hidden = !on;
      // the phone shows the short form beside the clock, wider screens the whole sentence
      if (on) slowNote.replaceChildren(h('span', { class: 'pl-slow-long', text: `Running slower than ${effectiveSpeed()}x on this device: the day is still correct, it just plays back slower.` }), h('span', { class: 'pl-slow-short', 'aria-hidden': 'true', text: `Slower than ${effectiveSpeed()}x on this device` }));
    }
    const dropped = perf.droppedTicks - (S.dropSeen || 0);
    S.dropSeen = perf.droppedTicks;
    if (interviewClock && !interviewState.complete) {
      const left = 2700 - Math.floor((Date.now() - interviewState.startedAt) / 1000);
      const shown = left >= 0 ? `Interview · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Interview · Overtime';
      if (interviewClock.textContent !== shown) interviewClock.textContent = shown;
    }
    if (performance.now() - hudAt >= 250) { hudAt = performance.now(); const d0 = performance.now(); hudTick(); lowEffects(); perf.domMs = performance.now() - d0; }
    try { scene.setFlows(sim.phase === 'build' ? null : sim.flows(), { speed: sim.phase === 'running' ? effectiveSpeed() : 0, dtWallMs: dt, nodeStates: S.nodeStates }); } catch (e) { if (!S.flowErr) { S.flowErr = 1; S.errors.push({ code: 'render', message: String(e?.message || e) }); } }
    if (ctx.recordFrame) {
      try {
        const rs = scene.stats();
        ctx.recordFrame({ dtWallMs: dtRaw || 16.7, simMs: perf.simMs, renderMs: rs.renderMsLast ?? rs.renderMs, ticks: n, dropped, particles: rs.particles, quality: rs.quality, domMs: perf.domMs || 0, idle: !!rs.idle });
      } catch { /* perf is optional */ }
    }
  }));
  // When frames run slow enough that rendering drops to its lowest quality, the frosted-glass blur goes too.
  function lowEffects() {
    let q = '';
    try { q = scene.stats().quality; } catch { return; }
    const low = q === 'low' || ctx.settings.get('quality') === 'low';
    if ((document.documentElement.dataset.fx === 'low') !== low) document.documentElement.dataset.fx = low ? 'low' : 'full';
  }
  function hudTick() {
    if (S.sim.phase === 'build') return;
    const st = S.sim.state();
    S.nodeStates = st.nodes;
    hud.update(st, { problem: S.problem, types: Object.keys(S.problem.requirements.mix || {}), goalMetric: S.problem.goal?.metric || (mode === 'intro' ? 'availability' : null), goalMet: S.goalMet });
    if (S.selected) inspector.update(st.nodes.find((n) => n.id === S.selected));
    let maxUtil = 0;
    for (const nd of st.nodes) if (nd.util > maxUtil) maxUtil = nd.util;
    try { ctx.audio?.setLoad(clamp(maxUtil, 0, 1)); } catch { /* optional */ }
    if (S.problem.goal) checkGoal(st);
  }

  // ---- sandbox traffic
  function rebuildSim(extra = {}) {
    const g = graph();
    const wasRunning = S.sim.phase === 'running' || S.sim.phase === 'paused';
    const clock = S.sim.clockMs;
    S.problem = { ...S.problem, ...extra };
    try { S.sim.pause?.(); } catch { /* old sim */ }
    S.sim = makeSim(S.problem, g);
    if (wasRunning) { S.sim.start(); if (clock > 0) S.sim.advance(clock); }
    S.acc = 0;
    scene.sync(graph(), flowVersion());
    S.nodeStates = S.sim.state().nodes;
    updateEditable();
  }
  function applyTraffic(t) {
    S.traffic = t;
    saveDraft();
    if (typeof S.sim.setTraffic === 'function') { S.sim.setTraffic(t); return; }
    rebuildSim({ requirements: { ...S.problem.requirements, peakRps: t.peakRps, mix: t.mix, userRegions: t.userRegions }, traffic: { ...S.problem.traffic, curve: t.curve } });
  }
  function fireEvent(id) {
    const def = catalog.eventById.get(id);
    if (typeof S.sim.fireEvent === 'function') { S.sim.fireEvent(id); return; }
    if (S.sim.phase === 'build') { startTraffic(); }
    const at = clockLabel(Math.min(86340000, Math.ceil((S.sim.clockMs + tickMs) / 60000) * 60000));
    S.sandboxEvents.push({ id, at });
    rebuildSim({ events: [...S.sandboxEvents] });
    toast(`${def?.name || id} fires at ${at}.`, 'info');
  }
  if (isSandbox) {
    trafficPanel = createTrafficPanel(right, { catalog, initial: trafficInput(opts.traffic || (!opts.graph && store.get('draft.sandbox.sandbox', null)?.traffic)), onChange: applyTraffic, onFire: fireEvent });
  }

  // ---- keyboard
  function onKey(ev) {
    if (S.destroyed || ev.defaultPrevented) return;
    const t = ev.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (ev.key === 'Escape') {
      if (!modal.hidden) { modal.hidden = true; return; }
      if (!editorialWrap.hidden) { closeEditorial(); return; }
      if (hints.isOpen()) { closeHints(); return; }
      cancelModes(); if (S.selected) select(null); return;
    }
    if (typing || !root.isConnected) return;
    if (!debriefWrap.hidden || !editorialWrap.hidden || !panel.hidden) { if (ev.key !== 'h' && ev.key !== 'H') return; }
    const k = ev.key;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && k.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
    if (mod && k.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'd') { ev.preventDefault(); if (S.selected) duplicate(S.selected); return; }
    if (mod || ev.altKey) return;
    if (k === '/') { ev.preventDefault(); toolbar.focusSearch(); }
    else if (k === 'f' || k === 'F') fitAll();
    else if (k === 'Delete' || k === 'Backspace') { if (S.selected) { ev.preventDefault(); removeNode(S.selected); } }
    else if (k === 'Enter') { if (S.sim.phase === 'build' && t === document.body) { ev.preventDefault(); hud.markRan(); startFromUi(); } }
    else if (k === ' ') { ev.preventDefault(); if (S.sim.phase === 'running') pause(); else if (S.sim.phase === 'paused') { hud.markRan(); resume(); } }
    else if (k >= '1' && k <= '7') { hud.markRan(); setSpeed(world.sim.speeds[+k - 1]); }
    else if (k === 'h' || k === 'H') { if (stepped && !interview) hints.toggle(); }
    else if (k === 'm' || k === 'M') { try { ctx.settings.set('soundMuted', !ctx.settings.get('soundMuted')); } catch { /* optional */ } }
  }
  document.addEventListener('keydown', onKey);
  const onErr = (e) => S.errors.push({ code: 'runtime', message: String(e.message || e.reason?.message || e.reason || 'error') });
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  scrim.addEventListener('click', () => { /* the panel is a step; clicks outside do nothing */ });

  // ---- theme, motion, quality
  offs.push(bus.on('theme', () => { try { scene.setTheme(ctx.palette(), ctx.theme()); } catch { /* optional */ } hud.refreshColors(); }));
  offs.push(bus.on('settings', ({ key }) => {
    try {
      if (key === 'reducedMotion') scene.setReducedMotion(ctx.reducedMotion());
      if (key === 'quality') scene.setQuality(ctx.settings.get('quality'));
      if (key === 'theme' || key === 'highContrast') hud.refreshColors();
    } catch { /* optional */ }
  }));

  // ---- state for tests
  // Camera zoom and the free canvas area, for tests: the on-screen label size is 12 px times the label scale times the zoom.
  function viewInfo() {
    try { const stats = scene.stats(), z = stats.zoom; return { zoom: z, cameraMoving: stats.cameraMoving, moving: stats.cameraMoving || !!fitAllTimer, labelPx: stats.labelPx, diagram: scene.measureDiagram(), free: freeArea(), screen: graph().nodes.map((n) => ({ id: n.id, ...scene.worldToScreen(n.x, n.y) })) }; } catch (e) { return { error: String(e) }; }
  }
  function getState() {
    const sim = S.sim;
    const st = sim.state();
    const g = graph();
    const live = new Map((st.nodes || []).map((n) => [n.id, n]));
    const rps = new Map((st.edges || []).map((e) => [e.id, e.rps]));
    let issues = [];
    try { issues = sim.validate() || []; } catch { /* ignore */ }
    const cp = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
    return {
      route: ctx.router?.current?.()?.path ?? '',
      mode, problemId: S.problem.id, step: S.step,
      phase: sim.phase, clock: { simMs: st.clockMs, label: st.clockLabel || clockLabel(st.clockMs || 0) }, speed: S.sim.phase === 'paused' ? 0 : S.speed,
      nodes: g.nodes.map((n) => {
        const l = live.get(n.id) || {};
        return { id: n.id, type: n.type, x: n.x, y: n.y, units: n.units, zones: n.zones, region: n.region, tier: n.tier, util: l.util ?? 0, status: typeof l.status === 'number' ? STATUS_NAMES[l.status] : (l.status || 'ok'), p99Ms: l.p99Ms ?? 0, failRps: l.failRps ?? 0, queueDepth: l.queueDepth ?? 0, retryRps: l.retryRps ?? 0, ...(l.oldestJobAgeSec != null ? { oldestJobAgeSec:l.oldestJobAgeSec, queueLimitSec:l.queueLimitSec, queueAcceptedRps:l.queueAcceptedRps, queueDrainRps:l.queueDrainRps } : {}) };
      }),
      edges: g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, rps: rps.get(e.id) ?? 0 })),
      traffic: cp(st.traffic), slo: cp(st.slo), cost: cp(st.cost),
      score: S.result ? { ...cp(S.result.score), stars: S.result.stars, passed: S.result.passed } : null,
      scoreLive: cp(st.scoreLive), events: cp(st.events),
      errors: [...issues.map((i) => ({ code: i.code, message: i.message, nodeId: i.nodeId })), ...S.errors],
      view: viewInfo(),
    };
  }
  // Synchronous step for tests: a paused day stays paused afterwards.
  function advanceSync(simMs) {
    if (S.hold) startTraffic(); // stepping a held lesson clock starts the day
    if (S.sim.phase === 'build') return getState();
    if (S.sim.phase === 'running' || S.sim.phase === 'paused') {
      const wasPaused = S.sim.phase === 'paused';
      if (wasPaused) S.sim.resume();
      S.sim.advance(simMs);
      if (wasPaused && S.sim.phase === 'running') S.sim.pause();
      hud.setPhase(S.sim.phase === 'done' ? 'done' : S.sim.phase);
      if (S.sim.phase === 'done') finish();
    }
    try { scene.setFlows(S.sim.flows(), { speed: 0, dtWallMs: 16, nodeStates: S.sim.state().nodes }); } catch { /* optional */ }
    hudTick();
    scene.renderNow(0);
    return getState();
  }

  // ---- boot
  const first = opts.problem || (isSandbox || isLesson ? pseudoProblem() : ctx.content?.problems?.[0]);
  if (!first) throw new Error('mountPlay needs a problem');
  hints.el.setAttribute('data-hints', '');
  configure(first, opts.graph || null);
  if (opts.overlay?.graph) {
    const target = bestOf(opts.overlay.score ?? opts.overlay.target);
    if (target != null) {
      const by = opts.overlay.name ? ` by ${opts.overlay.name}` : '';
      const chip = h('div', { class: 'pl-target' }, iconEl('ui.trophy', 16), `Beat ${Math.round(target)}${by}`, opts.overlay.verified ? h('span', { class: 'pl-badge pl-badge--ok' }, iconEl('ui.verified', 12), 'verified') : null);
      top.append(chip);
    }
  }
  if (stepped) {
    const seen = ctx.progress?.get?.(S.problem.id)?.attempts > 0;
    go(interview ? 'clarify' : opts.graph || seen || mode === 'beat' ? 'draw' : 'clarify');
  } else {
    stepsBar?.set('draw');
    top.classList.add('pl-top--plain');
  }
  if (isPhone()) trafficPanel?.fold(true);
  later(() => { if (!S.destroyed) fitEntry(); }, 60);
  // Panels keep the canvas clear: their edges follow the HUD's real height.
  let hudObs = null, toolbarObs = null, hudSyncFrame = 0;
  const syncHud = () => {
    if (S.destroyed) return;
    const r = hud.el.getBoundingClientRect(), rr = root.getBoundingClientRect();
    root.style.setProperty('--pl-hud-h', Math.round(r.height) + 'px');
    root.style.setProperty('--pl-hud-end', Math.round(r.bottom - rr.top) + 'px');
    const tb = top.getBoundingClientRect();
    root.style.setProperty('--pl-top-end', Math.round(tb.bottom - rr.top) + 'px');
    const coachBlocks = [root.querySelector('.pl-trace'), goalChip].filter(el => el && !el.hidden && el.offsetParent);
    const coachTop = Math.max(r.bottom, ...coachBlocks.map(el => el.getBoundingClientRect().bottom));
    root.style.setProperty('--pl-coach-top', Math.ceil(coachTop - rr.top + 8) + 'px');
    const toolsBox = tools.getBoundingClientRect();
    const slotL = Math.max(tb.left, ...[...top.children].filter((el) => el !== tools && !el.hidden && el.offsetParent).map((el) => el.getBoundingClientRect().right)) + 12;
    const slotW = toolsBox.left - 12 - slotL;
    const slot = !isPhone() && !isLesson && toolsBox.width > 0 && slotW >= 300;
    root.classList.toggle('pl-slot', slot);
    if (slot) { root.style.setProperty('--pl-slot-l', Math.round(slotL - rr.left) + 'px'); root.style.setProperty('--pl-slot-w', Math.floor(slotW) + 'px'); }
    syncFocusMap();
    freeArea();
  };
  // When a panel changes size (the status bar grows with live meters, the traffic panel folds), a diagram that now runs
  // underneath a panel is fitted back into the free part of the canvas.
  const nodesHidden = () => {
    try {
      const a = freeArea();
      return graph().nodes.some((n) => {
        const sp = scene.worldToScreen(n.x, n.y);
        return sp.x < a.l + 40 || sp.x > a.w - a.r - 40 || sp.y < a.t + 40 || sp.y > a.h - a.b - 70;
      });
    } catch { return false; }
  };
  right.addEventListener('click', () => refitSoon());
  let refitT = 0;
  const refitSoon = (viewportChanged = false) => {
    if (S.booted && !viewportChanged) return;
    clearTimeout(refitT);
    refitT = setTimeout(() => {
      if (S.destroyed || S.connectFrom || (!viewportChanged && !(S.sim.phase !== 'build' || isLesson || isSandbox)) || !nodesHidden()) return;
      if (viewportChanged) { fitView(true); return; }
      const remaining = (S.editUntil || 0) - performance.now();
      if (remaining > 0) { refitT = setTimeout(refitSoon, remaining + 20); return; }
      fitView(true, null, true);
      // a big diagram that still does not fit between the panels gets the room the open traffic panel was using, and then
      // zooms out a little further than usual so the whole of it shows
      if (isPhone() || isLesson) return;
      later(() => {
        if (S.destroyed || !nodesHidden()) return;
        if (trafficPanel?.isOpen?.()) trafficPanel.fold(true);
        later(() => { if (!S.destroyed) { fitView(true); later(() => { if (!S.destroyed && nodesHidden()) fitView(true, 0.32); }, 400); } }, 80);
      }, 400);
    }, 300);
  };
  try {
    let lastSize = { width: root.clientWidth, height: root.clientHeight };
    hudObs = new ResizeObserver(() => {
      if (hudSyncFrame) return;
      // Reconcile styles after resize delivery; moving panels inside it can resize observed descendants again.
      hudSyncFrame = requestAnimationFrame(() => {
        hudSyncFrame = 0;
        if (S.destroyed) return;
        const nextSize = { width: root.clientWidth, height: root.clientHeight };
        const resized = nextSize.width !== lastSize.width || nextSize.height !== lastSize.height;
        lastSize = nextSize;
        syncHud();
        if (resized) refreshChecks();
        refitSoon(resized);
        if (!resized && stepped && S.booted && !S.viewManual && S.step === 'day' && diagramCovered()) fitView(true);
      });
    });
    hudObs.observe(hud.el); hudObs.observe(root); hudObs.observe(top);
    hudObs.observe(right);
    hudObs.observe(caption); hudObs.observe(goalChip);
    const traceEl = root.querySelector('.pl-trace');
    if (traceEl) hudObs.observe(traceEl);
    // on phones the diagram is fitted above the parts drawer whenever it opens or closes
    let drawerWas = toolbar.el.classList.contains('pl-toolbar--open');
    toolbarObs = new MutationObserver(() => {
      const on = toolbar.el.classList.contains('pl-toolbar--open');
      if (on === drawerWas) return;
      drawerWas = on;
      if (isPhone() && !S.destroyed && !S.booted) later(() => { if (!S.destroyed) fitView(true, null, true); }, 340);
    });
    toolbarObs.observe(toolbar.el, { attributes: true, attributeFilter: ['class'] });
  } catch { syncHud(); }
  const wirePreview = h('output', { class: 'pl-wire-preview', hidden: '', 'aria-live': 'polite' }); root.append(wirePreview);
  offs.push(scene.on('connect:preview', pair => {
    root.classList.toggle('pl-connecting', !!pair || !!S.connectFrom);
    wirePreview.hidden = !pair?.to;
    if (!pair?.to) return;
    const name = id => { const n = graph().nodes.find(n => n.id === id); return catalog.elementById.get(n?.type)?.name || id; };
    const a = graph().nodes.find(n => n.id === pair.from), b = graph().nodes.find(n => n.id === pair.to);
    const normalized = S.sim.canConnect(a?.type, b?.type);
    wirePreview.textContent = `${name(normalized.swap ? pair.to : pair.from)} → ${name(normalized.swap ? pair.from : pair.to)} · ${pair.ok ? 'Release to connect' : 'This connection is not allowed'}`;
  }));
  offs.push(scene.on('placement:preview', preview => {
    const plan = preview?.plan;
    wirePreview.hidden = !preview;
    if (!preview) return;
    wirePreview.textContent = !plan ? 'Place beside this route. Connect it separately.' : plan.kind === 'side'
      ? `Add a side call to ${catalog.elementById.get(preview.type).name}. Keep ${nameOf(plan.source.id)} → ${nameOf(plan.target.id)}.`
      : `Insert ${catalog.elementById.get(preview.type).name} between ${nameOf(plan.source.id)} and ${nameOf(plan.target.id)}.`;
  }));
  bus.emit('play:loaded', { mode, problemId: S.problem.id ?? null, lessonId: opts.lesson?.id ?? null });
  bus.emit('play:graph', { graph: graph() });
  if (isLesson) {
    if (S.problem.goal) { goalChip.hidden = false; goalChip.replaceChildren(iconEl('ui.hint', 16), h('span', { text: goalLabel() })); }
    // A lesson goal step waits for the first edit before the day starts, so the meters do not run red while the player reads.
    const stepNow = opts.lesson?.steps?.[opts.stepIndex || 0];
    S.hold = mode === 'lesson' && stepNow?.kind === 'demo' && !!S.problem.goal;
    if (S.hold) {
      goalChip.hidden = false;
      goalChip.replaceChildren(iconEl('ui.hint', 16), h('span', { text: 'The day starts at your first change.' }));
    } else startTraffic();
    // the intro opens at dawn, so the first thing to do comes within seconds
    if (mode === 'intro') { try { S.sim.advance(6 * 3600000); } catch { /* keep the plain start */ } S.lastClock = S.sim.clockMs; }
    if (!S.hold) lessonLeadIn();
    const step = opts.lesson?.steps?.[opts.stepIndex || 0];
    if (step?.kind === 'script') runScript(step.beats || []);
    else if (S.problem.hints?.length && !(mode === 'lesson' && S.problem.goal)) showCaption(S.problem.hints[0], 0);
  }
  syncUndoButtons();
  if (mode === 'lesson') toolbar.el.classList.add('pl-toolbar--folded');
  S.booted = true;

  // ---- controller
  const controller = {
    perf,
    state: S,
    async loadProblem(id) {
      const p = ctx.content?.problemById?.get(id);
      if (!p) throw new Error('Unknown problem: ' + id);
      if (S.problem?.id !== id) { resetHostForProblem(); configure(p, null); }
      else if (S.sim.phase !== 'build') resetToDraw();
      S.sim.phase === 'build' && go('draw');
      fitView(false);
      return getState();
    },
    placeComponent, connect, setKnob,
    getTraffic: () => trafficPanel?.get() || null,
    startTraffic: () => startTraffic(true), setSpeed, step: advanceSync, getState, pause, reset,
    resume,
    destroy() {
      if (S.destroyed) return;
      S.destroyed = true;
      if (isSandbox) saveDraft();
      saveDraft.flush?.();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
      offs.forEach((o) => { try { o(); } catch { /* ignore */ } });
      timers.forEach(clearTimeout);
      clearTimeout(captionTimer);
      try { S.sim.pause?.(); } catch { /* ignore */ }
      try { toolbar.destroy(); } catch { /* ignore */ }
      try { trafficPanel?.destroy(); } catch { /* ignore */ }
      try { ctx.audio?.setLoad(0); } catch { /* ignore */ }
      try { hudObs?.disconnect(); toolbarObs?.disconnect(); } catch { /* ignore */ }
      cancelAnimationFrame(hudSyncFrame);
      clearTimeout(refitT);
      try { scene.destroy(); } catch { /* ignore */ }
      root.remove();
    },
  };
  function resetHostForProblem({ preserveReference = false } = {}) {
    S.twist = false;
    if (!preserveReference) S.refSig = null;
    S.correctnessAnswer = undefined; S.checkpointReady = null; S.workedRepair = false; S.prediction = null; hints.reset();
    S.revealed.clear(); S.guesses = {}; S.selected = null; inspector.hide(); debriefWrap.hidden = true; editorialWrap.hidden = true;
    hud.hideBanner(); hud.resetHistory();
  }
  return controller;
}
