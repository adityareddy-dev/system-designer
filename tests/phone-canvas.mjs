// Large paper diagrams keep readable, nonoverlapping headers on entry and resize.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {serveGame} from './browser-server.js';

const site=await serveGame(),base=site.base;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = ['web-browser', 'dns', 'cdn', 'waf', 'api-gateway', 'mobile-app', 'regional-lb', 'vm-fleet', 'cache', 'sql-primary', 'metrics', 'object-storage', 'queue', 'worker-pool', 'third-party-api'];
const graph = { nodes: types.map((type, i) => ({ id: 'n' + i, type, x: i % 5 * 200, y: Math.floor(i / 5) * 480, units: 1 })),
  edges: [[0,1],[1,2],[2,3],[3,4],[4,6],[5,6],[6,7],[7,8],[8,9],[7,12],[12,13],[13,14]].map(([a,b]) => ({ id: `n${a}>n${b}`, from: 'n' + a, to: 'n' + b, kind: 'flow' })) };

function assertFitted(view, message) {
  const f = view.free;
  assert(view.labelPx>=13,message+': readable names');
  const parts=view.diagram.parts,hit=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  assert(parts.some(p=>p.x>=f.l&&p.x+p.width<=f.w-f.r&&p.y>=f.t&&p.y+p.height<=f.h-f.b),message+': readable entry is visible');
  assert(!parts.some((a,i)=>parts.slice(i+1).some(b=>hit(a,b))),message+': headers do not overlap');
}

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(graph => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true }));
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph }));
  }, graph);
  for (const theme of ['light', 'dark']) {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(base + '#/sandbox');
    await page.waitForFunction(() => window.__game?.getState().nodes.length === 15);
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await delay(1000);
    let view = await page.evaluate(() => window.__game.getState().view);
    assertFitted(view, `${theme}: readable entry opens without pressing Fit`);
    assert(await page.$('.pl-camera-map svg'),'the overview contains the complete topology');
    assert.equal(view.diagram.labelPanelOverlaps, 0, `${theme}: opening captions clear panels`);
    await page.setViewport({ width: 1366, height: 800, isMobile: true, hasTouch: true });
    await delay(1000);
    await page.click('[aria-label="Fit to screen (F)"]');
    await delay(500);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await delay(1100);
    view = await page.evaluate(() => window.__game.getState().view);
    assertFitted(view, `${theme}: desktop-to-phone resize fits automatically`);
    assert.equal(view.diagram.labelPanelOverlaps, 0, `${theme}: resized captions clear panels`);
    await page.evaluate(() => { window.__game.startTraffic(); window.__game.pause(); window.__game.step(60000); });
    await delay(500);
    view = await page.evaluate(() => window.__game.getState().view);
    assert.equal(view.diagram.labelPanelOverlaps, 0, `${theme}: live queue and failure facts clear panels`);
    assert(view.labelPx >= 12.99, `${theme}: displayed names remain at least 13 CSS pixels`);
    for (const label of view.diagram.labels.filter(label => label.kind === 'name')) {
      const part = view.diagram.parts.find(part => part.id === label.id);
      const distance = Math.abs(label.x + label.width / 2 - part.x - part.width / 2) + Math.abs(label.y - part.y - part.height - 5);
      assert(distance <= 80, `${theme}: overview names stay near their own parts instead of drawing long leaders`);
    }
  }
  console.log('Large phone diagrams keep readable headers on entry and resize in both themes. Live captions clear panels.');
} finally { await browser.close(); await site.close(); }
