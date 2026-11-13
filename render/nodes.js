// Node views: cream card with a hard shadow, icon, label, load bar, status glyphs, chips; spring placement.

import { drawE08Load, e08IconSize } from './e08.js';
import { poolCells } from './pool.js';
import { outline, HALF } from './geom.js';
import { barColor, severityColor } from './theme.js';
import { P_SHAPE, BODY_BOX } from './textures.js';
import { queuePressure, count } from './pressure.js';
import { intersects } from './routing.js';

const FONT_UI = 'Space Grotesk, Arial, sans-serif';
const FONT_MONO = 'Space Mono, monospace';
const nowForStatus = () => performance.now();
const K = 320, C = 24;              // placement spring (≈ 6 % overshoot, settles in ≈ 300 ms)
const SHOVE_MS = 120, SHOVE_PX = 2.5; // a part that takes a hit jumps this far for this long
const PILE = [[-47, -6], [-47, 6], [-55, 0], [-55, -12], [-55, 12], [-63, -6]];
// One-word names for the zoomed-out overview. Whole words only: a name is never cut in the middle.
const SHORT = {
  'web-browser': 'Web', 'mobile-app': 'Mobile', 'tv-app': 'TV', 'game-client': 'Game', 'iot-device': 'IoT', 'partner-system': 'Partner', 'admin-console': 'Admin',
  'dns': 'DNS', 'geo-dns': 'GeoDNS', 'cdn': 'CDN', 'origin-shield': 'Shield', 'waf': 'WAF', 'firewall': 'Firewall', 'ddos-shield': 'DDoS',
  'api-gateway': 'Gateway', 'global-lb': 'Global LB', 'regional-lb': 'Balancer', 'network-lb': 'Network LB', 'service-mesh': 'Mesh', 'private-link': 'VPN',
  'vm-fleet': 'Servers', 'container-cluster': 'Containers', 'serverless-fn': 'Functions', 'edge-fn': 'Edge', 'gpu-cluster': 'GPU', 'worker-pool': 'Workers',
  'batch-cluster': 'Batch', 'cron-scheduler': 'Scheduler', 'autoscaler': 'Autoscaler',
  'sql-primary': 'SQL', 'sql-replica': 'Replica', 'sharded-sql': 'Shards', 'distributed-sql': 'Distributed', 'kv-store': 'Key-value', 'document-db': 'Documents',
  'wide-column': 'Wide-column', 'graph-db': 'Graph', 'timeseries-db': 'Time-series', 'search-index': 'Search', 'vector-db': 'Vectors', 'cache': 'Cache',
  'distributed-cache': 'Cache', 'object-storage': 'Objects', 'block-storage': 'Block', 'file-system': 'Files', 'data-warehouse': 'Warehouse', 'data-lake': 'Data lake',
  'ledger-db': 'Ledger', 'db-proxy': 'Pooler', 'cold-archive': 'Archive',
  'queue': 'Queue', 'pubsub': 'Pub/sub', 'event-stream': 'Events', 'stream-processor': 'Processor', 'dead-letter-queue': 'Dead-letter', 'outbox': 'Outbox',
  'workflow-engine': 'Workflow', 'websocket-gateway': 'Live', 'cdc-connector': 'Changes',
  'identity-provider': 'Identity', 'secrets-manager': 'Secrets', 'kms': 'Key mgmt', 'hsm': 'HSM', 'rate-limiter': 'Limiter', 'circuit-breaker': 'Breaker',
  'idempotency-store': 'Idempotency', 'feature-flags': 'Flags', 'config-service': 'Config', 'coordination-service': 'Coordinator', 'audit-log': 'Audit',
  'privacy-vault': 'Vault', 'consent-service': 'Consent',
  'metrics': 'Metrics', 'logs': 'Logs', 'traces': 'Traces', 'alerting': 'Alerting', 'dashboards': 'Dashboards', 'pager': 'On-call', 'ci-cd': 'CI/CD',
  'backups': 'Backups', 'disaster-recovery': 'Recovery', 'synthetic-probe': 'Checks',
  'model-server': 'Model', 'llm-gateway': 'AI gateway', 'semantic-cache': 'Semantic', 'safety-filter': 'Safety', 'feature-store': 'Features',
  'embedding-service': 'Embeddings', 'recommender': 'Recommender', 'etl-pipeline': 'Pipeline',
  'payment-processor': 'Payments', 'email-provider': 'Email', 'sms-provider': 'SMS', 'push-service': 'Push', 'maps-api': 'Maps',
  'video-transcoder': 'Transcoder', 'identity-verification': 'ID check', 'hosted-llm-api': 'Hosted AI', 'third-party-api': 'API',
};
const firstWord = label => String(label || '').replace(/\s*\([^)]*\)/g, '').trim().split(/\s+/)[0];

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
  const tex = kit.icons.get('el.' + type, kit.P.ink);
  const icon = new PIXI.Sprite(tex || PIXI.Texture.EMPTY);
  icon.anchor.set(0.5); icon.width = icon.height = kit.look === 'e08' ? e08IconSize : 28; icon.y = kit.look === 'e08' ? 0 : iconOffset(shape);
  icon.tint = kit.look === 'e08' ? 0xf3eee0 : 0xffffff;
  c.addChild(icon);
  c.__icon = icon; c.__type = type; c.__cat = cat; c.__shape = shape; c.__body = body; c.__faint = faint;
  return c;
}

