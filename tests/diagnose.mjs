// Explains one problem's reference design run: issues, per-type service, hot nodes, cost lines, events.
// Run from the app folder: node tests/diagnose.mjs <problemId> [designIndex]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problemById } = await imp('content/problems/index.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });

const [id, di = '0'] = process.argv.slice(2);
const p = problemById.get(id);
if (!p) { console.error('no problem', id); process.exit(1); }
const design = di === 'starter' ? null : p.editorial.designs[+di];
const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
if (design) sim.loadGraph(design.graph);
const g = sim.getGraph();
console.log(`${id} / ${design ? design.name : 'starter'}  peak ${p.requirements.peakRps} rps  mix ${JSON.stringify(p.requirements.mix)}  avail ${p.requirements.availability}  p99 ${JSON.stringify(p.requirements.latencyP99Ms)}  budget ${p.requirements.budgetPerMonth}  safety ${p.requirements.dataSafety} ryw ${p.requirements.readYourWrites} comp ${p.requirements.compliance}`);
console.log('events', JSON.stringify(p.events));
if (design) {
  const kept = new Set(g.edges.map((e) => e.from + '>' + e.to));
  const dropped = design.graph.edges.map((e) => (Array.isArray(e) ? e.join('>') : e)).filter((e) => !kept.has(e) && !kept.has(e.split('>').reverse().join('>')));
  if (dropped.length) console.log('DROPPED EDGES', dropped);
}
for (const i of sim.validate()) console.log(`  ${i.level.toUpperCase()} ${i.code} ${i.nodeId || ''}: ${i.message}`);
const est = sim.estimate();
console.log('estimate', JSON.stringify({ perMonth: Math.round(est.perMonth), peakRps: est.peakRps, successAtPeak: est.successAtPeak, p99AtPeak: est.p99AtPeak, holds: est.holdsAtPeak, bottleneck: est.bottleneck }));
sim.start();
const T = {};
const hot = {};
for (let h = 0; h < 24; h++) {
  sim.advance(3600000);
  const st = sim.state();
  for (const [t, v] of Object.entries(st.traffic.byType)) { T[t] ||= { off: 0, ok: 0 }; T[t].off += v.offered; T[t].ok += v.success; }
  for (const n of st.nodes) if (n.util > 0.9 || n.status === 'down' || n.failRps > 0) (hot[n.id] ||= []).push(`${String(h).padStart(2, '0')}h:${n.util.toFixed(2)}${n.status === 'down' ? 'D' : ''}${n.failRps > 0 ? ' f' + Math.round(n.failRps) : ''}`);
}
const r = sim.result();
console.log('RESULT', JSON.stringify({ passed: r.passed, stars: r.stars, score: r.score, avail: r.slo.availability, lat: { share: r.slo.latency.shareOk, worst: r.slo.latency.worstP99Ms, byType: r.slo.latency.byType }, safety: r.slo.safety, cost: Math.round(r.slo.cost.perMonth) }));
console.log('per type (hourly samples):', Object.entries(T).map(([t, v]) => `${t} ${(100 * v.ok / Math.max(1e-9, v.off)).toFixed(1)}%`).join('  '));
console.log('nodes:');
for (const n of r.nodes) {
  const gn = g.nodes.find((x) => x.id === n.id);
  console.log(`  ${n.id.padEnd(14)} ${n.type.padEnd(20)} u${gn.units} z${gn.zones} ${gn.region} ${gn.tier} peak ${n.peakUtil.toFixed(2)} overMin ${n.minutesOverloaded} failed ${Math.round(n.failed)} $${Math.round(n.usd)} ${JSON.stringify(gn.knobs)}`);
}
for (const [k, v] of Object.entries(hot)) console.log(`  hot ${k}: ${v.slice(0, 12).join(' ')}${v.length > 12 ? ' …' + v.length : ''}`);
console.log('edges', g.edges.map((e) => `${e.from}>${e.to}${e.kind !== 'flow' ? '(' + e.kind[0] + ')' : ''}`).join(' '));
console.log('cost lines:', r.slo.cost.lines.slice().sort((a, b) => b.usd - a.usd).slice(0, 6).map((l) => `${l.label} $${Math.round(l.usd)}`).join(' | '));
for (const e of r.events) console.log(`  event ${e.id} ${e.atMs / 3600000}h hurt ${e.hurt?.join(',')} helpers ${e.helpers?.join(',')} vars ${JSON.stringify(e.vars)}`);
console.log('next:', r.nextStep?.text);
