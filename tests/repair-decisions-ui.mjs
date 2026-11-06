// A report never applies a supplied count: the player's checked arithmetic is the only applied value.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  const outcome = await page.evaluate(async () => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { problemById, problems } = await import('./content/problems/index.js');
    const { renderRepair, repairCase } = await import('./ui/play/repair.js');
    const catalog = await loadCatalog(), problem = problemById.get('job-scheduler');
    const graph = structuredClone(problem.editorial.designs[0].graph);
    graph.nodes.filter(n => n.type === 'worker-pool').forEach(n => n.units = 12);
    const sim = createSim({ catalog, problem }); sim.loadGraph(graph); sim.start(); sim.advance(86400000);
    const result = sim.result(), test = repairCase(result, problem, catalog), applied = [];
    let assisted = 0;
    const form = renderRepair(result, problem, catalog, { onSetNext: fix => applied.push(fix), onAssisted: () => assisted++ });
    document.body.append(form);
    const initial = form.textContent;
    form.requestSubmit();
    const none = applied.length;
    const selects = form.querySelectorAll('select');
    selects[0].value = (test.answer + 1) % test.choices.length; selects[1].value = test.effect;
    const number = form.querySelector('input'); number.value = test.value;
    form.requestSubmit();
    const wrongPlan = { applied: applied.length, assisted, text: form.textContent };
    selects[0].value = test.answer; number.value = 1; form.requestSubmit();
    const wrongCount = { applied: applied.length, assisted, text: form.textContent };
    number.value = test.value; number.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit();
    const checked = { applied: applied.length, text: form.querySelector('button').textContent };
    form.requestSubmit();
    const { renderEditorial } = await import('./ui/play/editorial.js');
    const { estimateUnit } = await import('./ui/play/estimate-units.js');
    const units = [];
    for (const problem of problems) {
      const host = document.createElement('div'); renderEditorial(host, { problem, catalog, passed: true });
      const section = [...host.querySelectorAll('section')].find(s => s.querySelector('h3')?.textContent === 'The numbers');
      problem.numbers.forEach((row,i) => { if (estimateUnit(row).percent) units.push({ id: problem.id, text: section.querySelectorAll('tr')[i].children[1].textContent, value: estimateUnit(row).value }); });
    }
    return { units, initial, none, wrongPlan, wrongCount, checked, applied, expected: test.value };
  });
  assert.equal(outcome.units.length, 6);
  for (const row of outcome.units) { assert(row.text.includes(row.value + ' %'), row.id); assert(!row.text.includes('of requests')); }
  assert(!/Set .*\d/.test(outcome.initial)); assert.equal(outcome.none, 0);
  assert.equal(outcome.wrongPlan.applied, 0); assert.equal(outcome.wrongPlan.assisted, 0);
  assert.equal(outcome.wrongCount.applied, 0); assert.equal(outcome.wrongCount.assisted, 1);
  assert.match(outcome.wrongCount.text, /ceil\(/);
  assert.equal(outcome.checked.applied, 0); assert.match(outcome.checked.text, /Set my/);
  assert.equal(outcome.applied.length, 1); assert.equal(outcome.applied[0].units, outcome.expected);
  console.log('Repair plan, effect and count are required; worked arithmetic marks assistance; Set applies the player’s checked number.');
} finally { await browser.close(); }
