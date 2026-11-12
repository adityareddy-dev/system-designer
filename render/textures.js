// Pre-baked textures and shared vector contexts for one theme: particle atlas, glows, glyphs, silhouettes, icons.

import { hexStr } from './theme.js';
import { iconImage } from './icons.js';

export const P_CELL = 48;   // atlas cell, px
export const P_SHAPE = 34;  // shape size inside a cell, px (particle scale = worldSize / P_SHAPE)
const P_OUTLINE = 6;        // ink outline in bake px (≈ 1.8 px at a 10 px particle)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texFrom(PIXI, c, mip = false) {
  return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: mip }) });
}

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
      g.fillStyle = hexStr(P.ink);
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

// Flat shapes only: white so they can be tinted; no gradients, blur or glow.
function bakeFx(PIXI) {
  const out = {};
  {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    out.ring = texFrom(PIXI, c);
  }
  {
    const c = makeCanvas(24, 24), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(3, 3, 18, 18);
    out.shard = texFrom(PIXI, c);
  }
  {
    // hard four-point mark for a cache hit
    const c = makeCanvas(48, 48), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 7 : 22;
      g.lineTo(24 + Math.cos(a) * r, 24 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    out.sparkle = texFrom(PIXI, c);
  }
  {
    // a flat band, tinted to highlight a hot wire
    const c = makeCanvas(64, 24), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 7, 64, 10);
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

// Node card: hard ink shadow, cream card with an ink outline, a flat category strip on top, and port dots.
// With `failed` the card is tomato with hatching.
function bakeBody(PIXI, P, shape, tint, res, failed = false) {
  const k = 2 * res;
  const size = Math.round(BODY_BOX * k);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const o = size / 2;
  g.lineJoin = 'miter'; g.lineCap = 'butt';
  const card = (dx, dy) => { g.beginPath(); g.roundRect(o - 36*k + dx*k, o - 36*k + dy*k, 72*k, 72*k, 8*k); };
  g.fillStyle = hexStr(P.ink); card(3, 3); g.fill();
  g.fillStyle = hexStr(failed ? P.tomato : P.card); card(0, 0); g.fill();
  if (failed) {
    g.save(); card(0, 0); g.clip();
    g.strokeStyle = hexStr(P.tomatoDeep); g.lineWidth = 2.5*k;
    g.beginPath();
    for (let d = -72; d <= 72; d += 9) { g.moveTo(o + (d - 40)*k, o + 40*k); g.lineTo(o + (d + 40)*k, o - 40*k); }
    g.stroke(); g.restore();
  } else {
    g.save(); card(0, 0); g.clip();
    g.fillStyle = hexStr(tint); g.fillRect(o - 36*k, o - 36*k, 72*k, 9*k);
    g.fillStyle = hexStr(P.ink); g.fillRect(o - 36*k, o - 28*k, 72*k, 2*k);
    g.restore();
  }
  g.strokeStyle = hexStr(P.ink); g.lineWidth = 2*k; card(0, 0); g.stroke();
  g.fillStyle = hexStr(P.card);
  for (const x of [-36, 36]) { g.beginPath(); g.arc(o + x*k, o, 4*k, 0, Math.PI*2); g.fill(); g.stroke(); }
  return texFrom(PIXI, c, true);
}

// Rings follow the card: a square outline with a small corner radius, no matter which category.
function bakeRing(PIXI, shape, inflate, width, color, alpha, res, edge = null) {
  const k = 2 * res;
  const size = Math.round(BODY_BOX * k);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const h = (36 + inflate) * k, o = size / 2;
  g.lineJoin = 'miter';
  g.beginPath(); g.roundRect(o - h, o - h, 2 * h, 2 * h, (8 + inflate * 0.5) * k);
  if (edge != null) { g.lineWidth = (width + 3.5) * k; g.strokeStyle = rgba(edge, 1); g.stroke(); }
  g.lineWidth = width * k; g.strokeStyle = rgba(color, alpha); g.stroke();
  return texFrom(PIXI, c, true);
}

function ringContext(PIXI, shape, inflate, width, color, alpha) {
  const c = new PIXI.GraphicsContext();
  const h = 36 + inflate;
  c.roundRect(-h, -h, 2 * h, 2 * h, 8 + inflate * 0.5).stroke({ width, color, alpha, join: 'miter' });
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
  const INK = { width: 1.8, color: P.ink, cap: 'butt', join: 'miter' };
  const ok = mk();
  ok.circle(0, 0, 7.4).fill({ color: P.mint }).stroke({ width: 1.8, color: P.ink });
  ok.moveTo(-3.3, 0.2).lineTo(-0.9, 2.7).lineTo(3.5, -2.5).stroke({ ...INK, width: 1.9 });
  const warnLike = color => {
    const c = mk();
    tri(c); c.fill({ color }).stroke({ width: 1.8, color: P.ink, join: 'miter' });
    c.moveTo(0, -3.2).lineTo(0, 1.2).stroke({ ...INK, width: 1.7 });
    c.rect(-0.9, 2.9, 1.8, 1.8).fill({ color: P.ink });
    return c;
  };
  const over = mk();
  octa(over, 8.2); over.fill({ color: P.tomato }).stroke({ width: 1.8, color: P.ink });
  over.moveTo(-3, -3).lineTo(3, 3).moveTo(3, -3).lineTo(-3, 3).stroke({ ...INK, width: 1.9 });
  const down = mk();
  down.circle(0, 0, 7).fill({ color: P.card }).stroke({ width: 2, color: P.ink });
  down.moveTo(-4.6, 4.6).lineTo(4.6, -4.6).stroke({ width: 2.2, color: P.tomato });
  const info = mk();
  info.circle(0, 0, 7.4).fill({ color: P.blue }).stroke({ width: 1.8, color: P.ink });
  info.moveTo(0, -0.6).lineTo(0, 3.6).stroke({ ...INK, color: P.card, width: 1.9 });
  info.rect(-1, -4.4, 2, 2).fill({ color: P.card });
  const lock = mk();
  lock.rect(-4.4, -1.2, 8.8, 7).fill({ color: P.ink });
  lock.moveTo(-2.7, -1.2).lineTo(-2.7, -3).arc(0, -3, 2.7, Math.PI, Math.PI * 2).lineTo(2.7, -1.2).stroke({ width: 1.6, color: P.ink });
  const status = [ok, warnLike(P.yellow), warnLike(P.yellow), over, down];
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
      iconImage('req.' + t.id, hexStr(P.ink), hexStr(P.ink), P_SHAPE * 2),
    ]);
    return { fill, edge };
  }));
  const atlas = bakeParticleAtlas(PIXI, P, types, images);
  const fx = bakeFx(PIXI);
  const shapes = new Set(catalog.categories.map(c => c.nodeShape));
  const bodyTex = {}, selectTex = {}, select = {}, ghost = {}, faint = {}, leadTex = {};
  const downTex = bakeBody(PIXI, P, 'rounded-square', P.tomato, res, true);
  for (const cat of catalog.categories) {
    const tint = P.catFill?.[cat.id] ?? P.card;
    bodyTex[cat.id] = bakeBody(PIXI, P, cat.nodeShape, tint, res);
    faint[cat.id] = ringContext(PIXI, cat.nodeShape, 0, 2, P.ink, 1);
  }
  for (const s of shapes) {
    selectTex[s] = bakeRing(PIXI, s, 7, 3, P.blue, 1, res);
    leadTex[s] = bakeRing(PIXI, s, 7, 3.5, P.yellow, 1, res, P.ink);
    select[s] = ringContext(PIXI, s, 7, 3, P.blue, 1);
    ghost[s] = ringContext(PIXI, s, 3, 2.5, P.blue, 1);
  }
  const glyphs = glyphContexts(PIXI, P);
  const icons = createIconCache(PIXI, P, res, onIconLoad);
  const typeIndex = new Map(types.map((t, i) => [t.id, i]));
  return {
    P, res, atlas, fx, bodyTex, downTex, selectTex, leadTex, select, ghost, faint, glyphs, icons, typeIndex,
    destroy() {
      atlas.textures.forEach(t => t.destroy(false));
      atlas.base.destroy(true);
      Object.values(fx).forEach(t => t.destroy(true));
      [bodyTex, selectTex, leadTex].forEach(o => Object.values(o).forEach(t => t.destroy(true)));
      downTex.destroy(true);
      [select, ghost, faint].forEach(o => Object.values(o).forEach(c => c.destroy()));
      glyphs.all.forEach(c => c.destroy());
      icons.destroy();
    },
  };
}
