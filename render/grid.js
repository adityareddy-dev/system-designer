// Canvas dot grid as a static particle field in world space, rebuilt only when the view leaves it or the zoom changes a lot.
import { GRID } from './geom.js';

const MAX_DOTS = 6000;

export function createGrid(PIXI, parent, env) {
  const hasPC = typeof PIXI.ParticleContainer === 'function' && typeof PIXI.Particle === 'function';
  const pc = hasPC
    ? new PIXI.ParticleContainer({ dynamicProperties: { position: false, vertex: false, uvs: false, color: false, rotation: false } })
    : new PIXI.Container();
  parent.addChild(pc);
  let pool = [];
  let area = null;      // { x0, y0, x1, y1, step, z }
  let tex = null;

  function make(texture) {
    if (hasPC) return new PIXI.Particle({ texture, anchorX: 0.5, anchorY: 0.5 });
    const s = new PIXI.Sprite(texture); s.anchor.set(0.5); return s;
  }

  // Dot spacing in world units: 20, 40, 80 ... so dots stay at least 18 px apart on screen.
  function stepFor(z) {
    if (env.kit().look === 'e08') return 20 / Math.max(.01, z);
    let step = GRID;
    while (step * z < 18) step *= 2;
    return step;
  }

  function rebuild(cx, cy, w, h, z) {
    let step = stepFor(z);
    const margin = 0.25;
    const hw = (w / z) * (0.5 + margin), hh = (h / z) * (0.5 + margin);
    let x0, x1, y0, y1, nx, ny;
    for (;;) {
      x0 = Math.floor((cx - hw) / step) * step; x1 = Math.ceil((cx + hw) / step) * step;
      y0 = Math.floor((cy - hh) / step) * step; y1 = Math.ceil((cy + hh) / step) * step;
      nx = Math.round((x1 - x0) / step) + 1; ny = Math.round((y1 - y0) / step) + 1;
      if (nx * ny <= MAX_DOTS) break;
      step *= 2;
    }
    const count = Math.min(MAX_DOTS, nx * ny);
    const kit = env.kit();
    tex = kit.fx.dot;
    while (pool.length < count) pool.push(make(tex));
    const size = 2.2 / z;                      // about 2 screen px across
    const sc = size / tex.width;
    let i = 0;
    for (let gy = 0; gy < ny && i < count; gy++) {
      for (let gx = 0; gx < nx && i < count; gx++, i++) {
        const p = pool[i];
        const x = x0 + gx * step, y = y0 + gy * step;
        if (hasPC) { p.x = x; p.y = y; p.scaleX = p.scaleY = sc; p.texture = tex; }
        else { p.position.set(x, y); p.scale.set(sc); p.texture = tex; p.visible = true; }
      }
    }
    if (hasPC) { pc.particleChildren = pool.slice(0, count); pc.texture = tex; pc.update(); }
    else { for (let k = 0; k < pool.length; k++) { if (k >= count) pool[k].visible = false; if (!pool[k].parent) pc.addChild(pool[k]); } }
    area = { x0, y0, x1, y1, step, z };
  }

  return {
    // Called whenever the camera changed.
    update(cx, cy, w, h, z) {
      const P = env.kit().P;
      const fade = env.kit().look === 'e08' ? 1 : Math.max(0, Math.min(1, (z - 0.3) / 0.25));
      pc.visible = fade > 0;
      pc.alpha = Math.min(1, P.gridDotAlpha * 1.6) * fade;
      pc.tint = P.gridDot;
      if (!pc.visible) return;
      const hw = w / z / 2, hh = h / z / 2;
      const need = !area || Math.abs(Math.log(z / area.z)) > 0.18 || stepFor(z) > area.step
        || cx - hw < area.x0 || cx + hw > area.x1 || cy - hh < area.y0 || cy + hh > area.y1;
      if (need) rebuild(cx, cy, w, h, z);
    },
    invalidate() { area = null; },
    destroy() { pc.destroy({ children: true }); pool = []; },
  };
}
