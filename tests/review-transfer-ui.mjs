// Failed transfer reflection survives drawing resets, and editorials use the transfer's measured graph.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' }));
    localStorage.setItem('hotpath.v1.progress', JSON.stringify({ 'health-records': { attempts: 1 }, 'bank-ledger': { attempts: 1 } }));
  });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(b => b.checkVisibility() && b.textContent.trim() === text);
    if (!button) throw Error('Missing ' + text);
    button.click();
  }, text);
  await page.goto(base);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(async () => window.__game.loadProblem('health-records'));
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  await page.waitForSelector('.pl-debrief');
  await click('New twist');
  await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  await page.waitForSelector('.pl-transfer-reflection textarea');
  const failed = await page.evaluate(() => window.__game.getState().score);
  assert.equal(failed.passed, false);
  await page.$eval('.pl-step[data-step="draw"]', el => el.click());
  await click('Back to drawing');
  assert.equal(await page.evaluate(() => window.__game.getState().phase), 'done', 'failed transfer cannot be discarded before reflection');
  assert.equal(await page.$eval('.pl-transfer-reflection', el => el.checkVisibility()), true);
  // The controller reset and the step bar cannot erase the pending commitment either.
  await page.evaluate(() => window.__game.reset());
  await page.$eval('.pl-step[data-step="draw"]', el => el.click());
  await page.$eval('.pl-tool--editorial', el => el.click());
  assert.equal(await page.$eval('.pl-overlay--editorial', el => el.hidden), true);
  await page.$eval('.pl-tool--hint', el => el.click());
  assert.equal(await page.$eval('.pl-hints-foot button', el => el.hidden), true, 'the reflection instruction is outside counted hint tiers');
  assert.match(await page.$eval('.pl-hints', el => el.textContent), /Commit the changed tradeoff, two explanations/);
  await page.$eval('.pl-hints [aria-label="Close hints"]', el => el.click());
  await page.$eval('.pl-step[data-step="debrief"]', el => el.click());
  await page.$$eval('.pl-transfer-reflection textarea', inputs => {
    inputs.forEach((el, i) => el.value = [
      'The lower ceiling competes with the reserve needed to survive a failed zone.',
      'Either the paid fleet is too large or stored data dominates the monthly bill.',
      'Reduce only the compute floor. A falling bill supports fleet cost; a flat bill supports stored data. Measure served traffic during the failure too.'
    ][i]);
    inputs[0].closest('form').requestSubmit();
  });
  await page.$eval('.pl-step[data-step="draw"]', el => el.click());
  await click('Back to drawing');
  assert.equal(await page.evaluate(() => window.__game.getState().phase), 'build');
  await page.$eval('.pl-tool--editorial', el => el.click());
  await click('Show me the spoilers');
  assert.equal(await page.$eval('.pl-editorial h2', el => el.textContent), 'Patient health records');

  const sizing = await page.evaluate(async () => {
    const { problemById } = await import('./content/problems/index.js');
    const { twistProblem } = await import('./content/problems/twist.js');
    const { renderEditorial } = await import('./ui/play/editorial.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const problem = twistProblem(problemById.get('bank-ledger'));
    const host = document.createElement('div'); document.body.append(host);
    renderEditorial(host, { problem, catalog: await loadCatalog(), passed: true });
    const table = host.querySelector('.pl-worked-sizing');
    const text = table.textContent;
    const rows = [...table.querySelectorAll('tbody tr')].map(row => row.textContent);
    host.remove(); return { text, rows, graph: problem.editorial.designs[0].graph, cost: problem.editorial.designs[0].expect.costPerMonth };
  });
  assert.match(sizing.text, /15,512/);
  assert.doesNotMatch(sizing.text, /27,460|21 \/ 3|ledger: Ledger/);
  for (const row of sizing.rows) assert(sizing.graph.nodes.some(n => row.startsWith(n.ref + ':')), 'every measured row belongs to this transfer graph');
  assert.deepEqual(errors, []);
  console.log('Failed-transfer advice gates survive drawing resets; twist editorials render their own measured capacity and bill.');
} finally { await browser.close(); }
