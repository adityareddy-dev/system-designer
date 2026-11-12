// Short pooled effects: failure chips and cache-hit marks. Flat shapes that shrink away; nothing fades or glows.

const SHARDS = 192;
const SPARKS = 72;

export function createFx(PIXI, parent, env) {
  const kit0 = env.kit();
  const shards = [], sparks = [];
  for (let i = 0; i < SHARDS; i++) {
    const s = new PIXI.Sprite(kit0.fx.shard); s.anchor.set(0.5); s.visible = false;
    parent.addChild(s);
    shards.push({ s, vx: 0, vy: 0, vr: 0, life: 0, max: 300, size: 5, on: false });
  }
  for (let i = 0; i < SPARKS; i++) {
    const s = new PIXI.Sprite(kit0.fx.sparkle); s.anchor.set(0.5); s.visible = false;
    parent.addChild(s);
    sparks.push({ s, life: 0, max: 300, size: 12, on: false });
  }
  let si = 0, ki = 0, live = 0;

  function takeShard() {
    for (let n = 0; n < SHARDS; n++) {
      const o = shards[(si + n) % SHARDS];
      if (!o.on) { si = (si + n + 1) % SHARDS; return o; }
    }
    return null;
  }
  function takeSpark() {
    for (let n = 0; n < SPARKS; n++) {
      const o = sparks[(ki + n) % SPARKS];
      if (!o.on) { ki = (ki + n + 1) % SPARKS; return o; }
    }
    return null;
  }

  return {
    get count() { return live; },
    // Failed request: four flat chips in the failure colour, shrinking over 300 ms.
    burst(x, y, color, scale = 1) {
      const base = Math.random() * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        const o = takeShard();
        if (!o) return;
        const a = base + (k * Math.PI) / 2 + (Math.random() - 0.5) * 0.6;
        const sp = (55 + Math.random() * 35) * scale;
        o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp; o.vr = (Math.random() - 0.5) * 14;
        o.life = 0; o.max = 300; o.size = 5.5 * scale; o.on = true;
        o.s.visible = true; o.s.tint = color; o.s.alpha = 1; o.s.position.set(x, y); o.s.rotation = a;
        o.s.width = o.s.height = o.size;
        live++;
      }
    },
    sparkle(x, y, color, scale = 1) {
      const o = takeSpark();
      if (!o) return;
      o.life = 0; o.max = 300; o.size = 15 * scale; o.on = true;
      o.s.visible = true; o.s.tint = color; o.s.alpha = 1; o.s.position.set(x, y); o.s.rotation = Math.random();
      o.s.width = o.s.height = o.size * 0.3;
      live++;
    },
    update(dt) {
      if (!live) return;
      const t = dt / 1000;
      for (const o of shards) {
        if (!o.on) continue;
        o.life += dt;
        const k = o.life / o.max;
        if (k >= 1) { o.on = false; o.s.visible = false; live--; continue; }
        o.s.x += o.vx * t; o.s.y += o.vy * t;
        o.vx *= 0.9; o.vy *= 0.9;
        o.s.rotation += o.vr * t;
        o.s.width = o.s.height = o.size * (1 - k);
      }
      for (const o of sparks) {
        if (!o.on) continue;
        o.life += dt;
        const k = o.life / o.max;
        if (k >= 1) { o.on = false; o.s.visible = false; live--; continue; }
        o.s.width = o.s.height = o.size * (k < 0.4 ? 0.3 + 0.7 * (k / 0.4) : 1 - (k - 0.4) / 0.6 * 0.7);
      }
    },
    clear() {
      for (const o of shards) { o.on = false; o.s.visible = false; }
      for (const o of sparks) { o.on = false; o.s.visible = false; }
      live = 0;
    },
    applyKit(kit) {
      for (const o of shards) o.s.texture = kit.fx.shard;
      for (const o of sparks) o.s.texture = kit.fx.sparkle;
    },
  };
}
