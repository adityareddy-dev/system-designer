// Node views: glass silhouette, icon, label, busy ring, status glyphs, chips, glows; spring placement.

import { poolCells } from './pool.js';
import { outline, HALF } from './geom.js';
import { statusColor, severityColor } from './theme.js';
import { P_SHAPE, BODY_BOX } from './textures.js';
import { queuePressure, count } from './pressure.js';
import { intersects } from './routing.js';

const FONT_UI = 'Atkinson Hyperlegible, Arial, sans-serif';
const FONT_MONO = 'IBM Plex Mono, monospace';
const nowForStatus = () => performance.now();
const K = 320, C = 24;              // placement spring (≈ 6 % overshoot, settles in ≈ 300 ms)
const SHADOW = 114;               // shadow sprite size; its baked box comes out at about 68 units
const PILE = [[-47, -6], [-47, 6], [-55, 0], [-55, -12], [-55, 12], [-63, -6]];

function iconOffset(shape) {
  return shape === 'cylinder' ? 3 : shape === 'shield' ? -3 : 0;
}

// Small body + icon used for the ghost, the friend overlay and snapshots.
export function makeMini(PIXI, kit, env, type, { faint = false } = {}) {
  const el = env.element(type);
  const cat = el?.category || 'compute';
  const shape = env.shapeOf(cat);
  const c = new PIXI.Container();
  let body;
  if (faint) body = new PIXI.Graphics(kit.faint[cat]);
  else { body = new PIXI.Sprite(kit.bodyTex[cat]); body.anchor.set(0.5); body.width = body.height = BODY_BOX; }
  c.addChild(body);
  const tex = kit.icons.get('el.' + type, kit.P.cat[cat] ?? kit.P.text3);
  const icon = new PIXI.Sprite(tex || PIXI.Texture.EMPTY);
  icon.anchor.set(0.5); icon.width = icon.height = 28; icon.y = iconOffset(shape);
  c.addChild(icon);
  c.__icon = icon; c.__type = type; c.__cat = cat; c.__shape = shape; c.__body = body; c.__faint = faint;
  return c;
}

export function refreshMini(kit, c) {
  if (c.__faint) c.__body.context = kit.faint[c.__cat];
  else { c.__body.texture = kit.bodyTex[c.__cat]; c.__body.width = c.__body.height = BODY_BOX; }
  const tex = kit.icons.get('el.' + c.__type, kit.P.cat[c.__cat] ?? kit.P.text3);
  if (tex) c.__icon.texture = tex;
}

