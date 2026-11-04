// Builds the static asset modules from the SVG and CSS sources: assets/icons/data.js and assets/tokens.js.
// Run from the app folder after changing any icon or palette.css: node tools/gen-asset-modules.mjs
import fs from 'node:fs';

const index = JSON.parse(fs.readFileSync('assets/icons/index.json', 'utf8'));
const KEEP = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];
const attrTable = [];
const out = {};
const problems = [];

for (const ic of index.icons) {
  if (!fs.existsSync(ic.file)) { problems.push('missing ' + ic.file); continue; }
  const svg = fs.readFileSync(ic.file, 'utf8');
  const open = svg.match(/<svg\b([^>]*)>/);
  if (!open || !/viewBox="0 0 24 24"/.test(open[1])) { problems.push('viewBox ' + ic.file); continue; }
  const attrs = KEEP.map((k) => {
    const m = open[1].match(new RegExp(`\\s${k}="([^"]*)"`));
    return m ? `${k}="${m[1]}"` : '';
  }).filter(Boolean).join(' ');
  let inner = svg.slice(open.index + open[0].length).replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/g, '').trim();
  // Inline styles repeat what the outer svg and the scale group already set; drop the inherited parts.
  inner = inner.replace(/style="([^"]*)"/g, (m, s) => {
    const kept = s.split(';').map((x) => x.trim()).filter(Boolean)
      .filter((d) => !/^stroke:\s*currentColor$/.test(d) && !/^stroke-linecap:\s*round$/.test(d) && !/^stroke-linejoin:\s*round$/.test(d) && !/^stroke-width:\s*3\.5$/.test(d));
    return kept.length ? `style="${kept.join(';')}"` : '';
  }).replace(/\s+\/>/g, '/>').replace(/\s{2,}/g, ' ');
  let ai = attrTable.indexOf(attrs);
  if (ai < 0) { attrTable.push(attrs); ai = attrTable.length - 1; }
  out[ic.id] = [ai, inner];
}

const lines = Object.entries(out).map(([id, [a, s]]) => `  ${JSON.stringify(id)}: [${a}, ${JSON.stringify(s)}],`);
fs.writeFileSync('assets/icons/data.js',
  `// Icon data generated from the SVG files by tools/gen-asset-modules.mjs. Each entry is [attribute set, inner markup].\n` +
  `export const ATTRS = ${JSON.stringify(attrTable)};\n` +
  `export const ICONS = {\n${lines.join('\n')}\n};\n`);

// Palette tokens as plain strings for both themes, read from palette.css.
const css = fs.readFileSync('assets/palette.css', 'utf8');
const block = (sel) => {
  const i = css.indexOf(sel + ' {');
  if (i < 0) return {};
  const body = css.slice(i + sel.length + 2, css.indexOf('}', i));
  const o = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim();
  return o;
};
const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
fs.writeFileSync('assets/tokens.js',
  `// Palette tokens for both themes, generated from assets/palette.css by tools/gen-asset-modules.mjs.\n` +
  `export const TOKENS = ${JSON.stringify({ light, dark }, null, 1)};\n`);

const size = fs.statSync('assets/icons/data.js').size;
console.log(JSON.stringify({ icons: Object.keys(out).length, attrSets: attrTable.length, bytes: size, lightTokens: Object.keys(light).length, darkTokens: Object.keys(dark).length, problems }));
