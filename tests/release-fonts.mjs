// Exercise release asset packaging and font and scene URLs, including deployments under a sub-path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'system-designer-fonts-'));
try {
  const source = fs.readFileSync(path.join(root, 'tools/release.mjs'), 'utf8');
  const staticAssets = source.slice(source.indexOf('function copy('), source.indexOf("for (const f of ['privacy.html'"));
  vm.runInNewContext(staticAssets, { fs, path, root, dist });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const href = html.match(/<link rel="stylesheet" href="([^"]*fonts\.css)"/)[1];
  const stylesheet = path.join(dist, href);
  const css = fs.readFileSync(stylesheet, 'utf8');
  const fonts = [...css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)];
  assert.equal(fonts.length, 3);
  for (const [, font] of fonts) assert(fs.statSync(path.resolve(path.dirname(stylesheet), font)).size > 0, 'release font URL resolves');
  const helper = fs.readFileSync(path.join(root, 'core/urls.js'), 'utf8')
    .replace('export function', 'function').replace('import.meta.url', 'moduleUrl');
  const scenes = fs.readdirSync(path.join(dist, 'assets/scenes')).filter(file => file.endsWith('.svg'));
  assert(scenes.length >= 24, 'lesson and challenge scenes are packaged');
  for (const appBase of ['https://example.com/', 'https://example.com/system-designer/']) {
    for (const modulePath of ['core/urls.js', 'js/chunk.js']) {
      const context = { URL, moduleUrl: new URL(modulePath, appBase).href };
      vm.runInNewContext(helper, context);
      for (const scene of scenes) {
        const asset = 'assets/scenes/' + scene;
        assert.equal(context.appUrl(asset), appBase + asset, 'scene stays inside the source or release app base');
        assert(fs.statSync(path.join(dist, asset)).size > 0, 'scene URL has a release asset');
      }
    }
  }
  console.log('Release font and scene URL checks passed.');
} finally {
  fs.rmSync(dist, { recursive: true, force: true });
}
