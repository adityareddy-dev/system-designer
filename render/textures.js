// Pre-baked textures and shared vector contexts for one theme: particle atlas, glows, glyphs, silhouettes, icons.

import { outline } from './geom.js';
import { hexStr } from './theme.js';
import { iconImage } from './icons.js';

export const P_CELL = 48;   // atlas cell, px
export const P_SHAPE = 34;  // shape size inside a cell, px (particle scale = worldSize / P_SHAPE)
const P_OUTLINE = 5;        // canvas-coloured outline in bake px (≈ 1.5 px at a 10 px particle)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texFrom(PIXI, c, mip = false) {
  return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: mip }) });
}

const flat = f32 => Array.from(f32);

function bakeParticleAtlas(PIXI, P, types, images) {
  const cols = 8;
  const rows = Math.ceil(types.length / cols);
  const W = 512, H = Math.max(64, 1 << Math.ceil(Math.log2(rows * P_CELL)));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const frames = [];
  types.forEach((t, i) => {
    const x = (i % cols) * P_CELL, y = Math.floor(i / cols) * P_CELL;
    const ox = x + (P_CELL - P_SHAPE) / 2, oy = y + (P_CELL - P_SHAPE) / 2;
    const pair = images[i];
    if (pair && pair.fill && pair.edge) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        g.drawImage(pair.edge, ox + Math.cos(a) * P_OUTLINE, oy + Math.sin(a) * P_OUTLINE, P_SHAPE, P_SHAPE);
      }
      g.drawImage(pair.fill, ox, oy, P_SHAPE, P_SHAPE);
    } else {
      // shape file missing: plain dot so the flow still reads
      g.fillStyle = hexStr(P.canvas);
      g.beginPath(); g.arc(x + P_CELL / 2, y + P_CELL / 2, P_SHAPE / 2 + P_OUTLINE, 0, Math.PI * 2); g.fill();
      g.fillStyle = hexStr(P.req[t.family] ?? P.text3);
      g.beginPath(); g.arc(x + P_CELL / 2, y + P_CELL / 2, P_SHAPE / 2, 0, Math.PI * 2); g.fill();
    }
    frames.push([x, y]);
  });
  const base = texFrom(PIXI, c, true);
  const textures = frames.map(([x, y]) => new PIXI.Texture({ source: base.source, frame: new PIXI.Rectangle(x, y, P_CELL, P_CELL) }));
  return { base, textures };
}

function bakeFx(PIXI) {
  const out = {};
  {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    out.glow = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 6;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    out.ring = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(24, 24), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(12, 2); g.lineTo(22, 21); g.lineTo(3, 17); g.closePath(); g.fill();
    out.shard = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(48, 48), g = c.getContext('2d');
    const gr = g.createRadialGradient(24, 24, 0, 24, 24, 12);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 48, 48);
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 4 : 22;
      g.lineTo(24 + Math.cos(a) * r, 24 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    out.sparkle = texFrom(PIXI, c);
  }
  {
    // soft node shadow, baked white so it can be tinted to the theme's shadow colour
    const c = makeCanvas(120, 120), g = c.getContext('2d');
    g.shadowColor = '#fff'; g.shadowBlur = 14; g.shadowOffsetX = 1000;
    g.fillStyle = '#fff';
    g.beginPath();
    if (g.roundRect) g.roundRect(-1000 + 24, 24, 72, 72, 20); else g.rect(-1000 + 24, 24, 72, 72);
    g.fill();
    out.shadow = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(64, 24), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 24);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 24);
    out.strip = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 6.5, 0, Math.PI * 2); g.fill();
    out.dot = texFrom(PIXI, c, true);
  }
  return out;
}

export const BODY_BOX = 100; // world units covered by a baked body texture (centred on the node)

function tracePath(g, pts, k, o) {
  g.beginPath();
  g.moveTo(o + pts[0] * k, o + pts[1] * k);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(o + pts[i] * k, o + pts[i + 1] * k);
  g.closePath();
}

const rgba = (n, a) => 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';

