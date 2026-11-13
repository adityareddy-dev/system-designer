// Draw the section share cards with the site's own type and colors.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { previewHtml, PREVIEW_FONTS } from './site-preview.mjs';

const cards = [
  ['problems', 'Practice problems', 'Build a system. Test your choices.'],
  ['learn', 'Learn system design', 'One idea at a time.'],
  ['guides', 'System design guides', 'Requirements. Decisions. Experiments.'],
  ['interview', 'System design interviews', 'Practise with a system you can test.']
];
fs.mkdirSync('assets/share', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  for (const [id, title, tagline] of cards) {
    let html = previewHtml({ kind: 'lesson', title, track: 'Free browser game', like: 'Read before you play' })
      .replace('Learn system design</div>', 'Read and practise</div>')
      .replace('One idea. Try it. See why it works.', tagline);
    for (const [key, file] of Object.entries(PREVIEW_FONTS)) html = html.replaceAll(key, 'data:font/woff2;base64,' + fs.readFileSync('assets/fonts/' + file).toString('base64'));
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `assets/share/${id}.png`, type: 'png' });
  }
} finally {
  await browser.close();
}
console.log('Wrote four 1200 by 630 section share cards.');
