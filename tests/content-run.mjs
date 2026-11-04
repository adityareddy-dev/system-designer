// Content check: every problem and lesson against the catalog, and every editorial design played through a full day.
// Run from the app folder: node tests/content-run.mjs [--json out.json] [problemId ...]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const app = '.';
const J = (f) => JSON.parse(fs.readFileSync(path.join(app, f), 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(app, f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems, groups } = await imp('content/problems/index.js');
const { lessons } = await imp('content/lessons/index.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const only = new Set(args.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1));

const issues = [];
const bad = (where, msg) => issues.push(`${where}: ${msg}`);
const ids = new Set();
const lessonIds = new Set(lessons.map((l) => l.id));
const curves = new Set([...Object.keys(catalog.world.curves), 'deadline', 'drop']);
const compliance = new Set((catalog.world.complianceChecks || []).map((c) => c.id));

function checkProblem(p) {
  const w = p.id;
  if (ids.has(w)) bad(w, 'duplicate id'); ids.add(w);
  if (!['Easy', 'Medium', 'Hard'].includes(p.difficulty)) bad(w, 'difficulty ' + p.difficulty);
  for (const c of p.concepts || []) if (!lessonIds.has(c)) bad(w, 'concept ' + c);
  const r = p.requirements || {};
  const mixSum = Object.values(r.mix || {}).reduce((a, b) => a + b, 0);
  if (Math.abs(mixSum - 1) > 0.001) bad(w, 'mix sums to ' + mixSum);
  for (const t of Object.keys(r.mix || {})) if (!catalog.typeIndex.has(t)) bad(w, 'request type ' + t);
  if (!curves.has(p.traffic?.curve)) bad(w, 'curve ' + p.traffic?.curve);
  for (const c of r.compliance || []) if (compliance.size && !compliance.has(c)) bad(w, 'compliance ' + c);
  for (const e of p.events || []) if (!catalog.eventById.has(e.id)) bad(w, 'event ' + e.id);
  for (const e of p.eventPool || []) if (!catalog.eventById.has(e)) bad(w, 'pool event ' + e);
  const asks = (p.numbers || []).filter((n) => n.ask).length;
  if (asks < 1 || asks > 3) bad(w, 'numbers ask count ' + asks);
  if ((p.hints || []).length !== 3) bad(w, 'hints ' + (p.hints || []).length);
  if (!(p.clarify || []).length) bad(w, 'no clarify');
  if (!p.editorial?.designs?.length) bad(w, 'no editorial design');
  for (const d of p.editorial?.designs || []) for (const n of d.graph.nodes) if (!catalog.elementById.has(n.type)) bad(w, `design "${d.name}" element ${n.type}`);
}

function runDesign(p, graph) {
  const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
  if (graph) sim.loadGraph(graph);
  const g = sim.getGraph();
  const errs = sim.validate().filter((i) => i.level === 'error').map((i) => i.message);
  const t0 = performance.now();
  sim.start();
  sim.advance(86400000);
  const ms = performance.now() - t0;
  const r = sim.result();
  return {
    nodes: g.nodes.length, edges: g.edges.length, droppedEdges: graph ? (graph.edges.length - g.edges.length) : 0,
    passed: r.passed, stars: r.stars, score: Math.round(r.score.total), parts: r.score,
    avail: r.slo.availability.actual, availTarget: r.slo.availability.target,
    p99: r.slo.latency.worstP99Ms, p99Target: r.slo.latency.targetMs, latShare: r.slo.latency.shareOk,
    cost: Math.round(r.slo.cost.perMonth), budget: r.slo.cost.budget,
    lost: r.slo.safety.lostWrites, dup: r.slo.safety.duplicates, stale: r.slo.safety.staleReads, compFailed: r.slo.safety.compliance?.failed || [],
    errors: errs, ms: Math.round(ms), next: r.nextStep?.text,
  };
}

const rows = [];
for (const p of problems) {
  checkProblem(p);
  if (only.size && !only.has(p.id)) continue;
  const starter = runDesign(p, null);
  const designs = (p.editorial?.designs || []).map((d) => ({ name: d.name, expect: d.expect, ...runDesign(p, d.graph) }));
  // An editorial design must not trip the game's own rule that units are at least the zone count.
  (p.editorial?.designs || []).forEach((d, i) => {
    const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
    sim.loadGraph(d.graph);
    for (const v of sim.validate()) if (v.code === 'zones-units') bad(p.id, `design ${i} breaks units >= zones: ${v.message}`);
  });
  rows.push({ id: p.id, group: p.group, difficulty: p.difficulty, starterScore: starter.score, designs });
}

// Lessons: every demo and script step builds and runs a day without throwing.
const lessonRows = [];
for (const l of lessons) {
  if (!Array.isArray(l.steps) || !l.steps.length) bad(l.id, 'no steps');
  const quizzes = l.steps.filter((s) => s.kind === 'quiz');
  if (quizzes.length !== 3) bad(l.id, 'quiz count ' + quizzes.length);
  for (const q of quizzes) if (!(q.answer >= 0 && q.answer < q.choices.length)) bad(l.id, 'quiz answer out of range');
  l.steps.forEach((s, i) => {
    if (s.kind !== 'demo' && s.kind !== 'script') return;
    const setup = s.setup || {};
    for (const t of setup.palette || []) if (!catalog.elementById.has(t)) bad(l.id, 'palette ' + t);
    try {
      const prob = { id: l.id, requirements: setup.requirements, traffic: setup.traffic, starter: setup.starter, events: setup.events || [] };
      const sim = createSim({ catalog, problem: prob, seed: 'lesson-' + l.id, mode: 'lesson' });
      const g = sim.getGraph();
      const starterEdges = (setup.starter?.edges || []).length;
      if (g.edges.length !== starterEdges) bad(l.id, `step ${i}: ${starterEdges - g.edges.length} starter edges refused`);
      sim.start(); sim.advance(86400000);
      const st = sim.state();
      lessonRows.push({ id: l.id, step: i, kind: s.kind, goal: s.goal || null, avail: st.slo.availability.actual, nodes: st.nodes.map((n) => `${n.id}:${n.util}`).join(' ') });
    } catch (e) { bad(l.id, `step ${i} throws: ${e.message}`); }
  });
}

const summary = {
  problems: problems.length, groups: groups.map((g) => `${g.id}:${g.problems.length}`).join(' '), lessons: lessons.length,
  designsRun: rows.reduce((a, r) => a + r.designs.length, 0),
  firstDesignPassed: rows.filter((r) => r.designs[0]?.passed).length,
  anyDesignPassed: rows.filter((r) => r.designs.some((d) => d.passed)).length,
  notWinnable: rows.filter((r) => !r.designs.some((d) => d.passed)).map((r) => r.id),
  issues,
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, rows, lessonRows }, null, 1));
for (const r of rows) {
  for (const d of r.designs) {
    console.log(`${d.passed ? 'PASS' : 'FAIL'} ${r.id.padEnd(24)} ${String(d.score).padStart(4)} ${'*'.repeat(d.stars).padEnd(3)} avail ${(d.avail * 100).toFixed(2)}/${(d.availTarget * 100).toFixed(2)} p99 ${Math.round(d.p99)}/${d.p99Target} lat ${(d.latShare * 100).toFixed(1)} $${d.cost}/${d.budget} lost ${Math.round(d.lost)} dup ${Math.round(d.dup)} stale ${Math.round(d.stale)} comp ${d.compFailed.join(',')} err ${d.errors.length} drop ${d.droppedEdges} ${d.ms}ms "${d.name}"`);
  }
}
console.log(JSON.stringify(summary, null, 1));
