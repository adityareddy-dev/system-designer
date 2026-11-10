// Route replacements discard older queued events while later navigation keeps its order.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.isNavigationRequest()
    ? request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Route checks</title>' })
    : request.continue());
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  const observed = await page.evaluate(async () => {
    const { createRouter } = await import('./core/router.js');
    const routes = [];
    const router = createRouter({ emit(name, route) { routes.push(route.path); } });
    const settle = () => new Promise(resolve => setTimeout(resolve, 100));
    router.go('#/learn');
    router.replace('#/settings');
    await settle();
    const replaced = { hash: location.hash, path: router.current().path, routes: [...routes] };
    routes.length = 0;
    router.go('#/practice');
    router.go('#/learn');
    router.replace('#/sandbox');
    router.replace('#/settings');
    router.go('#/challenge');
    router.go('#/practice');
    await settle();
    const later = { hash: location.hash, path: router.current().path, routes: [...routes] };
    routes.length = 0;
    router.back();
    await settle();
    return { replaced, later, back: { hash: location.hash, path: router.current().path, routes } };
  });
  assert.deepEqual(observed.replaced, { hash: '#/settings', path: '/settings', routes: ['/settings'] });
  assert.deepEqual(observed.later, { hash: '#/practice', path: '/practice', routes: ['/sandbox', '/settings', '/challenge', '/practice'] });
  assert.deepEqual(observed.back, { hash: '#/challenge', path: '/challenge', routes: ['/challenge'] });
  console.log('Replacements supersede queued routes; later changes and Back retain their order.');
} finally {
  await browser.close();
}
