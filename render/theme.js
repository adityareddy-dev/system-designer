// Turns the palette (ctx.palette() or the CSS tokens) into the plain numbers the scene draws with.

const BASE = {
  bg: '--bg', bg2: '--bg-2', canvas: '--canvas', gridDot: '--grid-dot', surfaceSolid: '--surface-solid',
  border: '--border', text: '--text', text2: '--text-2', text3: '--text-3', accent: '--accent', accent2: '--accent-2',
  ok: '--ok', warn: '--warn', hot: '--hot', bad: '--bad', info: '--info', edgeIdle: '--edge-idle', edgeFlow: '--edge-flow',
};
export const CATEGORY_IDS = ['clients', 'edge', 'compute', 'data', 'messaging', 'platform', 'ops', 'ai', 'external'];
export const FAMILY_IDS = ['read', 'write', 'media', 'trust', 'ai', 'realtime', 'background', 'attack'];

// '#abc', '#aabbcc', 'rgb(...)', 'rgba(...)' or a 0xRRGGBB number → { c: 0xRRGGBB, a: 0..1 }
export function parseColor(v, fallback = null) {
  if (typeof v === 'number' && Number.isFinite(v)) return { c: v & 0xffffff, a: 1 };
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(n)) return fallback;
    return { c: n, a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) {
      return { c: ((p[0] & 255) << 16) | ((p[1] & 255) << 8) | (p[2] & 255), a: p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1 };
    }
  }
  return fallback;
}

export const hexStr = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

// Token values for either theme, read straight from the stylesheet rules (`:root` and `:root[data-theme="dark"]`),
// so a theme can be prepared before the page switches to it.
function sheetTokens(theme) {
  if (typeof document === 'undefined') return null;
  const base = {}, dark = {};
  const take = (style, into) => {
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (name.startsWith('--')) into[name] = style.getPropertyValue(name).trim();
    }
  };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheets (fonts)
    for (const r of rules || []) {
      const sel = r.selectorText;
      if (!sel || !r.style) continue;
      if (sel === ':root') take(r.style, base);
      else if (/^:root\[data-theme=["']?dark["']?\]$/.test(sel)) take(r.style, dark);
    }
  }
  if (!base['--canvas']) return null;
  return theme === 'dark' ? { ...base, ...dark } : base;
}

function computedTokens(theme) {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const shown = root.dataset.theme || (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (shown !== theme) return null;
  const cs = getComputedStyle(root);
  if (!cs.getPropertyValue('--canvas').trim()) return null;
  return new Proxy({}, { get: (_, name) => cs.getPropertyValue(name).trim() || undefined });
}

// Accepts getPalette() output ({ hex, alpha, css }) or nothing, and returns a flat colour set.
export function resolvePalette(palette, theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  const hex = palette && palette.hex ? palette.hex : null;
  const cssMap = palette && palette.css ? palette.css : null;
  const live = computedTokens(t);
  let sheet;
  const fromCss = token => {
    let v = cssMap?.[token] || live?.[token];
    if (!v) { if (sheet === undefined) sheet = sheetTokens(t); v = sheet?.[token]; }
    return v;
  };
  const neutral = { c: t === 'dark' ? 0x8a8f99 : 0x6b7280, a: 1 };
  const pick = (key, token, group) => {
    const fromHex = group ? hex?.[group]?.[key] : hex?.[key];
    if (typeof fromHex === 'number') {
      const a = key === 'gridDot' ? palette?.alpha?.gridDot : key === 'border' ? palette?.alpha?.border : undefined;
      return { c: fromHex, a: typeof a === 'number' ? a : 1 };
    }
    return parseColor(fromCss(token), neutral);
  };
  const P = { theme: t, dark: t === 'dark', cat: {}, req: {} };
  for (const [k, token] of Object.entries(BASE)) {
    const v = pick(k, token);
    P[k] = v.c;
    if (k === 'gridDot') P.gridDotAlpha = v.a;
    if (k === 'border') P.borderAlpha = v.a;
  }
  for (const id of CATEGORY_IDS) P.cat[id] = pick(id, '--cat-' + id, 'cat').c;
  for (const id of FAMILY_IDS) P.req[id] = pick(id, '--req-' + id, 'req').c;
  // Neo-brutalist workbench palette: ink outlines, flat accent fills, hard shadows.
  P.ink = pick('ink', '--ink').c;
  P.card = pick('card', '--card').c;
  P.paper = pick('paper', '--paper').c;
  P.tomato = pick('tomato', '--tomato').c;
  P.blue = pick('blue', '--blue').c;
  P.yellow = pick('yellow', '--yellow').c;
  P.mint = pick('mint', '--mint').c;
  P.tomatoDeep = 0xd9401f; // hatch lines on a failed part
  P.mark = P.ink;
  P.onBlue = P.card;
  P.shadow = P.ink;
  P.shadowAlpha = 1;
  // Flat light fills for each category's header strip: ink text stays above 4.5:1 on every one of them.
  P.catFill = {
    clients: 0xe3dccb, edge: 0xbfd0ff, compute: P.mint, data: P.yellow, messaging: 0xf4b6c8,
    platform: 0xcfc4f5, ops: 0xbdebd3, ai: 0xe0bdf0, external: 0xbfe0f5,
  };
  return P;
}

export function statusColor(P, status) {
  return status === 1 ? P.warn : status === 2 ? P.hot : status >= 3 ? P.bad : P.ok;
}

export function severityColor(P, severity) {
  return severity >= 3 ? P.bad : severity === 2 ? P.hot : P.warn;
}

// Load bars: blue while it copes, yellow as it gets hot, tomato when it is over.
export function barColor(P, status, down = false) {
  return down || status >= 3 ? P.tomato : status >= 1 ? P.yellow : P.blue;
}
