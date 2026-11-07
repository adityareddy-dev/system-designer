// Completion copy agrees across the report, checkpoint, bank card and notification for every state.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { problems } from '../content/problems/index.js';
import { completionState } from '../ui/play/completion.js';
const cases = [
  { key: 'failed', run: { passed: false } },
  { key: 'failed', run: { passed: false, mode: 'challenge' } },
  { key: 'failed', run: { passed: false, mode: 'beat' } },
  { key: 'trace-open', run: { passed: true, learning: { traceChecked: false } } },
  { key: 'checked', run: { passed: true, learning: { traceChecked: true } } },
  { key: 'assisted', run: { passed: true, learning: { traceChecked: true, assisted: true } } },
  { key: 'needs-original', twist: true, run: { passed: true, learning: { traceChecked: true, needsOriginal: true } } },
  { key: 'twist-assisted', twist: true, run: { passed: true, learning: { traceChecked: true, assisted: true } } },
  { key: 'mastered', twist: true, run: { passed: true, learning: { traceChecked: true, independentTwist: true } } },
  { key: 'mastered', saved: { learning: { masteredAt: 1 } }, run: { passed: true, learning: { traceChecked: true } } },
  { key: 'reference', run: { passed: true, reference: true } },
  { key: 'warm-up', warm: true, run: { passed: true } },
  { key: 'practice', run: { passed: true, mode: 'challenge' } },
  { key: 'practice', run: { passed: true, mode: 'beat' } }
];
for (const p of problems) for (const test of cases) assert.equal(completionState({ ...p, twistDay: test.twist, warmUp: test.warm }, test.run, null, test.saved).key, test.key, p.id);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  const checked = await page.evaluate(async cases => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { problemById } = await import('./content/problems/index.js');
    const { renderDebrief } = await import('./ui/play/debrief.js');
    const { completionState } = await import('./ui/play/completion.js');
    const catalog = await loadCatalog(), p = problemById.get('url-shortener');
    const sim = createSim({ catalog, problem: p }); sim.loadGraph(p.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
    const result = sim.result(), answer = { text: 'Atomic commit and durable outcome.', choices: p.correctness.fields.map(f => f.correct) };
    return cases.map(test => {
      const problem = { ...p, twistDay: test.twist, warmUp: test.warm };
      const run = { ...result, ...test.run, transferReflection: { tradeoff: 'Committed' } };
      const host = document.createElement('div');
      const ctx = { content: { lessons: [] }, progress: { get: () => test.saved } };
      renderDebrief(host, { problem, result: run, catalog, ctx, correctnessAnswer: answer, reduced: true });
      const expected = completionState(problem, run, answer, test.saved);
      return { key: test.key, actual: host.querySelector('.pl-debrief').dataset.completion,
        upper: host.querySelector('.pl-learning-status')?.textContent, lower: host.querySelector('.pl-checkpoint-status')?.textContent, expected: expected.message };
    });
  }, cases);
  for (const state of checked) {
    assert.equal(state.actual, state.key);
    if (state.key === 'failed') assert.doesNotMatch(state.lower, /Traffic passed/);
    if (state.upper) assert.equal(state.upper, state.expected);
    assert.equal(state.lower, state.expected);
  }
  // Bank cards consume saved learning history and preserve legacy solved records.
  for (const saved of [{ solvedAt: 1, attempts: 1 }, { solvedAt: 1, attempts: 1, learning: { assistedAt: 2 } }, { solvedAt: 1, attempts: 1, learning: { masteredAt: 3 } }]) {
    await page.evaluate(saved => { localStorage.setItem('hotpath.v1.progress', JSON.stringify({ 'url-shortener': saved })); }, saved);
    await page.goto((process.argv[2] || 'http://localhost:8765/') + '?completion-check=' + Math.random() + '#/practice');
    await page.waitForSelector('a[href="#/practice/url-shortener"]');
    assert.match(await page.$eval('a[href="#/practice/url-shortener"]', el => el.textContent), new RegExp(completionState(problems[0], {}, null, saved).label));
  }
  console.log(`${problems.length} problems × ${cases.length} completion states; report, checkpoint and saved bank labels agree.`);
} finally { await browser.close(); }
