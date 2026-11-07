// Full-day adversarial sweep of every problem, every missing reference part and every missing link.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problems } from '../content/problems/index.js';
// Independent problem days use separate processes so the complete sweep fits the check runner's time limit.
if (process.argv.length === 2) {
  const lanes = Array.from({ length: Math.min(4, availableParallelism()) }, () => []);
  problems.forEach((p,i) => lanes[i % lanes.length].push(p.id));
  const children = [];
  const outputs = await Promise.all(lanes.map(ids => new Promise((resolve,reject) => {
    children.push(execFile(process.execPath, [fileURLToPath(import.meta.url), ...ids], { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stdout + stderr)) : resolve(stdout)));
  }))).catch(error => { children.forEach(child => child.kill()); throw error; });
  const totals = outputs.map(out => out.match(/Advice sweep passed: (\d+) problems, (\d+) full days, (\d+) verified path repairs, (\d+) measured sizing repairs/).slice(1).map(Number)).reduce((a,b) => a.map((v,i) => v + b[i]), [0,0,0,0]);
  assert.equal(totals[0], problems.length);
  console.log(`Advice sweep passed: ${totals[0]} problems, ${totals[1]} full days, ${totals[2]} verified path repairs, ${totals[3]} measured sizing repairs.`);
  process.exit(0);
}
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`))])));
const plain = (text, where) => {
  assert(!/undefined|NaN|Infinity|\[object Object\]|\{\w+\}|\u2014|\b\d+(?:\.\d+)?[kMB] ms\b/.test(text || ''), `${where}: ${text}`);
};
let days = 0, repairs = 0, sizing = 0, checked = 0;
const run = (sim) => { sim.start(); sim.advance(86400000); days++; return sim.result(); };
for (const p of problems) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(p.id)) continue;
  checked++;
  for (const text of [p.brief, ...p.clarify.flatMap(c => [c.q,c.a]), ...p.requirements.notes, ...p.hints]) plain(text, p.id);
  const reference = p.editorial.designs[0].graph;
  const normalized = createSim({ catalog, problem: p }); normalized.loadGraph(reference);
  const base = normalized.getGraph();
  const variants = [
    ['undersized pool', { ...base, nodes: base.nodes.map(n => catalog.elementById.get(n.type).kind === 'compute' ? { ...n, units: 1, zones: 1, tier: 'S', knobs: { ...n.knobs, autoscale: { on: false } } } : n) }],
    ...base.nodes.map(n => [`without ${n.id}`, { nodes: base.nodes.filter(v => v.id !== n.id), edges: base.edges.filter(e => e.from !== n.id && e.to !== n.id) }]),
    ...base.edges.map(e => [`without ${e.id}`, { ...base, edges: base.edges.filter(v => v.id !== e.id) }]),
  ];
  const allCalls = createSim({ catalog, problem: p }); allCalls.loadGraph({ ...base, edges: [] });
  for (const a of base.nodes) for (const b of base.nodes) if (a.id !== b.id && allCalls.canConnect(a.type,b.type).ok) { try { allCalls.connect(a.id,b.id); } catch { /* reverse and duplicate connections are already represented */ } }
  variants.push(['everything calls directly', allCalls.getGraph()]);
  for (const [label, graph] of variants) {
    const where = `${p.id}/${label}`, sim = createSim({ catalog, problem: p }); sim.loadGraph(graph);
    for (const issue of sim.validate()) {
      plain(issue.message, where + ' warning');
      if (p.id === 'job-scheduler') assert.doesNotMatch(issue.message, /Payment processor/, where + ' keeps the customer-endpoint domain');
    }
    for (const id of Object.keys(p.requirements.mix)) {
      const trace = sim.trace(id);
      for (const rejection of trace.rejected) plain(rejection.reason, where + ' connection');
      if (!trace.repair) continue;
      const trial = createSim({ catalog, problem: p }); trial.loadGraph(sim.getGraph());
      for (const n of trace.repair.addNodes || []) trial.addNode(n.type, 0, 0, { id: n.id });
      for (const [a,b] of trace.repair.steps || [[trace.repair.from,trace.repair.to]]) trial.connect(a,b);
      assert(trial.trace(id).edgeIds.length > trace.edgeIds.length, where + ': following route advice opens the delivery path');
      const eligible = graph.nodes.filter(n => catalog.elementById.get(n.type).kind === 'source' && catalog.handles(n.type,id) && (!p.traffic.sourceTypes || (p.traffic.sourceTypes[n.id] || p.traffic.sourceTypes[n.type] || []).includes(id)));
      const weighted = eligible.some(n => p.traffic.sources?.[n.type] > 0);
      const reached = new Set(), pending = eligible.filter(n => !weighted || p.traffic.sources?.[n.type] > 0).map(n=>n.id);
      while (pending.length) { const u = pending.pop(); if (reached.has(u)) continue; reached.add(u); for (const e of graph.edges.filter(e=>e.from===u&&e.kind==='flow')) { const n=graph.nodes.find(n=>n.id===e.to); if (catalog.handles(n.type,id)) pending.push(n.id); } }
      const queues = graph.nodes.filter(n => catalog.elementById.get(n.type).kind === 'queue' && n.type !== 'dead-letter-queue' && reached.has(n.id));
      if (queues.length) assert(trace.repair.path.some(id => queues.some(q => q.id === id)), where + ': preserve the deferred route');
      repairs++;
    }
    const result = run(sim), advice = result.nextStep;
    for (const text of [result.verdict, advice.text, ...result.tradeoffs.map(t => t.text), ...result.events.flatMap(e => Object.values(e.story || {}).filter(v => typeof v === 'string'))]) plain(text, where);
    if (advice.elementId) assert(catalog.elementById.has(advice.elementId), where + ' suggests an actual part');
    if (advice.knob && advice.nodeId) {
      const n = sim.getGraph().nodes.find(n => n.id === advice.nodeId), el = catalog.elementById.get(n?.type);
      assert(el?.knobs.includes(advice.knob), `${where}: ${el?.id} has no ${advice.knob}`);
    }
    if (advice.sizing) {
      const before = result.nodes.find(n => n.id === advice.nodeId);
      sim.reset(); sim.setKnob(advice.nodeId,'units',advice.sizing.units);
      const n = sim.getGraph().nodes.find(n => n.id === advice.nodeId);
      if (n.knobs?.autoscale?.on) sim.setKnob(n.id,'autoscale',{...n.knobs.autoscale,min:advice.sizing.units,max:Math.max(n.knobs.autoscale.max,advice.sizing.units)});
      const after = run(sim), part = after.nodes.find(n => n.id === advice.nodeId);
      assert(part.peakUtil < before.peakUtil || after.slo.availability.actual > result.slo.availability.actual || after.lateRequests < result.lateRequests, where + ': sizing changes a measured cause'); sizing++;
    }
  }
  console.log(`Advice sweep: ${p.id}, ${variants.length} wrong designs.`);
}
console.log(`Advice sweep passed: ${checked} problems, ${days} full days, ${repairs} verified path repairs, ${sizing} measured sizing repairs.`);
