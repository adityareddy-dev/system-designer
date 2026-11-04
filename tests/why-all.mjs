// One line per failing problem: where requests were lost (types, events, nodes). Run from the app folder.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems } = await imp('content/problems/index.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });
const only = new Set(process.argv.slice(2));
for (const p of problems) {
  if (only.size && !only.has(p.id)) continue;
  const d = p.editorial.designs[0];
  const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
  sim.loadGraph(d.graph);
  const errs = sim.validate().filter((i) => i.level === 'error').map((i) => i.message.slice(0, 60));
  sim.start();
  const T = {}; const lossH = [];
  for (let h = 0; h < 24; h++) {
    sim.advance(3600000);
    const st = sim.state();
    let off = 0, ok = 0;
    for (const [t, v] of Object.entries(st.traffic.byType)) { T[t] ||= { off: 0, ok: 0 }; T[t].off += v.offered; T[t].ok += v.success; off += v.offered; ok += v.success; }
    if (off > 0 && ok / off < 0.995) lossH.push(`${h}h${(100 * ok / off).toFixed(0)}`);
  }
  const r = sim.result();
  if (r.passed && !only.size) continue;
  const s = r.slo;
  const types = Object.entries(T).filter(([, v]) => v.ok / v.off < 0.999).map(([t, v]) => `${t}:${(100 * v.ok / v.off).toFixed(1)}`).join(' ');
  const evs = r.events.filter((e) => (e.hurt || []).length || Number(String(e.vars?.failed || '0').replace(/[^\d.]/g, '')) > 0).map((e) => `${e.id}@${(e.atMs / 3600000).toFixed(1)}[${(e.hurt || []).join(',')}]f${e.vars?.failed ?? ''}`).join(' ');
  const nodes = r.nodes.filter((n) => n.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 4).map((n) => `${n.id}(${n.type}):${Math.round(n.failed / 1000)}k`).join(' ');
  console.log(`${r.passed ? 'PASS' : 'FAIL'} ${p.id} avail ${(s.availability.actual * 100).toFixed(2)}/${(s.availability.target * 100).toFixed(2)} lat ${(s.latency.shareOk * 100).toFixed(0)}% safety ${r.score.safety} cost ${Math.round(s.cost.perMonth)}/${s.cost.budget}${errs.length ? ' ERR ' + errs.join(';') : ''}\n   types ${types} | lossHours ${lossH.slice(0, 10).join(' ')}${lossH.length > 10 ? '…' + lossH.length : ''}\n   events ${evs}\n   nodes ${nodes}`);
}
