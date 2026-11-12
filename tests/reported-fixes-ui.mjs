// Click results and element bounds for the problems an independent review found: the header links, the phone gate, Editorial over the
// debrief, the phone traffic bar, the reading cards, the lesson label, the debrief cards and the signed-out wording.
// Run from the app folder: node tests/reported-fixes-ui.mjs [siteUrl]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER = JSON.stringify({ name: 'Preview player', avatar: null, providers: ['github'], email: 'p@example.com', surveyOptIn: false });

async function open(width, height, { signedIn = false, mobile = width < 700 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((user, on) => {
    try { sessionStorage.setItem('sd.preview', 'hosted'); localStorage.setItem('hotpath.v1.seenIntro', 'true'); if (on) sessionStorage.setItem('sd.preview.user', user); } catch { /* ignore */ }
  }, USER, signedIn);
  return page;
}
const visibleText = (page) => page.evaluate(() => document.body.innerText);

try {
  // T1: Sign in from a reading page opens the panel, from the front page of the site and from a page in the root
  for (const route of ['learn/', 'problems/', 'guides/', 'p/url-shortener/', 'privacy.html', '404.html']) {
    const page = await open(1280, 800);
    await page.goto(site.base + route, { waitUntil: 'load' });
    await page.click('.sd-signin');
    await page.waitForSelector('.ac-pop--modal', { visible: true, timeout: 15000 });
    const url = new URL(page.url());
    assert.equal(url.pathname, new URL(site.base).pathname, route + ': Sign in lands on the front page');
    assert(!/Nothing here|does not exist/i.test(await visibleText(page)), route + ': no missing-page message');
    await page.close();
  }
  // T1: the header's other links on a page in the root go to the game, not to a fragment of the same page
  for (const route of ['privacy.html', '404.html']) {
    const page = await open(1280, 800);
    await page.goto(site.base + route, { waitUntil: 'load' });
    await page.click('.sh-tab[data-tab="sandbox"]');
    await page.waitForFunction(() => location.pathname.endsWith('/') && location.hash.startsWith('#/'), { timeout: 15000 });
    assert.equal(new URL(page.url()).pathname, new URL(site.base).pathname, route + ': Sandbox opens the game');
    await page.waitForSelector('.sh-shell, .ac-gate', { timeout: 15000 });
    await page.close();
  }

  // T7: the same account state on the reading pages and on the 404 page, on a phone too
  for (const [w, h] of [[1280, 800], [440, 900]]) {
    for (const route of ['guides/', '404.html']) {
      const page = await open(w, h, { signedIn: true });
      await page.goto(site.base + route, { waitUntil: 'load' });
      await page.waitForSelector('.sd-me', { timeout: 8000 });
      assert.equal(await page.$('.sd-signin'), null, `${route} ${w}: no Sign in once signed in`);
      assert(await page.$eval('.sh-tab[data-tab="challenge"]', (el) => !el.hidden), `${route} ${w}: Challenge shows for a signed-in player`);
      assert(await page.$('.sh-icon-btn[aria-label="Settings"]'), `${route} ${w}: Settings link`);
      const nav = await page.$$eval('.sh-nav .sh-tab', (els) => els.filter((e) => !e.hidden).map((e) => e.getBoundingClientRect().height));
      assert(nav.length >= 5 && nav.every((x) => x >= 44), `${route} ${w}: the section bar has every tab at 44px or more`);
      await page.close();
    }
    const page = await open(w, h);
    await page.goto(site.base + '404.html', { waitUntil: 'load' });
    assert(await page.$('.sh-topbar .sh-brand'), '404 has the shared header');
    assert.equal(await page.$eval('.sh-brand', (a) => new URL(a.href).pathname), '/', '404 links start at the site root');
    await page.close();
  }

  // T2: the phone gate is one readable column
  {
    const page = await open(440, 956);
    await page.goto(site.base + '#/practice/url-shortener', { waitUntil: 'load' });
    await page.waitForSelector('.ac-gate-copy', { timeout: 15000 });
    await sleep(500);
    const m = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, y: r.y, r: r.right }; };
      return { copy: box('.ac-gate-copy'), side: box('.ac-gate-side'), provider: box('.ac-gate-side .ac-provider'), vw: innerWidth, cols: getComputedStyle(document.querySelector('.ac-gate')).gridTemplateColumns };
    });
    for (const k of ['copy', 'side', 'provider']) assert(m[k].w >= 280 && m[k].x >= 0 && m[k].r <= m.vw + 1, `phone gate ${k} is inside the screen and wide enough: ${JSON.stringify(m)}`);
    assert(!/0px/.test(m.cols), 'no zero-width column: ' + m.cols);
    assert(m.provider.y < 1100, 'the sign-in buttons are not pushed below a tall strip of text: ' + m.provider.y);
    await page.close();
  }

  // T10: signed-out challenge links and the share image do not promote the daily challenge
  for (const [w, h] of [[1280, 800], [440, 956]]) {
    const page = await open(w, h);
    await page.goto(site.base + '#/challenge', { waitUntil: 'load' });
    await page.waitForSelector('.ac-gate', { timeout: 15000 });
    assert(!/daily/i.test(await visibleText(page)), `signed-out challenge link ${w}: no mention of the daily challenge`);
    await page.close();
  }
  assert(!/Challenge/.test(fs.readFileSync(new URL('../assets/social-preview.svg', import.meta.url), 'utf8')), 'the share image does not advertise Challenge');

  // T8: reading cards open on a tap anywhere in the card, and links in lists are 44px
  {
    const page = await open(440, 956);
    for (const route of ['learn/', 'problems/']) {
      await page.goto(site.base + route, { waitUntil: 'load' });
      const bad = await page.evaluate(() => {
        const out = [];
        for (const li of document.querySelectorAll('.site-grid > li')) {
          const r = li.getBoundingClientRect();
          if (r.width < 1) continue;
          const own = li.querySelector('h2 a, h3 a, h4 a');
          if (!own) continue;
          li.scrollIntoView({ block: 'center' });
          const b = li.getBoundingClientRect();
          const hit = document.elementFromPoint(b.x + b.width - 12, b.y + b.height - 12);
          if (!hit || hit.closest('a') !== own) out.push(own.textContent.slice(0, 30));
          if (out.length > 3) break;
        }
        return out;
      });
      assert.deepEqual(bad, [], route + ': a tap in the lower corner of a card opens it');
    }
    await page.goto(site.base + 'p/url-shortener/', { waitUntil: 'load' });
    const small = await page.$$eval('.site-prose li > a, .site-panel li > a, .site-grid h3 a, .site-grid h4 a', (els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 43.5 && !e.closest('.site-grid')).map((e) => e.textContent.slice(0, 30)));
    assert.deepEqual(small, [], 'list links in a problem page are 44px tall');
    await page.close();
  }

  // T9: the lesson figure's labels fit their cards
  {
    const page = await open(440, 956, { signedIn: true });
    await page.goto(site.base + '#/learn/requests-and-latency', { waitUntil: 'load' });
    await page.waitForSelector('.sh-tap-end', { timeout: 15000 });
    await sleep(800);
    const bad = await page.$$eval('.sh-tap-end', (els) => els.map((e) => { const s = e.querySelector('span:not(.sh-ico)'); const a = s.getBoundingClientRect(), b = e.getBoundingClientRect(); return { t: s.textContent, lines: Math.round(a.height / 20), inside: a.bottom <= b.bottom && a.right <= b.right && a.left >= b.left }; }).filter((x) => x.lines > 1 || !x.inside));
    assert.deepEqual(bad, [], 'endpoint labels stay on one line inside their cards');
    await page.close();
  }

  // the play screens: a design, a traffic day, the debrief, Editorial
  const build = (page) => page.evaluate(async () => {
    const { problemById } = await import('./content/problems/index.js');
    const d = problemById.get('url-shortener').editorial.designs[0];
    const st = await window.__game.loadProblem('url-shortener');
    const have = new Set(st.nodes.map((n) => n.id));
    const idOf = new Map(st.nodes.map((n) => [n.id, n.id]));
    for (const n of d.graph.nodes) {
      if (have.has(n.ref)) continue;
      const id = window.__game.placeComponent(n.type, n.x, n.y);
      idOf.set(n.ref, id);
      for (const [k, v] of Object.entries(n.knobs || {})) window.__game.setKnob(id, k, v);
    }
    for (const e of d.graph.edges) { const [a, b] = Array.isArray(e) ? e : String(e).split('>'); window.__game.connect(idOf.get(a), idOf.get(b)); }
    document.querySelectorAll('.pl-panel .pl-btn--primary').forEach((b) => b.click());
  });

  // T4: every speed button and every measurement stays inside the phone screen while a day runs
  for (const [w, h] of [[440, 956], [390, 844], [320, 700]]) {
    const page = await open(w, h, { signedIn: true });
    await page.goto(site.base + '#/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game, { timeout: 15000 });
    await build(page);
    await page.evaluate(() => { window.__game.startTraffic(); window.__game.setSpeed(1); window.__game.step(9 * 3600000); });
    await sleep(1200);
    const m = await page.evaluate(() => {
      const hud = document.querySelector('.pl-hud');
      const parts = [...hud.querySelectorAll('.pl-speed-b, .pl-play, .pl-reset, .pl-clock, .pl-m-top, .pl-m-v, .pl-m-l, .pl-meters > *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
      const out = parts.filter((e) => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).map((e) => `${e.className} ${Math.round(e.getBoundingClientRect().right)}`);
      return { out, speeds: [...hud.querySelectorAll('.pl-speed-b')].map((e) => Math.round(e.getBoundingClientRect().right)), hudOverflow: hud.scrollWidth - hud.clientWidth, vw: innerWidth, n: parts.length };
    });
    assert.equal(m.speeds.length, 6, `${w}: six speeds`);
    assert.deepEqual(m.out, [], `${w}: nothing in the traffic bar leaves the screen: ${JSON.stringify(m)}`);
    assert(m.hudOverflow <= 1, `${w}: the traffic bar does not overflow itself: ${JSON.stringify(m)}`);
    await page.close();
  }

  // T3 and T6: Editorial is its own surface over the debrief, and the debrief uses the wide screen with the card look
  for (const [w, h] of [[2560, 1440], [3440, 1440], [440, 956]]) {
    const page = await open(w, h, { signedIn: true });
    await page.goto(site.base + '#/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game, { timeout: 15000 });
    await build(page);
    await page.evaluate(() => { window.__game.startTraffic(); window.__game.setSpeed(8); window.__game.step(86400000); });
    await page.waitForSelector('.pl-debrief', { visible: true, timeout: 20000 });
    await sleep(1200);
    if (w >= 2560) {
      const d = await page.evaluate(() => {
        const deb = document.querySelector('.pl-debrief'); const story = deb.querySelector('.pl-story, .pl-run-evidence'); const cs = getComputedStyle(story);
        const z = parseFloat(getComputedStyle(deb).zoom) || 1;
        return { width: deb.getBoundingClientRect().width, vw: innerWidth, border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth].map((x) => Math.round(parseFloat(x) * z * 10) / 10), shadow: (cs.boxShadow.match(/-?[\d.]+px/g) || []).slice(0, 2).map((x) => Math.round(parseFloat(x) * 10) / 10) };
      });
      assert(d.width >= d.vw * 0.55, `${w}: the debrief uses the width of the screen: ${JSON.stringify(d)}`);
      assert(d.border.every((x) => Math.abs(x - 2) < 0.15), `${w}: debrief cards have the 2px outline: ${d.border}`);
      assert(d.shadow.length === 2 && d.shadow[0] === d.shadow[1] && d.shadow[0] >= 3, `${w}: debrief cards have a hard offset shadow: ${d.shadow}`);
    }
    await page.evaluate(() => [...document.querySelectorAll('.pl-debrief button')].find((b) => /^Editorial/.test(b.textContent.trim()))?.click());
    await page.waitForSelector('.pl-overlay--editorial:not([hidden])', { timeout: 10000 });
    await sleep(500);
    const e = await page.evaluate(() => {
      const ed = document.querySelector('.pl-overlay--editorial');
      const bg = getComputedStyle(ed).backgroundColor;
      const r = ed.getBoundingClientRect();
      const hits = [];
      for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.2, 0.5, 0.8]) {
        const el = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
        hits.push(!el || ed.contains(el));
      }
      return { bg, allEditorial: hits.every(Boolean) };
    });
    assert(!/rgba\(.*, 0\)/.test(e.bg) && e.bg !== 'transparent', `${w}: Editorial has an opaque surface: ${e.bg}`);
    assert(e.allEditorial, `${w}: nothing of the debrief is on top of or between Editorial's content`);
    await page.close();
  }
  console.log('Reported fixes: header links, phone gate, Editorial surface, phone traffic bar, reading cards, lesson label, debrief cards and signed-out wording passed.');
} finally {
  await browser.close();
  await site.close();
}
