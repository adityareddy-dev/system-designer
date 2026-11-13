import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

await test('e08 supplies every catalog part, category state and traffic kind', async () => {
  const { categories,parts,traffic } = await import('../assets/e08/manifest.js');
  const catalog = JSON.parse(fs.readFileSync('catalog/elements.json','utf8'));
  const requests = JSON.parse(fs.readFileSync('catalog/requests.json','utf8'));
  assert.equal(parts.length,99);
  assert.deepEqual(parts.map(p=>p.id).sort(),catalog.elements.map(p=>p.id).sort());
  const glyphs=parts.map(p=>fs.readFileSync(`assets/e08/glyphs/${p.id}.svg`,'utf8'));
  assert.equal(new Set(glyphs).size,99,'each part retains its own glyph');
  for(const svg of glyphs){assert.match(svg,/viewBox="0 0 48 48"/);assert.match(svg,/stroke-width="3"/);assert(!/undefined|<script|<foreignObject/.test(svg));}
  for(const cat of Object.keys(categories))for(const status of ['ok','warn','hot','over','down']){
    const svg=fs.readFileSync(`assets/e08/bodies/${cat}-${status}.svg`,'utf8');
    assert.match(svg,/viewBox="-12 -12 184 184"/);
    assert(svg.includes(categories[cat].c),`${cat} keeps its colour band`);
    if(status==='over')assert.match(svg,/fill="url\(#hz\d+\)"/,'overload uses the red hatch');
    if(status==='down')assert.match(svg,/#e2e5e9/,'down stays grey on the light canvas');
    else assert.match(svg,/fill="var\(--card, #fffcf4\)"/,'body uses the site card token');
    if(status==='hot')assert.match(svg,/stroke-dasharray="7 6"/,'hot halo');
    if(status==='warn')assert.match(svg,/#facc15/,'steady warning outline');
  }
  assert.deepEqual(traffic.map(t=>t.id).sort(),requests.types.map(t=>t.id).sort());
  for(const t of traffic)assert(fs.readFileSync(`assets/e08/traffic/${t.id}.svg`,'utf8').includes(t.color));
});

await test('canvas look includes the mode and only opts URL shortener Practice in', async () => {
  const {canvasLook}=await import('../render/look.js');
  assert.equal(canvasLook('practice',{id:'url-shortener'}),'e08');
  for(const mode of ['challenge','sandbox','lesson','intro'])assert.equal(canvasLook(mode,{id:'url-shortener'}),'classic');
  assert.equal(canvasLook('practice',{id:'chat-app'}),'classic');
  assert.equal(canvasLook('practice',null),'classic');
});
