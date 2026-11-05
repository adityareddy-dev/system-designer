// Candidate-led preparation requires commitment, locks the run and persists an honest defense report.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { questionCoverage, defenseQuestions } from '../ui/play/interview.js';
import { createProgress } from '../ui/shell/progress.js';
import { mergeProgress, sanitizeProgress } from '../account/merge.js';
assert.deepEqual(questionCoverage('How many users? How long do we keep data?', [{ q: 'How many users are there?' }, { q: 'How long do we keep data?' }]), [true,true]);
const data = { progress: { legacy: { attempts: 2, bestScore: 800, stars: 1 } } };
const progress = createProgress({ get: (k, f) => data[k] || f, set: (k,v) => data[k] = v }, { emit() {} });
const draft = { covered: 1, total: 3, score: 400, estimates: { 0: 12 }, defense: [{ answer: 'A durable answer', checked: [true, false, false] }] };
progress.recordInterview('snapshot', draft);
draft.estimates[0] = 999;
draft.defense[0].checked[0] = false;
assert.equal(progress.get('snapshot').interview.latest.estimates[0], 12);
assert.equal(progress.get('snapshot').interview.latest.defense[0].checked[0], true);
progress.recordInterview('legacy', { covered: 3, total: 10, score: 600 });
progress.recordInterview('legacy', { covered: 8, total: 10, score: 500 });
assert.equal(progress.get('legacy').bestScore, 800);
assert.equal(progress.get('legacy').interview.bestDay.score, 600);
assert.equal(progress.get('legacy').interview.bestCoverage.covered, 8);
const interviewReport = structuredClone(progress.get('legacy').interview);
// Account sync sanitizes away device-local reports before importing remote ordinary progress.
const merged = mergeProgress(sanitizeProgress(progress.exportAll()), {
  problems: { legacy: { attempts: 4, bestScore: 900, stars: 2 }, remote: { attempts: 1, bestScore: 700 } }, lessons: { caching: Date.now() },
});
progress.importAll({ app: 'system-designer', problems: merged.problems, lessons: merged.lessons }, { preserveInterviews: true });
assert.deepEqual(progress.get('legacy').interview, interviewReport);
assert.equal(progress.get('legacy').bestScore, 900);
assert.equal(progress.get('remote').bestScore, 700);
progress.importAll({ app: 'system-designer', problems: {}, lessons: {} }, { preserveInterviews: true });
assert.deepEqual(progress.get('legacy').interview, interviewReport, 'syncs without this problem also preserve its local report');
const backup = structuredClone(progress.exportAll());
progress.reset();
progress.recordInterview('legacy', { covered: 1, total: 10, score: 100 });
progress.recordInterview('local-only', { covered: 1, total: 10, score: 100 });
assert.equal(progress.importAll(backup), true);
assert.deepEqual(progress.get('legacy').interview, interviewReport, 'backup restores attempts, latest report and both best records over a newer local report');
assert.equal(progress.get('local-only'), null, 'backup replaces progress rather than retaining unrelated local reports');
assert.deepEqual(data.progress.legacy.interview, interviewReport, 'restored reports are saved through the store');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
const base = process.argv[2] || 'http://localhost:8765/';
const click = text => page.evaluate(text => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && b.checkVisibility()); assertButton(el); function assertButton(el) { if (!el) throw new Error('Missing visible button: ' + text); el.click(); } }, text);
try {
  for (const width of [1366,390,320]) {
    await page.setViewport({ width, height: width < 720 ? 844 : 800 });
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('hotpath.v1.progress', JSON.stringify({ 'observability-platform': { attempts: 3, bestScore: 100, stars: 0 } })));
    await page.goto(base + '?interview-check=' + width + '#/practice/observability-platform?interview=1');
    await page.waitForSelector('.pl-defense-field textarea');
    await page.waitForFunction(() => {
      const clock = document.querySelector('.pl-interview-clock');
      const r = clock.getBoundingClientRect();
      const toolbar = document.querySelector('.pl-top').getBoundingClientRect();
      const panel = document.querySelector('.pl-panel').getBoundingClientRect();
      return clock.checkVisibility() && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight
        && panel.top >= Math.max(r.bottom, toolbar.bottom);
    });
    const requirementsVisible = () => page.$eval('.pl-req', e => e.checkVisibility());
    assert.equal(await requirementsVisible(), false, 'requirements are hidden before committing questions');
    const ax = await page.createCDPSession();
    const tree = await ax.send('Accessibility.getFullAXTree');
    assert(!tree.nodes.some(n => !n.ignored && n.role?.value === 'region' && n.name?.value === 'Requirements'), 'requirements are absent from the accessibility tree');
    await ax.detach();
    assert.equal(await page.$('.pl-qlist'), null);
    await click('Commit questions');
    assert.match(await page.$eval('.pl-panel', e => e.textContent), /Write your questions first/);
    await page.type('.pl-defense-field textarea', 'How many measurements arrive? How long do we keep data? What data may we lose?');
    await click('Commit questions');
    assert.equal(await requirementsVisible(), false, 'answers do not reveal requirements');
    await click('Write requirements');
    assert.equal(await requirementsVisible(), false, 'scope must be committed first');
    await page.type('.pl-defense-field textarea', 'Ingest and query separately. Aim for 99.95 percent served with no payment processing.');
    await click('Commit requirements');
    assert.equal(await requirementsVisible(), true, 'committing scope reveals requirements');
    await click('Estimate the workload');
    assert.equal(await page.$('.pl-panel input[type=range]'), null);
    assert.doesNotMatch(await page.$eval('.pl-panel', e => e.textContent), /11,200|11k|1\.1 M/);
    await page.$$eval('.pl-panel input[type=number]', els => els.forEach((el,i) => { el.value = [11200,4,6.4][i]; el.dispatchEvent(new Event('input')); }));
    await click('Commit estimates'); await click('Start drawing');
    assert.equal(await page.$eval('.pl-root', e => e.dataset.step), 'draw');
    assert.equal(await page.$('.pl-tool--hint'), null); assert.equal(await page.$('.pl-tool--editorial'), null);
    await page.evaluate(() => {
      const g = window.__game; const app = g.placeComponent('vm-fleet',0,0);
      const db = g.placeComponent('sql-primary',180,0); g.connect('agents',app); g.connect('oncall',app); g.connect(app,db);
    });
    await page.evaluate(() => document.querySelector('.pl-buildnote').click());
    const diagnosticText = await page.$eval('.pl-issues', e => e.textContent);
    assert.match(diagnosticText, /no usable route/);
    assert.match(diagnosticText, /percent/);
    assert.doesNotMatch(diagnosticText, /Time-series database|Data lake|raise|Add |Connect |Set |autoscaling|bigger size/);
    assert.equal(await page.$('.pl-issue-fix'), null);
    assert.equal(await page.$eval('.pl-trace', e => e.checkVisibility()), false, 'interview draw has no route repair tool');
    await click('Start day');
    const preflight = await page.$eval('.pl-modal-card', e => e.textContent);
    assert.match(preflight, /no usable route/);
    assert.doesNotMatch(preflight, /Time-series database|Data lake|Add |Connect |wiring guidance/);
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'build');
    await click('Keep drawing');
    await page.evaluate(() => {
      const g = window.__game, app = g.getState().nodes.find(n => n.type === 'vm-fleet');
      const store = g.placeComponent('timeseries-db',180,180); g.setKnob(store,'units',100); g.connect(app.id,store);
    });
    assert.doesNotMatch(await page.$eval('.pl-buildnote', e => e.textContent), /raise|turn on autoscaling|needs about|you have/);
    await page.evaluate(() => {
      const g = window.__game, app = g.getState().nodes.find(n => n.type === 'vm-fleet'); g.setKnob(app.id,'units',6);
      g.startTraffic(); g.pause();
    });
    const before = await page.evaluate(() => window.__game.getState().nodes);
    await page.evaluate(() => { const g = window.__game, n = g.getState().nodes.find(n => n.type === 'vm-fleet'); g.setKnob(n.id,'units',100); g.placeComponent('cache',0,200); });
    assert.deepEqual(await page.evaluate(() => window.__game.getState().nodes), before);
    await page.evaluate(() => window.__game.step(86400000));
    await page.waitForSelector('.pl-defense-card');
    await page.evaluate(() => window.__game.reset());
    assert.equal(await page.evaluate(() => window.__game.getState().phase), 'done');
    await page.$$eval('.pl-defense-card', cards => cards.forEach(card => {
      const input = card.querySelector('textarea'); input.value = 'The failed path must be measured before choosing capacity or routing changes.'; input.dispatchEvent(new Event('input'));
      card.querySelector('button').click(); card.querySelectorAll('input[type=checkbox]').forEach(box => box.click());
    }));
    assert.equal(await page.$$eval('.pl-defense-card', els => els.length >= 3 && els.length <= 5), true);
    await click('Save interview report');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.progress'))['observability-platform'].interview);
    assert(saved.latest.covered > 0); assert(saved.bestDay); assert(saved.bestCoverage);
    assert(await page.$$eval('.pl-defense-card input[type=checkbox]', boxes => boxes.every(box => box.disabled)), 'saved checklist locks');
    assert(await page.$eval('.pl-interview-report button', button => button.disabled), 'save locks');
    await page.$$eval('.pl-defense-card input[type=checkbox]', boxes => boxes.forEach(box => box.click()));
    await page.$eval('.pl-interview-report button', button => button.click());
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.progress'))['observability-platform'].interview), saved, 'second click cannot change the snapshot or attempt count');
  }
  const proofs = await page.evaluate(async () => {
    const { createReqCard } = await import('./ui/play/req-card.js');
    const { loadCatalog } = await import('./sim/catalog.js');
    const catalog = await loadCatalog();
    const problem = { title: 'Proof check', requirements: { mix: {}, compliance: ['encryption', 'audit-log', 'backups', 'access-control'] } };
    const host = document.createElement('div');
    const safe = createReqCard(host, { catalog, problem, advice: false }).el.textContent;
    const ordinary = createReqCard(host, { catalog, problem }).el.textContent;
    return { safe, ordinary };
  });
  assert.match(proofs.ordinary, /Add and connect|Connect Backups|Draw the key connection/);
  assert.doesNotMatch(proofs.safe, /Add and connect|Connect Backups|Draw the key connection|Example:/);
  const rendered = await page.evaluate(async () => {
    const { loadCatalog } = await import('./sim/catalog.js');
    const { createSim } = await import('./sim/engine.js');
    const { problemById } = await import('./content/problems/index.js');
    const { renderDebrief } = await import('./ui/play/debrief.js');
    const catalog = await loadCatalog(), problem = problemById.get('observability-platform');
    const sim = createSim({ catalog, problem }); sim.loadGraph(problem.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
    const host = document.createElement('div');
    renderDebrief(host, { result: sim.result(), problem, catalog, ctx: { content: { lessons: [] } }, reduced: true });
    const headings = [...host.querySelectorAll('.pl-story-head b')].map(e => e.textContent);
    const descriptions = [];
    for (const id of ['notification-service', 'bulk-sms-campaigns']) {
      const base = problemById.get(id);
      const authored = 'A receipt may be delivered twice after the carrier reconnects.';
      for (const description of [undefined, authored]) {
        const problem = { ...base, events: base.events.map(e => e.id === 'duplicate-delivery'
          ? { ...e, params: { ...e.params, share: 0.03 }, ...(description ? { text: { ...e.text, description } } : {}) } : e) };
        const sim = createSim({ catalog, problem }); sim.loadGraph(problem.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
        const host = document.createElement('div');
        renderDebrief(host, { result: sim.result(), problem, catalog, ctx: { content: { lessons: [] } }, reduced: true });
        const index = sim.result().events.findIndex(e => e.id === 'duplicate-delivery');
        const story = host.querySelector('#pl-ev-' + index);
        const would = [...story.querySelectorAll('p')].find(p => p.textContent.startsWith('What it would have done'))?.textContent;
        descriptions.push({ headline: story.querySelector('.pl-story-1').textContent, would, authored: description });
      }
    }
    return { headings, descriptions };
  });
  assert(rendered.headings.includes('Dashboard rush'), 'debrief headings preserve resolved event names');
  assert(!rendered.headings.includes('Thundering herd'));
  for (const { headline, would, authored } of rendered.descriptions) {
    assert.match(headline, /3 percent/);
    assert(would, 'protected duplicate deliveries still explain what would have happened');
    if (authored) assert(would.includes(authored), 'authored event descriptions survive rendering');
    else {
      assert.match(would, /redelivers 3 percent/);
      assert.doesNotMatch(would, /1 percent|payment/);
    }
  }
  await page.goto(base + '#/practice/bank-ledger?interview=1');
  await page.waitForSelector('.pl-defense-field textarea');
  await page.type('.pl-defense-field textarea', 'How many writes arrive? How long must records survive?');
  await click('Commit questions'); await click('Write requirements');
  await page.type('.pl-defense-field textarea', 'Keep a durable audit trail and authenticated access for every transfer.');
  await click('Commit requirements'); await click('Estimate the workload');
  await page.$$eval('.pl-panel input[type=number]', els => els.forEach(el => { el.value = 100; el.dispatchEvent(new Event('input')); }));
  await click('Commit estimates'); await click('Start drawing');
  await page.$$eval('.pl-req details', els => els.forEach(el => el.open = true));
  const requirementText = await page.$eval('.pl-req', el => el.textContent);
  assert.match(requirementText, /Every store that holds customer data is backed up/);
  assert.doesNotMatch(requirementText, /Example:|Draw the key connection|Add and connect|Connect Backups/);
  await page.evaluate(() => {
    const g = window.__game, sources = g.getState().nodes;
    const app = g.placeComponent('vm-fleet', 0, 0), db = g.placeComponent('sql-primary', 180, 0);
    for (const source of sources) g.connect(source.id, app);
    g.connect(app, db);
  });
  await click('Start day');
  const proofPreflight = await page.$eval('.pl-modal-card', el => el.textContent);
  assert.match(proofPreflight, /required compliance check has no proof/);
  assert.doesNotMatch(proofPreflight, /wiring guidance|Add |Connect |Put |Set /);
  assert.deepEqual(errors, []);
  console.log('Interview preparation, visible clock, typed estimates, one locked run, defense, sync and backup restoration passed at all sizes.');
} finally { await browser.close(); }
