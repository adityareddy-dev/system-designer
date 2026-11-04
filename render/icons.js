// Loads our SVG icons from the asset library and rasterises them to canvases for textures.

const INDEX_URL = new URL('../assets/icons/index.json', import.meta.url);
const APP_ROOT = new URL('../', import.meta.url);

// A release build also ships every icon in one file (tools/release.mjs); the per-icon files are the fallback.
const PACK_URL = new URL('../assets/icons/pack.json', import.meta.url);
let packPromise = null;
function loadPack() {
  // Only a release build has a pack (its index says so); a plain checkout would answer 404.
  if (!packPromise) packPromise = loadIndexJson().then(j => (j.pack ? fetch(PACK_URL).then(r => (r.ok ? r.json() : null)) : null)).catch(() => null);
  return packPromise;
}

let indexJson = null;
const svgCache = new Map(); // id → Promise<string | null>

function loadIndexJson() {
  if (!indexJson) indexJson = fetch(INDEX_URL).then(r => (r.ok ? r.json() : { icons: [] })).catch(() => ({ icons: [] }));
  return indexJson;
}
function loadIndex() {
  return loadIndexJson().then(j => new Map((j.icons || []).map(i => [i.id, i.file])));
}

// Full SVG markup for an icon id such as 'el.cache', 'req.read' or 'ev.hot-key'; null when missing.
export function iconSvg(id) {
  if (!svgCache.has(id)) {
    svgCache.set(id, loadPack().then(pack => pack && pack[id] ? pack[id] : loadIndex().then(idx => {
      const file = idx.get(id);
      if (!file) return null;
      return fetch(new URL(file, APP_ROOT)).then(r => (r.ok ? r.text() : null)).catch(() => null);
    })));
  }
  return svgCache.get(id);
}

// Colours the markup: currentColor follows `color`, icon background knock-outs use `bg`.
function prepare(svg, color, bg, size) {
  let s = svg.replace(/<title>[\s\S]*?<\/title>/g, '');
  s = s.replace(/var\(\s*--icon-bg\s*,[^)]*\)/g, bg).replace(/var\(\s*--icon-fill\s*,[^)]*\)/g, color);
  s = s.replace(/currentColor/g, color);
  s = s.replace(/<svg\b([^>]*)>/, (m, attrs) => {
    const a = attrs.replace(/\s(width|height|color)="[^"]*"/g, '');
    return `<svg${a} width="${size}" height="${size}" color="${color}">`;
  });
  return s;
}

function decode(svg) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// → HTMLImageElement of the icon drawn at `size` px in `color`, or null.
export async function iconImage(id, color, bg, size) {
  const svg = await iconSvg(id);
  if (!svg) return null;
  return decode(prepare(svg, color, bg, size));
}
