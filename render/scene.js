// The PixiJS scene: camera, nodes, edges, request particles, glows and effects. The only render file other modules import.

import { resolvePalette, severityColor } from './theme.js';
import { createKit } from './textures.js';
import { createCamera } from './camera.js';
import { createNodeLayer, makeMini, refreshMini } from './nodes.js';
import { createEdgeLayer, edgeCarries } from './edges.js';
import { createParticles } from './particles.js';
import { createFx } from './fx.js';
import { createInput, PORT_R, DND_TYPE, DND_PREFIX } from './input.js';
import { makeLut, edgeCurve, lutAt, HALF, niceCeil } from './geom.js';
import { createGrid } from './grid.js';
import { pathsThrough } from './diagram.js';

export { DND_TYPE, DND_PREFIX };
export { regionLayout } from './diagram.js';
// how near a line a dropped part must land to be inserted into it: at least about a part's width in world units, and at
// least 40 screen px so it stays easy to hit when the diagram is zoomed out
const EDGE_DROP_MIN = 64, EDGE_DROP_PX = 40, EDGE_DROP_MAX = 150;

const QUALITY = {
  high: { cap: 160, glow: true, res: 2 },
  medium: { cap: 120, glow: true, res: 1.5 },
  low: { cap: 80, glow: false, res: 1 },
};
const LEVELS = ['low', 'medium', 'high'];
const MAX_DOTS_PER_SEC = 12;      // busiest edge, DESIGN.md 9.5
const SEVERITY_DEFAULT = 2;

function normalizeCatalog(c = {}) {
  const elements = Array.isArray(c.elements) ? c.elements : c.elements?.elements || [];
  const categories = Array.isArray(c.categories) ? c.categories : c.elements?.categories || [];
  const requests = Array.isArray(c.requests) ? c.requests : c.requests?.types || [];
  const events = Array.isArray(c.events) ? c.events : c.events?.events || [];
  const world = c.world || {};
  return {
    elementById: c.elementById instanceof Map ? c.elementById : new Map(elements.map(e => [e.id, e])),
    categories,
    shapeByCat: new Map(categories.map(k => [k.id, 'rounded-square'])),
    requests,
    eventById: c.eventById instanceof Map ? c.eventById : new Map(events.map(e => [e.id, e])),
    regionShort: new Map((world.regions || []).map(r => [r.id, r.short || r.id.toUpperCase()])),
    utilBands: world.sim?.utilBands || { ok: 0.7, warn: 0.9, hot: 1 },
  };
}

function createEmitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { queueMicrotask(() => { throw err; }); }
      }
    },
  };
}

