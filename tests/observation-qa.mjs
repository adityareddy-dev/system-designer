// Browser privacy gates, game milestones and accessible feedback across sizes and themes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from '../api/server.js';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://localhost:8765/';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-browser-'));
const dbPath = path.join(dir, 'qa.db');
const api = await start({ NODE_ENV: 'test', DEV: '1', PORT: '8794', DB_PATH: dbPath });
api.config.sites.push(new URL(base).origin);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
if (process.env.SD_QA_SHOTS) fs.mkdirSync(process.env.SD_QA_SHOTS, { recursive: true });
const click = (page, text) => page.evaluate(text => { const el = [...document.querySelectorAll('button,a')].find(e => e.checkVisibility() && e.textContent.trim() === text); if (!el) throw Error('Missing ' + text); el.click(); }, text);
try {
  for (const gate of ['dnt', 'gpc', 'off', 'preview', 'offline']) {
    const page = await browser.newPage(), sent = [];
    page.on('request', r => { if (/\/(e|feedback)$/.test(r.url())) sent.push(r.url()); });
    await page.evaluateOnNewDocument(gate => {
      localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ anonymousCounts: gate !== 'off' }));
      if (gate === 'dnt') Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
      if (gate === 'gpc') Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
      if (gate === 'offline') Object.defineProperty(navigator, 'onLine', { get: () => false });
    }, gate);
    await page.goto(base + (gate === 'preview' ? '' : '?measure=8794') + '#/');
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await wait(1500); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.close();
    assert.deepEqual(sent, [], gate);
  }
  for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage(), events = [], feedback = [], errors = [];
    await page.setViewport({ width, height: width === 390 ? 844 : 900, isMobile: width === 390, hasTouch: width === 390 });
    await page.setRequestInterception(true);
    page.on('request', r => r.continue(r.url().startsWith('http://127.0.0.1:8794/') ? { headers: { ...r.headers(), 'x-forwarded-for': `192.0.2.${width === 390 ? 20 : 10}${theme === 'dark' ? 1 : 0}` } } : {}));
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', async r => { if (r.url().endsWith('/e') && r.method() === 'POST') events.push(...JSON.parse(r.postData() || await r.fetchPostData()).events); if (r.url().endsWith('/feedback') && r.method() === 'POST') feedback.push(JSON.parse(r.postData() || await r.fetchPostData())); });
    await page.evaluateOnNewDocument(theme => {
      localStorage.clear(); localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, reducedMotion: 'reduce', soundMuted: true }));
    }, theme);
    await page.goto(base + '?measure=8794#/settings');
    await page.waitForSelector('#sh-s-counts');
    assert.ok(await page.$('button[data-feedback-general]'));
    if (process.env.SD_QA_SHOTS) await page.screenshot({ path: path.join(process.env.SD_QA_SHOTS, `settings-${width}-${theme}.png`) });
    await click(page, 'Send feedback'); await page.waitForSelector('.sh-feedback');
    await page.focus('.sh-feedback button[type=button]'); await page.keyboard.press('Enter');
    assert.ok(await page.$eval('[data-feedback-general]', el => document.activeElement === el), 'dismiss restores keyboard focus to Send feedback');
    await page.keyboard.press('Enter'); await page.waitForSelector('.sh-feedback:not([hidden])');
    await page.click('.sh-feedback input[value="4"]'); await page.type('.sh-feedback textarea', 'General feedback'); await click(page, 'Send');
    await page.waitForFunction(() => document.querySelector('.sh-feedback [role=status]')?.textContent.includes('Thanks'));
    await page.evaluate(() => window.__game.loadLesson('intro'));
    await page.evaluate(() => {
      const g = window.__game; g.setKnob('app', 'units', 3); g.setKnob('app', 'autoscale', { on: true, min: 3, max: 12 });
      for (const [type, from, to] of [['regional-lb', 'users', 'app'], ['cache', 'app', 'db']]) {
        const edge = g.getState().edges.find(e => e.from === from && e.to === to);
        g.placeComponent(type, 0, 180, edge.id);
      }
    });
    for (let i = 0; i < 180; i++) {
      if (await page.evaluate(() => document.querySelector('.sh-modal-title')?.textContent.includes('You just did system design') || [...document.querySelectorAll('h2')].some(e => e.textContent === 'You just did system design'))) break;
      await page.evaluate(() => {
        document.querySelectorAll('.pl-caption button').forEach(b => { if (['Next', 'Fast-forward'].includes(b.textContent.trim())) b.click(); });
        const g = window.__game, st = g.getState();
        const caption = document.querySelector('.pl-caption')?.textContent || '';
        if (st.phase === 'running' && /Traffic builds toward midday|The spike is passing/.test(caption)) g.step(600000);
      });
      await wait(100);
    }
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Learn the building blocks')), await page.evaluate(() => JSON.stringify({ caption: document.querySelector('.pl-caption')?.textContent, state: window.__game.getState().phase, clock: window.__game.getState().clock })));
    await click(page, 'Learn the building blocks');
    await page.evaluate(() => { localStorage.setItem('hotpath.v1.warmups', JSON.stringify({ 'url-shortener': Date.now() })); return window.__game.loadProblem('url-shortener'); });
    await page.evaluate(async () => {
      const { problemById } = await import('./content/problems/index.js');
      const p = problemById.get('url-shortener'), game = window.__game;
      const ids = Object.fromEntries(game.getState().nodes.map(n => [n.id, n.id]));
      for (const n of p.editorial.designs[0].graph.nodes) {
        const id = ids[n.ref] || game.placeComponent(n.type, n.x, n.y); ids[n.ref] = id;
        for (const [k, v] of Object.entries({ units: n.units, zones: n.zones, ...n.knobs })) if (v !== undefined) game.setKnob(id, k, v);
      }
      for (const [a,b] of p.editorial.designs[0].graph.edges) { try { game.connect(ids[a], ids[b]); } catch {} }
      game.startTraffic(); game.step(86400000);
    });
    await page.waitForSelector('.pl-debrief .sh-feedback');
    assert.equal(await page.$$eval('.pl-debrief .sh-feedback', els => els.length), 1);
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.pl-debrief .sh-feedback').getBoundingClientRect(), actions = document.querySelector('.pl-debrief > .pl-actions').getBoundingClientRect();
      const report = document.querySelector('.pl-debrief').getBoundingClientRect();
      return { after: form.top >= actions.bottom, contained: form.left >= report.left && form.right <= innerWidth, score: !!document.querySelector('.pl-score-row, .pl-verdict-sec') };
    });
    assert.ok(layout.after && layout.contained && layout.score, JSON.stringify(layout));
    await page.waitForFunction(() => !document.querySelector('.sh-toast'), { timeout: 10000 });
    await page.$eval('.pl-debrief .sh-feedback', e => e.scrollIntoView({ block: 'center' }));
    if (process.env.SD_QA_SHOTS) await page.screenshot({ path: path.join(process.env.SD_QA_SHOTS, `feedback-${width}-${theme}.png`) });
    await page.focus('.pl-debrief .sh-feedback input[value="5"]'); await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await page.keyboard.type('Problem feedback'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.pl-debrief .sh-feedback [role=status]')?.textContent.includes('Thanks'));
    await click(page, 'Share'); await page.waitForSelector('.cp-dialog');
    await page.waitForFunction(() => document.querySelector('.cp-dialog input[readonly]')?.value.includes('#/beat/'));
    const beatHash = await page.$eval('.cp-link', el => new URL(el.value).hash);
    await click(page, 'Copy link'); await page.keyboard.press('Escape');
    await page.evaluate(() => window.__game.reset()); await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
    await page.waitForSelector('.pl-debrief'); assert.equal(await page.$('.pl-debrief .sh-feedback'), null, 'prompt does not repeat on retry');
    await page.evaluate(hash => { location.hash = hash; }, beatHash); await page.waitForSelector('.sh-beat .sh-h1');
    await page.evaluate(() => { const d = new Date(); location.hash = '#/challenge/' + `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}?play=1`; });
    await page.waitForFunction(() => window.__game.getState().mode === 'challenge');
    await page.evaluate(() => window.__game.startTraffic());
    // A lesson takeaway is reached through its ordinary final navigation.
    await page.evaluate(() => { location.hash = '#/learn/requests-and-latency'; });
    await page.waitForSelector('.sh-lesson-page');
    for (let step = 0; step < 8; step++) {
      await page.evaluate(async step => {
        const { lessonById } = await import('./content/lessons/index.js');
        const { transferFor } = await import('./content/transfers.js');
        const lesson = lessonById.get('requests-and-latency'), data = [...lesson.steps, transferFor(lesson.id)][step];
        const tap = document.querySelector('.sh-tap-btn');
        if (tap) { tap.click(); await new Promise(r => setTimeout(r, 600)); }
        const prediction = document.querySelector('.sh-prediction-form textarea');
        if (prediction) { prediction.value = 'Distance and server work add to the wait.'; prediction.dispatchEvent(new Event('input')); document.querySelector('.sh-prediction-form').requestSubmit(); }
        if (data.kind === 'quiz' || data.kind === 'transfer') {
          const answer = data.choices[data.answer];
          [...document.querySelectorAll('.sh-choice')].find(b => b.textContent.includes(answer)).click();
          if (data.kind === 'transfer') {
            const input = document.querySelector('input[type=number]'); input.value = String(data.value); input.dispatchEvent(new Event('input'));
            [...document.querySelectorAll('button')].find(b => b.textContent === 'Check my prediction').click();
          }
        }
        const buttons = [...document.querySelectorAll('.sh-lp-nav button')];
        const next = buttons.find(b => ['Continue', 'Skip this step', 'Finish lesson'].includes(b.textContent.trim()) || b.textContent.includes('Goal reached'));
        if (!next || next.disabled) throw Error('Lesson cannot continue from step ' + step); next.click();
      }, step);
      await wait(100);
    }
    await page.waitForSelector('.sh-lp-done .sh-feedback');
    await page.click('.sh-lp-done .sh-feedback input[value="4"]'); await page.type('.sh-lp-done .sh-feedback textarea', 'Lesson feedback'); await click(page, 'Send');
    await page.waitForFunction(() => document.querySelector('.sh-lp-done .sh-feedback [role=status]')?.textContent.includes('Thanks'));
    await click(page, 'Dismiss');
    await page.evaluate(() => { location.hash = '#/learn/requests-and-latency?step=7'; }); await page.waitForSelector('.sh-lp-card form');
    await page.evaluate(() => { location.hash = '#/learn/requests-and-latency?step=8'; }); await page.waitForSelector('.sh-lp-done');
    assert.equal(await page.$('.sh-lp-done .sh-feedback'), null, 'lesson prompt does not repeat');

    await page.evaluate(() => { location.hash = '#/practice/chat-app?interview=1'; }); await page.waitForSelector('.pl-defense-field textarea');
    await page.type('.pl-defense-field textarea', 'What scale, retention and failure guarantees do we need?'); await click(page, 'Commit questions'); await click(page, 'Write requirements');
    await page.type('.pl-defense-field textarea', 'Preserve messages durably, bound retries and measure the latency of each request path.'); await click(page, 'Commit requirements'); await click(page, 'Estimate the workload');
    await page.evaluate(async () => {
      const { problemById } = await import('./content/problems/index.js'), { estimateUnit } = await import('./ui/play/estimate-units.js');
      const p = problemById.get('chat-app'); document.querySelectorAll('.pl-panel input[type=number]').forEach((el,i) => { el.value = String(estimateUnit(p.numbers[i]).value); el.dispatchEvent(new Event('input')); });
    });
    await click(page, 'Commit estimates'); await click(page, 'Start drawing');
    await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); }); await page.waitForSelector('.pl-defense-card');
    await page.$$eval('.pl-defense-card', cards => cards.forEach(card => {
      const answer = card.querySelector('textarea'); answer.value = 'Test the measured limit and keep durable operation ids across retries and recovery.'; answer.dispatchEvent(new Event('input')); card.querySelector('form').requestSubmit(); card.querySelector('.hp-defense-claims input[type=checkbox]').click();
    }));
    await click(page, 'Save interview report');
    await page.waitForSelector('.pl-interview-result .sh-feedback'); await click(page, 'Dismiss');
    assert.ok(await page.$eval('.pl-interview-result .sh-feedback', el => el.hidden), 'an unsent prompt can be dismissed');
    await wait(1200);
    await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForSelector('#sh-s-counts');
    await page.click('#sh-s-counts');
    await wait(1500);
    assert.ok(feedback.some(f => f.page === 'general') && feedback.some(f => f.page === 'problem:url-shortener'));
    // Flush before switching the setting off, then prove no later events escape it.
    assert.equal(events.filter(e => e.name === 'app_opened').length, 1);
    assert.equal(events.filter(e => e.name === 'first_problem_started').length, 1);
    assert.equal(events.filter(e => e.name === 'intro_finished').length, 1);
    assert.equal(events.filter(e => e.name === 'lesson_finished').length, 1);
    assert.equal(events.filter(e => e.name === 'first_problem_passed').length, 1);
    assert.equal(events.filter(e => e.name === 'daily_challenge_played').length, 1);
    assert.equal(events.filter(e => e.name === 'beat_link_opened').length, 1);
    assert.equal(events.filter(e => e.name === 'interview_finished').length, 1);
    assert.ok(events.some(e => e.name === 'problem_passed'));
    assert.ok(events.some(e => e.name === 'result_shared'));
    const before = events.length;
    await page.evaluate(() => { dispatchEvent(new ErrorEvent('error', { error: new TypeError('private answer https://example.org/a?secret'), filename: 'https://systemdesigner.io/main.js' })); });
    await wait(1200); assert.equal(events.length, before, 'turning counts off suppresses error reports too');
    assert.deepEqual(errors, []); await page.close(); console.log(`Checked ${width}px ${theme}: intro, lesson, problem, share, beat, daily, interview and feedback.`);
  }

  for (const moduleFailure of [false, 'main.js', 'account/index.js']) {
    const page = await browser.newPage(), events = [];
    await page.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem('hotpath.v1.seenIntro','true'); });
    await page.setRequestInterception(true);
    page.on('request', r => moduleFailure && r.url().endsWith('/' + moduleFailure) ? r.abort() : r.continue());
    page.on('request', async r => { if (r.url().endsWith('/e') && r.method() === 'POST') events.push(...JSON.parse(r.postData() || await r.fetchPostData()).events); });
    await page.goto(base + '?measure=8794#/');
    if (!moduleFailure) {
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
      await page.evaluate(() => { for (let i=0;i<2;i++) dispatchEvent(new ErrorEvent('error', { error: new TypeError('Cannot read private answer https://example.org/a?secret from null'), filename: 'https://systemdesigner.io/ui/play/play.js?secret' })); });
    }
    const errorDeadline = Date.now() + 8000;
    while (!events.some(e => e.name === 'error') && Date.now() < errorDeadline) await wait(100);
    assert.equal(events.filter(e => e.name === 'error').length, 1);
    assert.doesNotMatch(JSON.stringify(events), /private answer|secret|https:/);
    assert.equal(events.find(e => e.name === 'error').errorName, moduleFailure ? 'ModuleError' : 'TypeError');
    await page.close();
  }
  const unavailable = await browser.newPage(), unavailableErrors = [];
  unavailable.on('pageerror', e => unavailableErrors.push(e.message));
  await unavailable.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem('hotpath.v1.seenIntro', 'true'); localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' })); });
  await unavailable.goto(base + '?measure=65534#/practice/url-shortener');
  await unavailable.waitForFunction(() => window.__game?.getState().problemId === 'url-shortener');
  await unavailable.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
  await unavailable.waitForSelector('.pl-debrief .sh-feedback');
  await unavailable.click('.sh-feedback input[value="3"]'); await click(unavailable, 'Send');
  await unavailable.waitForFunction(() => document.querySelector('.sh-feedback [role=status]')?.textContent.includes('Could not send'));
  assert.ok(await unavailable.$('.pl-debrief > .pl-actions button'));
  assert.deepEqual(unavailableErrors, []); await unavailable.close();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  assert.ok(db.prepare('SELECT sum(count) AS n FROM event_counts').get().n > 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM feedback').get().n, 12); db.close();
  for (const mode of [[], ['feedback']]) {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../api/stats.js', import.meta.url)), ...mode, '1'], { env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, mode.length ? /Lesson feedback/ : /interview_finished/);
    console.log(r.stdout.trim());
  }
  console.log('Anonymous browser collection and feedback checks passed in both themes at phone and desktop sizes.');
} finally { await browser.close(); await api.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
