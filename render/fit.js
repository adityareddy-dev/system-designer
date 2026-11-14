// Fitting the diagram into the canvas that panels leave free.

// A corner panel (a folded card, a single button) does not take a whole band of the canvas. Each one is cleared either
// by starting below (or above) it or by starting beside it, whichever leaves the diagram largest. The diagram then sits
// in the middle of the free canvas and steps aside only as far as a panel in its way requires.
// box: world bounds { minX, minY, maxX, maxY }; view: { w, h } in screen px; base: insets { l, t, r, b } already
// holding the padding; blocks: screen rectangles { x, y, width, height }; gap: { x, y } clear space kept around a block.
// Returns insets that place the diagram exactly when handed to the camera's fit.
export function fitInsets(box, view, base, blocks = [], maxZ = Infinity, gap = { x: 12, y: 12 }) {
  const bw = Math.max(1, box.maxX - box.minX), bh = Math.max(1, box.maxY - box.minY);
  const start = { l: base.l || 0, t: base.t || 0, r: base.r || 0, b: base.b || 0 };
  if (!blocks.length) return start;
  let best = null, band = null;
  for (let mask = 0; mask < (1 << blocks.length); mask++) {
    const p = { ...start };
    blocks.forEach((block, i) => {
      const left = block.x + block.width / 2 < view.w / 2, top = block.y + block.height / 2 < view.h / 2;
      if ((mask >> i) & 1) {
        if (left) p.l = Math.max(p.l, block.x + block.width + gap.x); else p.r = Math.max(p.r, view.w - block.x + gap.x);
      } else if (top) p.t = Math.max(p.t, block.y + block.height + gap.y);
      else p.b = Math.max(p.b, view.h - block.y + gap.y);
    });
    const pw = view.w - p.l - p.r, ph = view.h - p.t - p.b;
    if (pw < 40 || ph < 40) continue;
    const zoom = Math.min(pw / bw, ph / bh, maxZ);
    if (!mask) band = { zoom, insets: p };
    if (!best || zoom > best.zoom + 1e-6 || (Math.abs(zoom - best.zoom) <= 1e-6 && pw * ph > best.area)) best = { zoom, area: pw * ph, insets: p };
  }
  if (!best) return start;
  // Centre in the whole free canvas, then move clear of any panel the diagram would touch.
  const w = bw * best.zoom, h = bh * best.zoom;
  const lo = { x: start.l, y: start.t }, hi = { x: view.w - start.r - w, y: view.h - start.b - h };
  if (hi.x < lo.x - 0.5 || hi.y < lo.y - 0.5) return best.insets;
  const rect = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, width: w, height: h };
  const hits = (block) => rect.x < block.x + block.width + gap.x && rect.x + w > block.x - gap.x && rect.y < block.y + block.height + gap.y && rect.y + h > block.y - gap.y;
  // When starting below (or above) the panels costs little size, the diagram keeps to the middle instead of stepping sideways.
  if (blocks.some(hits) && band && band.zoom >= best.zoom * 0.92) return band.insets;
  for (const block of blocks) {
    if (!hits(block)) continue;
    const left = block.x + block.width / 2 < view.w / 2, top = block.y + block.height / 2 < view.h / 2;
    const x = left ? block.x + block.width + gap.x : block.x - gap.x - w;
    const y = top ? block.y + block.height + gap.y : block.y - gap.y - h;
    const okX = x >= lo.x - 0.5 && x <= hi.x + 0.5, okY = y >= lo.y - 0.5 && y <= hi.y + 0.5;
    if (okX && (!okY || Math.abs(x - rect.x) <= Math.abs(y - rect.y))) rect.x = x;
    else if (okY) rect.y = y;
    else return best.insets;
  }
  if (blocks.some(hits)) return best.insets;
  return { l: rect.x, t: rect.y, r: view.w - rect.x - w, b: view.h - rect.y - h };
}

// A readable Fit can show only part of the graph. Place its window between cards,
// including their hard shadows, so the next column never leaves half a name at an edge.
export function fitPaperWindow(cards, view, { padding = 0, focusId } = {}) {
  const P = typeof padding === 'number' ? { l: padding, t: padding, r: padding, b: padding } : padding;
  const inside = (b, x, y) => b.x+x >= 1 && b.y+y >= 1 && b.x+x+b.width <= view.w-1 && b.y+y+b.height <= view.h-1;
  const hits = (b, x, y) => b.x+x < view.w && b.y+y < view.h && b.x+x+b.width > 0 && b.y+y+b.height > 0;
  const clear = (b, x, y) => b.x+x >= (P.l||0) && b.y+y >= (P.t||0) && b.x+x+b.width <= view.w-(P.r||0) && b.y+y+b.height <= view.h-(P.b||0) && !(P.blocks || []).some(k => b.x+x < k.x+k.width && b.x+x+b.width > k.x && b.y+y < k.y+k.height && b.y+y+b.height > k.y);
  if (cards.every(b => !hits(b, 0, 0) || (inside(b, 0, 0) && clear(b, 0, 0)))) return { x: 0, y: 0 };
  const candidates = (axis, size, extent, low, high) => [...new Set([0, ...cards.flatMap(b => [1-b[axis], extent-1-b[axis]-b[size], -1-b[axis]-b[size], extent+1-b[axis], low-b[axis], high-b[axis]-b[size]])])];
  const xs = candidates('x', 'width', view.w, P.l||1, view.w-(P.r||1)), ys = candidates('y', 'height', view.h, P.t||1, view.h-(P.b||1));
  let best = null;
  for (const x of xs) for (const y of ys) {
    const visible = cards.filter(b => hits(b, x, y));
    if (!visible.length || visible.some(b => !inside(b, x, y)) || (focusId && !visible.some(b => b.id === focusId && clear(b, x, y)))) continue;
    const free = visible.filter(b => clear(b, x, y)).length;
    const distance = Math.hypot(x, y);
    if (!best || free > best.free || (free === best.free && distance < best.distance)) best = { x, y, free, distance };
  }
  return best || { x: 0, y: 0 };
}