// Node card: busy-ring track, glass fill, category wash and outline, baked once per theme.
function bakeBody(PIXI, P, shape, tint, res) {
  const k = 2 * res;
  const size = Math.round(BODY_BOX * k);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const o = size / 2;
  g.lineJoin = 'round'; g.lineCap = 'round';
  tracePath(g, outline(shape, 6, 96).pts, k, o);
  g.lineWidth = 3.6 * k; g.strokeStyle = rgba(P.text3, P.dark ? 0.16 : 0.13); g.stroke();
  const pts = outline(shape, 0, 160).pts;
  tracePath(g, pts, k, o);
  g.fillStyle = hexStr(P.surfaceSolid); g.fill();
  g.fillStyle = rgba(tint, P.dark ? 0.1 : 0.055); g.fill();
  // soft top sheen for depth
  const sheen = g.createLinearGradient(0, o - 36 * k, 0, o + 10 * k);
  sheen.addColorStop(0, 'rgba(255,255,255,' + (P.dark ? 0.05 : 0.55) + ')');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fill();
  const dashed = shape === 'dashed-square';
  if (dashed) g.setLineDash([7 * k, 5 * k]);
  g.lineWidth = (dashed ? 1.6 : 1.5) * k;
  g.strokeStyle = rgba(tint, P.dark ? (dashed ? 0.75 : 0.6) : (dashed ? 0.65 : 0.5));
  g.stroke();
  g.setLineDash([]);
  if (shape === 'double-square') {
    tracePath(g, outline(shape, -5, 128).pts, k, o);
    g.lineWidth = 1.2 * k; g.strokeStyle = rgba(tint, P.dark ? 0.5 : 0.4); g.stroke();
  }
  if (shape === 'cylinder') {
    g.beginPath();
    g.ellipse(o, o - 27 * k, 32 * k, 9 * k, 0, 0, Math.PI);
    g.lineWidth = 1.3 * k; g.strokeStyle = rgba(tint, P.dark ? 0.5 : 0.42); g.stroke();
  }
  return texFrom(PIXI, c, true);
}

function bakeRing(PIXI, shape, inflate, width, color, alpha, res) {
  const k = 2 * res;
  const size = Math.round(BODY_BOX * k);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.lineJoin = 'round';
  tracePath(g, outline(shape, inflate, 128).pts, k, size / 2);
  g.lineWidth = width * k; g.strokeStyle = rgba(color, alpha); g.stroke();
  return texFrom(PIXI, c, true);
}

function ringContext(PIXI, shape, inflate, width, color, alpha, n = 128) {
  const c = new PIXI.GraphicsContext();
  c.poly(flat(outline(shape, inflate, n).pts), true).stroke({ width, color, alpha, join: 'round' });
  return c;
}

function tri(c) { c.poly([0, -7.6, 7.8, 6.2, -7.8, 6.2], true); }
function octa(c, r) {
  const p = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; p.push(Math.cos(a) * r, Math.sin(a) * r); }
  c.poly(p, true);
}

function glyphContexts(PIXI, P) {
  const mk = () => new PIXI.GraphicsContext();
  const ok = mk();
  ok.circle(0, 0, 7.4).fill({ color: P.ok }).stroke({ width: 1.5, color: P.canvas });
  ok.moveTo(-3.3, 0.2).lineTo(-0.9, 2.7).lineTo(3.5, -2.5).stroke({ width: 1.9, color: P.mark, cap: 'round', join: 'round' });
  const warnLike = color => {
    const c = mk();
    tri(c); c.fill({ color }).stroke({ width: 2.2, color, join: 'round' });
    c.moveTo(0, -3.2).lineTo(0, 1.2).stroke({ width: 1.9, color: P.mark, cap: 'round' });
    c.circle(0, 3.7, 1.1).fill({ color: P.mark });
    return c;
  };
  const over = mk();
  octa(over, 8.2); over.fill({ color: P.bad }).stroke({ width: 1.5, color: P.canvas });
  over.moveTo(-3, -3).lineTo(3, 3).moveTo(3, -3).lineTo(-3, 3).stroke({ width: 1.9, color: P.mark, cap: 'round' });
  const down = mk();
  down.circle(0, 0, 7).fill({ color: P.surfaceSolid }).stroke({ width: 2.2, color: P.bad });
  down.moveTo(-4.6, 4.6).lineTo(4.6, -4.6).stroke({ width: 2.2, color: P.bad, cap: 'round' });
  const info = mk();
  info.circle(0, 0, 7.4).fill({ color: P.info }).stroke({ width: 1.5, color: P.canvas });
  info.moveTo(0, -0.6).lineTo(0, 3.6).stroke({ width: 1.9, color: P.mark, cap: 'round' });
  info.circle(0, -3.4, 1.1).fill({ color: P.mark });
  const lock = mk();
  lock.roundRect(-4.4, -1.2, 8.8, 7, 1.6).fill({ color: P.text3 });
  lock.moveTo(-2.7, -1.2).lineTo(-2.7, -3).arc(0, -3, 2.7, Math.PI, Math.PI * 2).lineTo(2.7, -1.2).stroke({ width: 1.6, color: P.text3 });
  const status = [ok, warnLike(P.warn), warnLike(P.hot), over, down];
  return { status, valid: { error: over, warn: status[1], info }, lock, all: [ok, status[1], status[2], over, down, info, lock] };
}

