// Earned credit survives the real controls: open trace, assisted pass, then independent changed conditions.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
import { problemById } from '../content/problems/index.js';
import { checkFor } from '../ui/play/design-check.js';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const base = site.base;
const errors = []; page.on('pageerror', e => errors.push(e.message));
const click = text => page.evaluate(text => { const el = [...document.querySelectorAll('button')].find(e => e.checkVisibility() && e.textContent.trim() === text); if (!el) throw Error('Missing ' + text); el.click(); }, text);
const p = problemById.get('search-autocomplete');
const gates = async () => {
  if (await page.$('.pl-modal:not([hidden]) .pl-design-check')) await page.evaluate(t => {
    const f = document.querySelector('.pl-design-check'); f.querySelectorAll('.sh-choice')[t.answer].click(); f.querySelector('input').value = t.value;
    f.querySelector('textarea').value = 'Queue delay and duplicate effects need separate checks under the changed traffic conditions.'; f.requestSubmit();
  }, checkFor(p));
  await page.waitForSelector('.pl-modal:not([hidden]) .pl-checkpoint');
  await page.evaluate(choices => { const f = document.querySelector('.pl-checkpoint'); f.querySelectorAll('select').forEach((e,i) => e.value = choices[i]); f.querySelector('input').value = 'Fence ownership, reuse the occurrence key and park permanent failure with a controlled replay policy.'; f.requestSubmit(); }, p.correctness.fields.map(f => f.correct));
};
try {
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('hotpath.v1.seenIntro', 'true'); localStorage.setItem('hotpath.v1.progress', JSON.stringify({ 'search-autocomplete': { attempts: 1, bestScore: 0, stars: 0 } })); localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' })); });
  await page.goto(base);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async id => window.__game.loadProblem(id), p.id);
  const missing = await page.evaluate(graph => {
    const game = window.__game, ids = new Map(game.getState().nodes.map(n => [n.id,n.id]));
    for (const n of graph.nodes) { let id = ids.get(n.ref); if (!id) { id = game.placeComponent(n.type,n.x,n.y); ids.set(n.ref,id); } for (const k of ['units','zones','tier','region']) if (n[k] != null) game.setKnob(id,k,n[k]); for (const [k,v] of Object.entries(n.knobs || {})) game.setKnob(id,k,v); }
    for (const [a,b] of graph.edges.slice(2)) game.connect(ids.get(a),ids.get(b));
    return graph.edges.slice(0,2).map(edge => edge.map(id => ids.get(id)));
  }, p.editorial.designs[0].graph);
  await page.$eval('.pl-trace', e => e.open = true);
  await page.waitForFunction(() => document.querySelector('.pl-trace-output').textContent.length > 0);
  assert.doesNotMatch(await page.$eval('.pl-trace-output', e => e.textContent), /Complete repair path:|Add Background workers/);
  await page.evaluate(edges => { for (const [a,b] of edges) window.__game.connect(a,b); window.__game.startTraffic(); window.__game.step(86400000); }, missing);
  await page.waitForSelector('.pl-learning-status');
  assert.match(await page.$eval('.pl-learning-status',e => e.textContent), /trace is still open/);
  assert.equal(await page.$('.pl-victory'), null);
  assert.match(await page.$eval('.sh-toast', e => e.textContent), /Traffic passed.*trace is still open/);
  await click('Retry'); await click('Start day'); await gates();
  await page.evaluate(() => window.__game.step(86400000));
  assert.match(await page.$eval('.pl-learning-status',e => e.textContent), /responsibility trace passed/);
  const before = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], p.id);
  assert(before.learning.eligibleAt && !before.learning.assistedAt && !before.learning.masteredAt);
  await click('Next: New twist without hints');
  await page.$eval('.pl-tool--hint', e => e.click()); for (let n = 1; n <= 3; n++) await click('Show hint ' + n);
  await page.$eval('.pl-hints [aria-label="Close hints"]',e => e.click());
  await page.$eval('.pl-tool--editorial', e => e.click());
  await page.$eval('.pl-overlay--editorial [aria-label="Close editorial"]', e => e.click());
  await page.evaluate(graph => {
    const game = window.__game;
    for (const n of graph.nodes) {
      const actual = game.getState().nodes.find(node => node.type === n.type && (node.label === n.label || !n.label));
      if (!actual) throw Error('Missing twist part ' + n.type);
      for (const k of ['units','zones','tier','region']) if (n[k] != null) game.setKnob(actual.id,k,n[k]);
      for (const [k,v] of Object.entries(n.knobs || {})) game.setKnob(actual.id,k,v);
    }
  }, p.twist.design.graph);
  await click('Start day'); await gates();
  await page.evaluate(() => window.__game.step(86400000));
  assert.match(await page.$eval('.pl-learning-status', e => e.textContent), /twist used help/);
  const assisted = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], p.id);
  assert(assisted.learning.assistedAt && !assisted.learning.masteredAt);
  assert.equal(await page.$('.pl-victory'), null, 'assisted twist keeps the pass quiet');
  assert.equal(assisted.learning.eligibleAt, before.learning.eligibleAt);
  await click('Next: Retry twist without hints');
  const setUnits = async graph => page.evaluate(graph => {
    for (const n of graph.nodes) if (n.units != null) {
      const actual = window.__game.getState().nodes.find(node => node.type === n.type);
      window.__game.setKnob(actual.id, 'units', n.units);
      window.__game.setKnob(actual.id, 'tier', n.tier || 'M');
    }
  }, graph);
  await setUnits(p.editorial.designs[0].graph);
  await click('Start day'); await gates();
  await page.evaluate(() => window.__game.step(86400000));
  assert.equal(await page.evaluate(() => window.__game.getState().score.passed), false);
  await page.$eval('.pl-tool--hint', e => e.click());
  assert.match(await page.$eval('.pl-hints', e => e.textContent), /Commit the changed tradeoff/);
  assert.equal(await page.$eval('.pl-hints-foot button', e => e.hidden), true);
  assert.equal(await page.$('.pl-hints .pl-hint'), null, 'the reflection instruction is not a revealed hint');
  await page.$eval('.pl-hints [aria-label="Close hints"]', e => e.click());
  await page.$$eval('.pl-transfer-reflection textarea', inputs => {
    inputs.forEach((input, i) => input.value = [
      'The lower bill competes with enough reserve for the unchanged recovery promise.',
      'Either idle compute capacity or retained data dominates this bill.',
      'Cut only compute units. A lower bill supports idle compute; an unchanged bill supports retained data. Check served share during the outage.'
    ][i]);
    inputs[0].closest('form').requestSubmit();
  });
  await click('Retry');
  await setUnits(p.twist.design.graph);
  await click('Start day'); await gates();
  await page.evaluate(() => window.__game.step(86400000));
  assert.match(await page.$eval('.pl-learning-status',e => e.textContent), /Full mastery earned/);
  const after = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], p.id);
  assert(after.learning.masteredAt);
  assert.equal(after.learning.assistedAt, assisted.learning.assistedAt);
  assert.equal(after.bestScore, before.bestScore); assert.equal(after.attempts, before.attempts);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async id => window.__game.loadProblem(id), p.id);
  await page.$eval('.pl-tool--editorial', e => e.click());
  await click('Show me the spoilers');
  await click('Load and run it');
  await gates();
  await page.evaluate(() => window.__game.step(86400000));
  assert.equal(await page.evaluate(() => window.__game.getState().score.total), 1000);
  const referenceProgress = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], p.id);
  const unchangedReference = async () => {
    assert.match(await page.$eval('.pl-debrief', e => e.textContent), /Reference design: not saved to your results/);
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('hotpath.v1.progress'))[id], p.id);
    assert.deepEqual(saved, referenceProgress, 'reference replays never save scores, solved dates or learning credit');
  };
  await unchangedReference();
  for (const day of ['New twist', 'Original day', 'New twist']) {
    await click(day); await click('Start day'); await gates();
    await page.evaluate(() => window.__game.step(86400000));
    if (await page.$('.pl-transfer-reflection textarea')) await page.$$eval('.pl-transfer-reflection textarea', inputs => {
      inputs.forEach(input => input.value = 'The paid reserve exceeds the new cost ceiling. Compare a smaller floor with unchanged units and measure the bill and failure headroom.');
      inputs[0].closest('form').requestSubmit();
    });
    await unchangedReference();
  }
  await click('Retry'); await click('Start day'); await gates();
  await page.evaluate(() => window.__game.step(86400000));
  await unchangedReference();
  assert.deepEqual(errors, []);
  console.log('Open trace cannot earn mastery; assisted twist history persists and an independent checked twist earns mastery without altering traffic bests.');
} finally { await browser.close(); await site.close(); }
