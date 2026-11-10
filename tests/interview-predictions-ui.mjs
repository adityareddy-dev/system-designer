// Explicit negative predictions are committed before replay and reported against measured outcomes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  for (const width of [1366, 390]) {
    await page.setViewport({ width, height: 844 });
    const observed = await page.evaluate(async () => {
      const { loadCatalog } = await import('./sim/catalog.js');
      const { createSim } = await import('./sim/engine.js');
      const { createInterview, renderInterviewResult } = await import('./ui/play/interview.js');
      const { summarizeClaims } = await import('./content/problems/defense-claims.js');
      const catalog = await loadCatalog();
      const problem = { id: 'claim-fixture', title: 'Cold origin', clarify: [], numbers: [], difficulty: 'Hard', requirements: { peakRps: 15000, mix: { read: 1 }, availability: .99, latencyP99Ms: { default: 10000 }, dataSafety: 'best-effort', budgetPerMonth: 1e9, userRegions: { us: 1 }, homeRegion: 'us', storageTb: .01 }, traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [] };
      const sim = createSim({ catalog, problem });
      sim.loadGraph({ nodes: [
        { id: 'client', type: 'web-browser', x: 0, y: 0, locked: true },
        { id: 'app', type: 'vm-fleet', x: 200, y: 0, units: 24 },
        { id: 'cache', type: 'cache', x: 400, y: 0, knobs: { ttlSec: 86400, coalesce: true } },
        { id: 'db', type: 'sql-primary', x: 600, y: 0 },
      ], edges: [['client', 'app'], ['app', 'cache'], ['cache', 'db']] });
      sim.start(); sim.advance(86400000);
      let state = createInterview(problem);
      const host = document.createElement('main');
      document.body.replaceChildren(host);
      let saved;
      renderInterviewResult(host, problem, state, sim.result(), catalog, report => saved = structuredClone(report));
      const first = host.querySelector('.pl-defense-card');
      const answer = first.querySelector('textarea'); answer.value = 'Bypassing the cache overloads the origin, so the served target fails.';
      answer.dispatchEvent(new Event('input')); first.querySelector('form').requestSubmit();
      const select = first.querySelector('.hp-defense-claims select');
      if (!select) return { missingPosition: true };
      const check = first.querySelector('.hp-defense-claims input');
      const requiredChoice = select.value === '' && check.disabled && !first.querySelector('.pl-claim-trace b');
      select.value = 'fail'; select.dispatchEvent(new Event('change'));
      const beforeReplay = !first.querySelector('.pl-claim-trace b');
      check.click();
      const cold = structuredClone(Object.values(state.defense[0].claims)[0]);
      const heading = first.querySelector('.pl-claim-trace b').textContent;
      const committed = select.disabled;
      check.click();
      const uncommitted = !select.disabled && !first.querySelector('.pl-claim-trace b');
      // A separate small fleet cannot apply a 30% cut because both zones must remain.
      const smaller = { ...problem, requirements: { ...problem.requirements, peakRps: 100 } };
      const smallSim = createSim({ catalog, problem: smaller });
      const graph = sim.result().graph;
      Object.assign(graph.nodes.find(n => n.id === 'app'), { units: 2, zones: 2 });
      smallSim.loadGraph(graph); smallSim.start(); smallSim.advance(86400000);
      state = createInterview(smaller);
      renderInterviewResult(host, smaller, state, smallSim.result(), catalog, report => saved = structuredClone(report));
      for (const card of host.querySelectorAll('.pl-defense-card')) {
        const answer = card.querySelector('textarea');
        if (!answer.readOnly) { answer.value = 'Measure the changed boundary and compare the served and latency targets.'; answer.dispatchEvent(new Event('input')); card.querySelector('form').requestSubmit(); }
        for (const select of card.querySelectorAll('.hp-defense-claims select')) { select.value = 'fail'; select.dispatchEvent(new Event('change')); }
        for (const input of card.querySelectorAll('.hp-defense-claims input')) if (!input.checked) input.click();
      }
      const summary = summarizeClaims(state.defense.flatMap(d => Object.values(d.claims)));
      const reportText = host.querySelector('.pl-interview-report').textContent;
      host.querySelector('.pl-interview-report button').click();
      return { requiredChoice, beforeReplay, committed, uncommitted, cold, heading, reportText, summary, saved,
        untestedHeadings: [...host.querySelectorAll('.pl-claim-trace b')].filter(el => el.textContent === 'Not tested by this replay').length,
        locked: [...host.querySelectorAll('.hp-defense-claims input, .hp-defense-claims select')].every(input => input.disabled),
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert(!observed.missingPosition, 'each experiment requires an explicit holds or fails prediction');
    assert(observed.requiredChoice && observed.beforeReplay, 'no replay runs before a committed position');
    assert(observed.committed && observed.uncommitted, 'changing a committed prediction requires clearing the replay');
    assert.equal(observed.cold.position, 'fail'); assert.equal(observed.cold.held, false); assert.equal(observed.cold.matched, true);
    assert.match(observed.heading, /Prediction matched/);
    assert(observed.untestedHeadings > 0, 'inapplicable hot-item interventions have an honest heading');
    assert.match(observed.reportText, new RegExp(`Predictions matched: ${observed.summary.covered}/${observed.summary.total}`));
    assert.equal(observed.saved.total, observed.summary.total); assert.equal(observed.saved.untested, observed.summary.untested);
    assert.equal(observed.saved.coverageKind, 'computed-predictions');
    assert(observed.saved.defense.every(d => Object.values(d.claims).every(c => c.position === 'fail')));
    assert(observed.locked); assert(!observed.overflow);
  }
  assert.deepEqual(errors, []);
  console.log('Negative predictions, unsupported replay headings, tested-only reports and saved control locks passed at desktop and phone widths.');
} finally { await browser.close(); }
