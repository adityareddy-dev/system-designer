// Edge views: ink curves between ports, load-scaled width, blocky direction marks, dashed links, flat highlight bands on hot paths.

import { drawE08Edge } from './e08-edges.js';
import { createRouter, routedLut, inkPath } from './routing.js';
import { makeLut, edgeSides, lutAt, distToLut, LUT_SEGS } from './geom.js';

const MAX_GLOWS = 12;
const ROPE_PTS = 13;

export function edgeCarries(kind) {
  return kind !== 'observe' && kind !== 'control';
}

export function createEdgeLayer(PIXI, parent, glowParent, env) {
  const views = new Map();
  let list = [];
  const dying = [];
  const tmp = { x: 0, y: 0, tx: 0, ty: 0, seg: 0 };
  let highlight = null;
  let trace = new Set();
  let structDirty = true;

  // glow ropes, pooled
  const ropes = [];
  function ensureRopes() {
    if (ropes.length) return;
    const kit = env.kit();
    for (let i = 0; i < MAX_GLOWS; i++) {
      const points = Array.from({ length: ROPE_PTS }, () => new PIXI.Point(0, 0));
      let rope;
      try { rope = new PIXI.MeshRope({ texture: kit.fx.strip, points }); } catch { return; }
      rope.visible = false;
      glowParent.addChild(rope);
      ropes.push({ rope, points, edge: null, ver: -1 });
    }
  }

  function create(e) {
    const v = {
      id: e.id, from: e.from, to: e.to, kind: e.kind || 'flow', carries: edgeCarries(e.kind || 'flow'),
      g: new PIXI.Graphics(), lut: makeLut(), ok: false, oa: 0, ob: 0,
      ax: NaN, ay: NaN, bx: NaN, by: NaN, a: env.reduced() ? 1 : 0, fade: 0, removing: false,
      rps: 0, band: 0, bandColor: 0, dirty: true, drawnW: -1, drawnColor: -1, drawnBand: -1, drawnHi: false,
      glow: 0,
    };
    v.g.alpha = v.a;
    parent.addChild(v.g);
    views.set(e.id, v);
    return v;
  }

  function draw(v, P) {
    if (env.kit().look === 'e08') return drawE08Edge(v, env, highlight === v.id || env.pathEdge?.(v.id) || trace.has(v.id));
    const g = v.g;
    const lut = v.lut;
    g.clear();
    if (!v.ok) return;
    const flowing = v.rps > 0.01;
    const hi = highlight === v.id || env.pathEdge?.(v.id) || trace.has(v.id);
    if (!v.carries) {
      const color = hi ? P.blue : P.text3;
      const alpha = 1;
      let s = 0, on = true;
      const dash = 6, gap = 5;
      while (s < lut.len) {
        const e = Math.min(lut.len, s + (on ? dash : gap));
        if (on) {
          lutAt(lut, s, tmp); g.moveTo(tmp.x, tmp.y);
          lutAt(lut, e, tmp); g.lineTo(tmp.x, tmp.y);
        }
        s = e; on = !on;
      }
      g.stroke({ width: 2, color, alpha, cap: 'butt' });
      g.rect(lut.p3x - 2.5, lut.p3y - 2.5, 5, 5).fill({ color, alpha });
      v.drawnW = 2; v.drawnColor = color; v.drawnHi = hi;
      return;
    }
    const w = 2.5 + Math.min(2.5, Math.log10(1 + v.rps) * 0.6) + (env.highContrast() ? 1.2 : 0);
    const wq = Math.round(w * 4) / 4;
    const color = hi ? P.blue : flowing ? P.ink : P.text3;
    if (v.band > 0) {
      // reduced motion: a still band in the traffic colour, outlined like a pipe
      inkPath(g, lut).stroke({ width: v.band + 4, color: P.ink, cap: 'butt', join: 'miter' });
      inkPath(g, lut).stroke({ width: v.band, color: v.bandColor, cap: 'butt', join: 'miter' });
    }
    inkPath(g, lut)
      .stroke({ width: v.kind === 'tap' ? wq * 0.75 : wq, color, alpha: 1, cap: 'butt', join: 'miter' });
    // direction marks every 80 units; with reduced motion (no moving dots) a flowing line gets bold chevrons in its
    // traffic colour, closer together, so direction and load still read at a glance
    const still = env.reduced() && flowing;
    const markColor = hi ? P.blue : P.ink;
    const len = lut.len;
    const step = still ? 56 : 80, k = still ? 1.6 : 1;
    if (len > 60) {
      for (let s = still ? 28 : 40; s < len - 20; s += step) {
        lutAt(lut, s, tmp);
        const nx = -tmp.ty, ny = tmp.tx, a = 4.2;
        if (v.kind === 'replication') {
          g.poly([tmp.x + tmp.tx * a, tmp.y + tmp.ty * a, tmp.x + nx * 3, tmp.y + ny * 3, tmp.x - tmp.tx * a, tmp.y - tmp.ty * a, tmp.x - nx * 3, tmp.y - ny * 3], true);
        } else {
          // small filled arrowhead pointing along the flow
          const back = 4 * k, half = 3.8 * k, tip = 3.6 * k;
          g.poly([tmp.x + tmp.tx * tip, tmp.y + tmp.ty * tip, tmp.x - tmp.tx * back + nx * half, tmp.y - tmp.ty * back + ny * half, tmp.x - tmp.tx * back - nx * half, tmp.y - tmp.ty * back - ny * half], true);
        }
      }
      g.fill({ color: markColor, alpha: 1 });
    }
    g.rect(lut.p0x - 3, lut.p0y - 3, 6, 6).fill({ color });
    g.rect(lut.p3x - 3, lut.p3y - 3, 6, 6).fill({ color });
    v.drawnW = wq; v.drawnColor = color; v.drawnBand = v.band; v.drawnHi = hi;
  }

  function wantsRedraw(v, P) {
    if (env.kit().look === 'e08') return v.dirty || (!env.reduced() && v.rps > .01) || (highlight === v.id || !!env.pathEdge?.(v.id) || trace.has(v.id)) !== v.drawnHi || v.rps !== v.drawnRps || v.band !== v.drawnBand;
    if (v.dirty) return true;
    const hi = highlight === v.id || env.pathEdge?.(v.id) || trace.has(v.id);
    if (hi !== v.drawnHi) return true;
    if (!v.carries) return false;
    const w = Math.round((2.5 + Math.min(2.5, Math.log10(1 + v.rps) * 0.6) + (env.highContrast() ? 1.2 : 0)) * 4) / 4;
    const color = hi ? P.blue : v.rps > 0.01 ? P.ink : P.text3;
    return w !== v.drawnW || color !== v.drawnColor || v.band !== v.drawnBand;
  }

  return {
    views,
    get list() { return list; },
    sync(graph) {
      const seen = new Set();
      let changed = false;
      for (const e of graph?.edges || []) {
        seen.add(e.id);
        let v = views.get(e.id);
        if (v && (v.from !== e.from || v.to !== e.to || v.kind !== (e.kind || 'flow'))) {
          v.removing = true; v.fade = 0; dying.push(v); views.delete(v.id); v = null;
        }
        if (!v) { v = create(e); changed = true; }
      }
      for (const v of [...views.values()]) {
        if (!seen.has(v.id)) { views.delete(v.id); v.removing = true; v.fade = 0; dying.push(v); changed = true; }
      }
      list = [...views.values()];
      if (changed) structDirty = true;
      return changed;
    },
    invalidateGeometry() { structDirty = true; },
    // Recomputes curves when nodes moved or edges changed; ports on a shared side fan out in order.
    updateGeometry(nodeViews) {
      let moved = structDirty;
      for (const v of list) {
        const a = nodeViews.get(v.from), b = nodeViews.get(v.to);
        if (!a || !b) { if (v.ok) { v.ok = false; v.dirty = true; } continue; }
        if (a.x !== v.ax || a.y !== v.ay || b.x !== v.bx || b.y !== v.by || !v.ok) moved = true;
      }
      if (!moved) return false;
      structDirty = false;
      const obstacles = [...nodeViews.values()].flatMap(n => [
        { id: n.id, body: true, x: n.x - (n.renderHalf||44), y: n.y - (n.renderHalf||44), width: 2*(n.renderHalf||44), height: 2*(n.renderHalf||44) },
        ...(n.captionBoxes || []),
      ]);
      const sides = new Map();
      const put = (key, item) => { let g = sides.get(key); if (!g) sides.set(key, g = []); g.push(item); };
      for (const v of list) {
        const a = nodeViews.get(v.from), b = nodeViews.get(v.to);
        if (!a || !b) continue;
        const o = edgeSides(a.x, a.y, b.x, b.y);
        v.horiz = o.horiz;
        const out = o.horiz ? (o.s > 0 ? 'R' : 'L') : (o.s > 0 ? 'B' : 'T');
        const inn = o.horiz ? (o.s > 0 ? 'L' : 'R') : (o.s > 0 ? 'T' : 'B');
        put(v.from + '|' + out, { v, end: 0, k: o.horiz ? b.y : b.x, t: o.horiz ? b.x : b.y });
        put(v.to + '|' + inn, { v, end: 1, k: o.horiz ? a.y : a.x, t: o.horiz ? a.x : a.y });
      }
      for (const g of sides.values()) {
        g.sort((p, q) => p.k - q.k || p.t - q.t || (p.v.id < q.v.id ? -1 : 1));
        const n = g.length;
        // r4-follow: wires that share a port all use the port's own height, so they meet in one shared last stretch
        // instead of ending a few pixels off the dot and jogging into it
        const gap = 0;
        g.forEach((it, i) => { const off = (i - (n - 1) / 2) * gap; if (it.end === 0) it.v.oa = off; else it.v.ob = off; });
      }
      const endpoints = new Map();
      for (const v of list) {
        const a = nodeViews.get(v.from), b = nodeViews.get(v.to);
        if (!a || !b) continue;
        const sign = b.x >= a.x ? 1 : -1;
        endpoints.set(v.id, [[a.x + sign * ((a.renderHalf||44)+8), a.y + (v.oa || 0)], [b.x - sign * ((b.renderHalf||44)+8), b.y + (v.ob || 0)]]);
      }
      const router = createRouter(obstacles, [...endpoints.values()].flat());
      for (const v of list) {
        const a = nodeViews.get(v.from), b = nodeViews.get(v.to);
        if (!a || !b) continue;
        v.ax = a.x; v.ay = a.y; v.bx = b.x; v.by = b.y;
        // Side ports leave a short clear stub before entering shared routing corridors.
        const sign = b.x >= a.x ? 1 : -1;
        const [start, end] = endpoints.get(v.id);
        // Endpoint bodies are obstacles too, apart from their own port stubs.
        const points = router.route(start, end);
        routedLut(v.lut, [[a.x + sign * (a.portHalf||36), start[1]], ...points, [b.x - sign * (b.portHalf||36), end[1]]]);
        const { lut } = v;
        v.minX = Math.min(...lut.xs) - 16; v.maxX = Math.max(...lut.xs) + 16;
        v.minY = Math.min(...lut.ys) - 16; v.maxY = Math.max(...lut.ys) + 16;
        v.ok = true; v.dirty = true;
      }
      return true;
    },
    update(dt) {
      const P = env.kit().P;
      const reduced = env.reduced();
      for (const v of list) {
        if (v.a < 1) { v.a = Math.min(1, v.a + dt / (reduced ? 120 : 180)); v.g.alpha = v.a; }
        if (wantsRedraw(v, P)) { draw(v, P); v.dirty = false; }
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const v = dying[i];
        v.fade += dt;
        const k = Math.min(1, v.fade / (reduced ? 120 : 160));
        v.g.alpha = v.a * (1 - k);
        if (k >= 1) { v.g.destroy(); dying.splice(i, 1); }
      }
    },
    setLoad(v, rps, band = 0, bandColor = 0) {
      v.rps = rps;
      v.band = band;
      v.bandColor = bandColor;
    },
    // [{ v, strength 0..1 }], busiest first, at most 12
    setGlows(items, time) {
      ensureRopes();
      const P = env.kit().P;
      const reduced = env.reduced();
      for (let i = 0; i < ropes.length; i++) {
        const r = ropes[i];
        const it = items[i];
        if (!it || !it.v.ok) { r.rope.visible = false; r.edge = null; continue; }
        const v = it.v;
        if (r.edge !== v || r.ver !== v.lut.ver) {
          for (let k = 0; k < ROPE_PTS; k++) {
            const idx = Math.round((k / (ROPE_PTS - 1)) * (v.lut.segs || LUT_SEGS));
            r.points[k].x = v.lut.xs[idx]; r.points[k].y = v.lut.ys[idx];
          }
          r.edge = v; r.ver = v.lut.ver;
        }
        // a flat highlighter band under the wire: yellow when hot, tomato when over
        r.rope.visible = true;
        r.rope.tint = it.strength >= 1 ? P.tomato : P.yellow;
        r.rope.blendMode = 'normal';
        r.rope.alpha = env.kit().look === 'e08' ? .4 : 1;
      }
    },
    redrawAll() { for (const v of list) v.dirty = true; },
    cull(x0, y0, x1, y1) {
      for (const v of list) v.g.visible = !v.ok || (v.maxX > x0 && v.minX < x1 && v.maxY > y0 && v.minY < y1);
    },
    setHighlight(id) {
      highlight = id;
    },
    setTrace(ids) { trace = new Set(ids || []); },
    hit(x, y, tol) {
      let best = null, bd = tol;
      for (const v of list) {
        if (!v.ok) continue;
        const { d } = distToLut(v.lut, x, y);
        if (d <= bd) { bd = d; best = v; }
      }
      return best;
    },
    // Nearest carrying edge whose middle part passes within tol of (x, y): used for drop-on-edge.
    hitMiddle(x, y, tol) {
      let best = null, bd = tol;
      for (const v of list) {
        if (!v.ok || !v.carries) continue;
        const { d, s } = distToLut(v.lut, x, y);
        if (d <= bd && s > 14 && s < v.lut.len - 14) { bd = d; best = v; }
      }
      return best;
    },
    applyKit(kit) {
      for (const r of ropes) r.rope.texture = kit.fx.strip;
      for (const v of list) v.dirty = true;
    },
    destroy() {
      for (const v of [...list, ...dying]) v.g.destroy();
      for (const r of ropes) r.rope.destroy();
      views.clear(); list = []; dying.length = 0; ropes.length = 0;
    },
  };
}
