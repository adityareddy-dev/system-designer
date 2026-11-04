// Test hooks: the rolling monitor behind window.__perf, the GameState shape behind window.__game, and a headless game.
import { createSim } from './engine.js';

// Rolling frame statistics over the last `size` frames. main.js assigns perf.data to window.__perf
// and calls perf.record(...) once per frame from the play frame loop.
export function createPerf({ size = 120 } = {}) {
  const frame = new Float64Array(size), sim = new Float64Array(size), render = new Float64Array(size), ticks = new Float64Array(size);
  const sorted = new Float64Array(size);
  let i = 0, n = 0, sinceP95 = 0;
  const data = { frameMs: 0, frameMsP95: 0, simMs: 0, renderMs: 0, ticksPerFrame: 0, droppedTicks: 0, particles: 0, fps: 0, quality: 'auto', domMs: 0, idle: false };
  const mean = (arr) => { let s = 0; for (let k = 0; k < n; k++) s += arr[k]; return n ? s / n : 0; };
  function record({ dtWallMs = 16.7, simMs = 0, renderMs = 0, ticks: tk = 0, dropped = 0, particles, quality, domMs, idle } = {}) {
    if (domMs != null) data.domMs = Math.round(domMs * 100) / 100;
    if (idle != null) data.idle = !!idle;
    frame[i] = dtWallMs; sim[i] = simMs; render[i] = renderMs; ticks[i] = tk;
    i = (i + 1) % size;
    if (n < size) n++;
    data.frameMs = Math.round(mean(frame) * 100) / 100;
    data.simMs = Math.round(mean(sim) * 1000) / 1000;
    data.renderMs = Math.round(mean(render) * 1000) / 1000;
    data.ticksPerFrame = Math.round(mean(ticks) * 100) / 100;
    data.droppedTicks += dropped;
    if (particles != null) data.particles = particles;
    if (quality != null) data.quality = quality;
    data.fps = data.frameMs > 0 ? Math.round(1000 / data.frameMs) : 0;
    if (++sinceP95 >= 10 || n < 10) {
      sinceP95 = 0;
      sorted.set(frame);
      const view = sorted.subarray(0, n).sort();
      data.frameMsP95 = Math.round(view[Math.min(n - 1, Math.floor(n * 0.95))] * 100) / 100;
    }
    return data;
  }
  function reset() { i = 0; n = 0; frame.fill(0); sim.fill(0); render.fill(0); ticks.fill(0); data.droppedTicks = 0; }
  return { data, record, reset };
}

// Builds the GameState shape (CONTRACT 13.1) from a sim plus what play knows (route, step, speed, caught errors).
export function toGameState(sim, extra = {}) {
  if (!sim) {
    return { route: extra.route ?? '', mode: extra.mode ?? null, problemId: null, step: extra.step ?? null, phase: null, clock: { simMs: 0, label: '00:00' },
      speed: extra.speed ?? 1, nodes: [], edges: [], traffic: null, slo: null, cost: null, score: null, scoreLive: null, events: [], errors: [...(extra.errors || [])] };
  }
  const st = sim.state();
  const g = sim.getGraph();
  const res = sim.result();
  const live = new Map(st.nodes.map((n) => [n.id, n]));
  const edgeRps = new Map(st.edges.map((e) => [e.id, e.rps]));
  const issues = sim.phase === 'build' ? sim.validate() : [];
  const step = extra.step ?? (sim.phase === 'build' ? 'draw' : sim.phase === 'done' ? 'debrief' : 'day');
  return {
    route: extra.route ?? '',
    mode: sim.mode,
    problemId: extra.problemId ?? sim.problem.id,
    step,
    phase: st.phase,
    clock: { simMs: st.clockMs, label: st.clockLabel },
    speed: extra.speed ?? 1,
    nodes: g.nodes.map((n) => {
      const l = live.get(n.id) || {};
      return { id: n.id, type: n.type, x: n.x, y: n.y, units: l.units ?? n.units, zones: n.zones, region: n.region, tier: n.tier,
        util: l.util ?? 0, status: l.status ?? 'ok', p99Ms: l.p99Ms ?? 0, failRps: l.failRps ?? 0, queueDepth: l.queueDepth ?? 0 };
    }),
    edges: g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, rps: edgeRps.get(e.id) ?? 0 })),
    traffic: st.traffic,
    slo: st.slo,
    cost: st.cost,
    score: res ? { ...res.score, stars: res.stars, passed: res.passed } : null,
    scoreLive: st.scoreLive,
    events: st.events,
    errors: [
      ...issues.filter((x) => x.level === 'error').map((x) => (x.nodeId ? { code: x.code, message: x.message, nodeId: x.nodeId } : { code: x.code, message: x.message })),
      ...(extra.errors || []),
    ],
  };
}

// The window.__game surface on the sim alone (no canvas). Used by Node tests and as a fallback before play mounts.
// findProblem(id) and findLesson(id) return content objects; lessons map to a problem through lessonProblem(lesson, stepIndex).
export function createHeadlessGame({ catalog, findProblem, findLesson, lessonProblem }) {
  let sim = null, problemId = null, speed = 1, step = null, route = '';
  const errors = [];
  const state = () => toGameState(sim, { route, problemId, step, speed, errors });
  const need = () => { if (!sim) throw new Error('Load a problem, the sandbox or a lesson first.'); return sim; };
  return {
    async loadProblem(id) {
      const p = findProblem(id);
      if (!p) throw new Error(`Unknown problem "${id}".`);
      sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
      problemId = id; step = 'draw'; route = `#/practice/${id}`;
      return state();
    },
    async loadSandbox() {
      sim = createSim({ catalog, problem: null, seed: 'sandbox', mode: 'sandbox' });
      problemId = null; step = 'draw'; route = '#/sandbox';
      return state();
    },
    async loadLesson(id, stepIndex) {
      const lesson = findLesson ? findLesson(id) : null;
      if (!lesson) throw new Error(`Unknown lesson "${id}".`);
      const p = lessonProblem ? lessonProblem(lesson, stepIndex) : null;
      sim = createSim({ catalog, problem: p, seed: `lesson-${id}`, mode: 'lesson' });
      problemId = null; step = 'draw'; route = `#/learn/${id}`;
      return state();
    },
    placeComponent(type, x, y) { return need().addNode(type, x, y); },
    connect(fromId, toId) { return need().connect(fromId, toId); },
    setKnob(nodeId, knob, value) { return need().setKnob(nodeId, knob, value); },
    startTraffic() { need().start(); step = 'day'; },
    setSpeed(n) { speed = n; },
    step(simMs) {
      const s = need();
      try { s.advance(simMs); } catch (e) { errors.push({ code: 'runtime', message: String(e && e.message || e) }); }
      if (s.phase === 'done') step = 'debrief';
      return state();
    },
    getState: state,
    get sim() { return sim; },
  };
}
