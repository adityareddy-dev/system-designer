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
    const tenant = problemById.get('tenant-metrics');
    const outageSim = createSim({ catalog, problem: tenant });
    outageSim.loadGraph(tenant.editorial.designs[0].graph);
    outageSim.setKnob('api', 'units', 4); outageSim.setKnob('api', 'autoscale', false);
    outageSim.start(); outageSim.advance(86400000);
    const outageResult = outageSim.result(), outageCase = repairCase(outageResult, tenant, catalog), outageApplied = [];
    const outageForm = renderRepair(outageResult, tenant, catalog, { onSetNext: fix => outageApplied.push(fix) });
    document.body.append(outageForm);
    const outageSelects = outageForm.querySelectorAll('select');
    outageSelects[0].value = outageCase.answer; outageSelects[1].value = outageCase.effect;
    const outageNumber = outageForm.querySelector('input');
    outageNumber.value = 13; outageForm.requestSubmit(); outageForm.requestSubmit();
    const activeCountRejected = outageApplied.length === 0;
    outageNumber.value = 26; outageNumber.dispatchEvent(new Event('input', { bubbles: true }));
    outageForm.requestSubmit(); outageForm.requestSubmit();
    if (outageApplied.length) {
      outageSim.reset(); outageSim.setKnob('api', 'units', outageApplied[0].units);
      outageSim.start(); outageSim.advance(86400000);
    }
    const outage = { value: outageCase.value, suggested: outageResult.nextStep.sizing.units, evidence: outageCase.evidence,
      activeCountRejected, applied: outageApplied, peakUtil: outageSim.result().nodes.find(n => n.id === 'api').peakUtil };
    const limiter = problemById.get('rate-limiter-service'), costSim = createSim({ catalog, problem: limiter });
    const overloadedSim = createSim({ catalog, problem: limiter });
    overloadedSim.loadGraph(limiter.editorial.designs[0].graph);
    overloadedSim.setKnob('svc', 'units', 1); overloadedSim.setKnob('svc', 'autoscale', false);
    overloadedSim.start(); overloadedSim.advance(86400000);
    const overloadedResult = overloadedSim.result(), overloadedCase = repairCase(overloadedResult, limiter, catalog);
    const overloadedApplied = [];
    let overloadedAssisted = 0;
    const overloadedForm = renderRepair(overloadedResult, limiter, catalog, {
      onSetNext: fix => overloadedApplied.push(fix), onAssisted: () => overloadedAssisted++,
    });
    document.body.append(overloadedForm);
    const overloadedSelects = overloadedForm.querySelectorAll('select');
    overloadedSelects[0].value = overloadedCase.answer; overloadedSelects[1].value = overloadedCase.effect;
    const overloadedNumber = overloadedForm.querySelector('input');
    overloadedNumber.value = 42; overloadedForm.requestSubmit(); overloadedForm.requestSubmit();
    const overloaded = { value: overloadedCase.value, suggested: overloadedResult.nextStep.sizing.units,
      applied: [...overloadedApplied], assisted: overloadedAssisted,
      measured: overloadedResult.nodes.find(n => n.id === 'svc').peakRequests,
      peakRps: overloadedResult.nextStep.sizing.peakRps };
    overloadedNumber.value = 15; overloadedNumber.dispatchEvent(new Event('input', { bubbles: true }));
    overloadedForm.requestSubmit(); overloadedForm.requestSubmit();
    overloaded.lowCountRejected = overloadedApplied.length === overloaded.applied.length;
    const precisionResult = structuredClone(overloadedResult);
    Object.assign(precisionResult.nodes.find(n => n.id === 'svc'), { peakRequests: 1400.0001, effectiveRpsPerUnit: 1000, peakUtil: 1.4 });
    overloaded.precisionValue = repairCase(precisionResult, limiter, catalog).value;
    costSim.loadGraph(limiter.editorial.designs[0].graph);
    costSim.setKnob('svc', 'units', 500); costSim.setKnob('svc', 'autoscale', false);
    costSim.start(); costSim.advance(86400000);
    const costResult = costSim.result(), costCase = repairCase(costResult, limiter, catalog), costApplied = [];
    let back = 0;
    const costForm = renderRepair(costResult, limiter, catalog, { onSetNext: fix => costApplied.push(fix), onBack: () => back++ });
    document.body.append(costForm);
    const costSelects = costForm.querySelectorAll('select');
    costSelects[0].value = costCase.answer; costSelects[1].value = costCase.effect;
    costForm.querySelector('input').value = costCase.value;
    costForm.requestSubmit(); costForm.requestSubmit();
    const cost = { checks: costResult.checks, kind: costResult.nextStep.kind, knob: costResult.nextStep.knob,
      plan: costCase.choices[costCase.answer], effect: costCase.effects[costCase.effect], text: costForm.textContent, applied: costApplied, back };
    const { renderEditorial } = await import('./ui/play/editorial.js');
    const { estimateUnit } = await import('./ui/play/estimate-units.js');
    const units = [];
    for (const problem of problems) {
      const host = document.createElement('div'); renderEditorial(host, { problem, catalog, passed: true });
      const section = [...host.querySelectorAll('section')].find(s => s.querySelector('h3')?.textContent === 'The numbers');
      problem.numbers.forEach((row,i) => { if (estimateUnit(row).percent) units.push({ id: problem.id, text: section.querySelectorAll('tr')[i].children[1].textContent, value: estimateUnit(row).value }); });
    }
    return { units, initial, none, wrongPlan, wrongCount, checked, applied, expected: test.value, outage, overloaded, cost };
  });
  assert.equal(outcome.units.length, 6);
  for (const row of outcome.units) { assert(row.text.includes(row.value + ' %'), row.id); assert(!row.text.includes('of requests')); }
  assert(!/Set .*\d/.test(outcome.initial)); assert.equal(outcome.none, 0);
  assert.equal(outcome.wrongPlan.applied, 0); assert.equal(outcome.wrongPlan.assisted, 0);
  assert.equal(outcome.wrongCount.applied, 0); assert.equal(outcome.wrongCount.assisted, 1);
  assert.match(outcome.wrongCount.text, /ceil\(/);
  assert.equal(outcome.checked.applied, 0); assert.match(outcome.checked.text, /Set my/);
  assert.equal(outcome.applied.length, 1); assert.equal(outcome.applied[0].units, outcome.expected);
  assert.equal(outcome.outage.value, 26); assert.equal(outcome.outage.value, outcome.outage.suggested);
  assert.match(outcome.outage.evidence, /2 of 4 installed units survived/);
  assert(outcome.outage.activeCountRejected);
  assert.equal(outcome.outage.applied.length, 1); assert.equal(outcome.outage.applied[0].units, 26);
  assert(outcome.outage.peakUtil <= .7, 'installed capacity keeps the outage peak below the headroom target');
  assert.equal(outcome.overloaded.value, 42, 'heavy overload uses measured demand rather than capped display utilization');
  assert.equal(outcome.overloaded.value, outcome.overloaded.suggested);
  assert.equal(outcome.overloaded.assisted, 0, 'correct arithmetic does not mark assistance');
  assert.equal(outcome.overloaded.applied.length, 1); assert.equal(outcome.overloaded.applied[0].units, 42);
  assert(outcome.overloaded.lowCountRejected, 'the count derived from capped utilization is rejected');
  assert.equal(outcome.overloaded.measured, outcome.overloaded.peakRps, 'demand and effective capacity retain matching peak precision');
  assert.equal(outcome.overloaded.precisionValue, 3, 'rounding cannot erase demand above an integer sizing boundary');
  assert.deepEqual(outcome.cost.checks, { availability: true, latency: true, safety: true, cost: false });
  assert.equal(outcome.cost.kind, 'cost'); assert.equal(outcome.cost.knob, 'units');
  assert.match(outcome.cost.plan, /Reduce the largest measured cost driver/);
  assert.match(outcome.cost.effect, /Cost may fall while headroom or freshness changes/);
  assert.doesNotMatch(outcome.cost.text, /Increase this pool|Less waiting at this pool/);
  assert.equal(outcome.cost.applied.length, 0); assert.equal(outcome.cost.back, 1);
  console.log('Repair plan, effect and count are required; worked arithmetic marks assistance; Set applies the player’s checked number.');
} finally { await browser.close(); }
