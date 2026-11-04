// Request particle shapes and node silhouettes: unit-space descriptors, PIXI drawing and SVG for legends.
import { ATTRS, ICONS } from './icons/data.js';

const ngon = (n, rot = -90, r = 1) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = ((rot + (i * 360) / n) * Math.PI) / 180; pts.push(+(r * Math.cos(a)).toFixed(4), +(r * Math.sin(a)).toFixed(4)); }
  return pts;
};
const starPts = (n, ro, ri) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = ((-90 + (i * 180) / n) * Math.PI) / 180, r = i % 2 ? ri : ro; pts.push(+(r * Math.cos(a)).toFixed(4), +(r * Math.sin(a)).toFixed(4)); }
  return pts;
};

// One per request shape id in catalog/requests.json. Unit space, radius 1, centred at 0,0.
export const SHAPES = {
  circle: { kind: 'circle' },
  square: { kind: 'poly', points: [-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, 0.8] },
  'triangle-up': { kind: 'poly', points: [0, -0.95, 0.95, 0.75, -0.95, 0.75] },
  capsule: { kind: 'capsule', w: 2, h: 1 },
  ring: { kind: 'ring', inner: 0.55 },
  diamond: { kind: 'poly', points: [0, -1, 1, 0, 0, 1, -1, 0] },
  octagon: { kind: 'poly', points: ngon(8, -67.5, 0.95) },
  hexagon: { kind: 'poly', points: ngon(6, 0, 0.95) },
  pentagon: { kind: 'poly', points: ngon(5, -90, 0.95) },
  star: { kind: 'poly', points: starPts(5, 1, 0.45) },
  chevron: { kind: 'poly', points: [-0.65, -0.85, -0.15, -0.85, 0.65, 0, -0.15, 0.85, -0.65, 0.85, 0.15, 0] },
  'triangle-down': { kind: 'poly', points: [0, 0.95, 0.95, -0.75, -0.95, -0.75] },
  dome: { kind: 'poly', points: [-0.95, 0.6, ...Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (i * Math.PI) / 8; return [+(0.95 * Math.cos(a)).toFixed(4), +(0.6 + 0.95 * Math.sin(a)).toFixed(4)]; }).flat(), 0.95, 0.6] },
  bowtie: { kind: 'compound', parts: [{ kind: 'poly', points: [-0.9, -0.7, 0, 0, -0.9, 0.7] }, { kind: 'poly', points: [0.9, -0.7, 0, 0, 0.9, 0.7] }] },
  dash: { kind: 'capsule', w: 2, h: 0.45 },
  plus: { kind: 'poly', points: [-0.27, -0.85, 0.27, -0.85, 0.27, -0.27, 0.85, -0.27, 0.85, 0.27, 0.27, 0.27, 0.27, 0.85, -0.27, 0.85, -0.27, 0.27, -0.85, 0.27, -0.85, -0.27, -0.27, -0.27] },
  crate: { kind: 'compound', parts: [{ kind: 'poly', points: [-0.75, -0.65, 0.75, -0.65, 0.75, 0.65, -0.75, 0.65] }, { kind: 'line', points: [0, -0.65, 0, 0.65] }, { kind: 'line', points: [-0.75, 0, 0.75, 0] }] },
  trapezoid: { kind: 'poly', points: [-0.5, -0.65, 0.5, -0.65, 0.9, 0.65, -0.9, 0.65] },
  x: { kind: 'compound', parts: [{ kind: 'line', points: [-0.7, -0.7, 0.7, 0.7] }, { kind: 'line', points: [0.7, -0.7, -0.7, 0.7] }] },
};

// One per category nodeShape in catalog/elements.json.
export const NODE_SHAPES = {
  circle: { kind: 'circle' },
  hexagon: { kind: 'poly', points: ngon(6, 0, 1) },
  'rounded-square': { kind: 'rect', radius: 0.28 },
  cylinder: { kind: 'cylinder', cap: 0.18 },
  pill: { kind: 'rect', radius: 0.5 },
  shield: { kind: 'poly', points: [-0.9, -0.85, 0, -1, 0.9, -0.85, 0.9, 0.1, 0, 1, -0.9, 0.1] },
  'dashed-square': { kind: 'rect', radius: 0.22, dashed: true },
  octagon: { kind: 'poly', points: ngon(8, -67.5, 1) },
  'double-square': { kind: 'compound', parts: [{ kind: 'rect', radius: 0.22 }, { kind: 'rect', radius: 0.16, inset: 0.14 }] },
};

