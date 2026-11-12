// Pooled request particles: one flat shape per request type with an ink outline, emitted per edge from flow rates, moving at constant screen speed. No trails or glow.

import { lutAt } from './geom.js';
import { P_SHAPE } from './textures.js';

export const MAX_PARTICLES = 1500;
const PER_EDGE = 8;
const SCREEN_SPEED = 240;   // px per second at 1x
const EASE_IN_MS = 80;

const TRAVEL = 0, BOUNCE = 1, SHRINK = 2, FIZZLE = 3;

export function createParticles(PIXI, parent, env) {
  const kit0 = env.kit();
  const N = MAX_PARTICLES;
  const hasPC = typeof PIXI.ParticleContainer === 'function' && typeof PIXI.Particle === 'function';
  let pc, pool;
  if (hasPC) {
    pc = new PIXI.ParticleContainer({ dynamicProperties: { position: true, vertex: true, uvs: true, color: true, rotation: false } });
    pool = Array.from({ length: N }, () => new PIXI.Particle({ texture: kit0.atlas.textures[0], anchorX: 0.5, anchorY: 0.5, alpha: 0 }));
  } else {
    pc = new PIXI.Container();
    pool = Array.from({ length: N }, () => { const s = new PIXI.Sprite(kit0.atlas.textures[0]); s.anchor.set(0.5); s.visible = false; pc.addChild(s); return s; });
  }
  parent.addChild(pc);
  let highWater = 0;

  const alive = new Uint8Array(N);
  const type = new Uint8Array(N);     // index into the flow frame's typeIds
  const atlasIdx = new Uint8Array(N); // index into the particle atlas
  const phase = new Uint8Array(N);
  const s = new Float32Array(N);
  const seg = new Uint16Array(N);
  const lane = new Float32Array(N);
  const age = new Float32Array(N);
  const tph = new Float32Array(N);
  const edge = new Array(N).fill(null);
  const free = [];
  for (let i = N - 1; i >= 0; i--) free.push(i);
  let live = 0;
  const tmp = { x: 0, y: 0, tx: 0, ty: 0, seg: 0 };

  function show(i) {
    if (!hasPC) pool[i].visible = true;
    else if (i >= highWater) {
      highWater = i + 1;
      pc.particleChildren = pool.slice(0, highWater);
      pc.update();
    }
  }

  function kill(i) {
    if (!alive[i]) return;
    alive[i] = 0;
    const p = pool[i];
    p.alpha = 0;
    if (!hasPC) p.visible = false;
    const v = edge[i];
    if (v) v.pc = Math.max(0, (v.pc || 0) - 1);
    edge[i] = null;
    free.push(i);
    live--;
  }

  function spawn(v, t, s0) {
    const i = free.pop();
    alive[i] = 1; type[i] = t; atlasIdx[i] = v.texMap ? v.texMap[t] : t; phase[i] = TRAVEL; s[i] = s0; seg[i] = 0;
    lane[i] = ((t % 3) - 1) * 2.6 + (Math.random() - 0.5) * 2;
    age[i] = 0; tph[i] = 0; edge[i] = v;
    v.pc = (v.pc || 0) + 1;
    const p = pool[i];
    p.texture = env.kit().atlas.textures[atlasIdx[i]];
    p.alpha = 1;
    show(i);
    live++;
    return i;
  }

  function place(i, v, scale, alpha) {
    lutAt(v.lut, s[i], tmp, seg[i]);
    seg[i] = tmp.seg;
    const p = pool[i];
    const x = tmp.x - tmp.ty * lane[i], y = tmp.y + tmp.tx * lane[i];
    if (hasPC) { p.x = x; p.y = y; p.scaleX = p.scaleY = scale; }
    else { p.position.set(x, y); p.scale.set(scale); }
    p.alpha = alpha;
  }

  return {
    get count() { return live; },
    // edges: carrying edge views with .rates (particles per second per type), .acc, .pFail/.pHit/.pFizzle (per type)
    update(dt, { edges, speed, zoom, cap, size, colorBad, colorHit, fx }) {
      const base = size / P_SHAPE;
      const running = speed > 0;
      const worldSpeed = (SCREEN_SPEED * Math.sqrt(Math.max(speed, 0))) / Math.max(zoom, 0.05);
      // emission
      if (running && edges) {
        const tsec = dt / 1000;
        for (let e = 0; e < edges.length; e++) {
          const v = edges[e];
          if (!v.ok || !v.rates) continue;
          const rates = v.rates, acc = v.acc;
          for (let t = 0; t < rates.length; t++) {
            const r = rates[t];
            if (r <= 0) continue;
            acc[t] += r * tsec;
            while (acc[t] >= 1) {
              acc[t] -= 1;
              if ((v.pc || 0) >= PER_EDGE || live >= cap || !free.length) { acc[t] = Math.min(acc[t], 1); break; }
              // spread particles born in the same frame along the first stretch of the edge
              const lead = Math.min(v.lut.len * 0.5, (acc[t] / r) * worldSpeed);
              spawn(v, t, lead);
            }
            if (acc[t] > 2) acc[t] = 1;
          }
        }
      }
      // motion and fates
      if (!live) return;
      const step = (worldSpeed * dt) / 1000;
      for (let i = 0; i < highWater || (!hasPC && i < N); i++) {
        if (!alive[i]) continue;
        const v = edge[i];
        if (!v || v.removing || !v.ok) { kill(i); continue; }
        const ph = phase[i];
        if (ph === TRAVEL) {
          if (!running) { place(i, v, base, 1); continue; }
          age[i] += dt;
          const ease = age[i] < EASE_IN_MS ? 0.25 + 0.75 * (age[i] / EASE_IN_MS) : 1;
          s[i] += step * ease;
          if (s[i] >= v.lut.len) {
            s[i] = v.lut.len;
            const t = type[i];
            const r = Math.random();
            const pf = v.pFail ? v.pFail[t] : 0, ph2 = v.pHit ? v.pHit[t] : 0, pz = v.pFizzle ? v.pFizzle[t] : 0;
            if (r < pf) {
              lutAt(v.lut, s[i], tmp, seg[i]);
              if (!v.quiet) fx.burst(tmp.x, tmp.y, colorBad, size / 10);
              kill(i);
              continue;
            } else if (r < pf + ph2) {
              phase[i] = BOUNCE; tph[i] = 0;
              lutAt(v.lut, s[i], tmp, seg[i]);
              if (!v.quiet) fx.sparkle(tmp.x, tmp.y, colorHit, size / 10);
            } else if (r < pf + ph2 + pz) {
              phase[i] = FIZZLE; tph[i] = 0;
            } else {
              phase[i] = SHRINK; tph[i] = 0;
            }
          }
          place(i, v, base, 1);
        } else if (ph === BOUNCE) {
          tph[i] += dt;
          const k = tph[i] / 320;
          if (k >= 1) { kill(i); continue; }
          if (running) s[i] = Math.max(0, s[i] - step * 0.55 * (1 - k));
          seg[i] = 0;
          place(i, v, base * (1 - k), 1);
        } else if (ph === SHRINK) {
          tph[i] += dt;
          const k = tph[i] / 120;
          if (k >= 1) { kill(i); continue; }
          place(i, v, base * (1 - k), 1);
        } else {
          tph[i] += dt;
          const k = tph[i] / 260;
          if (k >= 1) { kill(i); continue; }
          place(i, v, base * (1 - k), 1);
          const p = pool[i];
          const j = (Math.random() - 0.5) * 2;
          if (hasPC) { p.x += j; p.y -= k * 6; } else { p.position.x += j; p.position.y -= k * 6; }
        }
      }
    },
    clear() {
      for (let i = 0; i < N; i++) if (alive[i]) kill(i);
    },
    applyKit(kit) {
      for (let i = 0; i < N; i++) pool[i].texture = kit.atlas.textures[alive[i] ? atlasIdx[i] : 0];
      if (hasPC) { pc.texture = null; pc.update(); }
    },
    destroy() {
      pc.destroy({ children: true });
    },
  };
}
