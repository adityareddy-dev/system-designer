// Result card: draws a 1200 x 630 PNG with Canvas 2D, and hands it to the share sheet or downloads it.
import { getPalette } from '../assets/palette.js';
import { elementById, hexCss, fmtInt, fmtMoney, fmtPct } from './util.js';

const W = 1200, H = 630;
// The site's own faces (assets/fonts.css): Atkinson Hyperlegible in 400 and 700, IBM Plex Mono in 400.
const DISPLAY = '"Atkinson Hyperlegible", Arial, sans-serif';
const BODY = DISPLAY;
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
// Text keeps to x 76..1124 inside the panel. The architecture drawing gets the right half, above the four results.
const L = 76, R = W - 76;
const FRAME = { x: 560, y: 72, w: 564, h: 272 };
// The size to ask the canvas for: the frame's shape at twice its pixels, so the drawing stays sharp when it is fitted in.
export const THUMB = { width: FRAME.w * 2, height: FRAME.h * 2 };

function colors(palette) {
  const fallback = getPalette('light').css;
  const css = palette?.css || {};
  const hx = palette?.hex || {};
  const pick = (token, key, fb) => css[token] || (hx[key] != null ? hexCss(hx[key]) : palette?.theme === 'dark' ? fb : fallback[token] || fb);
  const dark = palette?.theme === 'dark';
  return {
    dark,
    bg: pick('--bg', 'bg', dark ? '#0A0E18' : '#F3F5FA'),
    bg2: pick('--bg-2', 'bg2', dark ? '#111827' : '#E8ECF5'),
    canvas: pick('--canvas', 'canvas', dark ? '#0C111D' : '#F6F8FC'),
    solid: pick('--surface-solid', 'surfaceSolid', dark ? '#151B2C' : '#FFFFFF'),
    border: pick('--border-strong', 'border', dark ? 'rgba(226,232,240,0.16)' : 'rgba(15,23,42,0.16)'),
    line: pick('--border', 'border', dark ? 'rgba(226,232,240,0.12)' : 'rgba(15,23,42,0.12)'),
    dot: pick('--grid-dot', 'gridDot', dark ? 'rgba(226,232,240,0.07)' : 'rgba(30,41,59,0.10)'),
    text: pick('--text', 'text', dark ? '#E7ECF6' : '#0E1525'),
    text2: pick('--text-2', 'text2', dark ? '#B4BDD0' : '#3A4458'),
    text3: pick('--text-3', 'text3', dark ? '#8B95AA' : '#6B7486'),
    accent: pick('--accent', 'accent', '#5146E5'),
    accent2: pick('--accent-2', 'accent2', '#0E9F94'),
    ok: pick('--ok', 'ok', '#138A4B'),
    warn: pick('--warn', 'warn', '#B7791F'),
    bad: pick('--bad', 'bad', '#C9372C'),
    cat: (id) => (hx.cat && hx.cat[id] != null ? hexCss(hx.cat[id]) : pick('--cat-' + id, '', '#64748B')),
  };
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function fit(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Wraps text onto at most maxLines lines; the last line is cut with an ellipsis only if it still does not fit.
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const rest = lines.splice(maxLines - 1).join(' '); lines.push(rest); }
  return lines.map((l) => fit(ctx, l, maxW));
}

function star(ctx, cx, cy, r, filled, c) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.46 : r;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  if (filled) { ctx.fillStyle = c.warn; ctx.fill(); }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = filled ? c.warn : c.text3;
  ctx.stroke();
}

