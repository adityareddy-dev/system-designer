// Prints a problem's requirements and reference design compactly. Run from the app folder: node tests/show.mjs <id> [design]
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { problemById } = await imp('content/problems/index.js');
const el = new Map(J('catalog/elements.json').elements.map((e) => [e.id, e]));
for (const id of process.argv.slice(2)) {
  const p = problemById.get(id);
  const d = p.editorial.designs[0];
  const r = p.requirements;
  console.log(`== ${id} peak ${r.peakRps} mix ${JSON.stringify(r.mix)} regions ${JSON.stringify(r.userRegions)} avail ${r.availability} lat ${JSON.stringify(r.latencyP99Ms)} safety ${r.dataSafety} ryw ${r.readYourWrites} comp ${r.compliance} sources ${JSON.stringify(p.traffic.sources)} requires ${JSON.stringify(p.requires || {})}`);
  console.log('   events ' + p.events.map((e) => `${e.id}@${e.at}${e.params && Object.keys(e.params).length ? JSON.stringify(e.params) : ''}`).join(' '));
  console.log('   nodes ' + d.graph.nodes.map((n) => `${n.ref}:${n.type}${n.units ? ' u' + n.units : ''}${n.zones ? ' z' + n.zones : ''}${n.region ? ' ' + n.region : ''}${n.knobs ? ' ' + JSON.stringify(n.knobs) : ''}`).join(' | '));
  console.log('   edges ' + d.graph.edges.map((e) => (Array.isArray(e) ? e.join('>') : e)).join(' '));
  const types = new Set(Object.keys(r.mix));
  for (const n of d.graph.nodes) { const e = el.get(n.type); if (e?.kind === 'source') console.log(`   src ${n.ref} ${n.type} handles ${e.handles.filter((t) => t === '*' || types.has(t))}`); }
}
