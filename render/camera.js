// Camera: pan with inertia, eased zoom toward a point, animated fit. Screen units are CSS px from the canvas top-left.

import { easeInOut } from './geom.js';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;

export function createCamera(world) {
  let w = 1, h = 1;
  let cx = 0, cy = 0, z = 1;
  let reduced = false;
  let vx = 0, vy = 0;                     // fling velocity, screen px per ms
  let zoomTarget = null;                  // { z, sx, sy }
  let tween = null;                       // { from, to, t, dur }
  let dirty = true;
  let lastZoomChange = 0;
  const clampZ = v => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));

  function apply() {
    world.position.set(w / 2 - cx * z, h / 2 - cy * z);
    world.scale.set(z);
    dirty = true;
  }

  function zoomAround(nz, sx, sy) {
    nz = clampZ(nz);
    const wx = (sx - w / 2) / z + cx, wy = (sy - h / 2) / z + cy;
    if (nz !== z) lastZoomChange = performance.now();
    z = nz;
    cx = wx - (sx - w / 2) / z;
    cy = wy - (sy - h / 2) / z;
  }

  return {
    get zoom() { return z; },
    get center() { return { x: cx, y: cy }; },
    get size() { return { w, h }; },
    get lastZoomChange() { return lastZoomChange; },
    get moving() { return !!(tween || zoomTarget || vx || vy); },
    takeDirty() { const d = dirty; dirty = false; return d; },
    setReducedMotion(b) { reduced = b; if (b) { vx = vy = 0; } },
    resize(nw, nh) { w = Math.max(1, nw); h = Math.max(1, nh); apply(); },
    screenToWorld(sx, sy) { return { x: (sx - w / 2) / z + cx, y: (sy - h / 2) / z + cy }; },
    worldToScreen(x, y) { return { x: (x - cx) * z + w / 2, y: (y - cy) * z + h / 2 }; },
    stop() { vx = vy = 0; zoomTarget = null; tween = null; },
    panBy(dx, dy) { tween = null; cx -= dx / z; cy -= dy / z; apply(); },
    fling(nvx, nvy) {
      if (reduced) return;
      const sp = Math.hypot(nvx, nvy);
      if (sp < 0.05) return;
      const cap = 4 / sp;
      vx = sp > 4 ? nvx * cap : nvx; vy = sp > 4 ? nvy * cap : nvy;
    },
    // Eased zoom toward a screen point (wheel, buttons). Instant under reduced motion.
    zoomBy(factor, sx = w / 2, sy = h / 2) {
      tween = null;
      const base = zoomTarget ? zoomTarget.z : z;
      const nz = clampZ(base * factor);
      if (reduced) { zoomAround(nz, sx, sy); zoomTarget = null; apply(); return; }
      zoomTarget = { z: nz, sx, sy };
    },
    // Immediate zoom (pinch follows the fingers).
    zoomTo(nz, sx, sy) { tween = null; zoomTarget = null; zoomAround(nz, sx, sy); apply(); },
    // padding: a number, or { l, t, r, b } screen px kept clear (panels over the canvas); the box centres in what is left
    fitBounds(minX, minY, maxX, maxY, padding = 80, animate = true, opts = {}) {
      vx = vy = 0; zoomTarget = null;
      const P = typeof padding === 'number' ? { l: padding, t: padding, r: padding, b: padding } : { l: 0, t: 0, r: 0, b: 0, ...padding };
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const pw = Math.max(40, w - P.l - P.r), ph = Math.max(40, h - P.t - P.b);
      // Explicit whole-graph fits can opt below the interactive zoom minimum.
      const tz = Math.min(ZOOM_MAX, Math.max(opts.minZ ?? 0, Math.min(pw / bw, ph / bh, opts.maxZ ?? 1.25)));
      // when the graph is wider or taller than the free area at this zoom, show its start (the users) instead of its middle
      const midX = bw * tz > pw ? minX + pw / 2 / tz : (minX + maxX) / 2;
      const midY = bh * tz > ph ? minY + ph / 2 / tz : (minY + maxY) / 2;
      const to = { x: midX - (P.l - P.r) / 2 / tz, y: midY - (P.t - P.b) / 2 / tz, z: tz };
      if (!animate || reduced) { cx = to.x; cy = to.y; z = to.z; tween = null; lastZoomChange = performance.now(); apply(); return; }
      tween = { from: { x: cx, y: cy, z }, to, t: 0, dur: 320 };
    },
    update(dt) {
      let moved = false;
      if (tween) {
        tween.t += dt;
        const k = easeInOut(Math.min(1, tween.t / tween.dur));
        const { from, to } = tween;
        cx = from.x + (to.x - from.x) * k;
        cy = from.y + (to.y - from.y) * k;
        z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * k);
        lastZoomChange = performance.now();
        if (tween.t >= tween.dur) tween = null;
        moved = true;
      }
      if (zoomTarget) {
        const k = 1 - Math.exp(-dt / 45);
        let nz = z + (zoomTarget.z - z) * k;
        if (Math.abs(zoomTarget.z - nz) < 1e-4 * zoomTarget.z) nz = zoomTarget.z;
        zoomAround(nz, zoomTarget.sx, zoomTarget.sy);
        if (nz === zoomTarget.z) zoomTarget = null;
        moved = true;
      }
      if (vx || vy) {
        cx -= (vx * dt) / z; cy -= (vy * dt) / z;
        const f = Math.pow(0.92, dt / 16.667);
        vx *= f; vy *= f;
        if (Math.hypot(vx, vy) < 0.01) vx = vy = 0;
        moved = true;
      }
      if (moved) apply();
      return moved;
    },
  };
}
