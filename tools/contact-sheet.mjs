// Renders every icon in both themes plus a 24px similarity report. Run on the server:
//   node tools/contact-sheet.mjs <appDir> <outPng> [reportJson]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const [,, appDir, outPng, report] = process.argv;
const rd = f => fs.readFileSync(path.join(appDir, f), 'utf8');
const groups = [['categories', 'Categories'], ['icons', 'Elements'], ['events', 'Events'], ['requests', 'Request shapes'], ['ui', 'Interface']];
const items = [];
for (const [d, label] of groups) for (const f of fs.readdirSync(path.join(appDir, 'assets', d)).filter(f => f.endsWith('.svg')).sort())
  items.push({ g: label, id: f.slice(0, -4), dir: d, svg: rd(`assets/${d}/${f}`) });
const css = rd('assets/palette.css');
const cell = it => `<div class="c"><div class="r"><span class="s16">${it.svg}</span><span class="s24">${it.svg}</span><span class="s48">${it.svg}</span></div><div class="n">${it.id}</div></div>`;
const half = theme => `<section data-theme="${theme}" class="half"><h1>${theme}</h1>${groups.map(([d, l]) => `<h2>${l}</h2><div class="grid">${items.filter(i => i.g === l).map(cell).join('')}</div>`).join('')}</section>`;
const html = `<!doctype html><meta charset=utf-8><style>${css}
body{margin:0;display:flex;font:11px system-ui;background:#888}.half{flex:1;padding:12px;background:var(--bg);color:var(--text)}
h1{margin:0 0 6px;font-size:14px}h2{margin:12px 0 4px;font-size:12px;color:var(--text-2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
.c{background:var(--surface-solid);border:1px solid var(--border);border-radius:8px;padding:6px;text-align:center;color:var(--cat-compute)}
.r{display:flex;align-items:center;justify-content:center;gap:6px;height:50px}.r svg{display:block}
.s16 svg{width:16px;height:16px}.s24 svg{width:24px;height:24px}.s48 svg{width:48px;height:48px}
.n{font-size:9px;color:var(--text-3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>
${half('light')}${half('dark')}`;
fs.writeFileSync(path.join(path.dirname(outPng), 'contact-sheet.html'), html);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 2200, height: 900, deviceScaleFactor: 1.5 });
await p.setContent(html, { waitUntil: 'load' });
await p.screenshot({ path: outPng, fullPage: true });
// similarity at 24 px (element + category icons, then each other group alone)
const res = await p.evaluate(async (items) => {
  const S = 32, out = {};
  const raster = async svg => {
    const u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg color="#000" '));
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); x.drawImage(im, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data; const a = new Float32Array(S * S); for (let i = 0; i < S * S; i++) a[i] = d[i * 4 + 3] / 255; return a;
  };
  for (const g of [...new Set(items.map(i => i.g))]) {
    const its = items.filter(i => i.g === g), R = [];
    for (const it of its) R.push(await raster(it.svg));
    const pairs = [];
    for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
      let diff = 0, ink = 0; for (let k = 0; k < S * S; k++) { diff += Math.abs(R[i][k] - R[j][k]); ink += Math.max(R[i][k], R[j][k]); }
      pairs.push([+(diff / ink).toFixed(3), its[i].id, its[j].id]);
    }
    pairs.sort((a, b) => a[0] - b[0]); out[g] = pairs.slice(0, 15);
  }
  return out;
}, items.map(({ g, id, svg }) => ({ g, id, svg })));
if (report) fs.writeFileSync(report, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
await b.close();
