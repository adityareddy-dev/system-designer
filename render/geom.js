// Geometry helpers: node silhouette outlines, edge curves and arc-length lookups (world units).

export const GRID = 20;
export const NODE = 72;
export const HALF = NODE / 2;

function arcPts(out, cx, cy, rx, ry, a0, a1, steps) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
}

function roundRectPts(hw, hh, r) {
  r = Math.min(r, hw, hh);
  const o = [[0, -hh]];
  arcPts(o, hw - r, -hh + r, r, r, -Math.PI / 2, 0, 12);
  arcPts(o, hw - r, hh - r, r, r, 0, Math.PI / 2, 12);
  arcPts(o, -hw + r, hh - r, r, r, Math.PI / 2, Math.PI, 12);
  arcPts(o, -hw + r, -hh + r, r, r, Math.PI, Math.PI * 1.5, 12);
  return o;
}

function regularPts(n, R, rot) {
  // Starts at top centre of the flat top edge and walks clockwise.
  const v = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    v.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  const topY = Math.min(...v.map(p => p[1]));
  const o = [[0, topY]];
  // first vertex on the top edge to the right of centre
  let start = 0, best = Infinity;
  v.forEach((p, i) => { if (Math.abs(p[1] - topY) < 1e-6 && p[0] > 0 && p[0] < best) { best = p[0]; start = i; } });
  for (let k = 0; k < n; k++) o.push(v[(start + k) % n]);
  return o;
}

function bez(out, p0, p1, p2, p3, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function basePath(shape) {
  switch (shape) {
    case 'circle': { const o = []; arcPts(o, 0, 0, HALF, HALF, -Math.PI / 2, Math.PI * 1.5, 96); return o; }
    case 'hexagon': return regularPts(6, 39, 0);
    case 'octagon': return regularPts(8, 38.5, Math.PI / 8);
    case 'cylinder': {
      const o = [[0, -36]];
      arcPts(o, 0, -27, 32, 9, -Math.PI / 2, 0, 12);
      o.push([32, 27]);
      arcPts(o, 0, 27, 32, 9, 0, Math.PI, 24);
      o.push([-32, -27]);
      arcPts(o, 0, -27, 32, 9, Math.PI, Math.PI * 1.5, 12);
      return o;
    }
    case 'pill': return roundRectPts(39, 26, 26);
    case 'shield': {
      const o = [[0, -34]];
      arcPts(o, 26, -28, 6, 6, -Math.PI / 2, 0, 6);
      o.push([32, 0]);
      bez(o, [32, 0], [32, 20], [16, 31], [0, 38], 14);
      bez(o, [0, 38], [-16, 31], [-32, 20], [-32, 0], 14);
      o.push([-32, -28]);
      arcPts(o, -26, -28, 6, 6, Math.PI, Math.PI * 1.5, 6);
      return o;
    }
    case 'dashed-square': return roundRectPts(33, 33, 14);
    case 'double-square': return roundRectPts(34, 34, 10);
    case 'rounded-square':
    default: return roundRectPts(34, 34, 16);
  }
}

function resample(pts, n) {
  const m = pts.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[m];
  const out = new Float32Array(n * 2);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (j < m - 1 && cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % m];
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (s - cum[j]) / seg;
    out[k * 2] = a[0] + (b[0] - a[0]) * t;
    out[k * 2 + 1] = a[1] + (b[1] - a[1]) * t;
  }
  return out;
}

const outlineCache = new Map();

// Closed outline of a node silhouette, pushed outward by `inflate`, sampled at n evenly spaced points
// starting at top centre and running clockwise. → { pts: Float32Array [x0,y0,...], n, len }
export function outline(shape, inflate = 0, n = 128) {
  const key = shape + '|' + inflate + '|' + n;
  let o = outlineCache.get(key);
  if (o) return o;
  const dense = resample(basePath(shape), 512);
  const m = 512;
  const pushed = [];
  for (let i = 0; i < m; i++) {
    const ax = dense[((i - 2 + m) % m) * 2], ay = dense[((i - 2 + m) % m) * 2 + 1];
    const bx = dense[((i + 2) % m) * 2], by = dense[((i + 2) % m) * 2 + 1];
    let nx = by - ay, ny = -(bx - ax);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    pushed.push([dense[i * 2] + nx * inflate, dense[i * 2 + 1] + ny * inflate]);
  }
  const pts = resample(pushed, n);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    len += Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
  }
  o = { pts, n, len };
  outlineCache.set(key, o);
  return o;
}

export function snap(v, step = GRID) {
  return Math.round(v / step) * step;
}

// ---- edges ----

export const LUT_SEGS = 24;

