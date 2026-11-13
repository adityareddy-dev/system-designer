// Evidence stays below the part in whole lines, including the first-limit reading at phone zoom.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  await test('paper captions stay readable as rejected pills appear, resize and disappear', async () => {
    const page = await browser.newPage();
    await page.goto(site.base + '#/settings');
    const readings = await page.evaluate(async () => {
      const { loadPixi } = await import('./ui/shell/playhost.js'); await loadPixi();
      const { loadCatalog } = await import('./sim/catalog.js');
      const { createKit } = await import('./render/textures.js');
      const { createNodeLayer } = await import('./render/nodes.js');
      const { paperPalette } = await import('./render/paper.js');
      const { resolvePalette } = await import('./render/theme.js');
      const catalog = await loadCatalog(), kit = await createKit(PIXI, paperPalette(resolvePalette()), catalog, 1);
      const parent = new PIXI.Container(); let zoom = 1;
      const layer = createNodeLayer(PIXI, parent, { kit: () => kit, element: t => catalog.elementById.get(t), shapeOf: () => 'rounded-square', reduced: () => true, zoom: () => zoom, regionShort: () => '' });
      try {
        layer.sync({ nodes: [0, 180, 360].map((y, i) => ({ id: i ? 'app' + i : 'app', type: 'vm-fleet', x: 0, y })), edges: [] });
        const v = layer.views.get('app'); v.telemetry = { retryRps: 7300 };
        return [1, .3].map(z => {
          zoom = z; layer.setLabelScale(z);
          for (const node of layer.views.values()) layer.setLive(node, false);
          const camera = { zoom: z, size: { w: 390, h: 600 }, worldToScreen: (x, y) => ({ x: 195 + x * z, y: 250 + y * z }) };
          // scene.draw updates nodes, applies flows, then lays out captions. Pills lag flows by a frame.
          const frame = (status, neighbourRate = 11600) => {
            layer.update(16, 0, 0);
            for (const node of layer.views.values()) {
              layer.setLive(node, true, 1.4, status, 0, .5, -1, node.id === 'app1' ? neighbourRate : 11600);
              // Hidden neighbour readings stay empty to isolate pill bounds from caption text changes.
              if (node !== v) node.evidenceT.text = '';
            }
            v.evidenceT.text = 'First limit\n' + v.evidenceT.text;
            layer.layoutLabels(camera);
            return { facts: { ...v.factCaption }, pills: [...layer.views.values()].filter(node => node.rejected.visible).map(node => {
              const b = node.rejected.getLocalBounds();
              return { x: node.x + node.rejected.x + b.x, y: node.y + node.rejected.y + b.y, width: b.width, height: b.height };
            }) };
          };
          const before = frame(3);
          const appeared = frame(3);
          // Only a neighbour's pill changes size. The first-limit caption's text stays the same.
          frame(3, 1160000000);
          const grown = frame(3, 1160000000);
          frame(0, 1160000000);
          const disappeared = frame(0, 1160000000);
          return { zoom: z, text: v.evidenceT.text, wrap: v.evidenceT.style.wordWrap, font: v.evidenceT.style.fontSize * v.evidenceT.scale.y * z,
            name: v.nameCaption, facts: v.factCaption, before, appeared, grown, disappeared,
            visible: v.evidenceT.visible && v.evidenceT.renderable, height: v.evidenceT.height * z };
        });
      } finally { layer.destroy(); parent.destroy(); kit.destroy(); }
    });
    for (const r of readings) {
      for (const [transition, snapshot] of [['appeared', r.appeared], ['grown', r.grown]]) {
        for (const pill of snapshot.pills) assert(!(snapshot.facts.x < pill.x + pill.width && snapshot.facts.x + snapshot.facts.width > pill.x && snapshot.facts.y < pill.y + pill.height && snapshot.facts.y + snapshot.facts.height > pill.y), `caption must clear neighbouring rejected pills (${transition})`);
      }
      assert.equal(r.wrap, false, 'paper facts must never wrap a measurement');
      assert(r.visible, 'first-limit evidence remains visible');
      assert.match(r.text, /First limit\n.*11.6K\/s rejected\n.*7.3K\/s retry/);
      assert(r.facts.y >= r.name.y + r.name.height, 'evidence starts below its name');
      assert(r.font >= 12 && r.font <= 14, 'readable evidence at desktop and phone zoom');
      assert(r.height <= 48, 'only the three intended lines');
      assert(r.facts.height * r.zoom <= 56, 'no oversized empty evidence box');
      assert.equal(r.before.pills.length, 0, 'first layout precedes pill appearance');
      assert.equal(r.appeared.pills.length, 3, 'next frame shows the rejected pills');
      assert(r.grown.pills[1].width > r.appeared.pills[1].width, 'neighbour pill really grows');
      assert.equal(r.disappeared.pills.length, 0, 'recovery hides the pills on the following frame');
      assert.deepEqual(r.disappeared.facts, r.before.facts, 'caption reclaims its lane when pills disappear');
    }
    await page.close();
  });
} finally { await browser.close(); await site.close(); }
