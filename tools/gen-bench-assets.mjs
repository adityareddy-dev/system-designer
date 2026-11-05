// Draws the signal bench symbols and explanatory scenes from original vector geometry.
import fs from 'node:fs';
import { iconInner } from '../assets/icons/index.js';
const symbols = {
  'web-browser': '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 13h8m-8 3h5"/>',
  'mobile-app': '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M10 18h4"/>',
  'regional-lb': '<path d="M3 12h6m0 0V5h12M9 12h12M9 12v7h12"/><path d="m18 3 3 2-3 2m0 3 3 2-3 2m0 3 3 2-3 2"/>',
  'vm-fleet': '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 9h16M4 15h16M8 6h.01M8 12h.01M8 18h.01m5-12h3m-3 6h3m-3 6h3"/>',
  cache: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M21 14h-5v7m0-7 5 5m-5-5-3 3"/>',
  'sql-primary': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  cdn: '<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M12 8V3M8 14l-5 5m13-5 5 5"/><circle cx="12" cy="3" r="1"/><circle cx="3" cy="20" r="1"/><circle cx="21" cy="20" r="1"/>',
  queue: '<path d="M2 6h20M2 18h20m-1-7 2 1-2 1"/><rect x="4" y="9" width="4" height="6" rx="1"/><rect x="11" y="9" width="4" height="6" rx="1"/>',
  'worker-pool': '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4M7 4V2m10 2V2"/>',
  'rate-limiter': '<path d="M3 7h18M3 17h18m-9-10v10m-5-7 3 2-3 2m8-4 3 2-3 2"/>',
  'kv-store': '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="12" r="2"/><path d="M10 12h7m-2 0v3"/>',
  'metrics': '<path d="M3 3v18h18M6 15l4-5 4 3 5-8"/>',
  'logs': '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  'alerting': '<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zm5 3h4M12 7v4m0 3h.01"/>',
  'circuit-breaker': '<path d="M2 12h6m8 0h6M8 12l7-7"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>',
  'sql-replica': '<ellipse cx="10" cy="5" rx="7" ry="3"/><path d="M3 5v13c0 3 10 4 14 1V5m1 7h4m-2-2 2 2-2 2"/>',
};
const svg = (inner, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>${title}</title>${inner}</svg>\n`;
for (const [id, shape] of Object.entries(symbols)) fs.writeFileSync(`assets/icons/${id}.svg`, svg(shape, id));
const categories = { clients: 'web-browser', edge: 'regional-lb', compute: 'vm-fleet', data: 'sql-primary', messaging: 'queue', platform: 'kv-store', ops: 'metrics', ai: 'worker-pool', external: 'cdn' };
for (const [id, shape] of Object.entries(categories)) fs.writeFileSync(`assets/categories/${id}.svg`, svg(symbols[shape], id));
fs.mkdirSync('assets/scenes', { recursive: true });
const colors = ['#4051A1', '#006E68', '#865400'];
function module(x, y, id, label, color, meter = .5) {
  return `<g transform="translate(${x} ${y})"><rect y="3" width="80" height="72" rx="10" fill="#C7D1D0"/><rect width="80" height="72" rx="10" fill="#FFFEFA" stroke="#657A87" stroke-width="1.5"/><path d="M14 2h52" stroke="${color}" stroke-width="3"/><g transform="translate(24 12) scale(1.33)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbols[id] || iconInner('el.' + id)}</g><path d="M14 59h52" stroke="#C7D1D0" stroke-width="4"/><path d="M14 59h${Math.round(52*meter)}" stroke="${color}" stroke-width="4"/><g fill="#FFFEFA" stroke="#657A87" stroke-width="1.5"><circle cy="36" r="4"/><circle cx="80" cy="36" r="4"/></g><text x="40" y="94" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#405868">${label}</text></g>`;
}
for (const kind of ['shared-load', 'cached-reads', 'draining-queue']) {
  let art = '', notes = '';
  if (kind === 'shared-load') {
    art = '<path d="M116 136h46V56h70m-70 80h70m-70 0v80h70"/>';
    notes = '<text x="24" y="26">01 / Share the burst</text><text x="335" y="70">1/3</text><text x="335" y="150">1/3</text><text x="335" y="230">1/3</text>';
    art = `<g fill="none" stroke="#657A87" stroke-width="2">${art}</g>` + module(36,100,'regional-lb','One address',colors[0]) + [20,100,180].map(y=>module(232,y,'vm-fleet','',colors[1],.65)).join('');
  } else if (kind === 'cached-reads') {
    art = '<g fill="none" stroke="#657A87" stroke-width="2"><path d="M110 136h70m80 0h70"/><path d="M220 100V66H70v34" stroke="#006E68"/></g>'+module(30,100,'vm-fleet','App',colors[1],.7)+module(180,100,'cache','Reuse the answer',colors[2],.8)+module(330,100,'sql-primary','Fewer reads',colors[2],.25);
    notes='<text x="24" y="26">02 / Remember repeated reads</text><text x="145" y="55">Hit: return early</text><text x="280" y="125">Miss</text>';
  } else {
    art='<path d="M110 136h70m80 0h70" fill="none" stroke="#657A87" stroke-width="2"/>'+module(30,100,'queue','Waiting work',colors[0],.8)+module(180,100,'worker-pool','Workers',colors[1],.65)+module(330,100,'sql-primary','Saved',colors[2],.4);
    notes='<text x="24" y="26">03 / Give work time to finish</text><text x="24" y="66">Arrive: 600/s</text><text x="230" y="66">Finish: 800/s</text><text x="110" y="250">Backlog shrinks by 200/s</text>';
  }
  fs.writeFileSync(`assets/scenes/${kind}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280"><rect width="440" height="280" rx="12" fill="#F5F2E9"/><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle r="1" fill="#657A87" opacity=".25"/></pattern><rect width="440" height="280" fill="url(#grid)"/>${art}<g font-family="monospace" font-size="12" fill="#182F40">${notes}</g></svg>`);
}
console.log('Signal bench symbols and three scenes drawn.');

// Lesson pictures in assets/scenes/<lesson id>.svg are drawn by hand.
