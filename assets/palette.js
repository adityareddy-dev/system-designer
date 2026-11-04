// The palette tokens as numbers for PixiJS and Canvas 2D, plus status and request colour helpers.
import { TOKENS } from './tokens.js';

const CATS = ['clients', 'edge', 'compute', 'data', 'messaging', 'platform', 'ops', 'ai', 'external'];
const FAMS = ['read', 'write', 'media', 'trust', 'ai', 'realtime', 'background', 'attack'];
const BASE = {
  bg: '--bg', bg2: '--bg-2', canvas: '--canvas', gridDot: '--grid-dot', surfaceSolid: '--surface-solid', border: '--border',
  text: '--text', text2: '--text-2', text3: '--text-3', accent: '--accent', accent2: '--accent-2', ok: '--ok', warn: '--warn',
  hot: '--hot', bad: '--bad', info: '--info', edgeIdle: '--edge-idle', edgeFlow: '--edge-flow',
};

// '#RRGGBB' or 'rgba(r, g, b, a)' → { n: 0xRRGGBB, a }
function parse(v) {
  const s = String(v || '').trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return { n: parseInt(h.slice(0, 6), 16) || 0, a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { n: ((p[0] & 255) << 16) | ((p[1] & 255) << 8) | (p[2] & 255), a: p.length > 3 ? p[3] : 1 };
  }
  return { n: 0x808080, a: 1 };
}

const cache = new Map();

export function getPalette(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  if (cache.has(t)) return cache.get(t);
  const css = { ...TOKENS[t] };
  const hex = { cat: {}, req: {} };
  for (const [k, token] of Object.entries(BASE)) hex[k] = parse(css[token]).n;
  for (const c of CATS) hex.cat[c] = parse(css['--cat-' + c]).n;
  for (const f of FAMS) hex.req[f] = parse(css['--req-' + f]).n;
  const alpha = { gridDot: parse(css['--grid-dot']).a, border: parse(css['--border']).a, glass: parse(css['--surface']).a };
  const pal = Object.freeze({ theme: t, css, hex, alpha });
  cache.set(t, pal);
  return pal;
}

// Utilisation bands from world.sim.utilBands (ok 0.7, warn 0.9, hot 1.0).
export function statusOf(util, down = false, bands = { ok: 0.7, warn: 0.9, hot: 1 }) {
  if (down) return 'down';
  if (util >= bands.hot) return 'overload';
  if (util >= bands.warn) return 'hot';
  if (util >= bands.ok) return 'warn';
  return 'ok';
}

// Request type (object with `family`, or a family id) → 0xRRGGBB.
export function requestColor(palette, requestType) {
  const fam = typeof requestType === 'string' ? requestType : requestType?.family;
  return palette.hex.req[fam] ?? palette.hex.req.read;
}
