// Generates assets/requests, assets/events, assets/ui SVG files, favicon and social preview.
// Run from the app folder: node tools/gen-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (p, s) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

const F = ' fill="currentColor" fill-opacity=".18"';
const stroke = (inner, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img"><title>${title}</title>${inner}</svg>\n`;
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
const events = {
  'viral-spike': p('M4 15l5-5 4 4 7-8') + p('M15 6h5v5') + p('M5 19.5h3M10.5 19.5h3M16 19.5h3'),
  'flash-crowd': [[4, 5], [7, 9], [4, 13], [7, 17]].map(([x, y]) => c(x, y, 1.5, F)).join('') + p('M10 12h5M13 9.5l2.5 2.5-2.5 2.5') + p('M18.5 4v5.5M18.5 14.5V20'),
  'deadline-surge': fp('M4 6h16v14H4z') + p('M4 10.5h16M8 3.5v4M16 3.5v4') + p('M12 18.2v-5M9.7 15.3L12 13l2.3 2.3'),
  'hot-key': c(8, 15, 3.8, F) + p('M10.8 12.2L19 4M16 7l2.2 2.2M18 5l2 2') + p('M5 4c-1 1 1 1.6 0 3M9 3c-1 1 1 1.6 0 3'),
  'celebrity-fanout': c(7, 12, 3.8, ' fill="currentColor" fill-opacity=".35"') + p('M10.8 12h7.7M10.4 10.2l7.2-4M10.4 13.8l7.2 4') + c(20, 12, 1.3) + c(19.3, 5.4, 1.3) + c(19.3, 18.6, 1.3),
  'cache-stampede': p('M11 2.5L5 12.5h5.5') + p('M13.5 11.5H19l-6 10') + p('M17.5 3v5M15.5 6l2 2 2-2'),
  'db-failover': fp('M3 6.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 2-3 2-3-.9-3-2zM3 6.5v9c0 1.1 1.3 2 3 2s3-.9 3-2v-9') + fp('M15 6.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 2-3 2-3-.9-3-2zM15 6.5v9c0 1.1 1.3 2 3 2s3-.9 3-2v-9') + p('M9.5 20.5c2 .8 4 .8 5.5 0M13 18.5l2 2-2.2 1.6'),
  'replication-lag': c(6.5, 12, 4.6, F) + c(17.5, 12, 4.6) + p('M6.5 9.3V12l2.1 1.4M17.5 9.3V12h-2'),
  'zone-outage': p('M2.5 20V10h5v10M9.5 20V6h5v14M16.5 20V10h5v10M2 20h20') + p('M9.5 8l5 10M14.5 8l-5 10'),
  'region-outage': c(12, 12, 9) + p('M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18') + p('M5 5l14 14', ' stroke-width="2.4"'),
  'slow-dependency': fp('M3 19h13c2.5 0 4-1.3 4-3.5V14M3 19c0-3 2-5 5-5') + c(9.5, 11, 4, F) + p('M9.5 11.5a1.2 1.2 0 1 0-1.2-1.2') + c(18.5, 5.5, 2.6) + p('M18.5 4.3v1.4l1 .6'),
  'dependency-outage': fp('M5 5h5a2 2 0 1 1 4 0h5v5a2 2 0 1 0 0 4v5H5z') + p('M12 9l-2 3.2 3.2 1-1.6 3.8'),
  'retry-storm': p('M15 12a3 3 0 1 1-3-3M18 12a6 6 0 1 1-6-6M21 12a9 9 0 1 1-9-9') + p('M10.5 7.5L12 9l-1.5 1.5M10.5 4.5L12 6l-1.5 1.5'),
  'thundering-herd': p('M3 3l6.5 6.5M9.5 6v3.5H6M21 3l-6.5 6.5M14.5 6v3.5H18M3 21l6.5-6.5M9.5 18v-3.5H6M21 21l-6.5-6.5M14.5 18v-3.5H18') + c(12, 12, 1.8, ' fill="currentColor"'),
  'cost-blowout': c(10, 14, 6.5, F) + c(10, 14, 3) + p('M16 9l5-5.5M16.8 3.5h4.2v4.2'),
  'compliance-audit': rect(4, 4.5, 12, 16, 2) + p('M8.5 3h5v3h-5z') + p('M7.5 10.5l1.8 1.8 3.2-3.4') + c(16.5, 16.5, 3.6, BG) + p('M19.2 19.2L22 22'),
  'ddos-attack': fp('M12 22c4-1.5 6-4 6-8v-3.5l-6-2.5-6 2.5V14c0 4 2 6.5 6 8z') + p('M3.5 2.5l3 3m0-3l-3 3M10.5 1.5l3 3m0-3l-3 3M17.5 2.5l3 3m0-3l-3 3'),
  'bot-scraping': rect(3, 7.5, 11, 9, 2.2) + p('M8.5 7.5V4.5') + c(8.5, 3.8, 0.9) + dot(6.3, 11.5, 1.1) + dot(10.7, 11.5, 1.1) + p('M6.3 14h4.4') + c(17, 16, 3.3) + p('M19.5 18.5L22 21'),
  'bad-deploy': fp('M12 3l8 4v10l-8 4-8-4V7z') + p('M4 7l8 4 8-4M12 11v10') + c(18.5, 18.5, 4, BG) + p('M18.5 16.2v2.6M18.5 20.6h.01'),
  'bad-config-push': p('M3 9.5h18M3 14.5h18M3 19.5h18') + c(8, 9.5, 2, F) + c(13, 14.5, 2, F) + c(19.5, 19.5, 2, ' fill="currentColor"') + p('M19 2l3 5.3h-6z') + p('M19 4.4v1.2'),
  'noisy-neighbor': fp('M2 20v-7l3.5-3.5L9 13v7z') + fp('M15 20v-7l3.5-3.5L22 13v7z') + p('M10.8 12c1 1 1 3.4 0 4.4M12.6 10.6c1.7 1.6 1.7 5.2 0 6.8'),
  'memory-leak': rect(2.5, 4.5, 15, 7, 1.5) + p('M5.5 11.5v2M8.5 11.5v2M11.5 11.5v2M14.5 11.5v2M5.5 8h3M11 8h3') + fp('M19 13.5c-1.6 2-2.5 3.2-2.5 4.3a2.5 2.5 0 0 0 5 0c0-1.1-.9-2.3-2.5-4.3z'),
  'disk-full': rect(3, 5.5, 18, 13, 2.5) + p('M6 9.5h12', ' stroke-width="2.6"') + p('M6 15h6') + dot(17, 15, 1.2),
  'cold-start': p('M8 3v12M2.8 6l10.4 6M2.8 12l10.4-6') + p('M6.5 3.8L8 5.3l1.5-1.5M6.5 14.2L8 12.7l1.5 1.5') + fp('M18.5 11l-3.5 5.5h3.2l-1.7 5.5 5-7.5h-3.2z'),
  'poison-message': rect(2.5, 5.5, 19, 13, 2) + p('M2.8 7.5L12 14l9.2-6.5') + p('M18 11.5l4.2 7.5h-8.4z', BG) + p('M18 14.4v2.2M18 18h.01'),
  'duplicate-delivery': p('M7 6h12a1.5 1.5 0 0 1 1.5 1.5V15') + rect(3, 9, 14, 10, 1.8) + p('M3.3 10.8L10 15.5l6.7-4.7'),
  'network-partition': c(5, 12, 3, F) + c(19, 12, 3, F) + p('M8 12h2.8l1-3.2M12.2 15.2l1-3.2H16'),
  'cert-expiry': rect(3, 3.5, 18, 12.5, 2) + p('M7 7.5h10M7 11h5M8 16v5l2-1.4 2 1.4v-5') + c(17.5, 17.5, 4, BG) + p('M17.5 15.2v2.3'),
  'dns-misconfig': p('M12 3v18M8.5 21h7') + fp('M19 5H8L5 8l3 3h11z') + p('M14 14.5l4 4m0-4l-4 4'),
  'third-party-rate-limit': p('M4 17.5a8 8 0 1 1 16 0') + p('M12 17.5l4.2-5.2M17.6 8.4a8 8 0 0 1 2.4 9.1', ' stroke-width="2.4"') + c(12, 17.5, 1.1, ' fill="currentColor"') + p('M7 21h10M7 6.5l1.4 1.4M12 4.5v2'),
  'data-corruption': fp('M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6') + p('M13.5 9l-3.5 4.2 3.5 1-2.2 5.8'),
  'cardinality-explosion': p('M3 3v18h18') + p('M5.5 17.5L10 13') + p('M10 13L19 5M10 13l10-1M10 13l9 5M10 13l6-8M10 13l9-3.5M10 13l7 7'),
  'key-leak': rect(3, 10.5, 11, 10, 2) + p('M6 10.5V7.5a3.3 3.3 0 0 1 6.2-1.6') + p('M8.5 14.6v2.2') + c(19, 12, 2.4) + p('M19 14.4v6.1M19 17.5h2.5M19 20.5h2'),
  'gpu-shortage': rect(2.5, 7, 13, 10, 2) + p('M6 4v3M9 4v3M12 4v3M6 17v3M9 17v3M12 17v3') + c(9, 12, 2.4) + rect(18, 8, 3.5, 8, 1, ' stroke-dasharray="2 2.4"'),
  'schema-migration-lock': rect(3, 4, 16, 14, 2) + p('M3 9h16M3 13.5h16M9.5 4v14') + rect(14, 15, 8, 6, 1.5, BG) + p('M16 15v-1.5a2 2 0 0 1 4 0V15'),
  'overseas-launch': c(8, 16.5, 4.8, F) + p('M3.2 16.5h9.6M8 11.7c1.6 2 1.6 7.6 0 9.6M8 11.7c-1.6 2-1.6 7.6 0 9.6') + p('M21 3l-8 13-2.2-5.3L5.5 8.5z') + p('M10.8 10.7L21 3'),
};
for (const [id, inner] of Object.entries(events)) out(`assets/events/${id}.svg`, stroke(inner, id.replace(/-/g, ' ')));

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

// ---------- favicon ----------
out('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5146E5"/><stop offset="1" stop-color="#0E9F94"/></linearGradient>
<radialGradient id="h"><stop offset="0" stop-color="#FFB27A" stop-opacity=".95"/><stop offset="1" stop-color="#FF8A4C" stop-opacity="0"/></radialGradient></defs>
<rect width="64" height="64" rx="16" fill="url(#g)"/>
<circle cx="32" cy="20" r="14" fill="url(#h)"/>
<path d="M13 46C24 46 22 20 32 20s9 26 20 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-opacity=".92"/>
<circle cx="13" cy="46" r="5" fill="#fff"/><circle cx="52" cy="46" r="5" fill="#fff"/><circle cx="32" cy="20" r="6" fill="#FF8A4C" stroke="#fff" stroke-width="2.5"/>
</svg>
`);

// ---------- social preview 1200x630 ----------
const node = (x, y, r, col, glow) => `${glow ? `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="url(#glow)"/>` : ''}<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="${(r * 0.38).toFixed(1)}" fill="#151B2C" stroke="${col}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(1)}" fill="${col}"/>`;
const route = 'M120 480C300 480 270 380 430 380S560 470 700 440 860 300 980 300 1070 360 1120 360';
out('assets/social-preview.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<title>System Designer: build the system, survive the day</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A0E18"/><stop offset="1" stop-color="#16203A"/></linearGradient>
<linearGradient id="path" gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="1120" y2="0"><stop offset="0" stop-color="#8B85FF"/><stop offset=".55" stop-color="#2DD4BF"/><stop offset="1" stop-color="#FF8A4C"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#FF8A4C" stop-opacity=".55"/><stop offset="1" stop-color="#FF8A4C" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#E2E8F0" fill-opacity=".07"/></pattern>
<filter id="soft" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#dots)"/>
<path d="${route}" fill="none" stroke="url(#path)" stroke-width="16" stroke-linecap="round" opacity=".55" filter="url(#soft)"/>
<path d="${route}" fill="none" stroke="url(#path)" stroke-width="5" stroke-linecap="round"/>
<path d="M430 380C500 380 560 300 650 250M700 440C760 500 840 520 900 520" fill="none" stroke="#46516A" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 10"/>
${node(120, 480, 26, '#94A3B8')}${node(430, 380, 30, '#2DD4BF')}${node(700, 440, 30, '#F2B544')}${node(980, 300, 34, '#FF8A4C', true)}${node(650, 250, 22, '#F472B6')}${node(900, 520, 22, '#A78BFA')}${node(1120, 360, 24, '#38BDF8')}
<circle cx="205" cy="468" r="6" fill="#4FA8E8"/><rect x="319" y="396" width="12" height="12" rx="2" fill="#F2B33D"/><path d="M560 430l7 12h-14z" fill="#E59AC6"/><path d="M806 342l8 -8 8 8-8 8z" fill="#4FA8E8"/><circle cx="1050" cy="338" r="6" fill="#2FD1A0"/>
<text x="80" y="170" font-family="Sora, Inter, system-ui, sans-serif" font-weight="700" font-size="104" fill="#E9EDF5">System Designer</text>
<text x="84" y="232" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="36" fill="#B7C0D1">Build the system. Survive the day. See why it held.</text>
<text x="84" y="288" font-family="Inter, system-ui, sans-serif" font-weight="500" font-size="24" fill="#8590A6">Free system design practice in your browser. No sign-up.</text>
<g font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="600">
<rect x="84" y="560" width="148" height="40" rx="20" fill="#8B85FF" fill-opacity=".18"/><text x="158" y="587" text-anchor="middle" fill="#B9B5FF">Learn</text>
<rect x="246" y="560" width="148" height="40" rx="20" fill="#2DD4BF" fill-opacity=".16"/><text x="320" y="587" text-anchor="middle" fill="#7EE8D8">Practice</text>
<rect x="408" y="560" width="148" height="40" rx="20" fill="#F2B544" fill-opacity=".16"/><text x="482" y="587" text-anchor="middle" fill="#F7CB78">Challenge</text>
<rect x="570" y="560" width="148" height="40" rx="20" fill="#F472B6" fill-opacity=".16"/><text x="644" y="587" text-anchor="middle" fill="#F9A3CF">Sandbox</text>
</g>
</svg>
`);

out('assets/assets-index.json', JSON.stringify({ requests: Object.keys(requests), events: Object.keys(events), ui: Object.keys(ui), favicon: 'assets/favicon.svg', social: 'assets/social-preview.svg' }, null, 1) + '\n');
console.log(Object.keys(requests).length, Object.keys(events).length, Object.keys(ui).length);