export async function createScene(hostEl, { catalog, palette, theme = 'light', reducedMotion = false, quality = 'auto', dotsPerSec = MAX_DOTS_PER_SEC } = {}) {
  const PIXI = globalThis.PIXI;
  if (!PIXI || !PIXI.Application) throw new Error('PixiJS is not loaded');
  const cat = normalizeCatalog(catalog);
  const emitter = createEmitter();
  const dpr = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 3));
  const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;

  let failureLead = null;
  let reduced = !!reducedMotion;
  let highContrast = false;
  let qualitySetting = QUALITY[quality] || quality === 'auto' ? quality : 'auto';
  // Start sharp on every screen (phones included); the auto-quality loop steps down only if frames run slow.
  let level = qualitySetting === 'auto' ? 'high' : qualitySetting;
  const resFor = lv => Math.min(dpr, coarse ? 1.5 : 2, QUALITY[lv].res);
  const bakeRes = Math.min(dpr, 2);

  let P = resolvePalette(palette, theme);
  let kit = null;
  let nodes = null;
  let overlayMinis = [];
  const ghost = { type: null, follow: false, x: 0, y: 0, view: null, ring: null, edgeId: null, preview: false, shown: false };
  const env = {
    kit: () => kit,
    reduced: () => reduced,
    highContrast: () => highContrast,
    pathEdge: id => !!pathFocus?.edges.has(id),
    element: type => cat.elementById.get(type),
    shapeOf: () => 'rounded-square',
    regionShort: id => (id ? cat.regionShort.get(id) || String(id).toUpperCase() : ''),
  };
  // icon loads arrive asynchronously; views pick them up here
  const onIcon = id => {
    nodes?.refreshIcons(id);
    if (ghost.view) refreshMini(kit, ghost.view);
    for (const m of overlayMinis) if (!m.destroyed) refreshMini(kit, m);
  };
  kit = await createKit(PIXI, P, { categories: cat.categories, requests: cat.requests }, bakeRes, onIcon);

  const w0 = Math.max(1, hostEl.clientWidth), h0 = Math.max(1, hostEl.clientHeight);
  const app = new PIXI.Application();
  await app.init({
    width: w0, height: h0, antialias: dpr < 2 && quality !== 'low', background: P.canvas, resolution: resFor(level), autoDensity: true,
    autoStart: false, sharedTicker: false, preference: 'webgl', powerPreference: 'high-performance', hello: false,
    eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
  });
  app.stage.eventMode = 'none';
  const canvas = app.canvas;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', outline: 'none' });
  canvas.style.webkitTouchCallout = 'none';
  canvas.setAttribute('aria-label', 'System design canvas');
  canvas.setAttribute('role', 'img');
  hostEl.appendChild(canvas);

  // layers
  const world = new PIXI.Container();
  const gridLayer = new PIXI.Container();
  const regionLayer = new PIXI.Container();
  let isolatePaths = false, regionGroups = false, pathFocus = null;
  const overlayLayer = new PIXI.Container(); overlayLayer.alpha = 0.42;
  const glowLayer = new PIXI.Container();
  const edgeLayer = new PIXI.Container();
  const particleLayer = new PIXI.Container();
  const nodeLayer = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  const uiLayer = new PIXI.Container();
  world.addChild(gridLayer, regionLayer, overlayLayer, glowLayer, edgeLayer, particleLayer, nodeLayer, fxLayer, uiLayer);
  app.stage.addChild(world);

  const camera = createCamera(world);
  camera.setReducedMotion(reduced);
  camera.resize(w0, h0);
  nodes = createNodeLayer(PIXI, nodeLayer, env);
  const edges = createEdgeLayer(PIXI, edgeLayer, glowLayer, env);
  const particles = createParticles(PIXI, particleLayer, env);
  const fx = createFx(PIXI, fxLayer, env);
  const grid = createGrid(PIXI, gridLayer, env);

  function drawRegions() {
    for (const child of regionLayer.removeChildren()) child.destroy({ children: true });
    if (!regionGroups || !graph) return;
    const groups = new Map();
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    for (const n of graph.nodes) {
      const region = n.region || 'us';
      if (!groups.has(region)) groups.set(region, []);
      groups.get(region).push(n);
    }
    const label = (text, x, y) => {
      const t = new PIXI.Text({ text, style: { fontFamily: 'Atkinson Hyperlegible', fontSize: 14, fill: P.text } });
      t.position.set(x, y); regionLayer.addChild(t);
    };
    for (const [region, ns] of groups) {
      const x = Math.min(...ns.map(n => n.x)) - 90, y = Math.min(...ns.map(n => n.y)) - 100;
      const w = Math.max(...ns.map(n => n.x)) - x + 90, h = Math.max(...ns.map(n => n.y)) - y + 90;
      regionLayer.addChild(new PIXI.Graphics().roundRect(x, y, w, h, 16).fill({ color: P.accent, alpha: 0.04 }).stroke({ color: P.accent, alpha: 0.4, width: 2 }));
      label(catalog.world.regions.find(r => r.id === region)?.name || region, x + 12, y + 10);
    }
    for (const e of graph.edges) {
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b || (a.region || 'us') === (b.region || 'us')) continue;
      const ms = catalog.world.rttMs[a.region || 'us']?.[b.region || 'us'];
      if (ms != null) label(`${env.regionShort(a.region || 'us')} → ${env.regionShort(b.region || 'us')}: ≈${ms} ms RTT`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 24);
    }
  }

  // ---- interaction drawings: port ring, rubber band, guides, ghost ----
  const portRing = new PIXI.Graphics(); portRing.visible = false;
  const portHint = new PIXI.Text({ text: 'Drag to connect →', style: { fontFamily: 'Atkinson Hyperlegible', fontSize: 13, fill: P.accent, fontWeight: '700' }, resolution: 2 });
  portHint.anchor.set(.5, 1); portHint.visible = false;
  const connectionInk = new PIXI.Graphics();
  let connection = null;
  const band = new PIXI.Graphics(); band.visible = false;
  const target = new PIXI.Graphics(); target.visible = false;
  const guides = new PIXI.Graphics();
  const dropWires = new PIXI.Graphics();
  uiLayer.addChild(guides, dropWires, connectionInk, portRing, portHint, band, target);
  let ringNode = null, ringHot = false;
  const bandLut = makeLut();
  let previewPair = null;

  function drawPortRing() {
    portRing.clear();
    if (!ringNode) { portRing.visible = false; return; }
    portRing.visible = true;
    const k = Math.max(1, 1 / camera.zoom);
    const n = 40;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      portRing.moveTo(Math.cos(a0) * PORT_R, Math.sin(a0) * PORT_R).arc(0, 0, PORT_R, a0, a1);
    }
    portRing.stroke({ width: ringHot ? 2.4 : 1.6, color: P.accent, alpha: ringHot ? 0.95 : 0.6, cap: 'round' });
    if (ringHot) portRing.circle(0, 0, PORT_R + 6).stroke({ width: 10, color: P.accent, alpha: 0.12 });
    // the handle: a clear dot with an arrow, big enough to find and to grab with a finger
    portRing.circle(PORT_R, 0, 10 * k).fill({ color: P.accent }).stroke({ width: 2 * k, color: P.surfaceSolid });
    portRing.moveTo(PORT_R - 3.5 * k, -4 * k).lineTo(PORT_R + 3 * k, 0).lineTo(PORT_R - 3.5 * k, 4 * k).stroke({ width: 2 * k, color: P.surfaceSolid, cap: 'round', join: 'round' });
  }

  const ui = {
    setPortRing(v, hot) {
      const id = v ? v.id : null;
      if ((ringNode?.id ?? null) === id && ringHot === !!hot) return;
      ringNode = v; ringHot = !!hot;
      drawPortRing();
    },
    drawBand(from, x, y, to, ok) {
      const pair = from.id + '>' + (to?.id || '');
      if (pair !== previewPair) { previewPair = pair; emitter.emit('connect:preview', { from: from.id, to: to?.id || null, ok }); }
      band.visible = true;
      band.clear();
      const color = ok ? P.accent : P.bad;
      if (to) {
        edgeCurve(bandLut, from.x, from.y, to.x, to.y);
        band.moveTo(bandLut.p0x, bandLut.p0y).bezierCurveTo(bandLut.c1x, bandLut.c1y, bandLut.c2x, bandLut.c2y, bandLut.p3x, bandLut.p3y)
          .stroke({ width: 2.6, color, alpha: 0.95, cap: 'round' });
        target.visible = true;
        target.context = ok ? kit.select[to.shape] : kit.ghost[to.shape];
        target.tint = ok ? 0xffffff : P.bad;
        target.position.set(to.x, to.y);
      } else {
        const s = x >= from.x ? 1 : -1;
        const sx = from.x + s * HALF, sy = from.y;
        const h = Math.max(30, Math.abs(x - sx) * 0.5);
        band.moveTo(sx, sy).bezierCurveTo(sx + s * h, sy, x - s * h * 0.4, y, x, y).stroke({ width: 2.4, color, alpha: 0.85, cap: 'round' });
        band.circle(x, y, 5).fill({ color }).stroke({ width: 1.5, color: P.surfaceSolid });
        target.visible = false;
      }
    },
    clearBand() { previewPair = null; emitter.emit('connect:preview', null); band.visible = false; band.clear(); target.visible = false; },
    drawGuides(lines) {
      guides.clear();
      for (const [x1, y1, x2, y2] of lines) {
        const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        for (let s = 0; s < len; s += 10) {
          const e = Math.min(len, s + 5);
          guides.moveTo(x1 + ux * s, y1 + uy * s).lineTo(x1 + ux * e, y1 + uy * e);
        }
      }
      if (lines.length) guides.stroke({ width: 1.2, color: P.accent, alpha: 0.7 });
    },
    clearGuides() { guides.clear(); },
  };

  const dropTol = () => Math.min(EDGE_DROP_MAX, Math.max(EDGE_DROP_MIN, EDGE_DROP_PX / Math.max(0.1, camera.zoom)));
  let insertionPreview = null;
  // placement ghost (toolbar drag, tap-to-place, HTML drag and drop)
  function ghostView(type) {
    if (ghost.view && ghost.view.__type === type) return;
    if (ghost.view) { ghost.view.destroy({ children: true }); ghost.view = null; }
    if (!type) return;
    ghost.view = makeMini(PIXI, kit, env, type);
    ghost.view.alpha = 0.62;
    ghost.ring = new PIXI.Graphics(kit.ghost[ghost.view.__shape]);
    ghost.view.addChild(ghost.ring);
    uiLayer.addChild(ghost.view);
  }
  function ghostMove(wx, wy) {
    const sp = input.snapPos(wx, wy, null);
    ghost.x = sp.x; ghost.y = sp.y;
    ui.drawGuides(sp.guides);
    const ev = edges.hitMiddle(sp.x, sp.y, dropTol());
    ghost.edgeId = ev ? ev.id : null;
    dropWires.clear();
    let plan = null;
    if (ev) {
      const edge = graph?.edges.find(e => e.id === ev.id);
      const a = nodes.views.get(edge?.from), b = nodes.views.get(edge?.to);
      plan = insertionPreview?.(ghost.type, ev.id);
      if (plan?.position) { ghost.x = plan.position.x; ghost.y = plan.position.y; }
      if (a && b && plan) {
        dropWires.moveTo(a.x, a.y).lineTo(ghost.x, ghost.y);
        if (plan.kind !== 'side') dropWires.lineTo(b.x, b.y);
        dropWires.stroke({ width: 3 / camera.zoom, color: P.accent, alpha: .8 });
      }
    }
    if (ghost.view) { ghost.view.position.set(ghost.x, ghost.y); ghost.view.visible = true; ghost.shown = true; }
    emitter.emit('placement:preview', ghost.edgeId ? { type: ghost.type, edgeId: ghost.edgeId, plan } : null);
    edges.setHighlight(ghost.edgeId);
    return sp;
  }
  function ghostClear() {
    ghostView(null);
    ghost.type = null; ghost.preview = false; ghost.shown = false; ghost.edgeId = null;
    edges.setHighlight(null);
    dropWires.clear(); emitter.emit('placement:preview', null);
    ui.clearGuides();
  }
  const ghostApi = {
    type: () => ghost.type,
    pointer(wx, wy) { if (ghost.type && ghost.follow) ghostMove(wx, wy); },
    place() { return { x: ghost.x, y: ghost.y, edgeId: ghost.edgeId }; },
    preview(type, wx, wy) {
      if (ghost.type && !ghost.preview && ghost.type !== type) return;
      if (!ghost.type) { ghost.preview = true; ghost.follow = true; }
      ghost.type = type; ghostView(type); ghostMove(wx, wy);
    },
    endPreview() { if (ghost.preview) ghostClear(); },
    dropAt(type, wx, wy) {
      const sp = input.snapPos(wx, wy, null);
      const ev = edges.hitMiddle(sp.x, sp.y, dropTol());
      return { x: sp.x, y: sp.y, edgeId: ev ? ev.id : null };
    },
  };

  let editable = true;
  let connectCheck = null;
  const input = createInput(canvas, hostEl, {
    camera, nodes, edges, ui, ghost: ghostApi,
    emit: (n, p) => emitter.emit(n, p),
    editable: () => editable,
    reduced: () => reduced,
    get connectCheck() { return connectCheck; },
    fit: () => api.fit(),
  });

  // ---- friend's design overlay ----
  let overlayGraph = null;
  const overlayEdges = new PIXI.Graphics();
  overlayLayer.addChild(overlayEdges);
  function buildOverlay() {
    for (const m of overlayMinis) m.destroy({ children: true });
    overlayMinis = [];
    overlayEdges.clear();
    const g = overlayGraph;
    if (!g) return;
    const pos = new Map(g.nodes.map(n => [n.ref ?? n.id, n]));
    const lut = makeLut();
    for (const e of g.edges || []) {
      const from = Array.isArray(e) ? e[0] : e.from, to = Array.isArray(e) ? e[1] : e.to;
      const a = pos.get(from), b = pos.get(to);
      if (!a || !b) continue;
      edgeCurve(lut, a.x, a.y, b.x, b.y);
      overlayEdges.moveTo(lut.p0x, lut.p0y).bezierCurveTo(lut.c1x, lut.c1y, lut.c2x, lut.c2y, lut.p3x, lut.p3y);
    }
    overlayEdges.stroke({ width: 2, color: P.text3, alpha: 0.8 });
    for (const n of g.nodes) {
      const m = makeMini(PIXI, kit, env, n.type, { faint: true });
      m.position.set(n.x, n.y);
      overlayLayer.addChild(m);
      overlayMinis.push(m);
    }
  }

  // ---- state ----
  let graph = null;
  let syncVersion = 0;
  let flowVersion = null;
  let flow = null;
  let speed = 1;
  let map = null;               // flow-frame index maps
  let dotScale = 1, dotCheckAt = 0;
  let glowAt = 0;
  let autoFit = true;
  const flashes = new Map();    // eventId → { nodeIds: Set | null, severity, color, iconId, minUntil }
  let validation = new Map();
  let selected = null;
  const frameFns = new Set();
  let raf = 0, last = performance.now();
  const renderSamples = new Float32Array(120); let rsi = 0, rsn = 0;
  const dtSamples = []; let qualityCheckAt = 0, qualityChangedAt = performance.now();
  let lastTextRes = 0;
  let destroyed = false;
  let themeToken = 0;

  function rebuildMap(F) {
    const T = F.typeIds.length, N = F.nodeIds.length, E = F.edgeIds.length;
    const nodeView = F.nodeIds.map(id => nodes.views.get(id) || null);
    const idxById = new Map(F.nodeIds.map((id, i) => [id, i]));
    const tex = F.typeIds.map(id => kit.typeIndex.get(id) ?? 0);
    const reqById = new Map(cat.requests.map(r => [r.id, r]));
    const attack = F.typeIds.map(id => id === 'attack');
    const famColor = F.typeIds.map(id => P.req[reqById.get(id)?.family] ?? P.text3);
    const edgeView = F.edgeIds.map(id => edges.views.get(id) || null);
    edgeView.forEach((v, j) => {
      if (!v) return;
      v.fromIdx = idxById.get(v.from) ?? -1;
      v.toIdx = idxById.get(v.to) ?? -1;
      v.toKind = env.element(nodes.views.get(v.to)?.type)?.kind || '';
      if (!v.rates || v.rates.length !== T) {
        v.rates = new Float32Array(T); v.acc = new Float32Array(T).map(() => Math.random());
        v.pFail = new Float32Array(T); v.pHit = new Float32Array(T); v.pFizzle = new Float32Array(T);
      }
      v.frameIdx = j;
    });
    map = {
      F, T, N, E, nodeView, edgeView, tex, attack, famColor, syncVersion, nodeIds: F.nodeIds, edgeIds: F.edgeIds, version: F.version,
      nodeIn: new Float32Array(N * T), nodeOut: new Float32Array(N * T), srcAcc: new Float32Array(N),
      carrying: edgeView.filter(v => v && v.carries),
    };
  }

  function applyFlows(dt, now) {
    const F = flow;
    if (!F) return null;
    if (!map || map.F !== F || map.version !== F.version || map.syncVersion !== syncVersion || map.nodeIds !== F.nodeIds
      || map.edgeIds !== F.edgeIds || map.T !== F.typeIds.length) rebuildMap(F);
    const { T, N, E, nodeView, edgeView, nodeIn, nodeOut, attack, famColor } = map;
    nodeIn.fill(0); nodeOut.fill(0);
    const er = F.edgeRps, nf = F.nodeFailRps, nh = F.nodeHitRps;
    for (let j = 0; j < E; j++) {
      const v = edgeView[j];
      if (!v || v.fromIdx < 0 || v.toIdx < 0) continue;
      const fo = v.fromIdx * T, to = v.toIdx * T, b = j * T;
      for (let t = 0; t < T; t++) { const r = er[b + t]; if (r > 0) { nodeOut[fo + t] += r; nodeIn[to + t] += r; } }
    }
    let maxEdge = 0;
    for (let j = 0; j < E; j++) {
      const v = edgeView[j];
      if (!v) continue;
      if (!v.carries || v.toIdx < 0) { edges.setLoad(v, 0); continue; }
      const to = v.toIdx * T, b = j * T;
      let total = 0, success = 0, domT = -1, domR = 0;
      for (let t = 0; t < T; t++) {
        const r = er[b + t];
        if (!(r > 0)) { v.rates[t] = 0; v.pFail[t] = v.pHit[t] = v.pFizzle[t] = 0; continue; }
        const inn = nodeIn[to + t], fail = nf[to + t] || 0, hit = nh[to + t] || 0, out = nodeOut[to + t];
        const denom = inn + fail;
        const pf = denom > 0 ? fail / denom : 0;
        const pfShare = inn > 0 ? fail / inn : 0;
        const eff = r * (1 + pfShare);
        v.rates[t] = eff;
        v.pFail[t] = pf;
        v.pHit[t] = denom > 0 ? Math.min(hit / denom, 1 - pf) : 0;
        v.pFizzle[t] = attack[t] && v.toKind === 'filter' && denom > 0 ? Math.max(0, Math.min(1 - pf - v.pHit[t], (inn - out - hit) / denom)) : 0;
        total += eff; success += r;
        if (r > domR) { domR = r; domT = t; }
      }
      v.totalRps = total;
      if (total > maxEdge) maxEdge = total;
      if (reduced && success > 0) edges.setLoad(v, success, Math.round((3 + Math.min(9, Math.log10(1 + success) * 1.6)) * 2) / 2, famColor[domT]);
      else edges.setLoad(v, success);
    }
    // dot scale: a round number so the busiest edge shows at most 12 dots a second
    if (now >= dotCheckAt) {
      dotCheckAt = now + 500;
      const need = niceCeil(maxEdge / dotsPerSec);
      if (need > dotScale || need < dotScale * 0.4) {
        dotScale = need;
        emitter.emit('scale', { dotScale });
      }
    }
    const inv = 1 / dotScale;
    for (const v of map.carrying) if (v.rates) for (let t = 0; t < T; t++) v.rates[t] *= inv;

    // nodes: busy level, status, queue, waiting pile; failures at nodes nothing flows into
    const util = F.nodeUtil, status = F.nodeStatus, queue = F.nodeQueue;
    const running = speed > 0 && !reduced;
    if (!failureLead && speed > 0) {
      let first = -1;
      for (let i = 0; i < N; i++) if ((util[i] > 1 || status?.[i] === 4) && nodeView[i]?.kind !== 'source') { first = i; break; }
      if (first >= 0) failureLead = { id: F.nodeIds[first], until: now + 1600 };
    }
    if (failureLead && now > failureLead.until) {
      let overloaded = false; for (let i = 0; i < N; i++) if (util[i] > 1) { overloaded = true; break; }
      if (!overloaded) failureLead = null;
    }
    for (let i = 0; i < N; i++) {
      const v = nodeView[i];
      if (!v || v.removing) continue;
      let fail = 0, inn = 0, pile = -1, pileR = 0;
      const b = i * T;
      for (let t = 0; t < T; t++) {
        const f = nf[b + t] || 0;
        if (F.typeIds[t] !== 'attack') fail += f; inn += nodeIn[b + t];
        if (f > pileR) { pileR = f; pile = t; }
      }
      const over = fail > 0 && inn > 0 ? fail / (inn + fail) : 0;
      nodes.setLive(v, true, util[i] || 0, status ? status[i] : 0, queue ? queue[i] || 0 : 0, over, pile >= 0 ? map.tex[pile] : -1, fail);
      if (failureLead && now < failureLead.until) {
        if (v.id !== failureLead.id) v.evidenceT.visible = false;
        else if (v.evidenceT.visible) v.evidenceT.text = 'First limit · ' + v.evidenceT.text;
      }
      if (running && fail > 0 && inn <= 0) {
        map.srcAcc[i] += (fail * inv * dt) / 1000;
        if (map.srcAcc[i] >= 1) {
          map.srcAcc[i] = Math.min(map.srcAcc[i] - 1, 1);
          fx.burst(v.x + HALF + 6, v.y + (Math.random() - 0.5) * 30, P.bad, particleSize() / 10);
        }
      }
    }
    // particle textures follow the frame's type order
    for (const v of map.carrying) v.texMap = map.tex;
    return map;
  }

  function particleSize() {
    const z = camera.zoom;
    return ((coarse ? 12 : 10) * Math.min(1.35, Math.max(0.85, Math.sqrt(z)))) / z;
  }

  function updateGlows(now) {
    if (now < glowAt) return;
    glowAt = now + 100;
    if (!flow || !map || !QUALITY[level].glow) { edges.setGlows([], now); return; }
    const items = [];
    const util = flow.nodeUtil;
    for (const v of map.carrying) {
      if (v.toIdx < 0 || !(v.rps > 0)) continue;
      const u = util[v.toIdx] || 0;
      if (u <= 0.7) continue;
      const strength = Math.min(1.2, (u - 0.7) / 0.3);
      items.push({ v, strength, score: strength * Math.log10(1 + v.rps) });
    }
    items.sort((a, b) => b.score - a.score);
    edges.setGlows(items.slice(0, 12), now);
  }

  function updateFlashes(now) {
    if (!flashes.size && !flashDirty) return;
    const active = flow?.activeEvents || [];
    const perNode = new Map();
    for (const [id, f] of flashes) {
      const on = now < f.minUntil || active.includes(id);
      if (!on) { flashes.delete(id); flashDirty = true; continue; }
      const ids = f.nodeIds || new Set(nodes.list.filter(v => v.kind === 'source').map(v => v.id));
      for (const nid of ids) {
        const cur = perNode.get(nid);
        if (!cur || f.severity > cur.severity) perNode.set(nid, f);
      }
    }
    for (const v of nodes.list) {
      const f = perNode.get(v.id) || null;
      const cur = v.event;
      if ((cur && cur.id) === (f && f.id) && (!f || cur.color === f.color)) continue;
      nodes.setEvent(v, f ? { id: f.id, color: f.color, iconId: f.iconId, severity: f.severity } : null);
    }
    flashDirty = false;
  }
  let flashDirty = false;

  function updateGrid() {
    const c = camera.center, { w, h } = camera.size;
    grid.update(c.x, c.y, w, h, camera.zoom);
  }

  function updateTextRes(now) {
    nodes.setLabelScale(camera.zoom);
    if (now - camera.lastZoomChange < 250) return;
    const r = Math.max(1, Math.min(4, Math.ceil(camera.zoom * resFor(level) * 2) / 2));
    if (r !== lastTextRes) { lastTextRes = r; nodes.setTextResolution(r); }
  }

  function setLevel(lv) {
    if (!QUALITY[lv] || lv === level) return;
    level = lv;
    qualityChangedAt = performance.now();
    const { w, h } = camera.size;
    app.renderer.resize(w, h, resFor(level));
    lastTextRes = 0;
    if (!QUALITY[level].glow) edges.setGlows([], 0);
  }

  function autoQuality(dt, now) {
    if (qualitySetting !== 'auto') return;
    dtSamples.push(now, dt);
    while (dtSamples.length && now - dtSamples[0] > 10000) dtSamples.splice(0, 2);
    if (now < qualityCheckAt) return;
    qualityCheckAt = now + 500;
    let s2 = 0, n2 = 0, s4 = 0, n4 = 0;
    for (let i = 0; i < dtSamples.length; i += 2) {
      const age = now - dtSamples[i];
      if (age <= 4000) { s4 += dtSamples[i + 1]; n4++; }
      if (age <= 2000) { s2 += dtSamples[i + 1]; n2++; }
    }
    const i = LEVELS.indexOf(level);
    // step down after 2 s of slow frames; step back up after 4 s of comfortably fast ones (when load falls again)
    if (n2 >= 8 && s2 / n2 > 20 && now - qualityChangedAt > 2000 && i > 0) setLevel(LEVELS[i - 1]);
    else if (n4 > 120 && s4 / n4 < 15 && now - qualityChangedAt > 6000 && i < LEVELS.length - 1) setLevel(LEVELS[i + 1]);
  }

  function cull() {
    const c = camera.center, { w, h } = camera.size, z = camera.zoom;
    const x0 = c.x - w / 2 / z, x1 = c.x + w / 2 / z, y0 = c.y - h / 2 / z, y1 = c.y + h / 2 / z;
    nodes.cull(x0, y0, x1, y1);
    edges.cull(x0, y0, x1, y1);
  }

  let visualTime = 0;
  function draw(dt, now) {
    if (!flow || speed > 0) visualTime += dt;
    const camMoved = camera.update(dt);
    const viewChanged = camMoved || camera.takeDirty();
    if (viewChanged) {
      updateGrid();
      const c = camera.center;
      emitter.emit('view', { zoom: camera.zoom, x: c.x, y: c.y });
    }
    updateTextRes(now);
    nodes.update(dt, now, visualTime);
    const geo = edges.updateGeometry(nodes.views);
    if (viewChanged || geo) cull();
    const m = applyFlows(dt, now);
    edges.update(dt);
    for (const v of nodes.list) v.c.alpha = pathFocus && !pathFocus.nodes.has(v.id) ? 0.16 : 1;
    for (const v of edges.list) v.g.alpha = pathFocus && !pathFocus.edges.has(v.id) ? 0.1 : 1;
    particleLayer.visible = !pathFocus;
    glowLayer.visible = !pathFocus;
    fxLayer.visible = !pathFocus;
    if (reduced) {
      if (particles.count) particles.clear();
    } else {
      particles.update(dt, {
        edges: m ? m.carrying : null,
        speed: flow ? speed : 1,
        zoom: camera.zoom,
        cap: Math.min(QUALITY[level].cap, hostEl.clientWidth < 768 ? 80 : 160),
        size: particleSize(),
        colorBad: P.bad,
        colorHit: P.accent2,
        fx,
      });
    }
    fx.update(dt);
    connectionInk.clear();
    if (connection) {
      const edge = edges.views.get(connection.id);
      const elapsed = now - connection.start;
      if (!edge || elapsed > 1100) connection = null;
      else {
        const z = camera.zoom, path = edge.lut;
        const p = lutAt(path, path.len * (reduced ? 1 : Math.min(1, elapsed / 720)), {});
        connectionInk.moveTo(path.p0x, path.p0y).bezierCurveTo(path.c1x, path.c1y, path.c2x, path.c2y, path.p3x, path.p3y).stroke({ width: 4 / z, color: P.accent, alpha: .22 });
        if (elapsed < 720 && !reduced) {
          connectionInk.circle(p.x, p.y, 12 / z).fill({ color: P.accent, alpha: .15 });
          connectionInk.circle(p.x, p.y, 5 / z).fill({ color: P.accent }).stroke({ width: 2 / z, color: P.surfaceSolid });
        } else {
          const v = nodes.views.get(edge.to);
          if (v) connectionInk.circle(v.x, v.y, (44 + (reduced ? 0 : (elapsed - 720) / 16)) / Math.max(.7, z)).stroke({ color: P.accent, width: 3 / z, alpha: reduced ? .7 : Math.max(0, 1 - (elapsed - 720) / 380) });
        }
      }
    }
    updateGlows(now);
    updateFlashes(now);
    if (ringNode) {
      if (ringNode.removing || !nodes.views.has(ringNode.id)) ui.setPortRing(null);
      else portRing.position.set(ringNode.x, ringNode.y);
    }
    portHint.visible = !!ringNode && ringNode.id === selected && editable && input.mode !== 'connect';
    if (portHint.visible) { portHint.position.set(ringNode.x, ringNode.y - PORT_R - 16 / camera.zoom); portHint.scale.set(1 / camera.zoom); portHint.style.fill = P.accent; }
    if (viewChanged && ringNode) drawPortRing();
    if (!editable && ringNode) ui.setPortRing(null);
    else if (editable && !ringNode && selected && input.mode === 'idle' && !nodes.hovered) {
      const v = nodes.views.get(selected);
      if (v) ui.setPortRing(v, false);
    }
    if (ghost.view && ghost.ring) ghost.ring.alpha = reduced ? 0.9 : 0.6 + 0.35 * Math.sin(now * 0.006);
  }

  function renderCanvas() {
    try { app.render(); return true; } catch (error) {
      // A context can also disappear during shader compilation, after the frame's check.
      if (!app.renderer.context.isLost) throw error;
      return false;
    }
  }

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (!(dt >= 0)) dt = 0;
    if (dt > 100) dt = 100;
    for (const fn of frameFns) {
      try { fn(dt); } catch (err) { queueMicrotask(() => { throw err; }); }
    }
    if (destroyed || app.renderer.context.isLost) { lastRenderMs = 0; return; }
    // nothing is moving: skip drawing and the GPU pass until something wakes the scene
    if (now - lastActive > IDLE_AFTER_MS && !particles.count && !fx.count && !flashes.size && !flashDirty && !(flow && speed > 0) && !ghost.view) {
      idleFrames++; isIdle = true;
      lastRenderMs = 0;
      return;
    }
    isIdle = false;
    const t0 = performance.now();
    draw(dt, now);
    if (!renderCanvas()) { lastRenderMs = 0; return; }
    const ms = performance.now() - t0;
    renderSamples[rsi] = ms; rsi = (rsi + 1) % renderSamples.length; rsn = Math.min(rsn + 1, renderSamples.length);
    lastRenderMs = ms;
    autoQuality(dt, now);
  }
  let lastRenderMs = 0;
  const IDLE_AFTER_MS = 1500;
  let lastActive = performance.now(), idleFrames = 0, isIdle = false;
  const wake = () => { lastActive = performance.now(); };

  const ro = new ResizeObserver(() => {
    if (destroyed) return;
    wake();
    const w = Math.max(1, hostEl.clientWidth), h = Math.max(1, hostEl.clientHeight);
    const { w: cw, h: ch } = camera.size;
    if (w === cw && h === ch) return;
    app.renderer.resize(w, h, resFor(level));
    camera.resize(w, h);
    input.refreshRect();
    updateGrid();
  });
  ro.observe(hostEl);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'wheel', 'dragover', 'drop', 'touchstart']) hostEl.addEventListener(ev, wake, { passive: true, capture: true });
  globalThis.addEventListener?.('keydown', wake);
  globalThis.document?.addEventListener?.('visibilitychange', wake);
  canvas.addEventListener('webglcontextrestored', wake);

  globalThis.document?.fonts?.ready?.then(() => { if (!destroyed) nodes.refreshLabels(); });

  updateGrid();
  raf = requestAnimationFrame(frame);

  const api = {
    setPathIsolation(on) {
      isolatePaths = !!on;
      pathFocus = isolatePaths && selected && graph ? pathsThrough(graph, selected) : null;
      edges.redrawAll();
    },
    setRegionGroups(on) { regionGroups = !!on; drawRegions(); },
    sync(g, fv) {
      graph = g || null;
      if (fv !== undefined && fv !== flowVersion) { flowVersion = fv; map = null; }
      const a = nodes.sync(graph);
      const b = edges.sync(graph);
      if (a || b) { syncVersion++; map = null; }
      nodes.setValidation(validation);
      nodes.setSelection(selected && nodes.views.has(selected) ? selected : null);
      edges.updateGeometry(nodes.views);
      pathFocus = isolatePaths && selected ? pathsThrough(graph, selected) : null;
      drawRegions();
      if (autoFit && graph?.nodes?.length) { autoFit = false; api.fit(80, false); }
    },
    setFlows(frameData, opts = {}) {
      if (opts.nodeStates) for (const state of opts.nodeStates) { const v = nodes.views.get(state.id); if (v) { v.fleetUnits = state.units; v.availableUnits = state.availableUnits; v.motionActive = opts.speed > 0; } }
      if (opts && typeof opts.speed === 'number') speed = opts.speed;
      if (!!frameData !== !!flow) wake();
      if (!frameData) {
        if (flow) {
          flow = null; map = null;
          failureLead = null;
          for (const v of nodes.list) nodes.setLive(v, false);
          for (const v of edges.list) { edges.setLoad(v, 0); if (v.rates) v.rates.fill(0); }
          edges.setGlows([], 0);
        }
        return;
      }
      flow = frameData;
    },
    setSelection(id) {
      selected = id || null;
      pathFocus = isolatePaths && selected && graph ? pathsThrough(graph, selected) : null;
      nodes.setSelection(selected);
      if (!selected && !nodes.hovered) ui.setPortRing(null);
      else if (selected && editable) ui.setPortRing(nodes.views.get(selected) || null, false);
    },
    setTrace(edgeIds) { edges.setTrace(edgeIds); },
    confirmConnection(edgeId) { connection = { id: edgeId, start: performance.now() }; },
    confirmRepair(nodeId) {
      const part = nodes.views.get(nodeId);
      if (part && !reduced) fx.sparkle(part.x, part.y, P.ok, 2);
      wake();
    },
    setInsertionPreview(fn) { insertionPreview = fn; },
    // type, then world x, y (snapped). Leave x, y out to have the ghost follow the pointer.
    setGhost(type, x, y) {
      if (!type) { ghostClear(); return; }
      ghost.type = type; ghost.preview = false;
      ghost.follow = !(Number.isFinite(x) && Number.isFinite(y));
      ghostView(type);
      if (!ghost.follow) ghostMove(x, y);
      else if (input.hoverWorld) ghostMove(input.hoverWorld.x, input.hoverWorld.y);
      else if (ghost.view) ghost.view.visible = false;
    },
    setOverlay(g) {
      overlayGraph = g && Array.isArray(g.nodes) ? g : null;
      buildOverlay();
    },
    setValidation(issues) {
      const rank = { info: 1, warn: 2, error: 3 };
      validation = new Map();
      for (const it of issues || []) {
        if (!it || !it.nodeId || !rank[it.level]) continue;
        const cur = validation.get(it.nodeId);
        if (!cur || rank[it.level] > rank[cur]) validation.set(it.nodeId, it.level);
      }
      nodes.setValidation(validation);
    },
    // Pulsing ring on the hit elements while the event is active (and at least 3 s). nodeIds null or severity 0 clears it.
    flashEvent(eventId, nodeIds, severity) {
      if (!eventId) return;
      if (nodeIds === null || severity === 0) { flashes.delete(eventId); flashDirty = true; return; }
      const sev = severity || cat.eventById.get(eventId)?.severity || SEVERITY_DEFAULT;
      flashes.set(eventId, {
        id: eventId, severity: sev, color: severityColor(P, sev), iconId: 'ev.' + eventId,
        nodeIds: nodeIds && nodeIds.length ? new Set(nodeIds) : null,
        minUntil: performance.now() + 3000,
      });
      flashDirty = true;
    },
    setTheme(palette2, theme2) {
      const token = ++themeToken;
      const nextP = resolvePalette(palette2, theme2);
      return createKit(PIXI, nextP, { categories: cat.categories, requests: cat.requests }, bakeRes, onIcon).then(nextKit => {
        if (destroyed || token !== themeToken) { nextKit.destroy(); return; }
        const old = kit;
        P = nextP; kit = nextKit;
        app.renderer.background.color = P.canvas;
        grid.invalidate();
        nodes.applyKit(kit);
        edges.applyKit(kit);
        particles.applyKit(kit);
        fx.applyKit(kit);
        if (ghost.view) { const t = ghost.type, f = ghost.follow, gx = ghost.x, gy = ghost.y; ghostView(null); ghostView(t); ghost.follow = f; ghostMove(gx, gy); }
        buildOverlay();
        drawRegions();
        for (const [, f] of flashes) f.color = severityColor(P, f.severity);
        for (const v of nodes.list) if (v.event) nodes.setEvent(v, null);
        flashDirty = true;
        map = null;
        drawPortRing();
        updateGrid();
        old.destroy();
      });
    },
    setReducedMotion(b) {
      reduced = !!b;
      camera.setReducedMotion(reduced);
      if (reduced) { particles.clear(); fx.clear(); }
      for (const v of edges.list) { edges.setLoad(v, v.rps, 0, 0); v.dirty = true; }
    },
    setQuality(q) {
      if (q === 'auto') { qualitySetting = 'auto'; return; }
      if (!QUALITY[q]) return;
      qualitySetting = q;
      setLevel(q);
    },
    // Extra: thicker busy rings with a tick pattern, thicker edges (the high-contrast setting).
    setHighContrast(b) {
      highContrast = !!b;
      nodes.redrawAll();
      edges.redrawAll();
    },
    // Extra: hides port rings and stops node moves and connects (traffic day).
    setEditable(b) { editable = !!b; if (!editable) { input.cancel(); ui.setPortRing(null); } },
    // Extra: fn(fromId, toId) → boolean, colours the connect band while dragging.
    setConnectCheck(fn) { connectCheck = typeof fn === 'function' ? fn : null; },
    // opts: { minZ, maxZ } keep a fitted view readable: a big graph is panned rather than shrunk past minZ.
    fit(padding = 80, animate = true, opts = {}) {
      const focus = opts.focusId && graph?.nodes.find(n => n.id === opts.focusId);
      const b = focus ? { minX: focus.x - 60, minY: focus.y - 50, maxX: focus.x + 60, maxY: focus.y + 70 } : nodes.bounds(opts.nodeIds ? { ...graph, nodes: graph.nodes.filter(n => opts.nodeIds.includes(n.id)) } : graph);
      if (!b) { camera.fitBounds(-200, -150, 200, 150, padding, animate, opts); return; }
      camera.fitBounds(b.minX, b.minY, b.maxX, b.maxY + (opts.reserveY || 0), padding, animate && !reduced, opts);
    },
    zoomBy(factor, cx, cy) { const { w, h } = camera.size; camera.zoomBy(factor, cx ?? w / 2, cy ?? h / 2); },
    panBy(dx, dy) { camera.panBy(dx, dy); },
    stopCamera() { camera.stop(); },
    screenToWorld(x, y) { return camera.screenToWorld(x, y); },
    worldToScreen(x, y) { return camera.worldToScreen(x, y); },
    // Extra: the connection whose middle part lies under a world point, for drop-to-insert.
    edgeAt(x, y) { const ev = edges.hitMiddle(x, y, dropTol()); return ev ? ev.id : null; },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    on(name, fn) { return emitter.on(name, fn); },
    // Extra: draw one frame right now (tests, step()).
    renderNow(dt = 16.7) {
      if (destroyed || app.renderer.context.isLost) return;
      wake();
      const t0 = performance.now();
      draw(dt, t0);
      if (!renderCanvas()) { lastRenderMs = 0; return; }
      lastRenderMs = performance.now() - t0;
    },
    stats() {
      let sum = 0;
      for (let i = 0; i < rsn; i++) sum += renderSamples[i];
      return {
        particles: particles.count, renderMs: rsn ? sum / rsn : 0, renderMsLast: lastRenderMs,
        idle: isIdle, idleFrames, quality: level, qualitySetting, dotScale, effects: fx.count, nodes: nodes.list.length, edges: edges.list.length,
        zoom: camera.zoom,
        labelPx: Math.min(...nodes.list.map(v => v.labelT.style.fontSize * v.labelT.scale.x * v.c.scale.x * camera.zoom)),
      };
    },
    async snapshot({ width = 600, height = 315, graph: g2 } = {}) {
      if (destroyed || app.renderer.context.isLost) throw new Error('The drawing surface is unavailable. Try again after it recovers.');
      const g = g2 || graph;
      const root = new PIXI.Container();
      const bg = new PIXI.Graphics().rect(0, 0, width, height).fill({ color: P.canvas });
      root.addChild(bg);
      const inner = new PIXI.Container();
      root.addChild(inner);
      const gn = g?.nodes || [];
      if (gn.length) {
        await kit.icons.ensure(gn.map(n => {
          const c = env.element(n.type)?.category || 'compute';
          return ['el.' + n.type, P.cat[c] ?? P.text3];
        }));
        const pos = new Map(gn.map(n => [n.ref ?? n.id, n]));
        const eg = new PIXI.Graphics();
        const lut = makeLut();
        const dashed = [];
        for (const e of g.edges || []) {
          const from = Array.isArray(e) ? e[0] : e.from, to = Array.isArray(e) ? e[1] : e.to;
          const a = pos.get(from), b = pos.get(to);
          if (!a || !b) continue;
          edgeCurve(lut, a.x, a.y, b.x, b.y);
          if (!Array.isArray(e) && !edgeCarries(e.kind || 'flow')) { dashed.push([lut.p0x, lut.p0y, lut.c1x, lut.c1y, lut.c2x, lut.c2y, lut.p3x, lut.p3y]); continue; }
          eg.moveTo(lut.p0x, lut.p0y).bezierCurveTo(lut.c1x, lut.c1y, lut.c2x, lut.c2y, lut.p3x, lut.p3y);
        }
        eg.stroke({ width: 3, color: P.edgeFlow, cap: 'round' });
        for (const d of dashed) eg.moveTo(d[0], d[1]).bezierCurveTo(d[2], d[3], d[4], d[5], d[6], d[7]);
        if (dashed.length) eg.stroke({ width: 1.6, color: P.cat.ops, alpha: 0.5 });
        inner.addChild(eg);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of gn) {
          const m = makeMini(PIXI, kit, env, n.type);
          m.position.set(n.x, n.y);
          inner.addChild(m);
          minX = Math.min(minX, n.x - HALF); maxX = Math.max(maxX, n.x + HALF);
          minY = Math.min(minY, n.y - HALF); maxY = Math.max(maxY, n.y + HALF);
        }
        const pad = Math.min(width, height) * 0.08;
        const sc = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY), 1.6);
        inner.scale.set(sc);
        inner.position.set(width / 2 - ((minX + maxX) / 2) * sc, height / 2 - ((minY + maxY) / 2) * sc);
      }
      if (destroyed || app.renderer.context.isLost) {
        root.destroy({ children: true });
        throw new Error('The drawing surface is unavailable. Try again after it recovers.');
      }
      const rt = PIXI.RenderTexture.create({ width, height, resolution: 1, antialias: true });
      app.renderer.render({ container: root, target: rt, clear: true });
      const out = app.renderer.extract.canvas(rt);
      rt.destroy(true);
      root.destroy({ children: true });
      return out;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      globalThis.removeEventListener?.('keydown', wake);
      globalThis.document?.removeEventListener?.('visibilitychange', wake);
      canvas.removeEventListener('webglcontextrestored', wake);
      input.destroy();
      frameFns.clear();
      ghostClear();
      for (const m of overlayMinis) m.destroy({ children: true });
      particles.destroy();
      grid.destroy();
      nodes.destroy();
      edges.destroy();
      app.destroy({ removeView: true }, { children: true });
      kit.destroy();
    },
  };
  // any call from outside (edit, theme, camera, selection) wakes the scene; the per-frame flow feed and stats do not
  for (const k of Object.keys(api)) {
    if (typeof api[k] !== 'function' || ['setFlows', 'stats', 'onFrame', 'on', 'off', 'destroy', 'renderNow'].includes(k)) continue;
    const fn = api[k];
    api[k] = function (...a) { wake(); return fn.apply(this, a); };
  }
  return api;
}
