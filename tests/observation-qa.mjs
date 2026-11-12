// Browser privacy gates, game milestones and accessible feedback across sizes and themes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
import { CONSENT_VERSION, CONSENT_TEXT } from '../core/feedback-contract.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from '../api/server.js';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = await serveGame();
const base = site.base;
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
    let failFirstFeedback = true;
    await page.setViewport({ width, height: width === 390 ? 844 : 900, isMobile: width === 390, hasTouch: width === 390 });
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().endsWith('/feedback') && r.method() === 'POST' && failFirstFeedback) { failFirstFeedback = false; r.respond({ status: 503, headers: { 'Access-Control-Allow-Origin': new URL(base).origin }, body: '{}' }); return; }
      r.continue(r.url().startsWith('http://127.0.0.1:8794/') ? { headers: { ...r.headers(), 'x-forwarded-for': `192.0.2.${width === 390 ? 20 : 10}${theme === 'dark' ? 1 : 0}` } } : {});
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', async r => { if (r.url().endsWith('/e') && r.method() === 'POST') events.push(...JSON.parse(r.postData() || await r.fetchPostData()).events); if (r.url().endsWith('/feedback') && r.method() === 'POST') feedback.push(JSON.parse(r.postData() || await r.fetchPostData())); });
    await page.evaluateOnNewDocument(theme => {
      localStorage.clear(); localStorage.setItem('hotpath.v1.seenIntro', 'true');
      localStorage.setItem('hotpath.v1.settings', JSON.stringify({ theme, reducedMotion: 'reduce', soundMuted: true }));
    }, theme);
    await page.goto(base + '?measure=8794#/settings');
    await page.waitForSelector('#sh-s-counts');
    assert.ok(await page.$('button[data-feedback-general]'));
    const privacy = await page.evaluate(() => {
      const link = document.querySelector('.sh-privacy-actions a'), button = document.querySelector('[data-feedback-general]');
      const box = el => el.getBoundingClientRect(), style = getComputedStyle(link), probe = document.createElement('i');
      probe.style.color = 'var(--accent)'; document.body.append(probe); const accent = getComputedStyle(probe).color; probe.remove();
      return { link: box(link).toJSON(), button: box(button).toJSON(), color: style.color, accent, underline: style.textDecorationLine };
    });
    assert.equal(privacy.color, privacy.accent, 'privacy link uses the link color');
    assert.equal(privacy.underline, 'underline', 'privacy link is underlined');
    const apart = privacy.link.right + 16 <= privacy.button.left || privacy.link.bottom + 8 <= privacy.button.top;
    assert.ok(apart, `privacy link keeps its distance from Send feedback: ${JSON.stringify(privacy)}`);
    if (width === 390) {
      assert.ok(privacy.link.bottom <= privacy.button.top, 'phones stack the privacy link above Send feedback');
      assert.ok(privacy.link.height >= 44 && privacy.button.height >= 44, 'privacy controls are at least 44 px tall');
    }
    if (process.env.SD_QA_SHOTS) await page.screenshot({ path: path.join(process.env.SD_QA_SHOTS, `settings-${width}-${theme}.png`) });
    await click(page, 'Send feedback'); await page.waitForSelector('.sh-feedback');
    assert.equal(await page.$('.sh-feedback-more'), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('hotpath.v1.feedback.more.asked')), null);
    await page.focus('.sh-feedback button[type=button]'); await page.keyboard.press('Enter');
    assert.ok(await page.$eval('[data-feedback-general]', el => document.activeElement === el), 'dismiss restores keyboard focus to Send feedback');
    await page.keyboard.press('Enter'); await page.waitForSelector('.sh-feedback:not([hidden])');
    assert.equal(await page.evaluate(() => localStorage.getItem('hotpath.v1.feedback.more.asked')), null, 'opening and dismissing does not consume extra questions');
    await page.click('.sh-feedback input[value="4"]');
    await page.waitForSelector('.sh-feedback-more');
    assert.equal(await page.evaluate(() => localStorage.getItem('hotpath.v1.feedback.more.asked')), 'true');
    assert.deepEqual(await page.$$eval('.sh-feedback select', els => els.map(el => el.value)), ['', '', '', '']);
    assert.equal(await page.$('.sh-feedback input[type=email]'), null);
    assert.ok(await page.$eval('[name=quote]', el => !el.checked && el.disabled));
    assert.equal(await page.$eval('[name=country] option', el => el.textContent), 'Prefer not to say');
    for (const [key, value] of [['helped','yes'], ['use','interview'], ['country','IN'], ['role','engineer']]) {
      await page.select(`[name=${key}]`, value); await page.select(`[name=${key}]`, '');
    }
    await page.type('.sh-feedback textarea', 'General feedback');
    await page.$eval('[name=quote]', el => el.scrollIntoView({ block: 'center' }));
    await page.click('[name=quote]');
    assert.ok(await page.$eval('.sh-feedback-more', (el, text) => el.textContent.includes(text), CONSENT_TEXT));
    assert.match(await page.$eval('.sh-feedback', el => el.textContent), /We'll keep your comment/);
    assert.ok(await page.$eval('[name=name]', el => el.required && el.maxLength === 60 && el.labels.length));
    assert.ok(await page.$eval('[name=title]', el => el.required && el.maxLength === 80 && el.placeholder === 'e.g. backend engineer'));
    assert.ok(await page.$eval('[name=email]', el => !el.required && el.maxLength === 254 && el.type === 'email'));
    await click(page, 'Send'); assert.equal(feedback.length, 0, 'blank attribution blocks only the checked quote');
    await page.type('[name=name]', 'Private Person'); await page.type('[name=title]', 'Private Role'); await page.type('[name=email]', 'private@example.org');
    await page.click('[name=quote]');
    assert.equal(await page.$('.sh-feedback-personal'), null);
    await page.click('[name=quote]');
    assert.deepEqual(await page.$$eval('.sh-feedback-personal input', els => els.map(el => el.value)), ['', '', '']);
    await page.$eval('.sh-feedback textarea', el => { el.value = '  '; el.dispatchEvent(new Event('input')); });
    assert.ok(await page.$eval('[name=quote]', el => !el.checked && el.disabled));
    assert.equal(await page.$('[name=email]'), null);
    await page.$eval('.sh-feedback textarea', el => { el.value = 'General feedback'; el.dispatchEvent(new Event('input')); });
    await page.click('[name=quote]');
    await page.type('[name=name]', 'Test Person'); await page.type('[name=title]', 'Backend engineer'); await page.type('[name=email]', 'test@example.org');
    for (const [key, value] of [['helped','yes'], ['use','interview'], ['country','IN'], ['role','engineer']]) await page.select(`[name=${key}]`, value);
    await click(page, 'Send');
    await page.waitForFunction(() => document.querySelector('.sh-feedback [role=status]')?.textContent.includes('Could not send'));
    assert.deepEqual(feedback[0].about, { helped: 'yes', use: 'interview', country: 'IN', role: 'engineer' });
    assert.deepEqual(feedback[0].quote, { consent: true, consentVersion: CONSENT_VERSION, name: 'Test Person', title: 'Backend engineer', email: 'test@example.org' });
    assert.equal(await page.$eval('[name=name]', el => el.value), 'Test Person');
    await click(page, 'Send');
    await page.waitForFunction(() => document.querySelector('.sh-feedback [role=status]')?.textContent.includes('Thanks'));
    assert.deepEqual(feedback[1], feedback[0], 'retry preserves the whole response');
    assert.ok(await page.$$eval('.sh-feedback input,.sh-feedback select,.sh-feedback textarea,.sh-feedback button', els => els.every(el => el.disabled)));
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
    await page.click('.pl-debrief .sh-feedback input[value="5"]');
    assert.equal(await page.$('.pl-debrief .sh-feedback-more'), null, 'later page omits extras even after consent');
    // Clearing local data restores eligibility; expand the real debrief for its tallest layout.
    await page.evaluate(async () => {
      localStorage.clear();
      const { mountFeedback } = await import('./ui/shell/feedback.js');
      const { createStore } = await import('./core/store.js');
      const old = document.querySelector('.pl-debrief .sh-feedback'), host = old.parentElement;
      old.remove(); mountFeedback(host, { store: createStore() }, 'problem:url-shortener', {}, false);
    });
    await page.click('.pl-debrief .sh-feedback input[value="5"]');
    await page.type('.pl-debrief .sh-feedback textarea', 'Problem feedback');
    await page.click('.pl-debrief [name=quote]');
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.pl-debrief .sh-feedback').getBoundingClientRect(), actions = document.querySelector('.pl-debrief > .pl-actions').getBoundingClientRect();
      const report = document.querySelector('.pl-debrief').getBoundingClientRect();
      return { after: form.top >= actions.bottom, contained: form.left >= report.left && form.right <= innerWidth, score: !!document.querySelector('.pl-score-row, .pl-verdict-sec') };
    });
    assert.ok(layout.after && layout.contained && layout.score, JSON.stringify(layout));
    assert.ok(await page.evaluate(() => {
      const button = document.querySelector('.pl-debrief > .pl-actions button'); button.scrollIntoView({ block: 'center' });
      const b = button.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return b.top >= 0 && b.bottom <= innerHeight && button.contains(hit);
    }), 'debrief actions remain reachable and unobscured with the full quote form');
    await page.waitForFunction(() => !document.querySelector('.sh-toast'), { timeout: 10000 });
    await page.$eval('.pl-debrief .sh-feedback', e => e.scrollIntoView({ block: 'center' }));
    if (process.env.SD_QA_SHOTS) await page.screenshot({ path: path.join(process.env.SD_QA_SHOTS, `feedback-${width}-${theme}.png`) });
    await page.click('.pl-debrief [name=quote]');
    await page.focus('.pl-debrief .sh-feedback input[value="5"]'); await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.ok(await page.$eval('.pl-debrief .sh-feedback textarea', el => document.activeElement === el), await page.evaluate(() => document.activeElement.outerHTML));
    await page.keyboard.press('Tab');
    assert.ok(await page.$eval('.pl-debrief [name=helped]', el => document.activeElement === el));
    await page.select('.pl-debrief [name=helped]', 'a-bit'); await page.select('.pl-debrief [name=helped]', '');
    await page.focus('.pl-debrief .sh-feedback button[type=submit]'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.pl-debrief .sh-feedback [role=status]')?.textContent.includes('Thanks'));
    assert.equal(feedback.at(-1).quote, undefined); assert.equal(feedback.at(-1).about, undefined, 'cleared optional answers are omitted');
    await click(page, 'Share'); await page.waitForSelector('.cp-dialog');
    await page.waitForFunction(() => document.querySelector('.cp-dialog input[readonly]')?.value.includes('#/beat/'));
    const beatHash = await page.$eval('.cp-link', el => new URL(el.value).hash);
    await click(page, 'Copy link'); await page.keyboard.press('Escape');
    await page.evaluate(() => window.__game.reset()); await page.evaluate(() => { window.__game.startTraffic(); window.__game.step(86400000); });
    await page.waitForSelector('.pl-debrief'); assert.equal(await page.$('.pl-debrief .sh-feedback'), null, 'prompt does not repeat on retry');
    await page.evaluate(hash => { location.hash = hash; }, beatHash); await page.waitForSelector('.sh-beat .sh-h1');
    await page.evaluate(() => { location.hash = '#/challenge'; });
    await page.waitForSelector('.sh-challenge-page');
    await page.evaluate(() => {
      const play = [...document.querySelectorAll('.sh-quickplay,.sh-playmain')].find(el => el.checkVisibility());
      if (!play) throw Error('Challenge has no visible play action');
      play.click();
    });
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
    assert.equal(await page.$('.sh-lp-done .sh-feedback-more'), null);
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
      const answer = card.querySelector('textarea'); answer.value = 'Test the measured limit and keep durable operation ids across retries and recovery.'; answer.dispatchEvent(new Event('input')); card.querySelector('form').requestSubmit();
      const position = card.querySelector('.hp-defense-claims select'); position.value = 'fail'; position.dispatchEvent(new Event('change'));
      card.querySelector('.hp-defense-claims input[type=checkbox]').click();
    }));
    await click(page, 'Save interview report');
    await page.waitForSelector('.pl-interview-result .sh-feedback');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hotpath.v1.progress'))['chat-app'].interview.latest);
    assert(saved.defense.every(d => Object.values(d.claims).every(c => c.position === 'fail')), 'counted interviews preserve predictions against claims');
    const interviewLayout = await page.evaluate(() => {
      const report = document.querySelector('.pl-interview-result'), form = report.querySelector('.sh-feedback');
      return form.getBoundingClientRect().top >= report.querySelector('.pl-interview-report').getBoundingClientRect().bottom && document.querySelector('.pl-overlay--debrief').getBoundingClientRect().top >= document.querySelector('.pl-top').getBoundingClientRect().bottom;
    });
    assert(interviewLayout, 'feedback follows the interview report and clears the sticky controls');
    await click(page, 'Dismiss');
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
    await click(page, 'Send feedback');
    await page.focus('.sh-feedback input[value="3"]'); await page.keyboard.press('Space');
    assert.ok(await page.$eval('.sh-feedback input[value="3"]', el => el.checked), 'keyboard selects the feedback rating with counts off');
    assert.equal(await page.$('.sh-feedback-more'), null, 'general forms share the once-only marker');
    assert.equal(await page.$('.sh-feedback input[type=email]'), null);
    await click(page, 'Send');
    await page.waitForFunction(() => document.querySelector('.sh-feedback [role=status]')?.textContent.includes('Thanks')).catch(async error => {
      console.error('Feedback with counts off:', feedback, await page.$eval('.sh-feedback', el => ({ valid: el.checkValidity(), status: el.querySelector('[role=status]').textContent, rating: el.querySelector('[name=rating]:checked')?.value }))); throw error;
    });
    assert.equal(feedback.at(-1).quote, undefined, 'ordinary feedback works with automatic counts off');
    await page.evaluate(() => { dispatchEvent(new ErrorEvent('error', { error: new TypeError('private answer https://example.org/a?secret'), filename: 'https://systemdesigner.io/main.js' })); });
    await wait(1200); assert.equal(events.length, before, 'turning counts off suppresses error reports too');
    // Hidden construction consumes nothing; a revealed-but-skipped block is still once-only.
    const lifecycle = await page.evaluate(async () => {
      const { mountFeedback } = await import('./ui/shell/feedback.js');
      const { createStore } = await import('./core/store.js');
      localStorage.clear(); const ctx = { store: createStore() };
      const host = document.createElement('div'); host.hidden = true; document.body.append(host);
      mountFeedback(host, ctx, 'general', {}, true);
      const choose = () => { const el = host.querySelector('[name=rating]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); };
      choose(); const hiddenAsked = ctx.store.get('feedback.more.asked', false);
      host.hidden = false; choose();
      const visibleAsked = ctx.store.get('feedback.more.asked', false);
      let escapedKeys = 0; host.addEventListener('keydown', () => escapedKeys++);
      host.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      const labels = [...host.querySelectorAll('input,textarea,select')].every(el => el.labels?.length || el.getAttribute('aria-label'));
      const legends = [...host.querySelectorAll('legend')].map(el => el.textContent);
      host.querySelector('button[type=button]').click(); host.replaceChildren();
      mountFeedback(host, ctx, 'lesson:caching', {}, false); choose();
      const skippedOnPage = !host.querySelector('.sh-feedback-more'); host.replaceChildren();
      mountFeedback(host, ctx, 'general', {}, true); choose();
      const skippedOnGeneral = !host.querySelector('.sh-feedback-more'); host.remove();
      return { hiddenAsked, visibleAsked, escapedKeys, labels, legends, skippedOnPage, skippedOnGeneral };
    });
    assert.equal(lifecycle.hiddenAsked, false); assert.equal(lifecycle.visibleAsked, true);
    assert.equal(lifecycle.escapedKeys, 0); assert.equal(lifecycle.labels, true);
    for (const legend of ['Did it help?', 'What did you use it for?', 'Country', 'Your role', 'Can I quote you?']) assert.ok(lifecycle.legends.includes(legend));
    assert.equal(lifecycle.skippedOnPage, true); assert.equal(lifecycle.skippedOnGeneral, true);
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
  assert.equal(db.prepare('SELECT count(*) AS n FROM feedback').get().n, 16);
  assert.equal(db.prepare('SELECT count(*) AS n FROM quotes').get().n, 4, 'local data clearing leaves separate quotes intact'); db.close();
  for (const mode of [[], ['feedback']]) {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../api/stats.js', import.meta.url)), ...mode, '1'], { env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, mode.length ? /Lesson feedback/ : /interview_finished/);
    console.log(r.stdout.trim());
  }
  console.log('Anonymous browser collection and feedback checks passed in both themes at phone and desktop sizes.');
} finally { await browser.close(); await api.stop(); await site.close(); fs.rmSync(dir, { recursive: true, force: true }); }
