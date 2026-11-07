// Reset clears overload dimming on every wire, including wires away from the first limit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
    const graph = { nodes: [['u','web-browser'],['lb','regional-lb'],['app','vm-fleet'],['db','sql-primary']].map(([id,type],i) => ({ id,type,units:1,x:i*260,y:0 })), edges: [['u','lb'],['lb','app'],['app','db']] };
    localStorage.setItem('hotpath.v1.draft.sandbox.sandbox', JSON.stringify({ graph, traffic: { rps:{read:30000}, curve:'flat', regions:{us:1} } }));
    window.__resetEdges = new Map();
    window.__resetNodes = new Map();
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/render/edges.js')) {
      const source = fs.readFileSync(new URL('../render/edges.js', import.meta.url), 'utf8').replace('views.set(e.id, v);', 'views.set(e.id, v); window.__resetEdges.set(e.id, v);');
      request.respond({ contentType: 'text/javascript', body: source });
    } else if (new URL(request.url()).pathname.endsWith('/render/nodes.js')) {
      const source = fs.readFileSync(new URL('../render/nodes.js', import.meta.url), 'utf8').replace('views.set(n.id, v);', 'views.set(n.id, v); window.__resetNodes.set(n.id, v);');
      request.respond({ contentType: 'text/javascript', body: source });
    } else if (new URL(request.url()).pathname.endsWith('/render/scene.js')) {
      const source = fs.readFileSync(new URL('../render/scene.js', import.meta.url), 'utf8').replace('return api;', 'window.__resetScene = api; return api;');
      request.respond({ contentType: 'text/javascript', body: source });
    } else request.continue();
  });
  await page.goto((process.argv[2] || 'http://localhost:8765/') + '#/sandbox');
  await page.waitForFunction(() => window.__game?.getState().nodes.length === 4);
  await page.evaluate(() => { __game.startTraffic(); __game.pause(); __game.step(60000); });
  await page.waitForFunction(() => [...window.__resetEdges.values()].some(e => e.quiet && e.g.alpha === .35));
  await page.mouse.move(400,300); await page.mouse.wheel({deltaY:-2000});
  await page.waitForFunction(() => __game.getState().view.zoom > 1.05);
  await page.waitForFunction(() => [...window.__resetNodes.values()].some(v => v.pile.visible));
  await page.evaluate(() => window.__resetScene.flashEvent('noisy-neighbor',['app'],3));
  await page.waitForFunction(() => window.__resetNodes.get('app').event);
  await page.evaluate(() => __game.reset());
  await page.waitForFunction(() => __game.getState().phase === 'build');
  await new Promise(r => setTimeout(r, 200));
  const wires = await page.evaluate(() => [...window.__resetEdges.values()].map(e => ({ id:e.id, quiet:!!e.quiet, alpha:e.g.alpha })));
  assert(wires.every(e => !e.quiet && e.alpha === 1), JSON.stringify(wires));
  await page.mouse.wheel({deltaY:-2000});
  await page.waitForFunction(() => __game.getState().view.zoom > 1.05);
  assert(await page.evaluate(() => [...window.__resetNodes.values()].every(v => !v.pile.visible)), 'overload piles stay cleared when zooming back in after reset');
  assert(await page.evaluate(() => [...window.__resetNodes.values()].every(v => !v.event)), 'event highlights clear without waiting for their minimum display time');
  assert(!await page.evaluate(() => __game.getState().view.diagram.labels.some(l => l.text.startsWith('First limit'))));
  await page.evaluate(() => { __game.placeComponent('queue',800,0); __game.startTraffic(); __game.pause(); __game.step(60000); });
  await page.waitForFunction(() => [...window.__resetNodes.values()].some(v => v.kind === 'queue' && !v.icon.visible));
  await page.evaluate(() => __game.reset());
  await new Promise(r => setTimeout(r,200));
  assert(await page.evaluate(() => [...window.__resetNodes.values()].filter(v => v.kind === 'queue').every(v => v.icon.visible && !v.qbar.visible)), 'reset restores queue icons after hiding the bounded fill');
  console.log('Sandbox reset clears first-limit labels and every edge quiet flag and alpha.');
} finally { await browser.close(); }