export function createNodeLayer(PIXI, parent, env) {
  const views = new Map();
  let list = [];
  const dying = [];
  let textRes = 2;
  let compact = false;
  let detailZoom = true;
  let tiny = false;
  const showLabel = (v) => { v.labelT.visible = true; v.labelT.text = compact ? shortName(v) : v.label; };
  const shortName = v => ({ 'vm-fleet': 'Servers', 'sql-primary': 'SQL', 'sql-replica': 'Replica', 'mobile-app': 'Mobile', 'web-browser': 'Web', 'regional-lb': 'Balancer', 'worker-pool': 'Workers', 'object-storage': 'Objects', 'api-gateway': 'Gateway', 'identity-provider': 'Identity', 'waf': 'Firewall', 'distributed-cache': 'Cache', 'third-party-api': 'API', 'idempotency-store': 'Keys' }[v.type] || v.label?.replace(/\s*\([^)]*\)/g, '').split(' ')[0].slice(0, 9) || v.type);
  let labelK = 1; // label scale that keeps names readable when zoomed out
  let multiRegion = false;
  let mainRegion = null; // most common region; only nodes elsewhere get a region chip
  let selected = null, hovered = null;
  let validation = new Map();

  function makeText(text, size, fill, mono = false, weight = '500', wrapW = 116) {
    const t = new PIXI.Text({
      text,
      style: { fontFamily: mono ? FONT_MONO : FONT_UI, fontSize: size, fill, fontWeight: weight, align: 'center',
        wordWrap: !mono, wordWrapWidth: wrapW, lineHeight: Math.round(size * 1.2) },
      resolution: textRes,
    });
    return t;
  }

  function create(n) {
    const kit = env.kit();
    const P = kit.P;
    const el = env.element(n.type);
    const cat = el?.category || 'compute';
    const shape = env.shapeOf(cat);
    const v = {
      id: n.id, type: n.type, el, cat, shape, kind: el?.kind || 'compute',
      x: n.x, y: n.y, tx: n.x, ty: n.y, vx: 0, vy: 0, s: env.reduced() ? 1 : 0.96, vs: 0, fade: 0,
      appearAt: env.reduced() ? 0 : performance.now() + ([...views.values()].some(o => Math.abs(o.x - n.x) < 90 && Math.abs(o.y - n.y) < 90) ? 160 : 0),
      drag: null, dragUntil: 0, removing: false,
      live: false, tu: 0, du: 0, drawnU: -1, drawnColor: -1, status: 0, down: false, queue: 0, drawnQ: -1, over: 0, pileType: -1,
      units: 1, zones: 1, region: null, locked: false, label: '',
      event: null, eventPhase: Math.random(),
      outline: outline(shape, 6, 96),
    };
    const c = new PIXI.Container();
    c.position.set(n.x, n.y);
    v.c = c;
    v.glow = new PIXI.Sprite(kit.fx.glow); v.glow.anchor.set(0.5); v.glow.visible = false;
    v.pulse = new PIXI.Sprite(kit.fx.ring); v.pulse.anchor.set(0.5); v.pulse.visible = false;
    v.shadow = new PIXI.Sprite(kit.fx.shadow); v.shadow.anchor.set(0.5); v.shadow.width = v.shadow.height = SHADOW; v.shadow.y = 5;
    v.shadow.tint = P.shadow; v.shadow.alpha = 0;
    v.body = new PIXI.Sprite(kit.bodyTex[cat]); v.body.anchor.set(0.5); v.body.width = v.body.height = BODY_BOX;
    v.select = new PIXI.Sprite(kit.selectTex[shape]); v.select.anchor.set(0.5); v.select.width = v.select.height = BODY_BOX; v.select.visible = false;
    v.icon = new PIXI.Sprite(kit.icons.get('el.' + n.type, P.cat[cat] ?? P.text3) || PIXI.Texture.EMPTY);
    v.icon.anchor.set(0.5); v.icon.width = v.icon.height = 28; v.icon.y = iconOffset(shape);
    v.busy = new PIXI.Graphics();
    v.pool = new PIXI.Graphics();
    v.poolT = makeText('', 10.5, P.text2, true); v.poolT.anchor.set(.5); v.poolT.y = 19;
    v.labelBg = new PIXI.Graphics();
    v.pile = new PIXI.Container(); v.pile.visible = false;
    v.pileSprites = PILE.map(([px, py]) => {
      const s = new PIXI.Sprite(kit.atlas.textures[0]); s.anchor.set(0.5); s.position.set(px, py); s.scale.set(8 / P_SHAPE); s.visible = false;
      v.pile.addChild(s); return s;
    });
    v.qbar = new PIXI.Graphics(); v.qbar.visible = false;
    v.retryG = new PIXI.Graphics();
    v.statusG = new PIXI.Graphics(kit.glyphs.status[0]); v.statusG.position.set(-HALF + 7, -HALF + 7); v.statusG.visible = false;
    v.valid = new PIXI.Graphics(kit.glyphs.valid.warn); v.valid.position.set(HALF - 7, -HALF + 7); v.valid.visible = false;
    v.lock = new PIXI.Graphics(kit.glyphs.lock); v.lock.position.set(-HALF + 8, HALF - 8); v.lock.visible = false;
    v.chip = new PIXI.Container(); v.chip.position.set(HALF - 6, HALF - 6); v.chip.visible = false;
    v.chipBg = new PIXI.Graphics(); v.chip.addChild(v.chipBg);
    v.chipText = null;
    v.zonesG = new PIXI.Graphics(); v.zonesG.position.set(HALF - 6, HALF + 6);
    v.labelT = makeText('', 12, P.text2, false, '500', 72); // narrow lines, so neighbours' names do not touch when zoomed out
    v.labelT.anchor.set(0.5, 0); v.labelT.y = HALF + 10; v.labelT.scale.set(labelK); v.labelT.visible = !tiny;
    v.evidenceT = makeText('', 11, P.bad, true); v.evidenceT.anchor.set(.5, 1); v.evidenceT.y = -HALF - 6; v.evidenceT.visible = false;
    v.evidenceT.style.wordWrap = true; v.evidenceT.style.wordWrapWidth = 108; v.evidenceT.style.align = 'left';
    v.leader = new PIXI.Graphics();
    v.regionC = new PIXI.Container(); v.regionC.y = -HALF - 12; v.regionC.visible = false;
    v.regionBg = new PIXI.Graphics(); v.regionC.addChild(v.regionBg);
    v.regionT = null;
    v.badge = new PIXI.Container(); v.badge.y = -HALF - 12; v.badge.visible = false;
    v.badgeBg = new PIXI.Graphics(); v.badge.addChild(v.badgeBg);
    v.badgeIcon = new PIXI.Sprite(PIXI.Texture.EMPTY); v.badgeIcon.anchor.set(0.5); v.badgeIcon.width = v.badgeIcon.height = 15;
    v.badge.addChild(v.badgeIcon);
    c.addChild(v.glow, v.pulse, v.shadow, v.body, v.select, v.icon, v.busy, v.pool, v.poolT, v.qbar, v.retryG, v.pile, v.statusG, v.valid, v.lock,
      v.chip, v.zonesG, v.leader, v.labelBg, v.labelT, v.regionC, v.badge, v.evidenceT);
    c.alpha = 0;
    c.scale.set(v.s);
    parent.addChild(c);
    views.set(n.id, v);
    update(v, n, true);
    return v;
  }

  function drawChip(v) {
    const P = env.kit().P;
    const show = v.units > 1 && !(v.el?.units?.max === 1);
    v.chip.visible = show;
    if (show) {
      const s = '×' + v.units;
      if (!v.chipText) { v.chipText = makeText(s, 10, P.text2, true, '500'); v.chipText.anchor.set(0.5); v.chip.addChild(v.chipText); }
      v.chipText.text = s;
      v.chipText.style.fill = P.text2;
      const w = Math.max(18, v.chipText.width + 8);
      v.chipBg.clear().roundRect(-w / 2, -7.5, w, 15, 7.5).fill({ color: P.surfaceSolid }).stroke({ width: 1, color: P.text3, alpha: 0.35 });
    }
    const dots = v.zones > 1 || show ? Math.max(1, Math.min(3, v.zones)) : 0;
    v.zonesG.clear();
    for (let i = 0; i < dots; i++) v.zonesG.circle((i - (dots - 1) / 2) * 5, 4, 1.7).fill({ color: P.accent2 });
  }

  function drawRegion(v) {
    const P = env.kit().P;
    const r = env.regionShort(v.region);
    const show = multiRegion && !!r && v.region !== mainRegion && !v.event;
    v.regionC.visible = show;
    if (!show) return;
    if (!v.regionT) { v.regionT = makeText(r, 9.5, P.text3, true, '500'); v.regionT.anchor.set(0.5); v.regionC.addChild(v.regionT); }
    v.regionT.text = r;
    v.regionT.style.fill = P.text3;
    const w = v.regionT.width + 10;
    v.regionBg.clear().roundRect(-w / 2, -7, w, 14, 7).fill({ color: P.surfaceSolid }).stroke({ width: 1, color: P.text3, alpha: 0.3 });
  }

  function update(v, n, fresh = false) {
    // tx, ty always follow the graph; an active drag only overrides what is shown
    if (fresh || n.x !== v.tx || n.y !== v.ty) {
      v.tx = n.x; v.ty = n.y;
      if ((env.reduced() || fresh) && !v.drag) { v.x = v.tx; v.y = v.ty; v.vx = v.vy = 0; v.c.position.set(v.x, v.y); }
    }
    const units = n.units ?? 1, zones = n.zones ?? 1;
    if (fresh || units !== v.units || zones !== v.zones) { v.units = units; v.zones = zones; drawChip(v); }
    if (fresh || n.region !== v.region) { v.region = n.region; drawRegion(v); }
    const locked = !!n.locked;
    if (fresh || locked !== v.locked) { v.locked = locked; v.lock.visible = locked; }
    const label = n.label || v.el?.name || n.type;
    if (fresh || label !== v.label) { v.label = label; showLabel(v); }
  }

  function remove(v) {
    views.delete(v.id);
    v.removing = true;
    v.fade = 0;
    dying.push(v);
    if (selected === v.id) selected = null;
    if (hovered === v.id) hovered = null;
  }

  function drawBusy(v, P) {
    const g = v.busy;
    const u = Math.min(1, Math.max(0, v.du));
    const color = v.down ? P.bad : statusColor(P, v.status);
    g.clear().roundRect(-26, 25, 52, 4, 2).fill({ color: P.border, alpha: .5 });
    if (u > .004) g.roundRect(-26, 25, Math.max(3, 52 * u), 4, 2).fill({ color });
    v.drawnU = v.du; v.drawnColor = color;
  }

  function drawQueue(v, P, dt, reduced) {
    const pressure=queuePressure(v.telemetry);
    v.ageFill=reduced?pressure.fill:(v.ageFill||0)+(pressure.fill-(v.ageFill||0))*(1-Math.exp(-dt/180));
    const fill=v.ageFill, color=pressure.late?P.bad:fill>.7?P.warn:P.cat.messaging;
    const g=v.qbar;g.clear().roundRect(-25,-22,50,42,4).fill({color:P.surfaceSolid}).stroke({width:1.5,color:P.text3});
    if(fill>.001)g.rect(-21,16-34*fill,42,34*fill).fill({color,alpha:.7});
    for(let i=1;i<4;i++)g.moveTo(-24,16-i*8.5).lineTo(-19,16-i*8.5).stroke({width:1,color:P.text3,alpha:.6});
    // The top rule is the actual deadline, not a capacity limit.
    g.moveTo(-28,-18).lineTo(28,-18).stroke({width:2,color:pressure.late?P.bad:P.warn,alpha:1});
    if(pressure.late)g.poly([-4,-27,4,-27,0,-21]).fill({color:P.bad});
    const change=Math.abs(pressure.net);
    if(change>.01){const direction=pressure.net>0?-1:1;g.moveTo(30,-direction*8).lineTo(30,direction*8).lineTo(27,direction*4).moveTo(30,direction*8).lineTo(33,direction*4).stroke({width:2,color});}
  }

  function drawRetries(v,P,time,reduced) {
    const rate=v.telemetry?.retryRps||0,g=v.retryG;g.clear();
    if(!v.live||rate<.5)return;
    g.moveTo(38,6).bezierCurveTo(64,-54,-64,-54,-38,6).stroke({width:2,color:P.bad,alpha:.65});
    g.poly([-38,6,-46,1,-38,-3]).fill({color:P.bad});
    // One marker is a dot-scale group of the engine's retry arrivals.
    const scale=env.dotScale?.()||1,n=Math.min(4,Math.ceil(rate/scale));
    for(let i=0;i<n;i++){
      const t=reduced?.5:((time/1100+i/n)%1),u=1-t;
      const x=u*u*u*38+3*u*u*t*64+3*u*t*t*(-64)+t*t*t*(-38),y=u*u*u*6+3*u*u*t*(-54)+3*u*t*t*(-54)+t*t*t*6;
      g.circle(x,y,3).fill({color:P.bad});
    }
  }

  function drawPool(v, P, now, reduced, time) {
    const show = detailZoom && v.kind === 'compute' && (v.units > 1 || v.fleetUnits > 1) &&
      (selected === v.id || v.live || now < (v.recoverUntil || 0));
    v.pool.visible = v.poolT.visible = show;
    v.icon.visible = !show;
    if (!show) return;
    const count = v.fleetUnits ?? v.units, alive = v.availableUnits ?? count;
    const cells = poolCells(count, alive, v.live ? v.du : 0);
    const cols = Math.min(cells.length, cells.length <= 3 ? 3 : 4), rows = Math.ceil(cells.length / cols);
    const w = 56 / cols - 3, h = Math.min(28, 31 / rows - 3), g = v.pool;
    g.clear();
    cells.forEach((cell, i) => {
      const x = -28 + (i % cols) * (w + 3), y = -22 + Math.floor(i / cols) * (h + 3);
      g.roundRect(x, y, w, h, 1.5).fill({ color: P.border, alpha: .6 });
      if (cell.available > 0) g.roundRect(x, y, Math.max(1, w * cell.available), h, 1.5).fill({ color: P.cat.compute, alpha: .15 });
      if (cell.busy > .002) {
        const light = reduced || !v.motionActive ? 1 : .75 + .25 * Math.sin(time / 135 - i * 1.2);
        g.roundRect(x, y + h * (1 - cell.busy), Math.max(1, w * cell.available), Math.max(1, h * cell.busy), 1).fill({ color: v.tu > 1 ? P.bad : P.cat.compute, alpha: light });
      }
      if (cell.available < .99) g.moveTo(x + w - 4, y + 2).lineTo(x + w - 1, y + h - 2).moveTo(x + w - 1, y + 2).lineTo(x + w - 4, y + h - 2).stroke({ width: 1, color: P.bad });
    });
    v.poolT.text = `${alive}/${count}`;
  }

  function step(v, dt, now, P, reduced, time) {
    if (now < v.appearAt && !reduced) { v.c.alpha = 0; return; }
    // placement spring
    if (v.drag) {
      v.x = v.drag.x; v.y = v.drag.y; v.vx = v.vy = 0;
      if (v.dragUntil && now > v.dragUntil) { v.drag = null; v.dragUntil = 0; }
    } else if (reduced) {
      v.x = v.tx; v.y = v.ty;
    } else if (v.x !== v.tx || v.y !== v.ty || v.vx || v.vy) {
      let rem = Math.min(dt, 64) / 1000;
      while (rem > 0) {
        const h = Math.min(rem, 0.004);
        v.vx += (-K * (v.x - v.tx) - C * v.vx) * h; v.x += v.vx * h;
        v.vy += (-K * (v.y - v.ty) - C * v.vy) * h; v.y += v.vy * h;
        rem -= h;
      }
      if (Math.abs(v.x - v.tx) < 0.05 && Math.abs(v.vx) < 0.5 && Math.abs(v.y - v.ty) < 0.05 && Math.abs(v.vy) < 0.5) {
        v.x = v.tx; v.y = v.ty; v.vx = v.vy = 0;
      }
    }
    v.c.position.set(v.x, v.y);
    if (reduced) {
      if (v.c.alpha < 1) v.c.alpha = Math.min(1, v.c.alpha + dt / 120);
      if (v.s !== 1) { v.s = 1; v.c.scale.set(1); }
    } else if (v.s !== 1 || v.vs) {
      let rem = Math.min(dt, 64) / 1000;
      while (rem > 0) { const h = Math.min(rem, 0.004); v.vs += (-K * (v.s - 1) - C * v.vs) * h; v.s += v.vs * h; rem -= h; }
      if (Math.abs(v.s - 1) < 0.002 && Math.abs(v.vs) < 0.05) { v.s = 1; v.vs = 0; }
      v.c.scale.set(v.s);
      if (v.c.alpha < 1) v.c.alpha = Math.min(1, v.c.alpha + dt / 120);
    }

    // live load
    if (v.live) {
      v.du = reduced ? v.tu : v.du + (v.tu - v.du) * (1 - Math.exp(-dt / 140));
      const color = v.down ? P.bad : statusColor(P, v.status);
      if (Math.abs(v.du - v.drawnU) > 0.004 || color !== v.drawnColor) drawBusy(v, P);
      const over = v.down || v.tu > 1 || v.status >= 3;
      if (over && !reduced) {
        const k = 0.5 + 0.5 * Math.sin(time * 0.001 * Math.PI * 2 * 1.2);
        v.busy.alpha = 1;
      } else v.busy.alpha = 1;
      if (v.kind === 'queue') drawQueue(v, P, dt, reduced);
      // waiting pile at the input of an overloaded element
      const count = v.over > 0.01 ? Math.min(6, Math.ceil(v.over * 6)) : 0;
      v.pile.visible = count > 0;
      if (count) {
        for (let i = 0; i < 6; i++) {
          const s = v.pileSprites[i];
          s.visible = i < count;
          if (v.pileType >= 0) s.texture = env.kit().atlas.textures[v.pileType];
          if (!reduced && s.visible) s.y = PILE[i][1] + Math.sin(time * 0.006 + i * 1.7) * 0.8;
        }
      }
    }

    drawPool(v, P, now, reduced, time);
    if(v.live && v.kind==='queue') v.icon.visible=false;
    drawRetries(v,P,time,reduced);
    // glow: overload pulse > event > selection
    const over = v.live && (v.down || v.tu > 1 || v.status >= 3);
    const isSel = selected === v.id;
    if (over) {
      const k = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 0.001 * Math.PI * 2 * 1.2);
      v.glow.visible = false; v.glow.tint = P.bad;
      v.glow.alpha = (P.dark ? 0.32 : 0.22) + k * (P.dark ? 0.3 : 0.18);
      v.glow.width = v.glow.height = 150 + k * 18;
    } else if (v.event) {
      v.glow.visible = true; v.glow.tint = v.event.color;
      v.glow.alpha = P.dark ? 0.38 : 0.24;
      v.glow.width = v.glow.height = 156;
    } else if (isSel) {
      const k = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 0.0025);
      v.glow.visible = false; v.glow.tint = P.accent;
      v.glow.alpha = (P.dark ? 0.3 : 0.18) + k * 0.08;
      v.glow.width = v.glow.height = 150;
    } else v.glow.visible = false;
    v.glow.blendMode = P.dark ? 'add' : 'normal';

    if (!reduced && over && now - (v.statusAt || 0) < 320) {
      const progress = Math.max(0, (now - v.statusAt) / 320);
      v.pulse.visible = true; v.pulse.tint = P.bad; v.pulse.alpha = 1 - progress; v.pulse.width = v.pulse.height = 100 + progress * 20;
    } else if (v.event) {
      v.pulse.visible = true; v.pulse.tint = v.event.color;
      if (reduced) { v.pulse.alpha = 0.7; v.pulse.width = v.pulse.height = 118; }
      else {
        const ph = ((time / 1200) + v.eventPhase) % 1;
        v.pulse.alpha = 0.85 * (1 - ph);
        v.pulse.width = v.pulse.height = 112 + ph * 46;
      }
    } else v.pulse.visible = false;
  }

  return {
    views,
    get list() { return list; },
    get selected() { return selected; },
    get hovered() { return hovered; },
    sync(graph) {
      const seen = new Set();
      let changed = false;
      const regions = new Map();
      for (const n of graph?.nodes || []) if (n.region) regions.set(n.region, (regions.get(n.region) || 0) + 1);
      const mr = regions.size > 1;
      let main = null, best = -1;
      for (const [r, c] of regions) if (c > best || (c === best && r < main)) { best = c; main = r; }
      const mrChanged = mr !== multiRegion || main !== mainRegion;
      multiRegion = mr; mainRegion = main;
      for (const n of graph?.nodes || []) {
        seen.add(n.id);
        let v = views.get(n.id);
        if (v && v.type !== n.type) { remove(v); v = null; }
        if (!v) { create(n); changed = true; }
        else {
          if (v.drag && v.dragUntil) { v.drag = null; v.dragUntil = 0; } // the build answered our dragend
          const moved = n.x !== v.tx || n.y !== v.ty;
          update(v, n);
          if (moved) changed = true;
          if (mrChanged) drawRegion(v);
        }
      }
      for (const v of [...views.values()]) if (!seen.has(v.id)) { remove(v); changed = true; }
      list = [...views.values()];
      for (const v of list) {
        const lv = validation.get(v.id);
        v.valid.visible = !!lv;
        if (lv) v.valid.context = env.kit().glyphs.valid[lv];
      }
      return changed;
    },
    update(dt, now, time) {
      const P = env.kit().P;
      const reduced = env.reduced();
      for (const v of list) step(v, dt, now, P, reduced, time);
      // Captions always belong to their module. Spacing is handled by graph layout, never by moving captions.
      for (const v of list) {
        const detail = detailZoom || selected === v.id;
        v.chip.visible = detail && v.units > 1;
        v.chip.scale.set(detailZoom ? 1 : labelK * 1.1);
        v.zonesG.visible = detailZoom;
        v.busy.visible = detailZoom;
        v.qbar.visible = v.live && v.kind === 'queue';
        v.qbar.scale.set(Math.max(1,.85/(env.zoom?.()||1)));
        v.pile.visible = detailZoom && v.over > .01;
        v.lock.visible = detailZoom && v.locked;
        v.regionC.visible = detailZoom && multiRegion && v.region !== mainRegion && !v.event;
        v.statusG.visible = v.live && v.status > 0;
        if (!detailZoom) { v.statusG.context = env.kit().glyphs.status[v.status]; v.statusG.scale.set(Math.max(1, labelK * .7)); }
        else v.statusG.scale.set(1);

      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const v = dying[i];
        v.fade += dt;
        const k = Math.min(1, v.fade / (reduced ? 120 : 160));
        v.c.alpha = 1 - k;
        if (!reduced) v.c.scale.set(1 - 0.15 * k);
        if (k >= 1) { v.c.destroy({ children: true }); dying.splice(i, 1); }
      }
    },
    // Names and failure facts get separate, fixed-width lanes.
    layoutLabels(camera, area) {
      const z = camera.zoom, P = env.kit().P;
      const key = [Math.round(z*1000), camera.center.x.toFixed(1), camera.center.y.toFixed(1), JSON.stringify(area), ...list.map(v=>`${v.x.toFixed(1)},${v.y.toFixed(1)},${v.labelT.text},${v.evidenceT.visible}`)].join('/');
      if (key === this.captionKey) return false;
      this.captionKey = key;
      const free = { x:area?.l||8,y:area?.t||8,width:camera.size.w-(area?.l||8)-(area?.r||8),height:camera.size.h-(area?.t||8)-(area?.b||8) };
      const parts = list.map(v=>{const p=camera.worldToScreen(v.x,v.y),half=v.live&&v.kind==='queue'?Math.max(42*z,26):42*z;v.portHalf=half/z-6;v.renderHalf=half/z;return {x:p.x-half-8,y:p.y-half,width:half*2+16,height:half*2};});
      const occupied = [...parts];
      const ordered = [...list].sort((a,b)=>a.y-b.y||a.x-b.x);
      for (const v of ordered) {
        const p = camera.worldToScreen(v.x,v.y), width = Math.max(40,v.labelT.width*z+8), height = v.labelT.height*z+6;
        const visible=p.x>=free.x && p.x<=free.x+free.width && p.y>=free.y && p.y<=free.y+free.height;
        const preferred={x:p.x-width/2,y:p.y+v.renderHalf*z+5,width,height};
        const clear=r=>!occupied.some(o=>intersects(r,o));
        const inside=r=>r.x>=free.x&&r.y>=free.y&&r.x+r.width<=free.x+free.width&&r.y+r.height<=free.y+free.height;
        const choose=(base)=>{
          if(!visible)return base;
          const candidates=[];
          for(let dy=0;dy<=free.height;dy+=18)for(const sy of dy?[1,-1]:[1])for(const dx of [0,-80,80,-160,160])candidates.push({...base,x:Math.max(free.x,Math.min(free.x+free.width-base.width,base.x+dx)),y:base.y+dy*sy});
          return candidates.find(r=>inside(r)&&clear(r))||candidates.find(clear)||base;
        };
        const name=choose(preferred); if(visible)occupied.push(name);
        const labelX=(name.x+width/2-p.x)/z,labelY=(name.y-p.y)/z;
        v.labelT.position.set(labelX,labelY);
        v.labelBg.clear().roundRect((name.x-p.x)/z,labelY,width/z,height/z,3/z).fill({color:P.canvas,alpha:.97});
        v.leader.clear();
        if(visible&&(Math.abs(labelX*z)>8||Math.abs(name.y-preferred.y)>8))v.leader.moveTo(0,0).lineTo(labelX,labelY).stroke({width:1/z,color:P.edgeIdle,alpha:.6});
        const boxes=[name];
        if(v.evidenceT.visible){
          const facts=choose({x:p.x-57,y:p.y-v.renderHalf*z-(v.kind==='queue'?58:44)-8,width:114,height:v.kind==='queue'?58:44});
          if(visible)occupied.push(facts);
          v.evidenceT.anchor.set(0,0);v.evidenceT.position.set((facts.x-p.x)/z,(facts.y-p.y)/z);
          v.labelBg.roundRect((facts.x-p.x)/z,(facts.y-p.y)/z,114/z,facts.height/z,3/z).fill({color:P.canvas,alpha:.97});
          boxes.push(facts);
        }
        v.captionBoxes=boxes.map(r=>({x:v.x+(r.x-p.x)/z-4/z,y:v.y+(r.y-p.y)/z-4/z,width:(r.width+8)/z,height:(r.height+8)/z}));
        v.captionScreen=name;
      }
      return true;
    },
    // Live values from the flow frame; pass live = false to hide them (build phase).
    setLive(v, live, util = 0, status = 0, queue = 0, over = 0, pileType = -1, failRps = 0) {
      const recovering = live && failRps < .5 && v.failRps > .5;
      if (recovering) v.recoverUntil = performance.now() + 1000;
      v.failRps = failRps;
      const recovered = performance.now() < (v.recoverUntil || 0);
      v.evidenceT.visible = live && (failRps > .5 || queue > 1 || recovered || v.kind === 'queue' || v.telemetry?.retryRps > .5);
      v.evidenceT.text = failRps > .5 ? `× ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(failRps)}/s rejected` : queue > 1 ? `${Math.round(queue).toLocaleString('en-US')} waiting` : recovered ? 'Requests recovered' : '';
      if (live && v.kind === 'queue' && v.telemetry) v.evidenceT.text = queuePressure(v.telemetry).text;
      else if (live && v.telemetry?.retryRps > .5) v.evidenceT.text += `\n↶ ${count(v.telemetry.retryRps)}/s retry`;
      v.evidenceT.style.fill = failRps > .5 ? env.kit().P.bad : recovered ? env.kit().P.ok : env.kit().P.warn;
      if (!live) {
        if (v.live) {
          v.live = false; v.busy.clear(); v.drawnU = -1; v.drawnColor = -1; v.statusG.visible = false;
          v.pile.visible = false; v.qbar.visible = false; v.icon.alpha = 1; v.body.alpha = 1; v.tu = v.du = 0;
        }
        return;
      }
      if (!v.live) { v.live = true; v.qbar.visible = v.kind === 'queue'; v.drawnQ = -1; v.statusG.visible = status > 0; }
      v.tu = util;
      const down = status === 4;
      if (status !== v.status || down !== v.down) {
        v.status = status; v.down = down; v.statusAt = nowForStatus();
        v.statusG.context = env.kit().glyphs.status[Math.min(4, status)];
        v.icon.alpha = down ? 0.4 : 1;
        v.body.alpha = down ? 0.7 : 1;
      }
      v.statusG.visible = status > 0;
      v.statusG.alpha = 1;
      v.queue = queue; v.over = over; v.pileType = pileType;
    },
    setSelection(id) {
      selected = id;
      for (const v of list) { v.select.visible = v.id === id; showLabel(v); }
    },
    setHover(id) { hovered = id; if (tiny) for (const v of list) showLabel(v); },
    setValidation(map) {
      validation = map;
      const kit = env.kit();
      for (const v of list) {
        const lv = map.get(v.id);
        v.valid.visible = !!lv;
        if (lv) v.valid.context = kit.glyphs.valid[lv];
      }
    },
    setEvent(v, ev) {
      // ev: { color, iconId } | null
      v.event = ev;
      const kit = env.kit();
      if (ev) {
        v.badge.visible = true;
        v.badgeBg.clear().circle(0, 0, 11).fill({ color: kit.P.surfaceSolid }).stroke({ width: 1.6, color: ev.color });
        const t = kit.icons.get(ev.iconId, ev.color);
        v.badgeIcon.texture = t || PIXI.Texture.EMPTY;
        v.badgeIcon.width = v.badgeIcon.height = 15;
      } else v.badge.visible = false;
      drawRegion(v);
    },
    refreshIcons(id) {
      const kit = env.kit();
      for (const v of list) {
        if (!id || id === 'el.' + v.type) {
          const t = kit.icons.get('el.' + v.type, kit.P.cat[v.cat] ?? kit.P.text3);
          if (t) { v.icon.texture = t; v.icon.width = v.icon.height = 28; }
        }
        if (v.event && (!id || id === v.event.iconId)) {
          const t = kit.icons.get(v.event.iconId, v.event.color);
          if (t) { v.badgeIcon.texture = t; v.badgeIcon.width = v.badgeIcon.height = 15; }
        }
      }
    },
    applyKit(kit) {
      const P = kit.P;
      for (const v of [...list, ...dying]) {
        v.glow.texture = kit.fx.glow; v.pulse.texture = kit.fx.ring;
        v.shadow.texture = kit.fx.shadow; v.shadow.tint = P.shadow; v.shadow.alpha = 0;
        v.shadow.width = v.shadow.height = SHADOW;
        v.body.texture = kit.bodyTex[v.cat]; v.body.width = v.body.height = BODY_BOX;
        v.select.texture = kit.selectTex[v.shape]; v.select.width = v.select.height = BODY_BOX;
        v.icon.texture = kit.icons.get('el.' + v.type, P.cat[v.cat] ?? P.text3) || PIXI.Texture.EMPTY;
        v.icon.width = v.icon.height = 28;
        v.statusG.context = kit.glyphs.status[Math.min(4, v.status)];
        const lv = validation.get(v.id);
        v.valid.context = kit.glyphs.valid[lv || 'warn'];
        v.lock.context = kit.glyphs.lock;
        for (const s of v.pileSprites) { s.texture = kit.atlas.textures[Math.max(0, v.pileType)]; s.scale.set(8 / P_SHAPE); }
        v.labelT.style.fill = P.text2;
        v.poolT.style.fill = P.text2;
        drawChip(v); drawRegion(v);
        if (v.event) v.event.color = v.event.severity ? severityColor(P, v.event.severity) : v.event.color;
        if (v.event) this.setEvent(v, v.event);
        v.drawnU = -1; v.drawnColor = -1; v.drawnQ = -1;
        if (!v.live) v.busy.clear();
      }
    },
    redrawAll() { for (const v of list) { v.drawnU = -1; v.drawnColor = -1; } },
    // Hides nodes outside the world rectangle (cheap culling; their state keeps updating).
    cull(x0, y0, x1, y1) {
      for (const v of list) v.c.visible = v.x + 90 > x0 && v.x - 90 < x1 && v.y + 90 > y0 && v.y - 90 < y1;
    },
    // Below full zoom the names grow (up to 4.5 times, the lowest zoom) so they stay at about 13 px on screen (the base size is 12 px).
    setLabelScale(z) {
      detailZoom = z >= 1.05;
      for (const v of list) v.icon.width = v.icon.height = detailZoom ? 28 : Math.max(28, 16 / Math.max(.01, z));
      const px = 13;
      const k = Math.max(1, px / (12 * Math.max(0.01, z)));
      if ((z < .65) !== compact) { compact = z < .65; for (const v of list) showLabel(v); }
      if ((z < 0.3) !== tiny) { tiny = z < 0.3; for (const v of list) showLabel(v); }
      if (Math.abs(k - labelK) < 0.0001) return;
      labelK = k;
      for (const v of list) { v.labelT.scale.set(k); v.evidenceT.scale.set(k); }
    },
    setTextResolution(r) {
      if (r === textRes) return;
      textRes = r;
      for (const v of list) {
        v.labelT.resolution = r;
        if (v.chipText) v.chipText.resolution = r;
        if (v.regionT) v.regionT.resolution = r;
      }
    },
    refreshLabels() {
      for (const v of list) { const s = v.labelT.text; v.labelT.text = s + ' '; v.labelT.text = s; }
    },
    hit(x, y, tol = 0) {
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        if (Math.abs(x - v.x) <= HALF + tol && Math.abs(y - v.y) <= HALF + tol) return v;
      }
      return null;
    },
    setDrag(id, x, y) {
      const v = views.get(id);
      if (!v) return;
      v.drag = { x, y }; v.dragUntil = 0;
    },
    endDrag(id, keep) {
      const v = views.get(id);
      if (!v) return;
      // keep the dropped spot until the build answers with a sync, else spring back after 1 s
      if (keep && v.drag) v.dragUntil = performance.now() + 1000;
      else v.drag = null;
    },
    cancelDrag(id) {
      const v = views.get(id);
      if (v) { v.drag = null; v.dragUntil = 0; }
    },
    bounds(graph) {
      const nodes = graph ? graph.nodes : list.map(v => ({ x: v.tx, y: v.ty }));
      if (!nodes || !nodes.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x - HALF); maxX = Math.max(maxX, n.x + HALF);
        minY = Math.min(minY, n.y - HALF - 14); maxY = Math.max(maxY, n.y + HALF + 30);
      }
      return { minX, minY, maxX, maxY };
    },
    destroy() {
      for (const v of [...list, ...dying]) v.c.destroy({ children: true });
      views.clear(); list = []; dying.length = 0;
    },
  };
}
