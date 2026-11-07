// New dispatches start at the caller while retained copies and queued jobs keep their identity.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { lessons } from '../content/lessons/index.js';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro', 'true');
    localStorage.setItem('hotpath.v1.settings', JSON.stringify({ reducedMotion: 'full', soundMuted: true }));
  });
  for (const motion of ['full', 'reduce']) {
    await page.goto(base + '#/learn/load-balancing?step=2');
    await page.waitForSelector('.fg-bench[data-figure="load-balancing"]');
    await page.evaluate(motion => { document.documentElement.dataset.motion = motion; }, motion);
    await page.waitForFunction(motion => document.querySelector('.fg-bench').dataset.motion === motion, {}, motion);
    let previous;
    for (let sent = 1; sent <= 3; sent++) {
      const request = await page.evaluate(() => {
        document.querySelector('[data-control="send"]').click();
        const el = document.querySelector('[data-transient]');
        return { key: el.dataset.key, x: +el.dataset.x, y: +el.dataset.y, frames: el.getAnimations()[0]?.effect.getKeyframes().map(frame => frame.transform) || [] };
      });
      assert.notEqual(request.key, previous, 'each dispatch is a new request');
      previous = request.key;
      assert.equal(request.y, 13 + (sent - 1) * 37, 'round robin chooses the next server');
      assert.deepEqual(request.frames, motion === 'full' ? [`translate(${15 - request.x}px, ${210 - request.y}px)`, 'translate(0px, 0px)'] : [], 'each request starts at the caller');
    }
    await page.click('[data-control="tick"]');
    assert.equal(await page.$('[data-transient]'), null, 'working existing jobs does not dispatch another request');
    await page.goto(base + '#/learn');
    await page.waitForSelector('.sh-learn-page');
  }

  await page.goto(base + '#/learn/caching?step=2');
  await page.waitForSelector('.fg-bench[data-figure="caching"]');
  await page.evaluate(() => { document.documentElement.dataset.motion = 'full'; });
  await page.waitForFunction(() => document.querySelector('.fg-bench').dataset.motion === 'full');
  await page.click('[data-control="read"]');
  const cached = await page.$eval('[data-key="cached:1"]', el => ({ key: el.dataset.key, x: el.dataset.x, y: el.dataset.y }));
  await page.click('[data-control="write"]');
  assert.deepEqual(await page.$eval('[data-key="cached:1"]', el => ({ key: el.dataset.key, x: el.dataset.x, y: el.dataset.y })), cached, 'changing the origin retains the cache copy');
  assert.equal(await page.$eval('[data-key="cached:1"]', el => el.getAnimations().length), 0, 'the cache copy is not sent again');

  await page.goto(base + '#/learn/consistency?step=2');
  await page.waitForSelector('.fg-bench[data-figure="consistency"]');
  await page.evaluate(() => { document.documentElement.dataset.motion = 'full'; });
  await page.waitForFunction(() => document.querySelector('.fg-bench').dataset.motion === 'full');
  await page.click('[data-control="read"]');
  assert.equal(await page.$eval('[data-key="answer:1"]', el => el.getAnimations().length), 1, 'a replica read animates a response');
  for (const action of ['write', 'mode', 'deliver']) {
    if (action === 'mode') await page.select('[data-control="mode"]', 'strong');
    else await page.click(`[data-control="${action}"]`);
    const answer = await page.$eval('[data-key="answer:1"]', el => ({ sourceY: +el.dataset.fromY, animations: el.getAnimations().length }));
    assert.deepEqual(answer, { sourceY: 210, animations: 0 }, 'unrelated actions cannot replay or reroute the replica response');
  }
  await page.click('[data-control="read"]');
  const primaryRead = await page.$eval('[data-key="answer:2"]', el => ({ sourceY: +el.dataset.fromY, frames: el.getAnimations()[0]?.effect.getKeyframes().map(frame => frame.transform) }));
  assert.deepEqual(primaryRead, { sourceY: 55, frames: ['translate(120px, -65px)', 'translate(0px, 0px)'] }, 'an explicit primary read starts a new response at the primary');

  await page.goto(base + '#/learn/queues-backpressure?step=2');
  await page.waitForSelector('.fg-bench[data-figure="queues-backpressure"]');
  await page.click('[data-control="step"]');
  const moved = await page.evaluate(() => {
    document.querySelector('[data-control="step"]').click();
    const el = document.querySelector('[data-key="job10"]');
    return { x: +el.dataset.x, y: +el.dataset.y, frames: el.getAnimations()[0]?.effect.getKeyframes().map(frame => frame.transform) };
  });
  // job10 arrived this turn, so it starts at admission rather than the previous front's position.
  assert.deepEqual(moved.frames, [`translate(${25 - moved.x}px, ${40 - moved.y}px)`, 'translate(0px, 0px)']);
  // Leave enough jobs waiting that the next turn shifts an existing job to the front.
  await page.$eval('[data-control="arrivals"]', el => { el.value = '20'; el.dispatchEvent(new Event('input')); });
  await page.click('[data-control="step"]');
  const retained = await page.$eval('[data-key="job21"]', el => [+el.dataset.x, +el.dataset.y]);
  await page.click('[data-control="step"]');
  const shifted = await page.$eval('[data-key="job21"]', el => ({ x: +el.dataset.x, y: +el.dataset.y, frames: el.getAnimations()[0]?.effect.getKeyframes().map(frame => frame.transform) }));
  assert.deepEqual(shifted.frames, [`translate(${retained[0] - shifted.x}px, ${retained[1] - shifted.y}px)`, 'translate(0px, 0px)'], 'retained jobs interpolate from their previous place');
  const operations = [
    ['copies-quorums', 'quorum', 'write', 'reply:'],
    ['copies-quorums', 'quorum', 'read', 'reply:'],
    ['copies-quorums', 'quorum', 'repair', 'reply:'],
    ['storage-engine', 'write', 'write', 'record:'],
    ['storage-engine', 'read', 'read', 'lookup:'],
    ['leader-consensus', 'fence', 'stale', 'token:'],
    ['ai-serving', 'main', 'run', 'tokens:'],
    ['observability', 'main', 'incident', 'incident:'],
    ['realtime-connections', 'main', 'beat', 'heartbeat:'],
    ['metrics-systems', 'pipeline', 'ingest', 'samples:'],
    ['privacy-design', 'boundary', 'upload', 'summary:'],
    ['logs-traces', 'index', 'search', 'row:'],
    ['logs-traces', 'sampling', 'sample', 'tail:'],
    ['device-sync', 'deltas', 'sync', 'deltaA:'],
    ['work-across-services', 'outbox', 'recover', 'delivery:', ['step']],
    ['ordering-time', 'clocks', 'a', 'a:'],
  ];
  for (const motion of ['full', 'reduce']) for (const [id, view, action, prefix, setup = []] of operations) {
    const lesson = lessons.find(l => l.id === id);
    const index = lesson.steps.findIndex(s => s.kind === 'figure' && (s.view || 'main') === view);
    assert(index >= 0, `${id} has view ${view}`);
    // Return to the list so repeated cases also start with fresh model state.
    await page.goto(base + '#/learn');
    await page.waitForSelector('.sh-learn-page');
    await page.goto(base + `#/learn/${id}?step=${index}`);
    await page.waitForSelector(`.fg-bench[data-figure="${id}"][data-view="${view}"]`);
    await page.evaluate(motion => { document.documentElement.dataset.motion = motion; }, motion);
    await page.waitForFunction(motion => document.querySelector('.fg-bench').dataset.motion === motion, {}, motion);
    for (const action of setup) await page.click(`[data-control="${action}"]`);
    let previous;
    for (let repeat = 0; repeat < 2; repeat++) {
      const operation = await page.evaluate(({ action, prefix }) => {
        document.querySelector(`[data-control="${action}"]`).click();
        const packet = [...document.querySelectorAll('[data-packet]')].find(el => el.dataset.key.startsWith(prefix));
        return packet && { key: packet.dataset.key, animations: packet.getAnimations().length };
      }, { action, prefix });
      assert(operation, `${id} draws the operation`);
      assert.notEqual(operation.key, previous, `${id} gives each ${action} its own identity`);
      assert.equal(operation.animations, motion === 'full' ? 1 : 0, `${id} repeated ${action} respects ${motion} motion`);
      previous = operation.key;
    }
  }
  assert.deepEqual(errors, []);
  console.log('Dispatch origins, still states, retained cache copies and FIFO movement passed.');
} finally {
  await browser.close();
}