// Shape id → the request type whose SVG artwork draws it (catalog/requests.json `shape`).
const SHAPE_ART = {
  circle: 'read', square: 'write', 'triangle-up': 'upload', capsule: 'stream', ring: 'live', diamond: 'search', octagon: 'report',
  hexagon: 'payment', pentagon: 'login', star: 'inference', chevron: 'message', 'triangle-down': 'location', dome: 'notify',
  bowtie: 'sync', dash: 'telemetry', plus: 'event', crate: 'batch', trapezoid: 'webhook', x: 'attack',
};

function drawDesc(g, d, r) {
  switch (d.kind) {
    case 'circle': g.circle(0, 0, r); break;
    case 'ring': g.circle(0, 0, r); g.circle(0, 0, r * d.inner); break;
    case 'capsule': g.roundRect((-d.w / 2) * r, (-d.h / 2) * r, d.w * r, d.h * r, (d.h / 2) * r); break;
    case 'poly': g.poly(d.points.map((v) => v * r), true); break;
    case 'line': g.moveTo(d.points[0] * r, d.points[1] * r); g.lineTo(d.points[2] * r, d.points[3] * r); break;
    case 'compound': for (const p of d.parts) drawDesc(g, p, r); break;
    default: g.circle(0, 0, r);
  }
}

// Draws a request shape into a PIXI.Graphics (v8 path API). The caller fills or strokes.
export function drawShape(g, shapeId, r) {
  drawDesc(g, SHAPES[shapeId] || SHAPES.circle, r);
  return g;
}

// Draws a node silhouette of size w x h centred at 0,0.
export function drawNodeShape(g, nodeShapeId, w, h) {
  const d = NODE_SHAPES[nodeShapeId] || NODE_SHAPES['rounded-square'];
  const one = (p) => {
    const ins = (p.inset || 0) * Math.min(w, h);
    const ww = w - ins * 2, hh = h - ins * 2;
    if (p.kind === 'circle') g.ellipse(0, 0, ww / 2, hh / 2);
    else if (p.kind === 'rect') g.roundRect(-ww / 2, -hh / 2, ww, hh, p.radius * Math.min(ww, hh));
    else if (p.kind === 'cylinder') { g.roundRect(-ww / 2, -hh / 2, ww, hh, p.cap * hh); g.ellipse(0, -hh / 2 + p.cap * hh, ww / 2, p.cap * hh); }
    else if (p.kind === 'poly') g.poly(p.points.map((v, i) => v * (i % 2 ? hh / 2 : ww / 2)), true);
    else if (p.kind === 'compound') p.parts.forEach(one);
  };
  one(d);
  return g;
}

// Inline SVG of a request shape for legends and chips.
export function shapeSvg(shapeId, { size = 16, fill = 'currentColor', stroke = 'none', strokeWidth = 0 } = {}) {
  const art = ICONS['req.' + (SHAPE_ART[shapeId] || shapeId)] || ICONS['req.read'];
  const base = ATTRS[art[0]].replace(/fill="[^"]*"/, `fill="${fill}"`).replace(/stroke="[^"]*"/, `stroke="${stroke === 'none' ? fill : stroke}"`);
  const sw = strokeWidth ? ` stroke-width="${strokeWidth}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><g ${base}${sw}>${art[1]}</g></svg>`;
}

// Status marks on a 12 x 12 grid, drawn as paths so status never relies on colour alone.
export const STATUS_GLYPHS = {
  ok: 'M2.5 6.2l2.4 2.4 4.6-5',
  warn: 'M6 1.5l4.8 8.7H1.2zM6 4.6v2.6M6 8.6v.1',
  hot: 'M6 1.2c.4 2-2.8 3-2.8 5.6a2.8 2.8 0 0 0 5.6 0c0-1.2-.6-2-1.2-2.6.1 1-.4 1.6-1 1.8.4-1.8-.2-3.6-.6-4.8z',
  overload: 'M6 1a5 5 0 1 0 0 10A5 5 0 1 0 6 1zM3.8 3.8l4.4 4.4M8.2 3.8l-4.4 4.4',
  down: 'M6 1a5 5 0 1 0 0 10A5 5 0 1 0 6 1zM3 6h6',
};
