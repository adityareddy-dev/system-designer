// The PixiJS scene: camera, nodes, edges, request particles, glows and effects. The only render file other modules import.

import { resolvePalette, severityColor } from './theme.js';
import { PAPER, paperPalette, paperPoint, paperGraph } from './paper.js';
import { e08Palette } from './e08.js';
import { createKit } from './textures.js';
import { createCamera } from './camera.js';
import { createNodeLayer, makeMini, refreshMini } from './nodes.js';
import { createEdgeLayer, edgeCarries } from './edges.js';
import { createParticles } from './particles.js';
import { createFx } from './fx.js';
import { createInput, PORT_R, DND_TYPE, DND_PREFIX } from './input.js';
import { makeLut, edgeCurve, lutAt, HALF, niceCeil, snap } from './geom.js';
import { createGrid } from './grid.js';
import { inkPath, crossesRect, intersects } from './routing.js';
import { pathsThrough } from './diagram.js';
import { createQualityGovernor } from './quality.js';

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
// Touch screens are dense. The canvas draws at up to three device pixels per CSS pixel while its backing store stays
// within what a phone fills comfortably; slow frames still step the quality down.
const TOUCH_PIXELS = 5e6;
const NO_WEBGL = 'The game needs WebGL to draw the diagram: try another browser, or turn on hardware acceleration in this browser\'s settings and reload.';
function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch { return false; }
}
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

