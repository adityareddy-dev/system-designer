// The warm-up day and Retry: after the warm-up, Retry plays the full day at full peak load, so its score matches a
// fresh profile's first full day for the same plain design, and a Beat link made after Retry replays to the same score.
// Run from the harness folder: node warmup-retry.mjs [baseUrl]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function session(progress) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.evaluateOnNewDocument((pr) => {
    try {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const P = 'hotpath.v1.';
      localStorage.setItem(P + 'settings', JSON.stringify({ soundMuted: true, playerName: 'Adi' }));
      localStorage.setItem(P + 'seenIntro', 'true');
      if (pr) localStorage.setItem(P + 'progress', JSON.stringify(pr));
    } catch { /* no storage */ }
  }, progress);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 30000 });
  return page;
}
// the editorial design with every part at one unit, so the score is below the cap and shows load differences
const build = (page) => page.evaluate(async () => {
  const { problemById } = await import('./content/problems/index.js');
  const d = problemById.get('url-shortener').editorial.designs[0];
  const st = await window.__game.loadProblem('url-shortener');
  const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
  for (const n of d.graph.nodes) {
    if (idOf.has(n.ref)) continue;
    idOf.set(n.ref, window.__game.placeComponent(n.type, n.x, n.y));
  }
  for (const id of idOf.values()) { try { window.__game.setKnob(id, 'units', 1); } catch { /* fixed */ } }
  for (const e of d.graph.edges) {
    const [a, b] = Array.isArray(e) ? e : String(e).split('>');
    window.__game.connect(idOf.get(a), idOf.get(b));
  }
});
const run = async (page) => {
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.setSpeed(8); window.__game.step(86400000); });
  await sleep(800);
  return page.evaluate(() => window.__game.getState().score?.total);
};

const A = await session(null);
await build(A);
const warm = await run(A);
await A.evaluate(() => window.__game.reset());
await sleep(500);
const retry = await run(A);
// the Beat link made after Retry: encode the design and its score, decode it and replay it as the friend's browser does
await sleep(1200); // the draft (the design with its settings) is saved a second after the last change
const link = await A.evaluate(async (score) => {
  const { loadCatalog } = await import('./sim/catalog.js');
  const { problemById } = await import('./content/problems/index.js');
  const share = await import('./compete/share.js');
  const catalog = await loadCatalog();
  const graph = JSON.parse(localStorage.getItem('hotpath.v1.draft.practice.url-shortener')).graph;
  const payload = await share.encodeShare({ mode: 'practice', problemId: 'url-shortener', seed: 'practice', graph, score: { total: score }, name: 'Adi' }, catalog);
  return share.verify(await share.decodeShare(payload, catalog), catalog, problemById.get('url-shortener'));
}, retry);
const B = await session({ other: { attempts: 1, best: 500 } });
await build(B);
const full = await run(B);
await browser.close();

console.log(`warm-up ${warm}, retry ${retry}, fresh full day ${full}, link replay ${link.replayScore} (verified ${link.verified})`);
const ok = Number.isFinite(retry) && retry === full && warm > retry;
console.log(ok ? 'ok   Retry after the warm-up scores the same as a full day' : 'FAIL Retry after the warm-up does not match the full day');
const linkOk = link.verified === true && link.replayScore === retry;
console.log(linkOk ? 'ok   a link made after Retry replays to the same score' : 'FAIL a link made after Retry replays to a different score');
process.exit(ok && linkOk ? 0 : 1);