// Status glyphs differ in shape as well as colour: circle with a tick, triangle, cross in a circle.
function glyph(ctx, kind, cx, cy, r, c) {
  const col = kind === 'ok' ? c.ok : kind === 'warn' ? c.warn : c.bad;
  ctx.save();
  ctx.fillStyle = col;
  // the mark inside: white on the deep light-theme colours, the panel colour on the pale dark-theme ones
  ctx.strokeStyle = c.dark ? c.solid : '#fff';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'warn') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 1.05, cy + r * 0.85);
    ctx.lineTo(cx - r * 1.05, cy + r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.3); ctx.lineTo(cx, cy + r * 0.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.58, 0.5, 0, 6.3); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    if (kind === 'ok') { ctx.moveTo(cx - r * 0.45, cy + r * 0.02); ctx.lineTo(cx - r * 0.1, cy + r * 0.36); ctx.lineTo(cx + r * 0.5, cy - r * 0.34); }
    else { ctx.moveTo(cx - r * 0.38, cy - r * 0.38); ctx.lineTo(cx + r * 0.38, cy + r * 0.38); ctx.moveTo(cx + r * 0.38, cy - r * 0.38); ctx.lineTo(cx - r * 0.38, cy + r * 0.38); }
    ctx.stroke();
  }
  ctx.restore();
}

function chipData(result, problem) {
  const slo = result.slo || {};
  const sc = result.score || {};
  const a = slo.availability || {};
  const l = slo.latency || {};
  const s = slo.safety || {};
  const co = slo.cost || {};
  const budget = co.budget ?? problem?.requirements?.budgetPerMonth ?? 0;
  const costState = !budget || co.perMonth <= budget ? 'ok' : co.perMonth <= budget * 1.25 ? 'warn' : 'bad';
  const lost = s.lostWrites || 0;
  // speed, safety and cost points count only for the share of requests served: say so instead of a bare red mark
  const served = a.actual ?? 1;
  const scaled = served < 0.999 ? `, but only ${fmtPct(served)} served` : '';
  const checks = result.checks || {};
  const safeOk = checks.safety ?? (sc.safety ?? 0) >= 150;
  const latOk = checks.latency ?? (l.shareOk ?? 0) >= 0.95;
  return [
    {
      label: 'Reliability', value: '≈ ' + fmtPct(a.actual), pts: sc.reliability, max: 400,
      sub: `target ${fmtPct(a.target)}`, state: a.actual >= a.target ? 'ok' : (sc.reliability ?? 0) >= 200 ? 'warn' : 'bad',
    },
    {
      label: 'Latency on time', value: fmtPct(l.shareOk ?? 0), pts: sc.latency, max: 200,
      sub: `worst ${fmtInt(l.worstP99Ms)} ms, goal ${goalTxt(l)}`, state: latOk ? (served < 0.999 ? 'warn' : 'ok') : (l.shareOk ?? 0) >= 0.7 ? 'warn' : 'bad',
    },
    {
      label: 'Data safety', value: lost > 0 ? '≈ ' + fmtInt(lost) + ' lost' : 'Nothing lost', pts: sc.safety, max: 200,
      sub: (s.duplicates ? '≈ ' + fmtInt(s.duplicates) + ' duplicates' : 'no duplicates') + (s.compliance?.failed?.length ? `, ${s.compliance.failed.length} audit fail` : '') + scaled,
      state: safeOk ? (served < 0.999 ? 'warn' : 'ok') : 'bad',
    },
    {
      label: 'Cost', value: '≈ ' + fmtMoney(co.perMonth) + '/mo', pts: sc.cost, max: 200,
      sub: (budget ? `budget ${fmtMoney(budget)}/mo` : 'no budget set') + scaled, state: costState === 'ok' && served < 0.999 ? 'warn' : costState,
    },
  ];
}