// Lazily rasterised SVG icons keyed by icon id and colour.
function createIconCache(PIXI, P, res, onLoad) {
  const size = Math.round(64 * res);
  const map = new Map(); // key → Texture | null (loading) | false (missing)
  const bg = hexStr(P.surfaceSolid);
  let dead = false;
  return {
    get(id, color) {
      const key = id + '|' + color;
      const v = map.get(key);
      if (v) return v;
      if (v === undefined) {
        map.set(key, null);
        iconImage(id, hexStr(color), bg, size).then(img => {
          if (dead) return;
          if (!img) { map.set(key, false); return; }
          const c = makeCanvas(size, size);
          c.getContext('2d').drawImage(img, 0, 0, size, size);
          map.set(key, texFrom(PIXI, c, true));
          onLoad?.(id, color);
        });
      }
      return null;
    },
    async ensure(list) {
      // list of [id, color]; resolves once each has loaded or failed
      const want = list.map(([id, color]) => { this.get(id, color); return id + '|' + color; });
      for (let i = 0; i < 100; i++) {
        if (want.every(k => map.get(k) !== null)) return;
        await new Promise(r => setTimeout(r, 20));
      }
    },
    destroy() {
      dead = true;
      for (const t of map.values()) if (t) t.destroy(true);
      map.clear();
    },
  };
}

export async function createKit(PIXI, P, catalog, res, onIconLoad) {
  const types = catalog.requests;
  const images = await Promise.all(types.map(async t => {
    const color = hexStr(P.req[t.family] ?? P.text3);
    const [fill, edge] = await Promise.all([
      iconImage('req.' + t.id, color, color, P_SHAPE * 2),
      iconImage('req.' + t.id, hexStr(P.canvas), hexStr(P.canvas), P_SHAPE * 2),
    ]);
    return { fill, edge };
  }));
  const atlas = bakeParticleAtlas(PIXI, P, types, images);
  const fx = bakeFx(PIXI);
  const shapes = new Set(catalog.categories.map(c => c.nodeShape));
  const bodyTex = {}, selectTex = {}, select = {}, ghost = {}, faint = {};
  for (const cat of catalog.categories) {
    const tint = P.cat[cat.id] ?? P.text3;
    bodyTex[cat.id] = bakeBody(PIXI, P, cat.nodeShape, tint, res);
    faint[cat.id] = ringContext(PIXI, cat.nodeShape, 0, 1.6, tint, 0.9);
  }
  for (const s of shapes) {
    selectTex[s] = bakeRing(PIXI, s, 10, 2.4, P.accent, 0.95, res);
    select[s] = ringContext(PIXI, s, 10, 2.4, P.accent, 0.95);
    ghost[s] = ringContext(PIXI, s, 4, 2, P.accent, 0.9);
  }
  const glyphs = glyphContexts(PIXI, P);
  const icons = createIconCache(PIXI, P, res, onIconLoad);
  const typeIndex = new Map(types.map((t, i) => [t.id, i]));
  return {
    P, res, atlas, fx, bodyTex, selectTex, select, ghost, faint, glyphs, icons, typeIndex,
    destroy() {
      atlas.textures.forEach(t => t.destroy(false));
      atlas.base.destroy(true);
      Object.values(fx).forEach(t => t.destroy(true));
      [bodyTex, selectTex].forEach(o => Object.values(o).forEach(t => t.destroy(true)));
      [select, ghost, faint].forEach(o => Object.values(o).forEach(c => c.destroy()));
      glyphs.all.forEach(c => c.destroy());
      icons.destroy();
    },
  };
}
