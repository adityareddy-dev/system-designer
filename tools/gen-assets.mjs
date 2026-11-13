// Generates assets/requests, assets/ui SVG files, favicon and social preview. Event icons in assets/events are drawn by hand.
// Run from the app folder: node tools/gen-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (p, s) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

const F = ' fill="currentColor" fill-opacity=".18"';
const stroke = (inner, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square" stroke-linejoin="miter" role="img"><title>${title}</title>${inner}</svg>\n`;
const solid = (inner, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" role="img"><title>${title}</title>${inner}</svg>\n`;
const p = (d, extra = '') => `<path d="${d}"${extra}/>`;
const fp = d => p(d, F);
const c = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${extra}/>`;
const dot = (cx, cy, r = 1.1) => c(cx, cy, r, ' fill="currentColor" stroke="none"');
const rect = (x, y, w, h, rx, extra = F) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${extra}/>`;
const BG = ' fill="var(--icon-bg,transparent)"';
const poly = (n, r, rot = -90, cx = 12, cy = 12) => 'M' + Array.from({ length: n }, (_, i) => { const a = (rot + i * 360 / n) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`; }).join('L') + 'z';
const star = (n, ro, ri) => 'M' + Array.from({ length: n * 2 }, (_, i) => { const a = (-90 + i * 180 / n) * Math.PI / 180, r = i % 2 ? ri : ro; return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`; }).join('L') + 'z';

// ---------- request shapes (filled, readable at 10 px) ----------
const requests = {
  read: ['Read', c(12, 12, 9)],
  write: ['Write', rect(3.5, 3.5, 17, 17, 3, '')],
  upload: ['Upload', p('M12 3.5L21.5 20H2.5z')],
  stream: ['Stream chunk', rect(1.5, 6.5, 21, 11, 5.5, '')],
  live: ['Live segment', c(12, 12, 7.6, ' fill="none" stroke-width="3.6"')],
  search: ['Search', p('M12 2l10 10-10 10L2 12z')],
  report: ['Report', p(poly(8, 10, -67.5) + 'M7.5 9.6h9v1.7h-9zM7.5 12.8h9v1.7h-9z', ' fill-rule="evenodd"')],
  payment: ['Payment', p(poly(6, 10, 0) + 'M12 8.6a3.4 3.4 0 1 0 .01 0z', ' fill-rule="evenodd"')],
  login: ['Login', p(poly(5, 10.2, -90) + 'M10.6 10.2h2.8v6h-2.8z', ' fill-rule="evenodd"')],
  inference: ['Inference', p(star(5, 10.5, 4.6))],
  message: ['Message', p('M4 3.5h6l9 8.5-9 8.5H4l9-8.5z')],
  location: ['Location', p('M12 21.5L2.5 5h19z')],
  notify: ['Notification', p('M2.5 19a9.5 9.5 0 0 1 19 0z')],
  sync: ['Sync', p('M2 4l10 8L2 20zM22 4l-10 8 10 8z')],
  telemetry: ['Telemetry', rect(1.5, 9.5, 21, 5, 2.5, '')],
  event: ['Event', p('M9 2.5h6V9h6.5v6H15v6.5H9V15H2.5V9H9z')],
  batch: ['Batch', rect(3.5, 4.5, 17, 15, 2.5, ' fill-opacity=".3" stroke-width="2.2"') + p('M12 4.5v15M3.5 12h17', ' fill="none" stroke-width="2.2"')],
  webhook: ['Webhook', p('M6.5 4.5h11L22.5 19.5h-21z')],
  attack: ['Attack', p('M5 5l14 14M19 5L5 19', ' fill="none" stroke-width="4"')],
};
for (const [id, [title, inner]] of Object.entries(requests)) out(`assets/requests/${id}.svg`, solid(inner, title));

// ---------- event icons (stroke, 24x24) ----------
const eventIds = JSON.parse(fs.readFileSync(path.join(root, 'catalog/events.json'), 'utf8')).events.map((e) => e.id);

// ---------- ui glyphs ----------
const ui = {
  play: fp('M7 4.5v15l12.5-7.5z'),
  pause: fp('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'),
  step: fp('M5.5 5l9 7-9 7z') + p('M18.5 5v14'),
  speed: p('M4 17.5a8 8 0 1 1 16 0') + p('M12 17.5l4.2-5.5') + c(12, 17.5, 1.2, ' fill="currentColor"'),
  restart: p('M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5'),
  undo: p('M4 9h10a5.5 5.5 0 0 1 0 11h-4M8 5L4 9l4 4'),
  redo: p('M20 9H10a5.5 5.5 0 0 0 0 11h4M16 5l4 4-4 4'),
  delete: p('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5'),
  duplicate: rect(9, 9, 11, 11, 2) + p('M5 15V6a2 2 0 0 1 2-2h9'),
  connect: c(5, 12, 2.6, F) + c(19, 12, 2.6, F) + p('M7.6 12h8.8'),
  disconnect: c(4.5, 12, 2.4, F) + c(19.5, 12, 2.4, F) + p('M7 12h3M14 12h3M10.5 16l3-8'),
  search: c(10.5, 10.5, 6.5, F) + p('M15.5 15.5L21 21'),
  filter: fp('M3 5h18l-7 8.2V19l-4 2v-7.8z'),
  settings: c(12, 12, 3) + c(12, 12, 6.8) + p('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'),
  'theme-light': c(12, 12, 4, F) + p('M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6'),
  'theme-dark': fp('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),
  'theme-system': rect(3, 4.5, 18, 12, 2) + p('M8.5 20h7M12 16.5V20'),
  'sound-on': fp('M4 9.5v5h3.8L13 18.5v-13L7.8 9.5z') + p('M16.3 9.2a4 4 0 0 1 0 5.6M18.9 6.6a7.6 7.6 0 0 1 0 10.8'),
  'sound-off': fp('M4 9.5v5h3.8L13 18.5v-13L7.8 9.5z') + p('M16.5 9.5l4.5 5M21 9.5l-4.5 5'),
  hint: fp('M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2.2h5c0-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z') + p('M9.5 19h5M10.5 21.5h3'),
  editorial: fp('M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z') + p('M4 20a2 2 0 0 0 2 2h13v-4M8.5 7.5h6'),
  share: c(18, 5.5, 2.6, F) + c(6, 12, 2.6, F) + c(18, 18.5, 2.6, F) + p('M8.3 10.7l7.4-4M8.3 13.3l7.4 4'),
  copy: rect(8, 8, 12, 12, 2) + p('M4 16V6a2 2 0 0 1 2-2h10'),
  download: p('M12 4v11M7.5 10.5L12 15l4.5-4.5M4 20h16'),
  close: p('M6 6l12 12M18 6L6 18'),
  back: p('M19 12H5M11 6l-6 6 6 6'),
  home: fp('M5 10.5V20h14v-9.5L12 4z') + p('M3.5 11.5L12 4l8.5 7.5M10 20v-5h4v5'),
  learn: fp('M2 9l10-5 10 5-10 5z') + p('M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M22 9v6'),
  practice: c(12, 12, 9, F) + c(12, 12, 5) + dot(12, 12, 1.4),
  challenge: fp('M5 21V4h12l-2 4.2L17 12H5') + p('M5 21V4'),
  sandbox: fp('M12 3l8 4.5v9L12 21l-8-4.5v-9z') + p('M4 7.5l8 4.5 8-4.5M12 12v9'),
  trophy: fp('M8 4h8v6a4 4 0 0 1-8 0z') + p('M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 14v4M8 21h8M9.5 18h5'),
  star: p('M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.6l6.3-.9z', ' fill="currentColor"'),
  'star-empty': p('M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.6l6.3-.9z'),
  streak: fp('M12 3c.8 3.8 5.2 5.2 5.2 10a5.2 5.2 0 0 1-10.4 0c0-2 .9-3.2 2.1-4.3.1 1.8.9 2.8 1.9 3.1C10.2 8.4 10.6 5.4 12 3z'),
  check: p('M5 12.5l4.5 4.5L19 7'),
  warn: fp('M12 3.5L21.5 20h-19z') + p('M12 10v4.5M12 17.4h.01'),
  error: fp(poly(8, 9.6, -67.5)) + p('M9 9l6 6m0-6l-6 6'),
  info: c(12, 12, 9, F) + p('M12 11v5.2M12 7.8h.01'),
  lock: rect(5.5, 11, 13, 9.5, 2) + p('M8.5 11V8a3.5 3.5 0 0 1 7 0v3'),
  unlock: rect(5.5, 11, 13, 9.5, 2) + p('M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'),
  'zoom-in': c(10.5, 10.5, 6.5, F) + p('M15.5 15.5L21 21M10.5 8v5M8 10.5h5'),
  'zoom-out': c(10.5, 10.5, 6.5, F) + p('M15.5 15.5L21 21M8 10.5h5'),
  fit: p('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'),
  grid: rect(3.5, 3.5, 7, 7, 1.5, '') + rect(13.5, 3.5, 7, 7, 1.5, '') + rect(3.5, 13.5, 7, 7, 1.5, '') + rect(13.5, 13.5, 7, 7, 1.5, ''),
  region: c(12, 12, 9, F) + p('M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18'),
  zone: rect(3.5, 3.5, 17, 17, 3, ' stroke-dasharray="3 3"') + c(12, 12, 2.4, F),
  units: fp('M12 3l9 5-9 5-9-5z') + p('M3 12.2l9 5 9-5M3 16.2l9 5 9-5'),
  clock: c(12, 12, 9, F) + p('M12 7v5.2l3.2 1.8'),
  cost: c(12, 12, 9, F) + p('M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.4M12 6v2M12 16v2'),
  latency: c(12, 13.5, 7.5, F) + p('M12 13.5l3-3M9.5 3h5M12 3v3'),
  availability: p('M3 12h4l2-6 4 12 2-6h6'),
  safety: fp('M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z') + p('M8.5 12l2.5 2.5 4.5-5'),
  budget: fp('M4 7.5h14a2 2 0 0 1 2 2V19H6a2 2 0 0 1-2-2z') + p('M4 7.5V6a2 2 0 0 1 2-2h10.5M16 14h.01'),
  users: c(9, 8, 3.5, F) + p('M2.5 20a6.5 6.5 0 0 1 13 0M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.2A6 6 0 0 1 21.5 20'),
  rps: p('M3 12h10M9.5 6.5l5.5 5.5-5.5 5.5M19 5v14'),
  calendar: rect(3.5, 5, 17, 15.5, 2.5) + p('M3.5 10h17M8 3v4M16 3v4'),
  hot: fp('M13.5 2.5L5 13.5h6l-1 8 9-11.5h-6z'),
  shield: fp('M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z'),
  link: p('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'),
  menu: p('M4 7h16M4 12h16M4 17h16'),
  more: dot(5, 12, 1.6) + dot(12, 12, 1.6) + dot(19, 12, 1.6),
  'chevron-left': p('M15 5l-7 7 7 7'),
  'chevron-right': p('M9 5l7 7-7 7'),
  'chevron-up': p('M5 15l7-7 7 7'),
  'chevron-down': p('M5 9l7 7 7-7'),
  plus: p('M12 5v14M5 12h14'),
  minus: p('M5 12h14'),
  drag: [8, 16].flatMap(x => [6, 12, 18].map(y => dot(x, y, 1.4))).join(''),
  keyboard: rect(2.5, 6, 19, 12, 2.5) + p('M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.5h8'),
  motion: p('M3 12c3-7.5 6-7.5 9 0s6 7.5 9 0'),
  contrast: c(12, 12, 9) + p('M12 3a9 9 0 0 0 0 18z', ' fill="currentColor"'),
  external: p('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
  ghost: fp('M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2z') + dot(9.5, 10.5) + dot(14.5, 10.5),
  verified: c(12, 12, 9, F) + p('M8 12.2l2.9 2.9 5.2-5.6'),
  approx: p('M4 9.5c2.7-3 5.3 3 8 0s5.3 3 8 0M4 15.5c2.7-3 5.3 3 8 0s5.3 3 8 0'),
};
for (const [id, inner] of Object.entries(ui)) out(`assets/ui/${id}.svg`, stroke(inner, id.replace(/-/g, ' ')));

// ---------- favicon: ink square, cream links, three dots ----------
const MARK = '<rect x="2" y="2" width="28" height="28" rx="6" fill="#141414"/><path d="M11 14 20 10M11 18l9 4" stroke="#FFF4E0" stroke-width="2"/><circle cx="8.5" cy="16" r="3.5" fill="#FFC93C"/><circle cx="23" cy="8.5" r="3.5" fill="#FF5B3A"/><circle cx="23" cy="23.5" r="3.5" fill="#2D5BFF"/>';
out('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${MARK}</svg>\n`);

// ---------- social preview 1200x630 ----------
const SG = "font-family=\"'Space Grotesk', system-ui, sans-serif\"";
const SM = "font-family=\"'Space Mono', ui-monospace, monospace\"";
const box = (x, y, w, h, fill = '#FFFCF4', sh = 5, rx = 8) => `<rect x="${x + sh}" y="${y + sh}" width="${w}" height="${h}" rx="${rx}" fill="#141414"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="#141414" stroke-width="3"/>`;
const replica = (y, label, load, fill) => `${box(640, y, 250, 52, '#FFFCF4', 5, 6)}<text x="658" y="${y + 33}" ${SM} font-size="20" font-weight="700" fill="#141414">${label}</text><rect x="752" y="${y + 17}" width="120" height="18" fill="#FFFCF4" stroke="#141414" stroke-width="2.5"/><rect x="752" y="${y + 17}" width="${load}" height="18" fill="${fill}" stroke="#141414" stroke-width="2.5"/>`;
const wire = (y) => `<path d="M400 420H520V${y}H636" fill="none" stroke="#141414" stroke-width="3.5"/><path d="M628 ${y - 8}L640 ${y}L628 ${y + 8}" fill="none" stroke="#141414" stroke-width="3.5"/>`;
out('assets/social-preview.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<title>System Designer: build the system, survive the day</title>
<defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.6" fill="#141414" fill-opacity=".18"/></pattern></defs>
<rect width="1200" height="630" fill="#FFF4E0"/><rect width="1200" height="630" fill="url(#dots)"/>
<rect x="68" y="58" width="1072" height="500" rx="10" fill="#141414"/>
<rect x="60" y="50" width="1072" height="500" rx="10" fill="#FFFCF4" stroke="#141414" stroke-width="4"/>
<rect x="104" y="188" width="560" height="22" fill="#FFC93C"/>
<text x="104" y="160" ${SG} font-weight="700" font-size="76" fill="#141414" letter-spacing="-2">Build the system.</text>
<text x="104" y="242" ${SG} font-weight="700" font-size="76" fill="#141414" letter-spacing="-2">Survive the day.</text>
<text x="106" y="296" ${SM} font-size="24" fill="#33312C">System Designer. Practice in your browser.</text>
<g transform="rotate(4 978 112)"><rect x="906" y="82" width="148" height="62" rx="8" fill="#141414" transform="translate(6 6)"/><rect x="906" y="82" width="148" height="62" rx="8" fill="#FF5B3A" stroke="#141414" stroke-width="4"/><text x="980" y="126" text-anchor="middle" ${SG} font-weight="700" font-size="38" fill="#141414">Free</text></g>
<g fill="#141414"><circle cx="124" cy="390" r="9"/><circle cx="124" cy="420" r="9" fill="#FFC93C" stroke="#141414" stroke-width="3"/><circle cx="124" cy="450" r="9"/></g>
<path d="M150 420H236" fill="none" stroke="#141414" stroke-width="3.5"/>
${box(240, 372, 160, 96, '#FFC93C', 6, 8)}<text x="320" y="428" text-anchor="middle" ${SM} font-size="26" font-weight="700" fill="#141414">LB</text>
${wire(356)}${wire(420)}${wire(484)}
${replica(330, 'app-1', 66, '#2D5BFF')}${replica(394, 'app-2', 62, '#2D5BFF')}${replica(458, 'app-3', 70, '#2D5BFF')}
<rect x="448" y="410" width="20" height="20" fill="#2D5BFF" stroke="#141414" stroke-width="3"/><rect x="570" y="346" width="20" height="20" fill="#2D5BFF" stroke="#141414" stroke-width="3"/><rect x="570" y="474" width="20" height="20" fill="#2D5BFF" stroke="#141414" stroke-width="3"/>
<text x="934" y="420" ${SM} font-size="22" fill="#33312C">1/3 each</text>
<g ${SM} font-size="22" font-weight="700" fill="#141414"><text x="68" y="586">Learn</text><text x="176" y="586">Practice</text><text x="322" y="586">Sandbox</text></g>
</svg>
`);

out('assets/assets-index.json', JSON.stringify({ requests: Object.keys(requests), events: eventIds, ui: Object.keys(ui), favicon: 'assets/favicon.svg', social: 'assets/social-preview.svg' }, null, 1) + '\n');
console.log(Object.keys(requests).length, eventIds.length, Object.keys(ui).length);