// Mini architecture drawing used when no scene thumbnail is supplied.
function drawMiniGraph(ctx, graph, catalog, c, x, y, w, h) {
  const nodes = graph?.nodes || [];
  if (!nodes.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const pad = 44;
  const sx = (w - pad * 2) / Math.max(1, x1 - x0);
  const sy = (h - pad * 2) / Math.max(1, y1 - y0);
  const s = Math.min(sx, sy, 0.9);
  const ox = x + w / 2 - ((x0 + x1) / 2) * s;
  const oy = y + h / 2 - ((y0 + y1) / 2) * s;
  const pos = new Map(nodes.map((n) => [n.id, [ox + n.x * s, oy + n.y * s, n]]));
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.dark ? 'rgba(226,232,240,0.38)' : 'rgba(30,41,59,0.36)';
  for (const e of graph.edges || []) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    ctx.setLineDash(e.kind && e.kind !== 'flow' ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.setLineDash([]);
  const r = Math.max(10, Math.min(22, 40 * s + 4));
  for (const [px, py, n] of pos.values()) {
    const cat = elementById(catalog, n.type)?.category || 'compute';
    ctx.fillStyle = c.solid;
    ctx.strokeStyle = c.cat(cat);
    ctx.lineWidth = 3;
    rrect(ctx, px - r, py - r, r * 2, r * 2, r * 0.45);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.cat(cat);
    ctx.beginPath(); ctx.arc(px, py, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const loads = ['700 40px "Atkinson Hyperlegible"', '400 16px "Atkinson Hyperlegible"', '400 14px "IBM Plex Mono"'].map((f) => document.fonts.load(f).catch(() => {}));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1200))]);
}

