// Re-measures the problem bank: sizes each reference design so it holds its own traffic day under the pass rule,
// keeps uptime targets at realistic levels, sets budgets from the most expensive reference's measured cost, and records
// measured expect values. Writes content/problems/calibration.js.
// Run from the app folder: node tests/calibrate.mjs [--write] [--no-size] [--no-budget] [--no-latency] [problemId ...]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyPromises } from '../content/problems/promises.js';
import { applyEvidence } from '../content/problems/evidence.js';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { sourceFiles, fixes, problemById } = await imp('content/problems/index.js');
const { applyCalibration } = await imp('content/problems/calibrate.js');
const current = (await imp('content/problems/calibration.js')).default;
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });

const args = process.argv.slice(2);
const write = args.includes('--write');
const size = !args.includes('--no-size');
const budget = !args.includes('--no-budget');
const latency = !args.includes('--no-latency');
const only = new Set(args.filter((a) => !a.startsWith('--')));
const cal = JSON.parse(JSON.stringify(current));
const raw = new Map();
for (const f of sourceFiles) for (const p of f.problems || []) if (!raw.has(p.id)) raw.set(p.id, applyPromises(applyEvidence(applyCalibration(p, fixes[p.id]))));

// Uptime floors: money moves at 99.9 percent or better, everything else at 99.5 or better (never above the brief).
const floorOf = (id, src) => Math.min(src, problemById.get(id)?.group === 'fintech' ? 0.999 : 0.995);
const STEPS = [0.9999, 0.9995, 0.999, 0.998, 0.995];
const TIERS = ['S', 'M', 'L', 'XL'];
const BUDGET_HEADROOM = 1.10; // enough for modest variation, while every reference fits
const LATENCY_MAX_BUMP = 2; // a speed target may at most double from the brief to fit distance and helpers

function run(prob, design) {
  const sim = createSim({ catalog, problem: prob, seed: 'practice', mode: 'practice' });
  sim.loadGraph(design.graph);
  const g = sim.getGraph();
  sim.start();
  sim.advance(86400000);
  return { r: sim.result(), g };
}
const nice = (v) => { const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.ceil(v / m) * m; };
function why(r) {
  const f = [];
  const s = r.slo;
  const c = r.checks || {};
  if (!c.availability) f.push(`avail ${(s.availability.actual * 100).toFixed(3)}/${(s.availability.target * 100).toFixed(2)}`);
  if (!c.latency) f.push(`lat ${(s.latency.shareOk * 100).toFixed(1)}% ` + Object.entries(s.latency.byType).filter(([, v]) => v.shareOk < 0.95).map(([k, v]) => `${k} ${(v.shareOk * 100).toFixed(0)}%/${v.targetMs}`).join(' '));
  if (!c.safety) f.push(`safety lost ${Math.round(s.safety.lostWrites)} dup ${Math.round(s.safety.duplicates)} stale ${s.safety.staleShare} comp ${s.safety.compliance.failed}`);
  if (!c.cost) f.push(`cost x${(s.cost.perMonth / s.cost.budget).toFixed(2)}`);
  return f.join(' | ');
}