export async function createScene(hostEl, { catalog, palette, theme = 'light', reducedMotion = false, quality = 'auto', dotsPerSec = MAX_DOTS_PER_SEC, look = 'classic' } = {}) {
  const PIXI = globalThis.PIXI;
  if (!PIXI || !PIXI.Application) throw new Error('PixiJS is not loaded');
  const cat = normalizeCatalog(catalog);
  const emitter = createEmitter();
  const dpr = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 3));
  const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;

  const displayPoint = (x, y) => look === 'paper' ? paperPoint(x, y) : { x, y };
  const modelPoint = (x, y) => look === 'paper' ? paperPoint(x, y, true) : { x, y };
  const displayGraph = g => look === 'paper' ? paperGraph(g) : g;
  let sourceGraph = null;
  let failureLead = null;
  let captionArea = null;
  let reduced = !!reducedMotion;
  let highContrast = false;
  let qualitySetting = QUALITY[quality] || quality === 'auto' ? quality : 'auto';
  // Start sharp on every screen (phones included); the auto-quality loop steps down only if frames run slow.
  let level = qualitySetting === 'auto' ? 'high' : qualitySetting;
  let viewW = Math.max(1, hostEl.clientWidth), viewH = Math.max(1, hostEl.clientHeight);
  const resFor = lv => {
    if (!coarse) return Math.min(dpr, 2, QUALITY[lv].res);
    if (lv !== 'high') return Math.min(dpr, QUALITY[lv].res);
    return Math.min(dpr, 3, Math.max(1.5, Math.floor(Math.sqrt(TOUCH_PIXELS / (viewW * viewH)) * 4) / 4));
  };
  const bakeRes = Math.min(dpr, coarse ? 3 : 2);

  const paletteFor = (p, t) => look === 'paper' ? paperPalette(resolvePalette(p, t)) : look === 'e08' ? e08Palette(resolvePalette(p, t)) : resolvePalette(p, t);
  let P = paletteFor(palette, theme);
  let kit = null;
  let nodes = null;
  let overlayMinis = [];
  const ghost = { type: null, follow: false, x: 0, y: 0, view: null, ring: null, edgeId: null, preview: false, shown: false };
  const env = {
    kit: () => kit,
    dotScale: () => dotScale,
    zoom: () => camera.zoom,
    reduced: () => reduced,
    visualTime: () => visualTime,
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

  const w0 = viewW = Math.max(1, hostEl.clientWidth), h0 = viewH = Math.max(1, hostEl.clientHeight);
  const app = new PIXI.Application();
  try {
    await app.init({
      width: w0, height: h0, antialias: dpr < 2 && quality !== 'low', background: P.canvas, resolution: resFor(level), autoDensity: true,
      autoStart: false, sharedTicker: false, preference: 'webgl', powerPreference: 'high-performance', hello: false,
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
  } catch (error) {
    try { kit.destroy(); } catch { /* nothing was drawn yet */ }
    // Without WebGL the library reports its own missing fallback; say what the player can do instead.
    throw webglAvailable() ? error : new Error(NO_WEBGL);
  }
  app.stage.eventMode = 'none';
  const canvas = app.canvas;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', outline: 'none' });
  canvas.style.webkitTouchCallout = 'none';
  canvas.setAttribute('aria-label', 'System design canvas');
  canvas.setAttribute('role', 'img');
  canvas.dataset.look = look;
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
      const t = new PIXI.Text({ text, style: { fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: '700', fill: P.ink } });
      t.position.set(x, y); regionLayer.addChild(t);
    };
    for (const [region, ns] of groups) {
      const x = Math.min(...ns.map(n => n.x)) - 90, y = Math.min(...ns.map(n => n.y)) - 100;
      const w = Math.max(...ns.map(n => n.x)) - x + 90, h = Math.max(...ns.map(n => n.y)) - y + 90;
      regionLayer.addChild(new PIXI.Graphics().roundRect(x, y, w, h, 8).stroke({ color: P.text3, width: 2 }));
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
  const portHint = new PIXI.Text({ text: 'Drag to connect →', style: { fontFamily: 'Space Grotesk', fontSize: 13, fill: P.accent, fontWeight: '700' }, resolution: 2 });
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
    if(look==='paper'){const x=PAPER.body.width/2+22/camera.zoom;portRing.moveTo(PAPER.body.width/2,0).lineTo(x,0).stroke({width:2*k,color:P.ink});portRing.rect(x-6*k,-6*k,12*k,12*k).fill({color:P.card}).stroke({color:P.ink,width:2*k});return;}
    const n = 40;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      // The part's name sits right under it: the dashes leave that stretch of the ring open so none cross the text.
      const mid = (a0 + a1) / 2;
      if (Math.abs(mid - Math.PI / 2) < 0.9) continue;
      portRing.moveTo(Math.cos(a0) * PORT_R, Math.sin(a0) * PORT_R).arc(0, 0, PORT_R, a0, a1);
    }
    portRing.stroke({ width: ringHot ? 3 : 2.5, color: P.blue, cap: 'butt' });
    // The handle keeps a full finger target outside the body, even at overview zoom.
    const handleX = HALF + 22 / camera.zoom;
    portRing.moveTo(HALF, 0).lineTo(handleX, 0).stroke({width:2.5*k,color:P.ink});
    portRing.rect(handleX - 10 * k + 2 * k, -10 * k + 2 * k, 20 * k, 20 * k).fill({ color: P.ink });
    portRing.rect(handleX - 10 * k, -10 * k, 20 * k, 20 * k).fill({ color: P.blue }).stroke({ width: 2 * k, color: P.ink });
    portRing.moveTo(handleX - 3.5 * k, -4 * k).lineTo(handleX + 3 * k, 0).lineTo(handleX - 3.5 * k, 4 * k).stroke({ width: 2.2 * k, color: P.card, cap: 'butt', join: 'miter' });
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
      const color = ok ? P.blue : P.tomato;
      if(look==='paper') {
        const endX=to?to.x:x,endY=to?to.y:y,sign=endX>=from.x?1:-1;
        const start=from.x+sign*PAPER.wire.port,end=endX-(to?sign*PAPER.wire.port:0),h=Math.max(30,Math.abs(end-start)*.5);
        band.moveTo(start,from.y).bezierCurveTo(start+sign*h,from.y,end-sign*h,endY,end,endY).stroke({width:PAPER.wire.width,color:ok?P.ink:P.tomato});
        target.visible=false;
        if(to)band.roundRect(to.x+PAPER.body.x,to.y+PAPER.body.y,PAPER.body.width,PAPER.body.height,PAPER.body.radius).stroke({width:PAPER.body.stroke,color:ok?P.ink:P.tomato});
        else band.rect(x-5,y-5,10,10).fill({color:P.card}).stroke({width:2,color:P.ink});
        return;
      }
      if (to) {
        edgeCurve(bandLut, from.x, from.y, to.x, to.y);
        band.moveTo(bandLut.p0x, bandLut.p0y).bezierCurveTo(bandLut.c1x, bandLut.c1y, bandLut.c2x, bandLut.c2y, bandLut.p3x, bandLut.p3y)
          .stroke({ width: 2.5, color, cap: 'butt' });
        target.visible = true;
        target.context = ok ? kit.select[to.shape] : kit.ghost[to.shape];
        target.tint = ok ? 0xffffff : P.tomato;
        target.position.set(to.x, to.y);
      } else {
        const s = x >= from.x ? 1 : -1;
        const sx = from.x + s * HALF, sy = from.y;
        const h = Math.max(30, Math.abs(x - sx) * 0.5);
        band.moveTo(sx, sy).bezierCurveTo(sx + s * h, sy, x - s * h * 0.4, y, x, y).stroke({ width: 2.5, color, cap: 'butt' });
        band.rect(x - 5, y - 5, 10, 10).fill({ color }).stroke({ width: 2, color: P.ink });
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
      if (lines.length) guides.stroke({ width: 1.5, color: P.blue });
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
      if (plan?.position) { const p = displayPoint(plan.position.x, plan.position.y); ghost.x = p.x; ghost.y = p.y; }
      if (a && b && plan) {
        dropWires.moveTo(a.x, a.y).lineTo(ghost.x, ghost.y);
        if (plan.kind !== 'side') dropWires.lineTo(b.x, b.y);
        dropWires.stroke({ width: 3 / camera.zoom, color: P.blue });
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
    snapPoint: (x, y) => { const p = modelPoint(x, y); return displayPoint(snap(p.x), snap(p.y)); },
    emit: (n, p) => emitter.emit(n, ['node:dragend', 'canvas:tap', 'canvas:drop'].includes(n) ? { ...p, ...modelPoint(p.x, p.y) } : p),
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
    const g = displayGraph(overlayGraph);
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
    overlayEdges.stroke({ width: 2, color: P.text3 });
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
  const governor = createQualityGovernor({ level, now: performance.now() });
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
    if (failureLead && now > failureLead.until) {
      const i = F.nodeIds.indexOf(failureLead.id);
      if (i < 0 || !(util[i] > 1 || status?.[i] === 4)) failureLead = null;
    }
    if (!failureLead) {
      let first = -1;
      for (let i = 0; i < N; i++) if ((util[i] > 1 || status?.[i] === 4) && nodeView[i]?.kind !== 'source') { first = i; break; }
      if (first >= 0) failureLead = { id: F.nodeIds[first], until: now + 1600 };
    }
    nodes.setLead(failureLead ? failureLead.id : null);
    for (let i = 0; i < N; i++) {
      const v = nodeView[i];
      if (!v || v.removing) continue;
      let fail = 0, inn = 0, pile = -1, pileR = 0;
      const b = i * T;
      if(look==='paper')v.outRps=nodeOut.subarray(b,b+T).reduce((sum,r)=>sum+r,0);
      for (let t = 0; t < T; t++) {
        const f = nf[b + t] || 0;
        if (F.typeIds[t] !== 'attack') fail += f; inn += nodeIn[b + t];
        if (f > pileR) { pileR = f; pile = t; }
      }
      const over = fail > 0 && inn > 0 ? fail / (inn + fail) : 0;
      nodes.setLive(v, true, util[i] || 0, status ? status[i] : 0, queue ? queue[i] || 0 : 0, over, pile >= 0 ? map.tex[pile] : -1, fail);
      if (failureLead) {
        if (v.id !== failureLead.id && v.kind !== 'queue') v.evidenceT.visible = false;
        else if (v.id === failureLead.id && v.evidenceT.visible) v.evidenceT.text = 'First limit\n' + v.evidenceT.text;
      }
      if (running && fail > 0 && inn <= 0) {
        map.srcAcc[i] += (fail * inv * dt) / 1000;
        if (map.srcAcc[i] >= 1) {
          map.srcAcc[i] = Math.min(map.srcAcc[i] - 1, 1);
          fx.burst(v.x + HALF + 6, v.y + (Math.random() - 0.5) * 30, P.tomato, particleSize() / 10);
        }
      }
    }
    // particle textures follow the frame's type order
    for (const v of map.carrying) {
      v.texMap = map.tex;
      v.quiet = !!failureLead && v.to !== failureLead.id && v.from !== failureLead.id;
    }
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
      if (v.toIdx < 0 || !(v.rps > 0) || v.quiet) continue;
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
    const { w, h } = camera.size;
    app.renderer.resize(w, h, resFor(level));
    lastTextRes = 0;
    if (!QUALITY[level].glow) edges.setGlows([], 0);
  }

  function autoQuality(dt, now) {
    if (qualitySetting !== 'auto') return;
    const next = governor.sample(now, dt);
    if (next) setLevel(next);
  }

  function cull() {
    const c = camera.center, { w, h } = camera.size, z = camera.zoom;
    const x0 = c.x - w / 2 / z, x1 = c.x + w / 2 / z, y0 = c.y - h / 2 / z, y1 = c.y + h / 2 / z;
    nodes.cull(x0, y0, x1, y1);
    edges.cull(x0, y0, x1, y1);
  }

  let visualTime = 0;
  function draw(dt, now, wallDt = dt) {
    if (!flow || speed > 0) visualTime += dt;
    const camMoved = camera.update(wallDt);
    const viewChanged = camMoved || camera.takeDirty();
    if (viewChanged) {
      updateGrid();
      const c = camera.center;
      emitter.emit('view', { zoom: camera.zoom, x: c.x, y: c.y });
    }
    updateTextRes(now);
    nodes.update(wallDt, now, visualTime);
    const m = applyFlows(dt, now);
    const captionsMoved = nodes.layoutLabels(camera, captionArea);
    if (captionsMoved) edges.invalidateGeometry();
    const geo = edges.updateGeometry(nodes.views);
    if (viewChanged || geo) cull();
    edges.update(dt);
    // Isolating paths only softens what is off the path; nothing is hidden, and a failing part never sits behind a dim.
    for (const v of nodes.list) v.c.alpha = pathFocus && !pathFocus.nodes.has(v.id) ? 0.6 : 1;
    for (const v of edges.list) v.g.alpha = pathFocus && !pathFocus.edges.has(v.id) ? 0.5 : 1;
    particleLayer.visible = !pathFocus;
    glowLayer.visible = !pathFocus;
    fxLayer.visible = !pathFocus;
    if (reduced || kit.look === 'paper') {
      if (particles.count) particles.clear();
    } else {
      particles.update(dt, {
        edges: m ? m.carrying : null,
        speed: flow ? speed : 1,
        zoom: camera.zoom,
        cap: Math.min(QUALITY[level].cap, hostEl.clientWidth < 768 ? 80 : 160),
        size: particleSize(),
        colorBad: P.tomato,
        colorHit: P.mint,
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
        inkPath(connectionInk, path).stroke({ width: 4 / z, color: P.blue, cap: 'butt' });
        if (elapsed < 720 && !reduced) {
          connectionInk.rect(p.x - 6 / z, p.y - 6 / z, 12 / z, 12 / z).fill({ color: P.blue }).stroke({ width: 2 / z, color: P.ink });
        } else {
          const v = nodes.views.get(edge.to);
          if (v) connectionInk.circle(v.x, v.y, (44 + (reduced ? 0 : (elapsed - 720) / 16)) / Math.max(.7, z)).stroke({ color: P.blue, width: 3 / z });
        }
      }
    }
    updateGlows(now);
    updateFlashes(now);
    if (ringNode) {
      if (ringNode.removing || !nodes.views.has(ringNode.id)) ui.setPortRing(null);
      else portRing.position.set(ringNode.x, ringNode.y);
    }
    portHint.visible = !!ringNode && ringNode.id === selected && editable && !flow && input.mode !== 'connect';
    if (portHint.visible) { portHint.position.set(ringNode.x, ringNode.y - (look==='paper'?PAPER.body.height/2:PORT_R) - 16 / camera.zoom); portHint.scale.set(1 / camera.zoom); portHint.style.fill = P.accent; }
    if (viewChanged && ringNode) drawPortRing();
    if (!editable && ringNode) ui.setPortRing(null);
    else if (editable && !ringNode && selected && input.mode === 'idle' && !nodes.hovered) {
      const v = nodes.views.get(selected);
      if (v) ui.setPortRing(v, false);
    }
    if (ghost.view && ghost.ring) ghost.ring.alpha = 1;
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
    const wallDt = dt;
    if (dt > 100) dt = 100;
    for (const fn of frameFns) {
      try { fn(wallDt); } catch (err) { queueMicrotask(() => { throw err; }); }
    }
    if (destroyed || app.renderer.context.isLost) { lastRenderMs = 0; return; }
    // nothing is moving: skip drawing and the GPU pass until something wakes the scene
    if (now - lastActive > IDLE_AFTER_MS && !camera.moving && !nodes.moving && !particles.count && !fx.count && !flashes.size && !flashDirty && !(flow && speed > 0) && !ghost.view) {
      idleFrames++; isIdle = true;
      lastRenderMs = 0;
      return;
    }
    isIdle = false;
    const t0 = performance.now();
    draw(dt, now, wallDt);
    if (!renderCanvas()) { lastRenderMs = 0; return; }
    const ms = performance.now() - t0;
    renderSamples[rsi] = ms; rsi = (rsi + 1) % renderSamples.length; rsn = Math.min(rsn + 1, renderSamples.length);
    lastRenderMs = ms;
    autoQuality(wallDt, now);
  }
  let lastRenderMs = 0;
  const IDLE_AFTER_MS = 1500;
  let lastActive = performance.now(), idleFrames = 0, isIdle = false;
  const wake = () => { lastActive = performance.now(); };

  const ro = new ResizeObserver(() => {
    if (destroyed) return;
    wake();
    wake();
    const w = Math.max(1, hostEl.clientWidth), h = Math.max(1, hostEl.clientHeight);
    const { w: cw, h: ch } = camera.size;
    if (w === cw && h === ch) return;
    viewW = w; viewH = h;
    governor.settle(performance.now());
    app.renderer.resize(w, h, resFor(level));
    lastTextRes = 0;
    camera.resize(w, h);
    input.refreshRect();
    updateGrid();
  });
  ro.observe(hostEl);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'wheel', 'dragover', 'drop', 'touchstart']) hostEl.addEventListener(ev, wake, { passive: true, capture: true });
  globalThis.addEventListener?.('keydown', wake);
  globalThis.document?.addEventListener?.('visibilitychange', wake);
  canvas.addEventListener('webglcontextrestored', wake);
  // A tab coming back, or a restored drawing surface, starts with slow frames that say nothing about the device.
  const calm = () => governor.settle(performance.now(), 2000);
  globalThis.document?.addEventListener?.('visibilitychange', calm);
  canvas.addEventListener('webglcontextrestored', calm);

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
      wake();
      sourceGraph = g || null;
      graph = displayGraph(sourceGraph);
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
      if (opts.nodeStates) for (const state of opts.nodeStates) { const v = nodes.views.get(state.id); if (v) { v.fleetUnits = state.units; v.availableUnits = state.availableUnits; v.motionActive = opts.speed > 0; v.telemetry = state; } }
      if (opts && typeof opts.speed === 'number') speed = opts.speed;
      if (!!frameData !== !!flow) wake();
      if (!frameData) {
        if (flow) {
          flow = null; map = null;
          failureLead = null;
          particles.clear(); fx.clear(); flashes.clear(); flashDirty = true;
          for (const v of nodes.list) nodes.setLive(v, false);
          for (const v of edges.list) { v.quiet = false; edges.setLoad(v, 0); if (v.rates) v.rates.fill(0); }
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
      if (!ghost.follow) { const p = displayPoint(x, y); ghostMove(p.x, p.y); }
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
    setLook(nextLook) {
      const next = ['paper', 'e08'].includes(nextLook) ? nextLook : 'classic';
      if (next === look) return Promise.resolve();
      look = next;
      return api.setTheme(palette, theme);
    },
    setTheme(palette2, theme2) {
      palette = palette2; theme = theme2;
      const token = ++themeToken;
      governor.settle(performance.now());
      const nextP = paletteFor(palette2, theme2);
      return createKit(PIXI, nextP, { categories: cat.categories, requests: cat.requests }, bakeRes, onIcon).then(nextKit => {
        if (destroyed || token !== themeToken) { nextKit.destroy(); return; }
        const old = kit;
        P = nextP; kit = nextKit;
        canvas.dataset.look = kit.look || 'classic';
        app.renderer.background.color = P.canvas;
        grid.invalidate();
        nodes.applyKit(kit);
        graph = displayGraph(sourceGraph);
        nodes.sync(graph);
        nodes.setLabelScale(camera.zoom);
        edges.applyKit(kit);
        edges.sync(graph);
        edges.updateGeometry(nodes.views);
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
      if (q === 'auto') { qualitySetting = 'auto'; governor.reset(level, performance.now()); return; }
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
    setCaptionArea(area) { captionArea = area; wake(); },
    // opts: { minZ, maxZ } keep a fitted view readable: a big graph is panned rather than shrunk past minZ.
    fit(padding = 80, animate = true, opts = {}) {
      wake();
      // A minimum chosen for saved coordinates must not crop the spread paper layout.
      const fitOpts = look === 'paper' && opts.minZ ? { ...opts, minZ: opts.minZ / Math.max(PAPER.spread.x, PAPER.spread.y) } : opts;
      const focus = opts.focusId && graph?.nodes.find(n => n.id === opts.focusId);
      const b = focus ? { minX: focus.x - 60, minY: focus.y - 50, maxX: focus.x + 60, maxY: focus.y + 70 } : nodes.bounds(opts.nodeIds ? { ...graph, nodes: graph.nodes.filter(n => opts.nodeIds.includes(n.id)) } : graph);
      if (!b) { camera.fitBounds(-200, -150, 200, 150, padding, animate, fitOpts); return; }
      camera.fitBounds(b.minX, b.minY, b.maxX, b.maxY + (opts.reserveY || 0), padding, animate && !reduced, fitOpts);
      nodes.setLabelScale(camera.zoom);
    },
    // Display bounds, including card and label space, for fitting around panels. Null when empty.
    bounds(nodeIds) { return nodes.bounds(nodeIds && graph ? { ...graph, nodes: graph.nodes.filter(n => nodeIds.includes(n.id)) } : graph); },
    // Glide just far enough that a world point sits inside the free part of the canvas (insets are panels, in screen px).
    reveal(x, y, insets = {}, margin = {}) {
      const d = displayPoint(x, y), p = camera.worldToScreen(d.x, d.y), { w, h } = camera.size;
      const l = (insets.l || 0) + (margin.l ?? 60), r = w - (insets.r || 0) - (margin.r ?? 60);
      const t = (insets.t || 0) + (margin.t ?? 60), b = h - (insets.b || 0) - (margin.b ?? 60);
      const dx = r > l ? (p.x < l ? l - p.x : p.x > r ? r - p.x : 0) : (l + r) / 2 - p.x;
      const dy = b > t ? (p.y < t ? t - p.y : p.y > b ? b - p.y : 0) : (t + b) / 2 - p.y;
      if (!dx && !dy) return false;
      camera.glideBy(dx, dy);
      return true;
    },
    zoomBy(factor, cx, cy) { wake(); const { w, h } = camera.size; camera.zoomBy(factor, cx ?? w / 2, cy ?? h / 2); nodes.setLabelScale(camera.zoom); },
    panBy(dx, dy) { wake(); camera.panBy(dx, dy); },
    stopCamera() { camera.stop(); },
    screenToWorld(x, y) { const p = camera.screenToWorld(x, y); return modelPoint(p.x, p.y); },
    worldToScreen(x, y) { const p = displayPoint(x, y); return camera.worldToScreen(p.x, p.y); },
    // Extra: the connection whose middle part lies under a world point, for drop-to-insert.
    edgeAt(x, y) { const p = displayPoint(x, y); const ev = edges.hitMiddle(p.x, p.y, dropTol()); return ev ? ev.id : null; },
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
    measureDiagram() {
      const z = camera.zoom;
      const labels = nodes.list.flatMap(v => [v.labelT, v.evidenceT].filter(t => t.visible && t.renderable && t.text && v.c.visible).map(t => {
        const b = t.getBounds(); return { id: v.id, kind: t === v.labelT ? 'name' : 'failure', text: t.text, x: b.x, y: b.y, width: b.width, height: b.height };
      }));
      const parts = nodes.list.map(v => { const p = camera.worldToScreen(v.x, v.y); return { id: v.id, x: p.x - (v.renderHalf||36)*z, y: p.y - (v.renderHeight/2||v.renderHalf||36)*z, width: (v.renderWidth||2*(v.renderHalf||36))*z, height: (v.renderHeight||2*(v.renderHalf||36))*z }; });
      const wires = edges.list.map(v => ({ id: v.id, from: v.from, to: v.to, points: Array.from({ length: (v.lut.segs || 24) + 1 }, (_, i) => camera.worldToScreen(v.lut.xs[i], v.lut.ys[i])) }));
      let labelOverlaps = 0, wirePartCrossings = 0, wireLabelCrossings = 0, labelPartOverlaps = 0, labelPanelOverlaps = 0;
      const area=captionArea||{l:0,t:0,r:0,b:0}, right=camera.size.w-area.r, bottom=camera.size.h-area.b;
      for (let i=0; i<labels.length; i++) {
        for (let j=i+1; j<labels.length; j++) if (intersects(labels[i],labels[j])) labelOverlaps++;
        for (const p of parts) if (intersects(labels[i],p)) labelPartOverlaps++;
        const l=labels[i], owner=parts.find(p=>p.id===l.id), x=owner.x+owner.width/2, y=owner.y+owner.height/2;
        if(x>=area.l&&x<=right&&y>=area.t&&y<=bottom&&(l.x<area.l||l.y<area.t||l.x+l.width>right||l.y+l.height>bottom||(area.blocks||[]).some(b=>intersects(l,b))))labelPanelOverlaps++;
      }
      for (const w of wires) {
        const hits = r => w.points.slice(1).some((p,i) => crossesRect(w.points[i].x,w.points[i].y,p.x,p.y,r));
        for (const p of parts) if (p.id !== w.from && p.id !== w.to && hits(p)) wirePartCrossings++;
        for (const l of labels) if (hits(l)) wireLabelCrossings++;
      }
      return { labels, parts, wires, labelOverlaps, wirePartCrossings, wireLabelCrossings, labelPartOverlaps, labelPanelOverlaps };
    },
    stats() {
      let sum = 0;
      for (let i = 0; i < rsn; i++) sum += renderSamples[i];
      return {
        particles: particles.count, renderMs: rsn ? sum / rsn : 0, renderMsLast: lastRenderMs,
        idle: isIdle, idleFrames, quality: level, qualitySetting, dotScale, effects: fx.count, nodes: nodes.list.length, edges: edges.list.length,
        zoom: camera.zoom, cameraMoving: camera.moving,
        labelPx: Math.min(...nodes.list.map(v => v.labelT.style.fontSize * v.labelT.scale.x * v.captionC.scale.x * v.c.scale.x * camera.zoom)),
      };
    },
    async snapshot({ width = 600, height = 315, graph: g2 } = {}) {
      if (destroyed || app.renderer.context.isLost) throw new Error('The drawing surface is unavailable. Try again after it recovers.');
      const g = displayGraph(g2 || sourceGraph);
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
        // A thumbnail is read at a fraction of the canvas size, so it is drawn as a schematic: the same parts in the same
        // order, moved closer together along each axis until the closest neighbours are about a part apart, then fitted
        // to the picture. Parts come out as large as the layout allows and the wires between them stay visible.
        const N = look === 'paper' ? PAPER.body.textureSize : HALF * 2;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nearX = Infinity, nearY = Infinity;
        for (let i = 0; i < gn.length; i++) {
          const a = gn[i];
          x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y);
          for (let j = i + 1; j < gn.length; j++) {
            const dx = Math.abs(a.x - gn[j].x), dy = Math.abs(a.y - gn[j].y);
            if (dx >= dy) nearX = Math.min(nearX, dx); else nearY = Math.min(nearY, dy);
          }
        }
        const spanX = x1 - x0, spanY = y1 - y0;
        const pad = Math.min(width, height) * 0.055;
        const availW = width - pad * 2, availH = height - pad * 2;
        // the closest the centres may come: room for a wire sideways, a clear gap up and down
        const tightX = nearX === Infinity ? 1 : Math.min(1, (N * 1.7) / nearX);
        const tightY = nearY === Infinity ? 1 : Math.min(1, (N * 1.2) / nearY);
        // a design of two or three parts stops growing once a part is three tenths of the picture's height
        const sc = Math.min(availW / (spanX * tightX + N), availH / (spanY * tightY + N), (height * 0.3) / N);
        // the looser axis opens up into the room that is left, to at most three parts between neighbours
        const mx = spanX ? Math.max(tightX, Math.min((availW / sc - N) / spanX, nearX === Infinity ? 1 : (N * 3) / nearX)) : 1;
        const my = spanY ? Math.max(tightY, Math.min((availH / sc - N) / spanY, nearY === Infinity ? 1 : (N * 3) / nearY)) : 1;
        const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
        const pos = new Map(gn.map(n => [n.ref ?? n.id, { x: (n.x - midX) * mx, y: (n.y - midY) * my }]));
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
        // wires keep one thickness in the finished picture, whatever the design's size
        const wire = height / (124 * sc);
        eg.stroke({ width: wire, color: P.ink, cap: 'butt' });
        for (const d of dashed) eg.moveTo(d[0], d[1]).bezierCurveTo(d[2], d[3], d[4], d[5], d[6], d[7]);
        if (dashed.length) eg.stroke({ width: wire * 0.6, color: P.text3, cap: 'butt' });
        inner.addChild(eg);
        for (const n of gn) {
          const m = makeMini(PIXI, kit, env, n.type);
          const p = pos.get(n.ref ?? n.id);
          m.position.set(p.x, p.y);
          m.__icon.width = m.__icon.height = look === 'paper' ? PAPER.icon.size : 38;
          inner.addChild(m);
        }
        inner.scale.set(sc);
        inner.position.set(width / 2, height / 2);
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
      globalThis.document?.removeEventListener?.('visibilitychange', calm);
      canvas.removeEventListener('webglcontextrestored', calm);
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