export async function renderCard({ result, problem, catalog, palette, thumbCanvas, date, url, name }) {
  await ensureFonts();
  const c = colors(palette);
  const canvas = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Background and soft glows
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c.bg); bg.addColorStop(1, c.bg2);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.dot;
  for (let gx = 20; gx < W; gx += 24) for (let gy = 20; gy < H; gy += 24) ctx.fillRect(gx, gy, 2, 2);
  for (const [gx, gy, col] of [[130, 60, c.accent], [1100, 580, c.accent2]]) {
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 380);
    g.addColorStop(0, col + (col.length === 7 ? '38' : '')); g.addColorStop(1, col.length === 7 ? col + '00' : 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Panel
  ctx.save();
  ctx.shadowColor = c.dark ? 'rgba(0,0,0,0.5)' : 'rgba(15,23,42,0.16)';
  ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = c.solid; rrect(ctx, 36, 32, W - 72, H - 64, 28); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = c.border; ctx.lineWidth = 1.5; rrect(ctx, 36, 32, W - 72, H - 64, 28); ctx.stroke();

  const score = result.score || {};
  const mode = result.mode || 'practice';
  const kicker = (mode === 'challenge' ? 'DAILY CHALLENGE' : mode === 'beat' ? 'BEAT MY DESIGN' : 'PRACTICE') + (date ? '  ·  ' + date : '');

  // Header: the column to the left of the drawing. A long title gets smaller before it wraps.
  const colW = FRAME.x - 32 - L;
  const kickerText = 'SYSTEM DESIGNER   ' + kicker;
  let ks = 15;
  ctx.font = `700 ${ks}px ${BODY}`;
  while (ks > 12 && ctx.measureText(kickerText).width > colW) { ks -= 0.5; ctx.font = `700 ${ks}px ${BODY}`; }
  ctx.fillStyle = c.accent;
  ctx.fillText(kickerText, L, 92);
  const title = problem?.title || result.problemId || 'System design';
  let ts = 42;
  ctx.font = `700 ${ts}px ${DISPLAY}`;
  while (ts > 30 && ctx.measureText(title).width > colW) { ts -= 2; ctx.font = `700 ${ts}px ${DISPLAY}`; }
  ctx.fillStyle = c.text;
  const titleLines = wrap(ctx, title, colW, 2);
  const tl = Math.round(ts * 1.18);
  titleLines.forEach((t, i) => ctx.fillText(t, L, 100 + ts + i * tl));
  let hy = 100 + ts + (titleLines.length - 1) * tl;
  const sub = [problem?.difficulty, problem?.like].filter(Boolean).join('  ·  ');
  if (sub) {
    ctx.fillStyle = c.text2; ctx.font = `400 17px ${BODY}`;
    const subLines = wrapLines(ctx, sub, colW, 2);
    subLines.forEach((t, i) => ctx.fillText(t, L, hy + 30 + i * 23));
    hy += 30 + (subLines.length - 1) * 23;
  }

  // Score dial: as large as the room under the header allows, with the stars and the verdict beside it
  const floor = FRAME.y + FRAME.h + 22;
  const top = hy + 20;
  const dr = Math.max(56, Math.min(96, (floor - top - 18) / 1.707));
  const k = dr / 98;
  const dlw = Math.round(18 * k);
  const dcx = L + dlw / 2 + dr;
  const dcy = top + Math.max(0, (floor - top - (dr * 1.707 + dlw)) / 2) + dlw / 2 + dr;
  ctx.lineWidth = dlw; ctx.lineCap = 'round';
  ctx.strokeStyle = c.dark ? 'rgba(226,232,240,0.10)' : 'rgba(15,23,42,0.08)';
  ctx.beginPath(); ctx.arc(dcx, dcy, dr, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  const frac = Math.max(0, Math.min(1, (score.total || 0) / 1000));
  const grad = ctx.createLinearGradient(dcx - dr, dcy + dr, dcx + dr, dcy - dr);
  grad.addColorStop(0, result.passed ? c.accent : c.warn); grad.addColorStop(1, result.passed ? c.accent2 : c.bad);
  ctx.strokeStyle = grad;
  if (frac > 0) { ctx.beginPath(); ctx.arc(dcx, dcy, dr, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * frac)); ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = c.text; ctx.font = `700 ${Math.round(58 * k)}px ${DISPLAY}`;
  ctx.fillText(fmtInt(score.total), dcx, dcy + 14 * k);
  ctx.fillStyle = c.text3; ctx.font = `400 ${Math.max(13, Math.round(16 * k))}px ${BODY}`;
  ctx.fillText('out of 1,000', dcx, dcy + 14 * k + Math.max(22, 28 * k));
  const sx = (dcx + dr + dlw / 2 + L + colW) / 2;
  const sy = dcy - dr * 0.146;
  for (let i = 0; i < 3; i++) star(ctx, sx + (i - 1) * 54, sy - 18, 20, i < (result.stars || 0), c);
  ctx.fillStyle = result.passed ? c.ok : c.warn; ctx.font = `700 17px ${BODY}`;
  ctx.fillText(result.passed ? 'Held the day' : 'Did not hold', sx, sy + 36);
  ctx.textAlign = 'left';

  // Architecture drawing: the canvas's own colour edge to edge, so the picture has no band around it
  const { x: tx, y: ty0, w: tw, h: th } = FRAME;
  ctx.save();
  rrect(ctx, tx, ty0, tw, th, 16);
  ctx.fillStyle = c.canvas; ctx.fill();
  ctx.clip();
  const tc = thumbCanvas;
  if (tc && tc.width && tc.height) {
    const s = Math.min(tw / tc.width, th / tc.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tc, tx + (tw - tc.width * s) / 2, ty0 + (th - tc.height * s) / 2, tc.width * s, tc.height * s);
  } else {
    drawMiniGraph(ctx, result.graph, catalog, c, tx, ty0, tw, th);
  }
  ctx.restore();
  ctx.strokeStyle = c.line; ctx.lineWidth = 1.5; rrect(ctx, tx, ty0, tw, th, 16); ctx.stroke();
  ctx.fillStyle = c.text3; ctx.font = `700 13px ${BODY}`;
  const caption = `ARCHITECTURE  ·  ${(result.graph?.nodes || []).length} elements`;
  ctx.fillText(caption, tx + 2, ty0 + th + 22);
  if (name) {
    const used = ctx.measureText(caption).width;
    ctx.textAlign = 'right'; ctx.fillStyle = c.text2; ctx.font = `700 16px ${BODY}`;
    ctx.fillText(fit(ctx, name, tw - used - 40), R - 2, ty0 + th + 22);
    ctx.textAlign = 'left';
  }

  // The four results in one row
  const chips = chipData(result, problem);
  const cy0 = 378, ch = 134, gap = 16, cw = (R - L - gap * 3) / 4;
  chips.forEach((chip, i) => {
    const x = L + i * (cw + gap), y = cy0;
    ctx.fillStyle = c.dark ? 'rgba(226,232,240,0.05)' : 'rgba(15,23,42,0.035)';
    rrect(ctx, x, y, cw, ch, 16); ctx.fill();
    ctx.strokeStyle = c.line; ctx.lineWidth = 1.5; rrect(ctx, x, y, cw, ch, 16); ctx.stroke();
    glyph(ctx, chip.state, x + 27, y + 27, 11, c);
    ctx.fillStyle = c.text3; ctx.font = `700 13px ${BODY}`;
    ctx.fillText(chip.label.toUpperCase(), x + 46, y + 32);
    ctx.fillStyle = c.text; ctx.font = `700 23px ${DISPLAY}`;
    ctx.fillText(fit(ctx, chip.value, cw - 36), x + 18, y + 65);
    ctx.fillStyle = c.text2; ctx.font = `400 13px ${BODY}`;
    wrapLines(ctx, chip.sub, cw - 36, 2).forEach((ln, j) => ctx.fillText(ln, x + 18, y + 85 + j * 16));
    ctx.fillStyle = c.text3; ctx.font = `400 13px ${MONO}`;
    ctx.fillText(`${fmtInt(chip.pts)} / ${chip.max} pts`, x + 18, y + ch - 12);
  });

  // Footer
  ctx.fillStyle = c.text; ctx.font = `700 24px ${DISPLAY}`;
  ctx.fillText(`Can you beat ${fmtInt(score.total)}?`, L, 546);
  ctx.fillStyle = c.text2; ctx.font = `400 15px ${MONO}`;
  let site = '', shortPath = '';
  try { const u = new URL(url); site = u.host; const m = /\/d\/(\d{4}-\d{2}-\d{2})\//.exec(u.pathname); if (m) shortPath = '/d/' + m[1]; } catch { site = ''; }
  // a daily result prints a short address anyone can type to play the same day; the design itself rides in the link
  const shown = shortPath ? `${site}${shortPath}  ·  play the same day` : url ? `${site || 'systemdesigner.io'}  ·  design link in the message` : 'Free and open source';
  ctx.fillText(fit(ctx, shown, 640), L, 574);
  ctx.textAlign = 'right'; ctx.fillStyle = c.text3; ctx.font = `400 13px ${BODY}`;
  ctx.fillText('Numbers are approximate, from a simulation.', R, 574);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    if (canvas.convertToBlob) canvas.convertToBlob({ type: 'image/png' }).then(resolve, reject);
    else canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png');
  });
}

function fileNameFor(title) {
  return 'system-designer-' + String(title || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.png';
}

// Returns 'shared', 'downloaded' or 'cancelled' (the person closed the share sheet).
export async function shareCard(blob, { title, text, url } = {}) {
  const file = typeof File === 'function' ? new File([blob], fileNameFor(title), { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  downloadCard(blob, title);
  return 'downloaded';
}

export function downloadCard(blob, title) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = fileNameFor(title);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

// the goals actually judged: one number, or the range when types keep their own budgets
function goalTxt(l) {
  const t = [...new Set(Object.values(l.byType || {}).map((v) => v.targetMs).filter((v) => v > 0))].sort((a, b) => a - b);
  return t.length > 1 ? `${fmtInt(t[0])} to ${fmtInt(t[t.length - 1])} ms by type` : `${fmtInt(l.targetMs)} ms`;
}
