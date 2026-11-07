// New dispatches start at the caller while retained copies and queued jobs keep their identity.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

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
  assert.deepEqual(errors, []);
  console.log('Dispatch origins, still states, retained cache copies and FIFO movement passed.');
} finally {
  await browser.close();
}