export function refreshMini(kit, c) {
  if (c.__faint) c.__body.context = kit.faint[c.__cat];
  else { c.__body.texture = kit.bodyTex[c.__cat]; c.__body.width = c.__body.height = BODY_BOX; }
  const tex = kit.icons.get('el.' + c.__type, kit.P.ink);
  if (tex) c.__icon.texture = tex;
  c.__icon.tint = kit.look === 'e08' ? 0xf3eee0 : 0xffffff;
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
  const shortName = v => SHORT[v.type] || firstWord(v.label) || v.type;
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
      event: null, eventPhase: Math.random(), shoveAt: -1e9, shoveDir: 1, isLead: false,
      outline: outline(shape, 6, 96),
    };
    const c = new PIXI.Container();
    c.position.set(n.x, n.y);
    v.c = c;
    v.pulse = new PIXI.Sprite(kit.fx.ring); v.pulse.anchor.set(0.5); v.pulse.visible = false;
    v.lead = new PIXI.Sprite(kit.leadTex[shape]); v.lead.anchor.set(0.5); v.lead.width = v.lead.height = BODY_BOX; v.lead.visible = false;
    v.body = new PIXI.Sprite(kit.bodyTex[cat]); v.body.anchor.set(0.5); v.body.width = v.body.height = BODY_BOX;
    v.select = new PIXI.Sprite(kit.selectTex[shape]); v.select.anchor.set(0.5); v.select.width = v.select.height = BODY_BOX; v.select.visible = false;
    v.icon = new PIXI.Sprite(kit.icons.get('el.' + n.type, P.ink) || PIXI.Texture.EMPTY);
    v.icon.anchor.set(0.5); v.icon.width = v.icon.height = kit.look === 'e08' ? e08IconSize : 28; v.icon.y = kit.look === 'e08' ? 0 : iconOffset(shape);
    v.icon.tint = kit.look === 'e08' ? 0xf3eee0 : 0xffffff;
    v.busy = new PIXI.Graphics();
    v.pool = new PIXI.Graphics();
    v.poolT = makeText('', 10.5, P.text2, true); v.poolT.anchor.set(.5); v.poolT.y = 15;
    v.labelBg = new PIXI.Graphics();
    v.evidenceBg = new PIXI.Graphics();
    v.pile = new PIXI.Container(); v.pile.visible = false;
    v.pileSprites = PILE.map(([px, py]) => {
      const s = new PIXI.Sprite(kit.atlas.textures[0]); s.anchor.set(0.5); s.position.set(px, py); s.scale.set(8 / P_SHAPE); s.visible = false;
      v.pile.addChild(s); return s;
    });
    v.qbar = new PIXI.Graphics(); v.qbar.visible = false;
    v.retryG = new PIXI.Graphics();
    v.statusG = new PIXI.Graphics(kit.look === 'e08' ? undefined : kit.glyphs.status[0]); v.statusG.position.set(-HALF + 7, -HALF + 7); v.statusG.visible = false;
    v.valid = new PIXI.Graphics(kit.glyphs.valid.warn); v.valid.position.set(HALF - 7, -HALF + 7); v.valid.visible = false;
    v.lock = new PIXI.Graphics(kit.glyphs.lock); v.lock.position.set(-HALF + 9, -HALF + 20); v.lock.visible = false;
    v.chip = new PIXI.Container(); v.chip.position.set(HALF - 10, -HALF - 8); v.chip.visible = false;
    v.chipBg = new PIXI.Graphics(); v.chip.addChild(v.chipBg);
    v.chipText = null;
    v.zonesG = new PIXI.Graphics(); v.chip.addChild(v.zonesG); // r4-follow: the zone dots live inside the ×N chip
    v.labelT = makeText('', 12, kit.look === 'e08' ? P.text : P.ink, false, '600', 72); // narrow lines, so neighbours' names do not touch when zoomed out
    v.labelT.anchor.set(0.5, 0); v.labelT.y = HALF + 10; v.labelT.scale.set(labelK); v.labelT.visible = !tiny;
    v.evidenceT = makeText('', 12, P.bad, true); v.evidenceT.anchor.set(.5, 1); v.evidenceT.y = -HALF - 6; v.evidenceT.visible = false;
    v.evidenceT.style.wordWrap = kit.look !== 'e08'; v.evidenceT.style.wordWrapWidth = 108; v.evidenceT.style.align = kit.look === 'e08' ? 'center' : 'left';
    v.evidenceT.style.fontWeight = kit.look === 'e08' ? '600' : '500';
    v.rejected = new PIXI.Container(); v.rejected.position.set(0,-HALF-14); v.rejected.visible = false;
    v.rejectedG = new PIXI.Graphics();
    v.rejectedT = makeText('', 13, 0xffc9c9, true, '800'); v.rejectedT.anchor.set(.5);
    v.rejected.addChild(v.rejectedG,v.rejectedT);
    if (kit.look === 'e08') { v.labelT.style.fontFamily = 'system-ui, sans-serif'; v.labelT.style.fontSize = 14; v.labelT.style.fontWeight = '700'; v.labelT.style.wordWrapWidth = 140; }
    v.leader = new PIXI.Graphics();
    v.captionC = new PIXI.Container();
    v.captionC.addChild(v.leader, v.labelBg, v.labelT, v.evidenceBg, v.evidenceT);
    v.regionC = new PIXI.Container(); v.regionC.y = -HALF - 12; v.regionC.visible = false;
    v.regionBg = new PIXI.Graphics(); v.regionC.addChild(v.regionBg);
    v.regionT = null;
    v.badge = new PIXI.Container(); v.badge.y = -HALF - 12; v.badge.visible = false;
    v.badgeBg = new PIXI.Graphics(); v.badge.addChild(v.badgeBg);
    v.badgeIcon = new PIXI.Sprite(PIXI.Texture.EMPTY); v.badgeIcon.anchor.set(0.5); v.badgeIcon.width = v.badgeIcon.height = 15;
    v.badge.addChild(v.badgeIcon);
    c.addChild(v.pulse, v.body, v.lead, v.select, v.icon, v.busy, v.pool, v.poolT, v.qbar, v.retryG, v.pile, v.statusG, v.valid, v.lock,
      v.chip, v.regionC, v.badge, v.captionC, v.rejected);
    c.alpha = 0;
    c.scale.set(v.s);
    v.captionC.scale.set(1 / v.s);
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
      if (!v.chipText) { v.chipText = makeText(s, 10, P.ink, true, '700'); v.chipText.anchor.set(0.5); v.chip.addChild(v.chipText); }
      v.chipText.text = s;
      v.chipText.style.fill = P.ink;
      // two or three small dots at the left end of the chip say "spread over that many zones"
      const dots = v.zones > 1 ? Math.min(3, v.zones) : 0;
      const dw = dots ? dots * 5 + 3 : 0;
      const w = Math.max(18, v.chipText.width + 8) + dw;
      v.chipText.x = dw / 2;
      v.chipBg.clear().roundRect(-w / 2 + 1.5, -6, w, 15, 3).fill({ color: P.ink }).roundRect(-w / 2, -7.5, w, 15, 3).fill({ color: env.kit().look === 'e08' ? P.surfaceSolid : P.yellow }).stroke({ width: 1.5, color: P.ink });
      v.zonesG.clear();
      for (let i = 0; i < dots; i++) v.zonesG.circle(-w / 2 + 6 + i * 5, 0, 1.8).fill({ color: P.mint }).stroke({ width: 0.8, color: P.ink });
    }
  }

  function drawRegion(v) {
    const P = env.kit().P;
    const r = env.regionShort(v.region);
    const show = multiRegion && !!r && v.region !== mainRegion && !v.event;
    v.regionC.visible = show;
    if (!show) return;
    if (!v.regionT) { v.regionT = makeText(r, 9.5, P.ink, true, '700'); v.regionT.anchor.set(0.5); v.regionC.addChild(v.regionT); }
    v.regionT.text = r;
    v.regionT.style.fill = P.ink;
    const w = v.regionT.width + 10;
    v.regionBg.clear().roundRect(-w / 2, -7, w, 14, 3).fill({ color: P.card }).stroke({ width: 1.5, color: P.ink });
  }

  function update(v, n, fresh = false) {
    // tx, ty always follow the graph; an active drag only overrides what is shown
    if (fresh || n.x !== v.tx || n.y !== v.ty) {
      v.moveAt = performance.now();
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
    if (env.kit().look === 'e08') return drawE08Load(v, env.kit(), 0, true);
    const g = v.busy;
    const u = Math.min(1, Math.max(0, v.du));
    const color = barColor(P, v.status, v.down);
    g.clear().rect(-26, 23.5, 52, 8).fill({ color: P.card }).stroke({ width: 1.5, color: P.ink });
    if (u > .004) g.rect(-26, 23.5, Math.max(4, 52 * u), 8).fill({ color }).stroke({ width: 1.5, color: P.ink });
    v.drawnU = v.du; v.drawnColor = color;
  }

  function drawQueue(v, P, dt, reduced) {
    const pressure=queuePressure(v.telemetry);
    v.ageFill=reduced?pressure.fill:(v.ageFill||0)+(pressure.fill-(v.ageFill||0))*(1-Math.exp(-dt/180));
    const fill=v.ageFill, color=pressure.late?P.tomato:fill>.7?P.yellow:P.blue;
    const g=v.qbar;g.clear().rect(-25,-22,50,42).fill({color:P.card}).stroke({width:2,color:P.ink});
    if(fill>.001)g.rect(-22,17-34*fill,44,34*fill).fill({color}).stroke({width:1.5,color:P.ink});
    for(let i=1;i<4;i++)g.moveTo(-25,16-i*8.5).lineTo(-19,16-i*8.5).stroke({width:1.5,color:P.ink});
    // The top rule is the actual deadline, not a capacity limit.
    g.moveTo(-29,-18).lineTo(29,-18).stroke({width:2.5,color:pressure.late?P.bad:P.ink,alpha:1});
    if(pressure.late)g.poly([-4,-28,4,-28,0,-21]).fill({color:P.tomato}).stroke({width:1.5,color:P.ink});
    const change=Math.abs(pressure.net);
    if(change>.01){const direction=pressure.net>0?-1:1;g.moveTo(31,-direction*8).lineTo(31,direction*8).lineTo(28,direction*4).moveTo(31,direction*8).lineTo(34,direction*4).stroke({width:2,color:P.ink});}
  }

  function drawRetries(v,P,time,reduced) {
    const rate=v.telemetry?.retryRps||0,g=v.retryG;g.clear();
    if(!v.live||rate<.5)return;
    g.moveTo(38,6).bezierCurveTo(64,-54,-64,-54,-38,6).stroke({width:2.5,color:P.bad});
    g.poly([-38,6,-46,1,-38,-3]).fill({color:P.bad});
    // One marker is a dot-scale group of the engine's retry arrivals.
    const scale=env.dotScale?.()||1,n=Math.min(4,Math.ceil(rate/scale));
    for(let i=0;i<n;i++){
      const t=reduced?.5:((time/1100+i/n)%1),u=1-t;
      const x=u*u*u*38+3*u*u*t*64+3*u*t*t*(-64)+t*t*t*(-38),y=u*u*u*6+3*u*u*t*(-54)+3*u*t*t*(-54)+t*t*t*6;
      g.circle(x,y,3.4).fill({color:P.tomato}).stroke({width:1.5,color:P.ink});
    }
  }

  function drawPool(v, P, now, reduced, time) {
    if (env.kit().look === 'e08') { v.pool.visible = v.poolT.visible = false; v.icon.visible = true; return; }
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
      g.rect(x, y, w, h).fill({ color: P.card }).stroke({ width: 1.5, color: P.ink });
      if (cell.available > 0) g.rect(x, y, Math.max(1, w * cell.available), h).fill({ color: P.mint }).stroke({ width: 1.5, color: P.ink });
      if (cell.busy > .002) {
        g.rect(x, y + h * (1 - cell.busy), Math.max(1, w * cell.available), Math.max(1, h * cell.busy)).fill({ color: v.tu > 1 ? P.tomato : P.blue }).stroke({ width: 1.5, color: P.ink });
      }
      if (cell.available < .99) g.moveTo(x + w - 4, y + 2).lineTo(x + w - 1, y + h - 2).moveTo(x + w - 1, y + 2).lineTo(x + w - 4, y + h - 2).stroke({ width: 1.5, color: P.ink });
    });
    v.poolT.text = `${alive}/${count}`;
  }

  function step(v, dt, now, P, reduced, time) {
    if (now < v.appearAt && !reduced) { v.c.alpha = 0; return; }
    // placement spring
    if (v.drag) {
      v.x = v.drag.x; v.y = v.drag.y; v.vx = v.vy = 0;
      if (v.dragUntil && now > v.dragUntil) { v.drag = null; v.dragUntil = 0; }
    } else if (reduced || now - v.moveAt >= 600) {
      v.x = v.tx; v.y = v.ty;
      v.vx = v.vy = 0;
    } else if (v.x !== v.tx || v.y !== v.ty || v.vx || v.vy) {
      let rem = Math.min(dt, 1000) / 1000;
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
    // A part that takes a hit jumps a few pixels for a moment; a reduced-motion player gets no movement at all.
    let sx = 0, sy = 0;
    if (!reduced && now - v.shoveAt < SHOVE_MS) {
      const ph = (now - v.shoveAt) / SHOVE_MS;
      const amp = ph < 0.34 ? SHOVE_PX : ph < 0.67 ? -SHOVE_PX * 0.6 : SHOVE_PX * 0.3;
      sx = amp * v.shoveDir; sy = amp * 0.4;
    }
    v.c.position.set(v.x + sx, v.y + sy);
    if (reduced) {
      if (v.c.alpha < 1) v.c.alpha = Math.min(1, v.c.alpha + dt / 120);
      v.s = 1; v.vs = 0; v.c.scale.set(1);
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
      const color = barColor(P, v.status, v.down);
      if (Math.abs(v.du - v.drawnU) > 0.004 || color !== v.drawnColor) drawBusy(v, P);
      const over = v.down || v.tu > 1 || v.status >= 3;
      if (over && !reduced) {
        const k = 0.5 + 0.5 * Math.sin(time * 0.001 * Math.PI * 2 * 1.2);
        v.busy.alpha = 1;
      } else v.busy.alpha = 1;
      if (v.kind === 'queue' && env.kit().look !== 'e08') drawQueue(v, P, dt, reduced);
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
    if(v.live && v.kind==='queue' && env.kit().look !== 'e08') v.icon.visible=false;
    drawRetries(v,P,time,reduced);
    // Flat markers only: an event gets a still ring in its colour, the first failing part a yellow frame with an ink edge.
    v.lead.visible = v.isLead && !isSelNow(v);
    if (v.event) {
      v.pulse.visible = true; v.pulse.tint = v.event.color; v.pulse.alpha = 1;
      v.pulse.width = v.pulse.height = 104;
    } else v.pulse.visible = false;
  }
  const isSelNow = v => selected === v.id;

  return {
    views,
    get list() { return list; },
    get moving() { return dying.length > 0 || list.some(v => v.s !== 1 || v.vs !== 0 || v.x !== v.tx || v.y !== v.ty); },
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
      for (const v of list) {
        step(v, dt, now, P, reduced, time);
        v.captionC.scale.set(1 / Math.max(.01, v.c.scale.x));
      }
      // Keep names and facts in their own caption lanes.
      for (const v of list) {
        v.labelT.scale.set(labelK);
        const detail = detailZoom || selected === v.id;
        v.chip.visible = detail && v.units > 1;
        v.chip.scale.set(detailZoom ? 1 : labelK * 1.1);
        const e08 = env.kit().look === 'e08';
        v.busy.visible = e08 || detailZoom;
        v.qbar.visible = v.live && v.kind === 'queue' && env.kit().look !== 'e08';
        v.qbar.scale.set(Math.max(1,.85/(env.zoom?.()||1)));
        v.pile.visible = detailZoom && v.over > .01;
        v.lock.visible = detailZoom && v.locked;
        v.regionC.visible = detailZoom && multiRegion && v.region !== mainRegion && !v.event;
        v.statusG.visible = e08 || (v.live && v.status > 0);
        if (!e08 && !detailZoom) { v.statusG.context = env.kit().glyphs.status[v.status]; v.statusG.scale.set(Math.max(1, labelK * .7)); }
        else v.statusG.scale.set(1);
        if (e08) drawE08Load(v, env.kit(), time, reduced);

      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const v = dying[i];
        v.fade += dt;
        const k = Math.min(1, v.fade / (reduced ? 120 : 160));
        v.c.alpha = 1 - k;
        if (!reduced) v.c.scale.set(1 - 0.15 * k);
        v.captionC.scale.set(1 / Math.max(.01, v.c.scale.x));
        if (k >= 1) { v.c.destroy({ children: true }); dying.splice(i, 1); }
      }
    },
    // Names and failure facts get separate, fixed-width lanes.
    layoutLabels(camera, area) {
      const z = camera.zoom, P = env.kit().P, e08 = env.kit().look === 'e08';
      const free = { x:area?.l||8,y:area?.t||8,width:camera.size.w-(area?.l||8)-(area?.r||8),height:camera.size.h-(area?.t||8)-(area?.b||8) };
      const visible=p=>p.x>=free.x && p.x<=free.x+free.width && p.y>=free.y && p.y<=free.y+free.height;
      // Corner panels (a folded card, a button) cover only their own rectangle, not a whole band of the canvas.
      const blocks=area?.blocks||[];
      const inside=r=>r.x>=free.x&&r.y>=free.y&&r.x+r.width<=free.x+free.width&&r.y+r.height<=free.y+free.height&&!blocks.some(b=>intersects(r,b));
      const refreshVisibility=()=>{
        for(const v of list){
          const p=camera.worldToScreen(v.x,v.y);
          const shown=box=>!!box&&visible(p)&&inside({x:p.x+box.x*z,y:p.y+box.y*z,width:box.width*z,height:box.height*z});
          v.labelT.renderable=shown(v.nameCaption);
          v.labelBg.renderable=v.leader.renderable=v.labelT.renderable;
          v.evidenceT.renderable=shown(v.factCaption);
          v.evidenceBg.renderable=v.evidenceT.visible&&v.evidenceT.renderable;
        }
      };
      // Node drawing precedes flows, so rejected pills can change a frame after the readings.
      // Use the same bounds for cache invalidation and caption clearance.
      const rejectedBounds = e08 ? list.filter(v => v.rejected.visible).map(v => {
        const b = v.rejected.getLocalBounds();
        return { x:v.x+v.rejected.x+b.x, y:v.y+v.rejected.y+b.y, width:b.width, height:b.height };
      }) : [];
      // Retry missing captions when panning opens space, keeping reserved lanes fixed.
      const key = [z, camera.size.w, camera.size.h, JSON.stringify(area), JSON.stringify(rejectedBounds), ...list.map(v=>`${v.id},${v.x},${v.y},${v.labelT.text},${v.evidenceT.visible},${v.live},${e08 ? v.evidenceT.text : ''}`)].join('/');
      const origin=camera.worldToScreen(0,0);
      const panned=origin.x!==this.captionOrigin?.x||origin.y!==this.captionOrigin?.y;
      this.captionOrigin=origin;
      let retryCaption=false;
      for(const v of list){
        const inView=visible(camera.worldToScreen(v.x,v.y));
        if(inView&&(!v.nameCaption||(v.evidenceT.visible&&!v.factCaption))&&(panned||!v.captionWasVisible))retryCaption=true;
        v.captionWasVisible=inView;
      }
      if (key === this.captionKey && !retryCaption) { refreshVisibility(); return false; }
      const preserve=key===this.captionKey;
      this.captionKey = key;
      const previous = list.map(v => [v.renderHalf, v.captionBoxes]);
      // A zoomed-out overview keeps less air around each part and name, so a name still fits under its own part.
      const tight=z<.5, nameGap=tight?(z<.3?2:3):5, namePad=tight?2:6;
      const parts = list.map(v=>{const p=camera.worldToScreen(v.x,v.y),live=v.live&&v.kind==='queue',half=live?Math.max(42*z,26):42*z;v.portHalf=half/z-6;v.renderHalf=half/z;const body=tight&&!live?38*z:half,side=tight?4:8;v.bodyHalf=body;return {x:p.x-body-side,y:p.y-body-1,width:body*2+side*2,height:body*2+2};});
      // A caption that had to move away from its part is tied back to it: a short line between the two facing edges.
      // A name that still sits under its own part needs none.
      const lead=(v,box,p,z,P)=>{
        const half=v.renderHalf*z, near=(value,low,high)=>Math.max(low,Math.min(high,value));
        const bx=near(p.x,box.x,box.x+box.width), by=near(p.y,box.y,box.y+box.height);
        const ax=near(bx,p.x-half,p.x+half), ay=near(by,p.y-half,p.y+half);
        if(Math.hypot(bx-ax,by-ay)<14)return;
        v.leader.moveTo((ax-p.x)/z,(ay-p.y)/z).lineTo((bx-p.x)/z,(by-p.y)/z).stroke({width:1.5/z,color:P.ink});
      };
      const screenBox=(v,box)=>{const p=camera.worldToScreen(v.x,v.y);return box?{x:p.x+box.x*z,y:p.y+box.y*z,width:box.width*z,height:box.height*z}:null;};
      // The wide readings keep the fuller clearance around every part, so wires still find a way past them; only names pack tighter.
      const roomyParts = tight ? list.map(v=>{const p=camera.worldToScreen(v.x,v.y),half=v.renderHalf*z;return {x:p.x-half-8,y:p.y-half-1,width:half*2+16,height:half*2+2};}) : parts;
      // The p10 rejected pill extends above the body. Keep captions out of its lane too.
      const rejectedBoxes = rejectedBounds.map(b => {
        const p = camera.worldToScreen(b.x, b.y);
        return { x:p.x-3, y:p.y-3, width:b.width*z+6, height:b.height*z+6 };
      });
      const occupied = [...roomyParts, ...rejectedBoxes];
      if(preserve)for(const v of list)for(const box of [v.nameCaption,v.factCaption])if(box)occupied.push(screenBox(v,box));
      const ordered = [...list].sort((a,b)=>a.y-b.y||a.x-b.x);
      const clear=r=>!occupied.some(o=>intersects(r,o));
      const choose=(base,p,maxMove=Infinity,ok=null,lane=0)=>{
          // Reserve a local world-space slot for offscreen captions so panning can reveal them without rerouting.
          if(!visible(p))return clear(base)?base:null;
          const close=r=>Math.abs(r.x-base.x)+Math.abs(r.y-base.y)<=maxMove;
          for(let dy=0;dy<=free.height;dy+=18)for(const sy of dy && !e08?[1,-1]:[1])for(const dx of [0,-80,80,-160,160]){
            const r={...base,x:Math.max(free.x,Math.min(free.x+free.width-base.width,base.x+dx)),y:base.y+dy*sy};
            if(inside(r)&&clear(r)&&close(r)&&(!ok||ok(r)))return r;
          }
          // A crowded overview can leave a gap between the regular search lanes.
          // Test the exact edges of the occupied boxes before leaving the free canvas.
          const xs=[free.x,free.x+free.width-base.width,...occupied.flatMap(r=>[r.x-base.width-2,r.x+r.width+2,r.x-base.width,r.x+r.width,...(lane?[r.x-base.width-lane,r.x+r.width+lane]:[])])];
          const ys=[free.y,free.y+free.height-base.height,...occupied.flatMap(r=>[r.y-base.height-2,r.y+r.height+2,r.y-base.height,r.y+r.height,...(lane?[r.y-base.height-lane,r.y+r.height+lane]:[])])];
          let best=null,distance=Infinity;
          for(const x of xs)for(const y of ys){const r={...base,x,y},d=Math.abs(x-base.x)+Math.abs(y-base.y);if(d<distance&&inside(r)&&clear(r)&&close(r)&&(!ok||ok(r))){best=r;distance=d;}}
          return best;
      };
      // Reserve the larger telemetry lanes first. Small names can fit around them, but the place right under a part
      // stays with its name: readings go above, beside or below that.
      const nameSlot=v=>{const p=camera.worldToScreen(v.x,v.y),width=Math.max(40,v.labelT.width*z+8);return {x:p.x-width/2,y:p.y+v.bodyHalf+nameGap,width,height:v.labelT.height*z+namePad};};
      const held=preserve?[]:list.filter(v=>visible(camera.worldToScreen(v.x,v.y))).map(nameSlot), heldAt=occupied.length;
      occupied.push(...held);
      const factsById=new Map();
      for(const v of ordered.filter(v=>v.evidenceT.visible).sort((a,b)=>Number(b.evidenceT.text.startsWith('First limit'))-Number(a.evidenceT.text.startsWith('First limit')))){
        const p=camera.worldToScreen(v.x,v.y);
        const height = e08 ? v.evidenceT.height*z+8 : v.kind === 'queue' ? 112 : 76;
        const factWidth = e08 ? v.evidenceT.width*z+12 : 114;
        const reserved=preserve&&v.factCaption;
        const half=v.renderHalf*z, above={x:p.x-factWidth/2,y:e08 ? nameSlot(v).y+nameSlot(v).height+4 : p.y-half-height-8,width:factWidth,height};
        // When the lane above is taken, the readings hug a corner of the part, clear of the ports on its left and right faces.
        const corners=[[-half-124,-14-height],[half+10,-14-height],[-half-124,14],[half+10,14]].map(([dx,dy])=>({...above,x:p.x+dx,y:p.y+dy}));
        // A corner slot must also leave the lanes beside neighbouring parts open, or their wires could not get past it.
        const own=list.indexOf(v), LANE=16, roomy=r=>!roomyParts.some((o,i)=>i!==own&&intersects(r,{x:o.x-LANE,y:o.y-LANE,width:o.width+LANE*2,height:o.height+LANE*2}));
        const beside=visible(p)?(e08 ? [above] : [above,...corners]).find((r,i)=>inside(r)&&clear(r)&&(!i||roomy(r))):null;
        // Zoomed far out, the readings box is large beside the parts: it stays near its own part or waits for a closer view.
        // The first limit of the day is always shown.
        const first=v.evidenceT.text.startsWith('First limit');
        const facts=reserved?screenBox(v,reserved):beside||choose(above,p,z<.35&&!first?96:Infinity,roomy,LANE+1);
        factsById.set(v.id,facts);if(facts&&!reserved)occupied.push(facts);
      }
      occupied.splice(heldAt,held.length);
      for (let i=0;i<parts.length;i++) occupied[i]=parts[i];
      for (const v of ordered) {
        const p = camera.worldToScreen(v.x,v.y), width = Math.max(40,v.labelT.width*z+8), height = v.labelT.height*z+namePad;
        const preferred={x:p.x-width/2,y:p.y+v.bodyHalf+nameGap,width,height};
        // A dense overview keeps captions near their parts. Branch focus restores any omitted names.
        const reserved=preserve&&v.nameCaption;
        const name=reserved?screenBox(v,reserved):choose(preferred,p,z<.24?30:z<.35?72:Infinity); if(name&&!reserved)occupied.push(name);
        v.labelT.renderable=!!name;
        v.labelBg.clear();
        v.evidenceBg.clear();
        v.leader.clear();
        const boxes=[];
        if(name){
          const labelX=(name.x+width/2-p.x)/z,labelY=(name.y-p.y)/z;
          v.labelT.position.set(labelX,labelY);
          v.labelBg.roundRect((name.x-p.x)/z,labelY,width/z,height/z,3/z).fill({color:P.canvas});
          lead(v,name,p,z,P);
          boxes.push(name);
        }
        const facts=factsById.get(v.id);
        v.evidenceT.renderable=!!facts;
        if(facts){
          v.evidenceT.anchor.set(0,0);v.evidenceT.position.set((facts.x-p.x+(e08?6:0))/z,(facts.y-p.y+(e08?4:0))/z);
          v.evidenceBg.roundRect((facts.x-p.x)/z,(facts.y-p.y)/z,facts.width/z,facts.height/z,3/z).fill({color:e08?P.canvas:P.card});
          if (!e08) v.evidenceBg.stroke({width:1.5/z,color:P.ink});
          lead(v,{x:facts.x,y:facts.y,width:e08?facts.width:Math.min(114,v.evidenceT.width*z+4),height:e08?facts.height:Math.min(facts.height,v.evidenceT.height*z+2)},p,z,P);
          boxes.push(facts);
        }
        v.captionBoxes=boxes.map(r=>({x:v.x+(r.x-p.x)/z-4/z,y:v.y+(r.y-p.y)/z-4/z,width:(r.width+8)/z,height:(r.height+8)/z}));
        const local=r=>r?{x:(r.x-p.x)/z,y:(r.y-p.y)/z,width:r.width/z,height:r.height/z}:null;
        v.nameCaption=local(name);v.factCaption=local(facts);
        v.captionScreen=name;
      }
      refreshVisibility();
      return list.some((v,i) => {
        const [half, boxes] = previous[i];
        return half !== v.renderHalf || !boxes || boxes.length !== v.captionBoxes.length || boxes.some((r,j) =>
          ['x','y','width','height'].some(k => Math.abs(r[k] - v.captionBoxes[j][k]) > .01));
      });
    },
    // Live values from the flow frame; pass live = false to hide them (build phase).
    setLive(v, live, util = 0, status = 0, queue = 0, over = 0, pileType = -1, failRps = 0) {
      const recovering = live && failRps < .5 && v.failRps > .5;
      if (recovering) v.recoverUntil = performance.now() + 1000;
      v.failRps = failRps;
      const recovered = performance.now() < (v.recoverUntil || 0);
      v.evidenceT.visible = live && ((env.kit().look !== 'e08' && failRps > .5) || queue > 1 || recovered || v.kind === 'queue' || v.telemetry?.retryRps > .5);
      v.evidenceT.text = failRps > .5 ? `× ${count(failRps)}/s rejected` : queue > 1 ? `${Math.round(queue).toLocaleString('en-US')} waiting` : recovered ? 'Requests recovered' : '';
      if (live && v.kind === 'queue' && v.telemetry) v.evidenceT.text = queuePressure(v.telemetry).text;
      else if (live && v.telemetry?.retryRps > .5) v.evidenceT.text += `\n↶ ${count(v.telemetry.retryRps)}/s retry`;
      v.evidenceT.style.fill = env.kit().look === 'e08' ? env.kit().P.text2 : (v.kind === 'queue' && queuePressure(v.telemetry).late) || failRps > .5 ? env.kit().P.bad : recovered ? env.kit().P.ok : env.kit().P.warn;
      if (!live) {
        v.queue = v.over = 0; v.pileType = -1; v.down = false; v.status = 0; v.recoverUntil = 0; v.isLead = false;
        if (v.live) {
          v.live = false; v.busy.clear(); v.drawnU = -1; v.drawnColor = -1; v.statusG.visible = false;
          v.pile.visible = false; v.qbar.visible = false; v.icon.alpha = 1; v.body.texture = env.kit().bodyTex[v.cat]; v.icon.tint = env.kit().look === 'e08' ? 0xf3eee0 : 0xffffff; v.rejected.visible = false; v.tu = v.du = 0;
        }
        return;
      }
      if (!v.live) { v.live = true; v.qbar.visible = v.kind === 'queue'; v.drawnQ = -1; v.statusG.visible = env.kit().look === 'e08' || status > 0; }
      v.tu = util;
      const down = status === 4;
      if (status !== v.status || down !== v.down) {
        v.status = status; v.down = down; v.statusAt = nowForStatus();
        if (env.kit().look !== 'e08') v.statusG.context = env.kit().glyphs.status[Math.min(4, status)];
        v.icon.alpha = 1;
        v.body.texture = env.kit().bodyFor?.(v.cat, status) || (down || status >= 3 ? env.kit().downTex : env.kit().bodyTex[v.cat]);
        v.icon.tint = env.kit().look === 'e08' ? (down ? 0x7b8798 : 0xf3eee0) : 0xffffff;
        if (!down && status >= 3 || down) { v.shoveAt = performance.now(); v.shoveDir = -v.shoveDir; }
      }
      v.statusG.visible = env.kit().look === 'e08' || status > 0;
      if (env.kit().look !== 'e08') v.statusG.alpha = 1;
      v.queue = queue; v.over = over; v.pileType = pileType;
    },
    // The first failing part gets a yellow frame instead of the rest of the canvas being dimmed.
    setLead(id) { for (const v of list) v.isLead = v.id === id; },
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
        v.badgeBg.clear().circle(1.5, 1.5, 11).fill({ color: kit.P.ink }).circle(0, 0, 11).fill({ color: kit.P.card }).stroke({ width: 2, color: kit.P.ink });
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
          const t = kit.icons.get('el.' + v.type, kit.P.ink);
          if (t) { v.icon.texture = t; v.icon.width = v.icon.height = kit.look === 'e08' ? e08IconSize : 28; }
        }
        if (v.event && (!id || id === v.event.iconId)) {
          const t = kit.icons.get(v.event.iconId, v.event.color);
          if (t) { v.badgeIcon.texture = t; v.badgeIcon.width = v.badgeIcon.height = 15; }
        }
      }
    },
    applyKit(kit) {
      this.captionKey = null;
      const P = kit.P;
      for (const v of [...list, ...dying]) {
        v.pulse.texture = kit.fx.ring;
        v.lead.texture = kit.leadTex[v.shape]; v.lead.width = v.lead.height = BODY_BOX;
        v.body.texture = kit.bodyFor?.(v.cat, v.status) || (v.down || v.status >= 3 ? kit.downTex : kit.bodyTex[v.cat]); v.body.width = v.body.height = BODY_BOX;
        v.select.texture = kit.selectTex[v.shape]; v.select.width = v.select.height = BODY_BOX;
        v.icon.texture = kit.icons.get('el.' + v.type, P.ink) || PIXI.Texture.EMPTY;
        v.icon.width = v.icon.height = kit.look === 'e08' ? e08IconSize : 28;
        v.icon.y = kit.look === 'e08' ? 0 : iconOffset(v.shape);
        v.icon.tint = kit.look === 'e08' ? (v.down ? 0x7b8798 : 0xf3eee0) : 0xffffff;
        v.labelT.style.fontFamily = kit.look === 'e08' ? 'system-ui, sans-serif' : FONT_UI;
        v.labelT.style.fontSize = kit.look === 'e08' ? 14 : 12;
        v.labelT.style.fontWeight = kit.look === 'e08' ? '700' : '600';
        v.labelT.style.wordWrapWidth = kit.look === 'e08' ? 140 : 72;
        v.rejected.visible = false;
        v.evidenceT.style.wordWrap = kit.look !== 'e08';
        v.evidenceT.style.align = kit.look === 'e08' ? 'center' : 'left';
        v.evidenceT.style.fontWeight = kit.look === 'e08' ? '600' : '500';
        v.evidenceT.style.fill = kit.look === 'e08' ? P.text2 : P.bad;
        v.statusG.context = kit.look === 'e08' ? new PIXI.GraphicsContext() : kit.glyphs.status[Math.min(4, v.status)];
        if (kit.look !== 'e08') v.statusG.position.set(-HALF+7,-HALF+7);
        const lv = validation.get(v.id);
        v.valid.context = kit.glyphs.valid[lv || 'warn'];
        v.lock.context = kit.glyphs.lock;
        for (const s of v.pileSprites) { s.texture = kit.atlas.textures[Math.max(0, v.pileType)]; s.scale.set(8 / P_SHAPE); }
        v.labelT.style.fill = kit.look === 'e08' ? P.text : P.ink;
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
    // Keep names readable through zoom and part entry motion.
    setLabelScale(z) {
      detailZoom = z >= 1.05;
      for (const v of list) { v.icon.width = v.icon.height = env.kit().look === 'e08' ? e08IconSize : detailZoom ? 28 : Math.max(28, 16 / Math.max(.01, z)); v.evidenceT.scale.set(1 / Math.max(.01, z)); }
      const px = 13;
      const k = Math.max(1, px / ((env.kit().look === 'e08' ? 14 : 12) * Math.max(0.01, z)));
      if ((z < .65) !== compact) { compact = z < .65; for (const v of list) showLabel(v); }
      if ((z < 0.3) !== tiny) { tiny = z < 0.3; for (const v of list) showLabel(v); }
      if (Math.abs(k - labelK) < 0.0001) return;
      labelK = k;
      for (const v of list) v.labelT.scale.set(k);
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