export function makeLut() {
  return { xs: new Float32Array(LUT_SEGS + 1), ys: new Float32Array(LUT_SEGS + 1), cum: new Float32Array(LUT_SEGS + 1), len: 0, ver: 0,
    p0x: 0, p0y: 0, c1x: 0, c1y: 0, c2x: 0, c2y: 0, p3x: 0, p3y: 0 };
}

// Which sides an edge leaves and enters by: left/right ports unless the nodes are stacked.
export function edgeSides(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const horiz = Math.abs(dx) >= HALF * 1.6 || Math.abs(dx) >= Math.abs(dy) * 0.9;
  return { horiz, s: horiz ? (dx >= 0 ? 1 : -1) : (dy >= 0 ? 1 : -1) };
}

// Ports and control points: horizontal tangents between the side ports, vertical ones when stacked.
// oa and ob slide the ports along their side so several edges on one side fan out.
export function edgeCurve(lut, ax, ay, bx, by, offset = 0, oa = 0, ob = 0) {
  lut.segs = LUT_SEGS; lut.points = null;
  const dx = bx - ax, dy = by - ay;
  let p0x, p0y, p3x, p3y, c1x, c1y, c2x, c2y;
  if (Math.abs(dx) >= HALF * 1.6 || Math.abs(dx) >= Math.abs(dy) * 0.9) {
    const s = dx >= 0 ? 1 : -1;
    p0x = ax + s * HALF; p0y = ay + oa;
    p3x = bx - s * HALF; p3y = by + ob;
    const h = Math.max(36, Math.abs(p3x - p0x) * 0.5);
    c1x = p0x + s * h; c1y = p0y;
    c2x = p3x - s * h; c2y = p3y;
  } else {
    const s = dy >= 0 ? 1 : -1;
    p0x = ax + oa; p0y = ay + s * HALF;
    p3x = bx + ob; p3y = by - s * HALF;
    const h = Math.max(30, Math.abs(p3y - p0y) * 0.5);
    c1x = p0x; c1y = p0y + s * h;
    c2x = p3x; c2y = p3y - s * h;
  }
  if (offset) {
    // shift both control points sideways so a pair of opposite edges separates
    const l = Math.hypot(p3x - p0x, p3y - p0y) || 1;
    const nx = -(p3y - p0y) / l * offset, ny = (p3x - p0x) / l * offset;
    p0x += nx * 0.5; p0y += ny * 0.5; p3x += nx * 0.5; p3y += ny * 0.5;
    c1x += nx; c1y += ny; c2x += nx; c2y += ny;
  }
  lut.p0x = p0x; lut.p0y = p0y; lut.c1x = c1x; lut.c1y = c1y; lut.c2x = c2x; lut.c2y = c2y; lut.p3x = p3x; lut.p3y = p3y;
  const { xs, ys, cum } = lut;
  let len = 0;
  for (let i = 0; i <= LUT_SEGS; i++) {
    const t = i / LUT_SEGS, u = 1 - t;
    const x = u * u * u * p0x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p3x;
    const y = u * u * u * p0y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p3y;
    if (i > 0) len += Math.hypot(x - xs[i - 1], y - ys[i - 1]);
    xs[i] = x; ys[i] = y; cum[i] = len;
  }
  lut.len = len;
  lut.ver++;
  return lut;
}

// Point and unit tangent at arc length s. `hint` is a segment index to start from (monotonic walks).
export function lutAt(lut, s, out, hint = 0) {
  const { xs, ys, cum } = lut;
  const count = lut.segs || LUT_SEGS;
  if (s <= 0) { s = 0; hint = 0; }
  if (s >= lut.len) s = lut.len;
  let i = hint > 0 && hint < count && cum[hint] <= s ? hint : 0;
  while (i < count - 1 && cum[i + 1] < s) i++;
  const seg = cum[i + 1] - cum[i] || 1e-6;
  const t = (s - cum[i]) / seg;
  const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
  const l = Math.hypot(dx, dy) || 1;
  out.x = xs[i] + dx * t;
  out.y = ys[i] + dy * t;
  out.tx = dx / l;
  out.ty = dy / l;
  out.seg = i;
  return out;
}

export function distToLut(lut, x, y) {
  const { xs, ys } = lut;
  let best = Infinity, bestS = 0;
  for (let i = 0; i < (lut.segs || LUT_SEGS); i++) {
    const ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-6;
    let t = ((x - ax) * dx + (y - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; bestS = lut.cum[i] + (lut.cum[i + 1] - lut.cum[i]) * t; }
  }
  return { d: best, s: bestS };
}

export function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Round number 1, 2 or 5 × 10^k at or above x.
export function niceCeil(x) {
  if (!(x > 1)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
