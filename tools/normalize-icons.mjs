// One-time normaliser: element icons were drawn on a 48 grid; bring them to the shared 24 grid style.
// Run from the app folder: node tools/normalize-icons.mjs
import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('catalog/elements.json', 'utf8'));
const K = 2.25; // 2.25 on the 24 grid, drawn in a 0.5 scale group
for (const el of cat.elements) {
  const f = `assets/icons/${el.id}.svg`;
  let s = fs.readFileSync(f, 'utf8');
  if (/viewBox="0 0 24 24"/.test(s)) continue;
  let inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');
  inner = inner
    .replace(/stroke-width:\s*([\d.]+)/g, (_, w) => `stroke-width:${+(w * K).toFixed(2)}`)
    .replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${+(w * K).toFixed(2)}"`)
    .replace(/var\(--icon-fg\s*,\s*currentColor\)/g, 'currentColor')
    .replace(/var\(--icon-fg\)/g, 'currentColor')
    .replace(/var\(--icon-accent\s*,\s*currentColor\)/g, 'currentColor')
    .replace(/var\(--icon-accent\)/g, 'currentColor');
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square" stroke-linejoin="miter" role="img"><title>${el.name}</title><g transform="scale(.5)" stroke-width="4.5">${inner}</g></svg>\n`;
  fs.writeFileSync(f, out);
}
