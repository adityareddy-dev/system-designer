// The selected e08 canvas assets. The editor's CSS and palette are deliberately untouched.
import { categories, parts, traffic } from '../assets/e08/manifest.js';

export function e08Palette(base) {
  return { ...base, look: 'e08',
    blue: 0x60a5fa, accent: 0xf5c451, yellow: 0xfbbf24, mint: 0x4ade80, tomato: 0xef4444,
    ok: 0x4ade80, warn: 0xfacc15, hot: 0xfb923c, bad: 0xef4444,
    cat: Object.fromEntries(Object.entries(categories).map(([k,v]) => [k, Number.parseInt(v.c.slice(1),16)])),
    req: Object.fromEntries(traffic.filter((t,i) => traffic.findIndex(first => first.family === t.family) === i).map(t => [t.family, Number.parseInt(t.color.slice(1),16)])) };
}

const svgFiles = new Map();
function svgFile(path) {
  if (!svgFiles.has(path)) svgFiles.set(path, fetch(new URL('assets/e08/' + path, document.baseURI)).then(r => {
    if (!r.ok) throw new Error('Could not load e08 asset: ' + path);
    return r.text();
  }).catch(error => { svgFiles.delete(path); throw error; }));
  return svgFiles.get(path);
}
async function texture(PIXI, file, size) {
  let svg = (await svgFile(file)).replace(/<svg\b([^>]*)>/, (_, attrs) =>
    `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${size}" height="${size}">`);
  // Bake glyphs white so Pixi can reproduce both original glyph colours exactly with a tint.
  if (file.startsWith('glyphs/')) svg = svg.replace('#f3eee0','#ffffff');
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Invalid e08 SVG: ' + file));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
}

// Reuse the scene's lifecycle, icon fallback and FX resources. Only this kit owns these textures.
export async function addE08Textures(PIXI, kit) {
  const owned = [];
  const load = async (file, size) => { const tex = await texture(PIXI, file, size); owned.push(tex); return tex; };
  try {
    const bodyStates = {};
    await Promise.all(Object.keys(categories).map(async cat => {
      bodyStates[cat] = await Promise.all(['ok','warn','hot','over','down'].map(s => load(`bodies/${cat}-${s}.svg`, Math.round(200 * kit.res))));
    }));
    const glyphs = new Map(await Promise.all(parts.map(async p => [p.id, await load(`glyphs/${p.id}.svg`, Math.round(96 * kit.res))])));
    // All request textures share a source, as Pixi's particle container requires.
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    await Promise.all(traffic.map(async (t,i) => {
      const tex = await load(`traffic/${t.id}.svg`, 48);
      ctx.drawImage(tex.source.resource, (i % 8) * 48, Math.floor(i / 8) * 48, 48, 48);
    }));
    const source = new PIXI.CanvasSource({ resource: canvas, autoGenerateMipmaps: true });
    const atlas = traffic.map((_,i) => new PIXI.Texture({ source, frame: new PIXI.Rectangle((i%8)*48,Math.floor(i/8)*48,48,48) }));
    const icons = kit.icons;
    const destroy = kit.destroy;
    kit.look = 'e08'; kit.bodyStates = bodyStates;
    kit.bodyFor = (cat,status = 0) => bodyStates[cat]?.[Math.max(0, Math.min(4,status))] || bodyStates.compute[0];
    // Keep the base resources for their existing destroy closure, and expose the replacement atlas.
    kit.bodyTex = Object.fromEntries(Object.keys(categories).map(c => [c,bodyStates[c][0]]));
    kit.icons = { ...icons, get(id,color) { return id.startsWith('el.') ? glyphs.get(id.slice(3)) : icons.get(id,color); } };
    kit.atlas = { textures: atlas }; kit.typeIndex = new Map(traffic.map((t,i) => [t.id,i]));
    kit.destroy = () => { atlas.forEach(t => t.destroy(false)); source.destroy(); owned.forEach(t => t.destroy(true)); destroy(); };
    return kit;
  } catch (error) { owned.forEach(t => t.destroy(true)); kit.destroy(); throw error; }
}

export const e08IconSize = 48 * 1.5 * 100 / 184;

export function drawE08Load(v, kit, time, reduced) {
  const P = kit.P, g = v.busy, k = 100 / 184;
  const color = v.down ? 0x64748b : v.status === 1 ? P.warn : v.status === 2 ? P.hot : v.status >= 3 ? P.bad : P.cat[v.cat];
  g.clear().roundRect(-56*k,48*k,112*k,8*k,4*k).fill({color:0x0a1220});
  const load = v.down ? 0 : Math.max(0,Math.min(1,v.live ? v.du : 0));
  if (load > 0) g.roundRect(-56*k,48*k,112*k*load,8*k,4*k).fill({color});
  if (v.down) g.moveTo(-28*k,-30*k).lineTo(28*k,26*k).moveTo(28*k,-30*k).lineTo(-28*k,26*k).stroke({color:0x94a3b8,width:4*k,cap:'round'});
  v.drawnU = v.du; v.drawnColor = color;
  const mark = v.statusG;
  mark.clear().circle(0,0,10*k).fill({color:v.status === 0 ? P.ok : color}).stroke({color:0x0c1424,width:3*k});
  if(v.down) mark.moveTo(-4*k,-4*k).lineTo(4*k,4*k).moveTo(4*k,-4*k).lineTo(-4*k,4*k).stroke({color:0x0c1424,width:2.5*k});
  mark.position.set(58*k,-58*k); mark.scale.set(1);
  mark.alpha = !reduced && (v.status === 2 || v.status === 3) && Math.floor(time/450)%2 ? .2 : 1;
  // In p10 the rejected rate is a red pill above the part. Use the engine's actual rate.
  v.rejected.visible = v.live && v.status === 3;
  if(v.rejected.visible) {
    v.rejectedT.text = `${Math.round(v.failRps || 0)}/s`;
    v.rejectedT.style.fill = P.text;
    const w = Math.max(48,v.rejectedT.width+16);
    v.rejectedG.clear().roundRect(-w/2,-10,w,20,10).fill({color:P.surfaceSolid}).stroke({color:0xef4444,width:1.5});
  }
}
