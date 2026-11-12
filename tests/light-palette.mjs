// Light text, status and request colors retain contrast on panels and canvas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPalette } from '../assets/palette.js';
const { css } = getPalette('light');
const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
const luminance = color => color.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const mix = (a, b, share) => a.map((c, i) => c * share + b[i] * (1 - share));
const surfaces = ['--bg', '--bg-2', '--canvas', '--surface-solid', '--surface-strong', '--accent-soft'];
const ink = Object.keys(css).filter(k => /^--(text(?:-[23])?|accent(?:-2)?|ok|warn|hot|bad|info|cat-.+|req-.+)$/.test(k));
for (const surface of surfaces) {
  const bg = rgb(css[surface]);
  for (const token of ink) assert(contrast(rgb(css[token]), bg) >= 4.5, `${token} on ${surface}`);
  assert(contrast(rgb(css['--border-strong']), bg) >= 3, 'control outlines on ' + surface);
}
for (const token of ['--ok', '--warn', '--bad']) {
  const fg = rgb(css[token]);
  assert(contrast(fg, mix(fg, rgb(css['--surface-solid']), .16)) >= 4.5, 'tinted verdict ' + token);
}
const shellCss = fs.readFileSync('ui/shell/shell.css', 'utf8');
const warningTint = Number(shellCss.match(/\.sh-badge--warn\s*\{[^}]*var\(--warn\)\s+(\d+)%/)[1]) / 100;
assert.equal(warningTint, .18, 'warning badge uses its actual 18% tint');
const warning = rgb(css['--warn']);
assert(contrast(warning, mix(warning, rgb(css['--surface-solid']), warningTint)) >= 4.5, 'warning badge contrast');
assert(contrast(rgb(css['--accent']), rgb('#FFFFFF')) >= 4.5);
assert(luminance(rgb(css['--canvas'])) >= luminance(rgb(css['--surface-solid'])) - 1e-9 && luminance(rgb(css['--canvas'])) > luminance(rgb(css['--bg'])), 'canvas and panels are the card colour, lighter than the paper');
assert.equal(css['--accent'], '#2850F5', 'the workbench blue');
assert.equal(css['--ink'], '#141414');
assert.equal(css['--paper'], '#FFF4E0');
const playCss = fs.readFileSync('ui/play/play.css', 'utf8');
const lightRule = sel => (playCss.split(':root[data-theme="light"] ' + sel + ' {')[1] || '').split('}')[0];
const tokenOf = (rule, prop) => rule.split(';').map(d => d.trim()).find(d => d.startsWith(prop + ':'))?.match(/var\((--[\w-]+)\)/)?.[1];
const offered = tokenOf(lightRule('.pl-tl-offered'), 'fill'), outline = tokenOf(lightRule('.pl-tl-offered'), 'stroke'), served = tokenOf(lightRule('.pl-tl-success'), 'fill');
assert(offered && outline && served, 'light day chart sets its own offered, outline and served colors');
assert.equal(tokenOf(lightRule('.pl-key--offered'), 'background'), offered, 'offered legend swatch matches the chart');
assert(/inset/.test(lightRule('.pl-key--offered')) && lightRule('.pl-key--offered').includes(`var(${outline})`), 'offered legend swatch shows the outline');
assert(playCss.includes(`.pl-key--ok { background: var(${served}); }`), 'served legend swatch matches the chart');
for (const surface of ['--bg', '--surface-solid']) {
  const bg = rgb(css[surface]);
  assert(contrast(rgb(css[served]), bg) >= 3, 'served band on ' + surface);
  assert(contrast(rgb(css[outline]), bg) >= 3, 'offered outline on ' + surface);
}
assert(contrast(rgb(css[served]), rgb(css[offered])) >= 3, 'served band against offered band');
assert(contrast(rgb(css[outline]), rgb(css[offered])) >= 3, 'offered outline against its band');
for (const file of fs.readdirSync('assets/scenes').filter(f => f.endsWith('.svg'))) {
  assert(!/#(?:F5F2E9|FFFEFA|EAE8DF)/i.test(fs.readFileSync('assets/scenes/' + file, 'utf8')), file + ' has no cream');
}
console.log('PASS light text, statuses, request shapes and controls meet contrast targets');
