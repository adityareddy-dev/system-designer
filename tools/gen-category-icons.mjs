// Draws the 9 category icons. Run from the app folder: node tools/gen-category-icons.mjs
import fs from 'node:fs';
const cats = JSON.parse(fs.readFileSync('catalog/elements.json', 'utf8')).categories;
const F = ' fill="currentColor" fill-opacity=".18"';
const p = (d, x = '') => `<path d="${d}"${x}/>`;
const r = (x, y, w, h, rx, e = F) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${e}/>`;
const c = (cx, cy, rr, e = '') => `<circle cx="${cx}" cy="${cy}" r="${rr}"${e}/>`;
const art = {
  clients: r(12, 4.5, 8.5, 16, 2.5) + p('M15.5 17.5h1.5') + c(7, 9.5, 2.8, ' fill="var(--icon-bg,transparent)"') + p('M2.5 20.5c0-3.2 2-5.6 4.5-5.6s4.5 2.4 4.5 5.6z', ' fill="var(--icon-bg,transparent)"'),
  edge: c(13.5, 12, 8, F) + p('M5.5 12h16M13.5 4c-3 3.2-3 12.8 0 16M13.5 4c3 3.2 3 12.8 0 16') + p('M1.5 12h4.5M4 9.8l2.2 2.2L4 14.2', ' stroke-width="2"'),
  compute: r(7, 7, 10, 10, 2) + r(10.5, 10.5, 3, 3, .8, '') + p('M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5'),
  data: p('M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13') + '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"' + F + '/>' + p('M5 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 14.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5'),
  messaging: r(8, 6.5, 13, 10.5, 2) + p('M8.5 8.2l6 4.6 6-4.6') + p('M1.5 10h3.5M2.5 14h2.5M4 18h5'),
  platform: p('M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z', F) + c(12, 10.5, 2) + p('M12 12.5v3.2'),
  ops: r(3, 4, 18, 12.5, 2.5) + p('M9 20.5h6M12 16.5v4') + p('M6 10.5h3l1.5-3 2.5 6 1.5-3H18'),
  ai: p('M12 2.5c.6 3.2 1.8 4.4 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.6 4.4-1.8 5-5z', F) + r(8, 15, 8, 5.5, 1.5) + p('M10.5 15v-2M13.5 15v-2M5.5 17.8H8M16 17.8h2.5'),
  external: p('M3.5 7.5h3.8a1.9 1.9 0 1 1 3.8 0H15v3.6a1.9 1.9 0 1 1 0 3.8V19H3.5z', F) + p('M18 12.5h3.5M19.5 10.5l2 2-2 2'),
};
fs.mkdirSync('assets/categories', { recursive: true });
for (const k of cats) {
  fs.writeFileSync(`assets/categories/${k.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square" stroke-linejoin="miter" role="img"><title>${k.name}</title>${art[k.id]}</svg>\n`);
}