const lines = [];
for (const [id, base] of raw) {
  if (only.size && !only.has(id)) continue;
  const c = cal[id] || (cal[id] = {});
  c.designs = c.designs || {};
  const designsN = (base.editorial?.designs || []).length;
  const srcAvail = base.requirements.availability ?? 0.99;
  // start from the brief's uptime target; budgets are re-derived from scratch each run
  if (c.requirements) { if (size) delete c.requirements.availability; if (budget) delete c.requirements.budgetPerMonth; }

  for (let i = 0; i < designsN; i++) {
    const dc = c.designs[i] || (c.designs[i] = {});
    dc.nodes = dc.nodes || {};
    const orig = new Map(applyCalibration(base, { designs: { [i]: { ...dc, nodes: {} } } }).editorial.designs[i].graph.nodes.map((n) => [n.ref, n]));
    for (let it = 0; size && it < 10; it++) {
      const prob = applyCalibration(base, { ...c, requirements: { ...(c.requirements || {}), budgetPerMonth: 1e12 } });
      const { r, g } = run(prob, prob.editorial.designs[i]);
      // a passing design is still sized when a side part sits overloaded for half an hour or more
      const sideHot = (n) => n.peakUtil > 1 && n.minutesOverloaded >= 30;
      if (r.passed && !r.nodes.some(sideHot)) break;
      const slow = !r.checks.latency;
      let changed = false;
      for (const n of r.nodes) {
        const el = catalog.elementById.get(n.type);
        const gn = g.nodes.find((x) => x.id === n.id);
        if (!el || !gn) continue;
        const hot = r.passed ? sideHot(n) : n.peakUtil > 0.85 && (n.minutesOverloaded > 0 || n.failed > 0);
        const warm = !r.passed && slow && n.peakUtil > 0.75;
        if (!hot && !warm) continue;
        const o = orig.get(n.id);
        // queue consumers can need many times their first size to keep up with a peak
        const cap = Math.min(el.units.max, Math.max(40, (o?.units ?? el.units.default) * 40));
        const want = el.units.max <= 1 ? gn.units : Math.min(cap, Math.ceil(gn.units * Math.min(3, Math.max(1.25, n.peakUtil / 0.6))));
        if (want <= gn.units) {
          // no more units to add: a bigger size is the remaining lever
          const ti = TIERS.indexOf(gn.tier || 'M');
          if ((el.knobs || []).includes('tier') && ti >= 0 && ti < TIERS.length - 1) {
            const patch = dc.nodes[n.id] || (dc.nodes[n.id] = {});
            patch.tier = TIERS[Math.min(TIERS.length - 1, ti + (n.peakUtil > 1.6 ? 2 : 1))];
            changed = true;
          }
          continue;
        }
        const patch = dc.nodes[n.id] || (dc.nodes[n.id] = {});
        patch.units = want;
        const as = gn.knobs?.autoscale;
        if (as && as.on) patch.knobs = { ...(patch.knobs || {}), autoscale: { ...as, min: Math.max(as.min || 1, want), max: Math.max(as.max || want, want * 2) } };
        changed = true;
      }
      // Parts a zone outage took down get a second zone.
      for (const e of r.events) {
        if (e.id !== 'zone-outage') continue;
        for (const hid of e.hurt || []) {
          const gn = g.nodes.find((x) => x.id === hid);
          const el = gn && catalog.elementById.get(gn.type);
          if (!gn || !el || el.managed || gn.zones >= 2 || el.units.max < 2) continue;
          const patch = dc.nodes[hid] || (dc.nodes[hid] = {});
          patch.zones = 2;
          patch.units = Math.max(gn.units, patch.units || 0, 2);
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (!Object.keys(dc.nodes).length) delete dc.nodes;
  }

  // An uptime target the sized first design cannot reach steps down, but never below the realistic floor.
  if (designsN) {
    const prob = applyCalibration(base, { ...c, requirements: { ...(c.requirements || {}), budgetPerMonth: 1e12 } });
    const { r } = run(prob, prob.editorial.designs[0]);
    const a = r.slo.availability.actual, t = r.slo.availability.target;
    const floor = floorOf(id, srcAvail);
    if (a < t) {
      const step = STEPS.find((x) => x <= a - 0.0001 && x >= floor);
      if (step && step < t) c.requirements = { ...(c.requirements || {}), availability: step };
      else if (t > floor) c.requirements = { ...(c.requirements || {}), availability: floor };
    }
  }

  // Speed targets the sized first design misses only because of distance or slow helpers move up (at most 2x the brief).
  if (latency && designsN) {
    for (let it = 0; it < 12; it++) {
      const prob = applyCalibration(base, { ...c, requirements: { ...(c.requirements || {}), budgetPerMonth: 1e12 } });
      const { r } = run(prob, prob.editorial.designs[0]);
      const s = r.slo;
      if (r.checks.latency || !r.checks.availability) break;
      const L = { ...prob.requirements.latencyP99Ms };
      const orig = base.requirements.latencyP99Ms || {};
      const bump = new Set();
      for (const [t, v] of Object.entries(s.latency.byType)) if (v.shareOk < 0.97) bump.add(t in L ? t : 'default');
      let changed = false;
      for (const k of bump) {
        const o = orig[k] ?? orig.default ?? 200;
        const next = Math.ceil(((L[k] ?? o) * 1.15) / 25) * 25;
        if (next > o * LATENCY_MAX_BUMP) continue;
        L[k] = next; changed = true;
      }
      if (!changed) break;
      c.requirements = { ...(c.requirements || {}), latencyP99Ms: L };
    }
  }
  if (budget && designsN) {
    const prob = applyCalibration(base, { ...c, requirements: { ...(c.requirements || {}), budgetPerMonth: 1e12 } });
    const costs = prob.editorial.designs.map(design => run(prob, design).r.slo.cost.perMonth);
    c.requirements = { ...(c.requirements || {}), budgetPerMonth: nice(Math.max(...costs) * BUDGET_HEADROOM) };
  }
  const prob = applyCalibration(base, c);
  for (let i = 0; i < designsN; i++) {
    const { r } = run(prob, prob.editorial.designs[i]);
    const dc = c.designs[i] || (c.designs[i] = {});
    dc.expect = { score: Math.round(r.score.total), costPerMonth: Math.round(r.slo.cost.perMonth), passed: r.passed, availability: Math.round(r.slo.availability.actual * 100000) / 100000 };
    if (!r.passed) dc.expect.verdict = r.verdict;
    if (i === 0) { if (r.passed) delete c.daily; else c.daily = false; }
    lines.push(`${r.passed ? 'PASS' : 'FAIL'} ${id.padEnd(24)} d${i} ${String(Math.round(r.score.total)).padStart(4)} ${'*'.repeat(r.stars).padEnd(3)} $${Math.round(r.slo.cost.perMonth)}/${prob.requirements.budgetPerMonth} av ${(prob.requirements.availability * 100).toFixed(2)} ${why(r)} ${dc.nodes ? 'sized ' + Object.entries(dc.nodes).map(([k, v]) => k + ':' + (v.units ?? '') + (v.tier || '')).join(',') : ''}`);
  }
}

console.log(lines.join('\n'));
console.log(`passed ${lines.filter((l) => l.startsWith('PASS') && / d0 /.test(l)).length} first designs of ${lines.filter((l) => / d0 /.test(l)).length}`);
// Round adjusted latency targets up to plain numbers (they only get easier, so results still hold).
const niceMs = (v) => (v < 1000 ? Math.ceil(v / 50) * 50 : nice(v));
for (const c of Object.values(cal)) {
  if (!c.requirements?.latencyP99Ms) continue;
  for (const k of Object.keys(c.requirements.latencyP99Ms)) c.requirements.latencyP99Ms[k] = niceMs(c.requirements.latencyP99Ms[k]);
}
if (write) {
  const body = Object.keys(cal).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(cal[k])},`).join('\n');
  fs.writeFileSync('content/problems/calibration.js', `// Calibration measured from full simulated days (tests/calibrate.mjs). Keyed by problem id.\nexport default {\n${body}\n};\n`);
  console.log('wrote content/problems/calibration.js');
}
