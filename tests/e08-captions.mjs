// Evidence stays below the part in whole lines, including the first-limit reading at phone zoom.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  await test('e08 evidence captions keep rejected and retry readings on whole lines below names', async () => {
    const page = await browser.newPage();
    await page.goto(site.base + '#/settings');
    const readings = await page.evaluate(async () => {
      const { loadPixi } = await import('./ui/shell/playhost.js'); await loadPixi();
      const { loadCatalog } = await import('./sim/catalog.js');
      const { createKit } = await import('./render/textures.js');
      const { createNodeLayer } = await import('./render/nodes.js');
      const { e08Palette } = await import('./render/e08.js');
      const { resolvePalette } = await import('./render/theme.js');
      const catalog = await loadCatalog(), kit = await createKit(PIXI, e08Palette(resolvePalette()), catalog, 1);
      const parent = new PIXI.Container(); let zoom = 1;
      const layer = createNodeLayer(PIXI, parent, { kit: () => kit, element: t => catalog.elementById.get(t), shapeOf: () => 'rounded-square', reduced: () => true, zoom: () => zoom, regionShort: () => '' });
      try {
        layer.sync({ nodes: [0, 180, 360].map((y, i) => ({ id: i ? 'app' + i : 'app', type: 'vm-fleet', x: 0, y })), edges: [] });
        const v = layer.views.get('app'); v.telemetry = { retryRps: 7300 };
        return [1, .3].map(z => {
          zoom = z; layer.setLabelScale(z);
          for (const node of layer.views.values()) layer.setLive(node, true, 1.4, 3, 0, .5, -1, 11600);
          v.evidenceT.text = 'First limit\n' + v.evidenceT.text;
          layer.update(16, 0, 0);
          layer.layoutLabels({ zoom: z, size: { w: 390, h: 600 }, worldToScreen: (x, y) => ({ x: 195 + x * z, y: 250 + y * z }) });
          return { zoom: z, text: v.evidenceT.text, wrap: v.evidenceT.style.wordWrap, font: v.evidenceT.style.fontSize * v.evidenceT.scale.y * z,
            name: v.nameCaption, facts: v.factCaption, pills: [...layer.views.values()].map(node => { const b = node.rejected.getLocalBounds(); return { x: node.x + node.rejected.x + b.x, y: node.y + node.rejected.y + b.y, width: b.width, height: b.height }; }), visible: v.evidenceT.visible && v.evidenceT.renderable, height: v.evidenceT.height * z };
        });
      } finally { layer.destroy(); parent.destroy(); kit.destroy(); }
    });
    for (const r of readings) {
      assert.equal(r.wrap, false, 'e08 facts must never wrap a measurement');
      assert(r.visible, 'first-limit evidence remains visible');
      assert.match(r.text, /First limit\n.*11.6K\/s rejected\n.*7.3K\/s retry/);
      assert(r.facts.y >= r.name.y + r.name.height, 'evidence starts below its name');
      assert(r.font >= 12 && r.font <= 14, 'readable evidence at desktop and phone zoom');
      assert(r.height <= 48, 'only the three intended lines');
      assert(r.facts.height * r.zoom <= 56, 'no oversized empty evidence box');
      for (const pill of r.pills) assert(!(r.facts.x < pill.x + pill.width && r.facts.x + r.facts.width > pill.x && r.facts.y < pill.y + pill.height && r.facts.y + r.facts.height > pill.y), 'caption must clear neighbouring rejected pills');
    }
    await page.close();
  });
} finally { await browser.close(); await site.close(); }
