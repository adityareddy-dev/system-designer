// Copy failures keep the design link available without reporting a successful share.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.seenIntro', 'true'));
  await page.goto((process.argv[2] || 'http://localhost:8765/') + '?measure=8794#/settings');
  const results = await page.evaluate(async () => {
    const { createCompete } = await import('./compete/index.js');
    const { metrics } = await import('./core/metrics.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { getPalette } = await import('./assets/palette.js');
    const { problemById } = await import('./content/problems/index.js');
    const catalog = await loadCatalog(), problem = problemById.get('url-shortener');
    const sim = createSim({ catalog, problem });
    sim.loadGraph(problem.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
    const host = document.createElement('div'); document.body.append(host);
    const originalOnce = metrics.once, originalCopy = document.execCommand;
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const rows = [];
    try {
      for (const mode of ['false', 'throw', 'fallback', 'clipboard']) {
        const events = [], toasts = [], writes = [];
        let fallbacks = 0;
        metrics.once = name => events.push(name);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          async writeText(text) {
            if (mode !== 'clipboard') throw new Error('Clipboard blocked');
            writes.push(text);
          },
        } });
        document.execCommand = command => {
          if (command !== 'copy') throw new Error('Unexpected command');
          fallbacks++;
          if (mode === 'throw') throw new Error('Copy blocked');
          if (mode === 'fallback') writes.push(document.querySelector('.cp-link').value);
          return mode === 'fallback';
        };
        const compete = createCompete({ catalog, palette: () => getPalette('light'),
          bus: { emit: (name, payload) => toasts.push(payload) } });
        const dialog = compete.ui.openShareDialog(host, { problem, result: sim.result() });
        const link = host.querySelector('.cp-link');
        while (!link.value) await new Promise(resolve => setTimeout(resolve, 10));
        host.querySelector('.cp-linkrow button').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        rows.push({ mode, events, toasts, writes, url: link.value, fallbacks,
          selected: link.selectionStart === 0 && link.selectionEnd === link.value.length });
        dialog.close();
      }
    } finally {
      metrics.once = originalOnce; document.execCommand = originalCopy;
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete navigator.clipboard;
      host.remove();
    }
    return rows;
  });
  for (const row of results) {
    const copied = ['fallback', 'clipboard'].includes(row.mode);
    assert.deepEqual(row.events, copied ? ['result_shared'] : [], row.mode + ' only records a completed copy');
    assert.deepEqual(row.writes, copied ? [row.url] : [], row.mode + ' copies the design link');
    assert.equal(row.toasts.at(-1)?.level, copied ? 'ok' : 'warn', row.mode + ' reports the outcome');
    assert.equal(row.fallbacks, row.mode === 'clipboard' ? 0 : 1);
    if (!copied) assert(row.selected, row.mode + ' leaves the link selected for manual copying');
  }
  console.log('Clipboard and fallback successes count shares; rejected, false and throwing copies do not.');
} finally { await browser.close(); }
