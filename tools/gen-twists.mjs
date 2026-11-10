// Calibrates a quieter workload with a binding cost ceiling and a measured smaller reference.
import fs from 'node:fs';
import { problems } from '../content/problems/index.js';
import { createSim } from '../sim/engine.js';
import { createCatalog } from '../sim/catalog.js';
import { twistEvents } from '../content/problems/twist-events.js';
const read = name => JSON.parse(fs.readFileSync(`catalog/${name}.json`));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const out = JSON.parse(JSON.stringify((await import('../content/problems/twists.js')).default));
const run = (p, graph) => {
  const sim = createSim({ catalog, problem: p, seed: 'practice' }); sim.loadGraph(graph); sim.start(); sim.advance(86400000); return sim.result();
};
for (const p of problems) {
  if (process.argv.includes('--resume') && out[p.id]?.design) continue;
  let found;
  search: for (const factor of [.25, .1, .05, .01]) {
    const spec = { shiftMin: 45, extra: null };
    const requirements = { ...p.requirements, peakRps: Math.max(1, Math.round(p.requirements.peakRps * factor)), budgetPerMonth: 1e12 };
    const prob = { ...p, requirements, events: twistEvents(p, spec) };
    const unchanged = p.editorial.designs.map(d => run(prob, d.graph));
    for (const design of p.editorial.designs) {
    let graph = structuredClone(design.graph);
    for (const n of graph.nodes) {
      const el = catalog.elementById.get(n.type);
      if (el.knobs?.includes('units')) n.units = Math.max(el.units.min, n.zones || 1, Math.ceil((n.units || el.units.default) * factor));

      if (n.knobs?.autoscale?.on) n.knobs.autoscale = { ...n.knobs.autoscale, min: n.units, max: Math.max(n.units, Math.ceil((n.knobs.autoscale.max || n.units) * factor)) };
    }
    let result;
    for (let i = 0; i < 18; i++) {
      result = run(prob, graph);
      if (result.passed && result.score.total === 1000) break;
      let changed = false;
      for (const item of result.efficiency || []) {
        const n = graph.nodes.find(n => n.ref === item.nodeId); if (!n) continue;
        n.units = item.suggestedUnits;
        if (n.knobs?.autoscale?.on) n.knobs.autoscale.min = n.units;
        changed = true;
      }
      for (const m of result.nodes) {
        if (!(m.peakUtil > .8 && (m.failed > 0 || m.minutesOverloaded > 0 || !result.checks.latency))) continue;
        const n = graph.nodes.find(n => n.ref === m.id), el = catalog.elementById.get(n?.type);
        if (!n || !el) continue;
        const want = Math.min(el.units.max, Math.ceil((n.units || el.units.default) * Math.max(1.2, Math.min(3, m.peakUtil / .7))));
        if (want > (n.units || el.units.default)) { n.units = want; changed = true; }
        else if (el.knobs?.includes('tier') && n.tier !== 'XL') { n.tier = ['S','M','L','XL'][['S','M','L','XL'].indexOf(n.tier || 'M') + 1]; changed = true; }
        if (n.knobs?.autoscale?.on) { n.knobs.autoscale.min = n.units; n.knobs.autoscale.max = Math.max(n.units, n.knobs.autoscale.max); }
      }
      if (!changed) break;
    }
    if (result.passed && result.score.total === 1000) {
      for (const node of graph.nodes) {
        const el = catalog.elementById.get(node.type);
        if (!el.knobs?.includes('tier') || node.tier === 'S') continue;
        const trial = structuredClone(graph), candidate = trial.nodes.find(n => n.ref === node.ref);
        candidate.tier = 'S';
        const check = run(prob, trial);
        if (check.passed && check.score.total === 1000 && check.slo.cost.perMonth < result.slo.cost.perMonth) { graph = trial; result = check; }
      }
    }
    const oldCost = Math.min(...unchanged.map(r => r.slo.cost.perMonth));
    const cost = result.slo.cost.perMonth;
    if (!result.passed || result.score.total !== 1000 || cost >= oldCost - 1) { console.log('candidate',p.id,factor,result.score.total,result.checks,cost,oldCost); continue; }
    const budget = Math.floor((oldCost + cost) / 2);
    requirements.budgetPerMonth = budget;
    result = run(prob, graph);
    if (!result.passed || result.score.total !== 1000 || unchanged.some(r => r.slo.cost.perMonth <= budget)) continue;
    found = { ...spec, requirements: { peakRps: requirements.peakRps, budgetPerMonth: budget },
      brief: `Demand has settled at about ${requirements.peakRps} requests/s. The new monthly ceiling is $${budget}. The original burst reserve now competes with the operating budget. Decide which reserve to keep, then test its failure headroom. All data and recovery promises still apply.`,
      design: { name: 'Smaller workload, measured reserve', graph, why: 'Reduce the paid floor for the quieter workload, preserving the required copies and recovery settings. This design was checked through the full event day.', expect: { score: 1000, passed: true, costPerMonth: Math.round(cost) } } };
    break search;
    }
  }
  if (!found) throw Error('No calibrated transfer for ' + p.id);
  out[p.id] = found;
  console.log(p.id, found.requirements);
}
fs.writeFileSync('content/problems/twists.js', '// Measured transfer workloads and references, generated by tools/gen-twists.mjs.\nexport default ' + ('{\n' + Object.keys(out).sort().map(id => JSON.stringify(id) + ': ' + JSON.stringify(out[id])).join(',\n') + '\n}') + ';\n');
