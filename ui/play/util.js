// Small DOM and formatting helpers private to ui/play.
import { icon } from '../../assets/icons/index.js';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.length > 2 && k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(2)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const ic = (id, size = 18) => { try { return icon(id, { size }); } catch { return ''; } };
export function iconEl(id, size = 18, cls = 'pl-ic') {
  const s = h('span', { class: cls, 'aria-hidden': 'true' });
  s.innerHTML = ic(id, size);
  return s;
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e12) return trim(n / 1e12) + 'T';
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'k';
  if (a >= 1e3) return trim(n / 1e3) + 'k';
  if (a >= 100) return String(Math.round(n));
  if (a >= 10) return n.toFixed(0);
  return trim(n);
}
function trim(n) { return String(+n.toFixed(1)); }
export const fmtInt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-US'));
export const fmtUsd = (n) => (n == null ? '–' : '$' + Math.round(n).toLocaleString('en-US'));
export function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  if (ms >= 10000) return (ms / 1000).toFixed(0) + ' s';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + ' s';
  if (ms >= 100) return Math.round(ms) + ' ms';
  return (+ms.toFixed(1)) + ' ms';
}
export function fmtPct(x, digits) {
  if (x == null || Number.isNaN(x)) return '–';
  const p = x * 100;
  if (digits != null) return p.toFixed(digits) + '%';
  const d = p >= 99.99 ? 3 : p >= 99 ? 2 : 1;
  return String(+p.toFixed(d)) + '%';
}
export function clockLabel(ms) {
  const m = Math.floor(ms / 60000) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// The ≈ marker: always paired with a tooltip saying the figure is approximate.
export function approx(text) {
  return h('span', { class: 'pl-approx', tabindex: '0', title: 'approx.: a sensible real-world estimate, not an exact figure', text: '≈ ' + text });
}

// Fill {placeholders}; returns '' when any placeholder has no value.
export function fill(tpl, vars) {
  if (!tpl) return '';
  let missing = false;
  const out = tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars?.[k];
    if (v == null || v === '') { missing = true; return ''; }
    return String(v);
  });
  return missing ? '' : out;
}

export const STATUS_NAMES = ['ok', 'warn', 'hot', 'overload', 'down'];
export const STATUS_TEXT = { ok: 'Healthy', warn: 'Getting busy', hot: 'Very busy', overload: 'Overloaded', down: 'Down' };
const GLYPHS = {
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.6v.2"/>',
  hot: '<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.6v.2"/>',
  overload: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  down: '<circle cx="12" cy="12" r="9"/><path d="M5.6 18.4L18.4 5.6"/>',
};
export function statusGlyph(status, size = 16) {
  const s = h('span', { class: 'pl-glyph pl-st-' + status, 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[status] || GLYPHS.ok}</svg>`;
  return s;
}

export function snd(ctx, name, opts) { try { ctx.audio?.play(name, opts); } catch { /* sound is optional */ } }

// Plain "HH:MM" from a minute index.
export const minuteLabel = (i) => clockLabel(i * 60000);

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function prefersReduced(ctx) { try { return !!ctx.reducedMotion(); } catch { return false; } }
