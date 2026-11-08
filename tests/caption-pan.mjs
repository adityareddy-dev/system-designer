// Names remain readable through camera movement, entry motion and crowded caption lanes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { localStorage.setItem('hotpath.v1.seenIntro', 'true'); window.routeBuilds = 0; });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/render/routing.js')) {
      const source = fs.readFileSync(new URL('../render/routing.js', import.meta.url), 'utf8')
        .replace('export function routedLut(lut, points) {', 'export function routedLut(lut, points) { window.routeBuilds++;');
      request.respond({ contentType: 'text/javascript', body: source });
    } else request.continue();
  });
  await page.goto((process.argv[2] || 'http://localhost:8765/') + '#/sandbox');
  await page.waitForFunction(() => window.__game?.getState().nodes.length > 0);
  const { scenarios, fitLabelPx, entryLabelPx } = await page.evaluate(async () => {
    const { createScene } = await import('./render/scene.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:400px;height:400px'; document.body.append(host);
    const scene = await createScene(host, { catalog: await loadCatalog(), reducedMotion: true }), results = [];
    try {
      for (const blocked of [false, true]) {
        scene.sync({ nodes: ['web-browser', 'vm-fleet', 'sql-primary'].map((type, i) => ({ id: 'p' + i, type, x: blocked && i ? 500 : i * 500, y: blocked && i === 2 ? 112 : 0 })),
          edges: [['p0','p1'],['p1','p2']].map(([from,to]) => ({ id: from + '>' + to, from, to, kind: 'flow' })) });
        scene.setCaptionArea({ l: 32, t: 60, r: 80, b: 70 });
        scene.fit({ l: 32, t: 60, r: 80, b: 70 }, false, { focusId: 'p0', minZ: 1, maxZ: 1 });
        scene.renderNow();
        const before = scene.measureDiagram(), builds = window.routeBuilds;
        scene.panBy(-500, 0); scene.renderNow();
        const entered = scene.measureDiagram(), enteringBuilds = window.routeBuilds - builds;
        const node = entered.parts.find(part => part.id === 'p1');
        scene.panBy(0, 330 - (node.y + node.height / 2) - 10); scene.renderNow();
        const edge = scene.measureDiagram();
        scene.panBy(0, -100); scene.renderNow();
        const returned = scene.measureDiagram();
        results.push({ blocked, before, entered, edge, returned, enteringBuilds, laterBuilds: window.routeBuilds - builds - enteringBuilds });
      }
      scene.setReducedMotion(false);
      scene.sync({ nodes: [{ id: 'entry', type: 'vm-fleet', x: 0, y: 0 }], edges: [] });
      scene.fit(32, false, { minZ: 0.75, maxZ: 0.75 });
      const fitLabelPx = scene.stats().labelPx;
      scene.renderNow(0);
      return { scenarios: results, fitLabelPx, entryLabelPx: scene.stats().labelPx };
    } finally { scene.destroy(); host.remove(); }
  });
  for (const result of scenarios) {
    assert(result.before.labels.some(label => label.id === 'p0'), 'the initial part has its name');
    assert(!result.before.labels.some(label => label.id === 'p1'), 'the offscreen part has no visible caption');
    assert(result.entered.labels.some(label => label.id === 'p1'), 'panning a previously offscreen part into view reveals its name');
    assert.equal(result.entered.labelPartOverlaps, 0, 'the entering name clears the neighboring part below it');
    assert.equal(result.edge.labelPanelOverlaps, 0, 'panning a name toward a panel hides it before it runs underneath');
    assert(result.returned.labels.some(label => label.id === 'p1'), 'panning back restores a caption hidden at a panel');
    assert.equal(result.laterBuilds, 0, 'reserved captions keep their wire routes while panning');
    if (!result.blocked) assert.equal(result.enteringBuilds, 0, 'an already reserved caption needs no route rebuild');
  }
  assert(fitLabelPx >= 12.99, 'an immediate fit updates name size before the next frame');
  assert(entryLabelPx >= 12.99, 'names stay at least 13 CSS pixels during the first entry frame');
  console.log('Names remain readable during entry and panning, with stable routes for reserved captions.');
} finally { await browser.close(); }
