// Release build: bundles the ES modules into a few files in dist/ (dev keeps running unbuilt from the source folder).
// Usage: node tools/release.mjs   (needs esbuild: set ESBUILD_DIR to a folder that has node_modules/esbuild, or install it next to this app)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { releaseDirectory, prepareReleaseDirectory } from './release-output.mjs';

const root = process.cwd();
const dist = releaseDirectory(root, process.env.RELEASE_DIR || path.join(root, 'dist'));

// Content data first, then the static preview pages (d/<date>/ and p/<problem>/) from that data, so a page never names a
// problem the game does not play that day. Preview images are drawn again for changed pages when puppeteer-core is there.
const node = (...a) => execFileSync(process.execPath, a, { cwd: root, stdio: 'inherit', env: process.env });
node('tools/gen-content.mjs');
try { node('tools/gen-daily-pages.mjs'); }
catch { console.warn('gen-daily-pages with images failed; writing the pages without new images'); node('tools/gen-daily-pages.mjs', '--no-images'); }
node('tools/gen-site-pages.mjs');
const req = createRequire(path.join(process.env.ESBUILD_DIR || root, 'noop.js'));
const esbuild = req('esbuild');

prepareReleaseDirectory(root, dist);

const res = await esbuild.build({
  entryPoints: { main: path.join(root, 'core/boot.js') },
  bundle: true, splitting: true, format: 'esm', minify: true, target: 'es2022',
  outdir: path.join(dist, 'js'), entryNames: '[name]', chunkNames: '[name]-[hash]',
  metafile: true, legalComments: 'none', logLevel: 'warning',
});

// Styles in one file, in the order index.html loads them.
const css = ['assets/palette.css', 'ui/shell/shell.css', 'ui/play/play.css', 'compete/compete.css', 'compete/pool.css', 'account/account.css', 'ui/shell/layout.css', 'assets/neo.css', 'assets/header.css']
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(dist, 'app.css'), (await esbuild.transform(css, { loader: 'css', minify: true })).code);

// Static files the pages fetch: data, images, icon index, plain pages.
function copy(from, to, skip = () => false) {
  const st = fs.statSync(from);
  if (st.isDirectory()) { for (const n of fs.readdirSync(from)) copy(path.join(from, n), path.join(to, n), skip); return; }
  if (skip(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
copy(path.join(root, 'catalog'), path.join(dist, 'catalog'));
copy(path.join(root, 'content/data'), path.join(dist, 'content/data'));
copy(path.join(root, 'assets'), path.join(dist, 'assets'), (f) => /\.(js|css)$/.test(f) || /preview\.html$/.test(f));
copy(path.join(root, 'assets/fonts.css'), path.join(dist, 'assets/fonts.css'));
copy(path.join(root, 'assets/site.css'), path.join(dist, 'assets/site.css'));
copy(path.join(root, 'assets/header.js'), path.join(dist, 'assets/header.js'));
for (const file of ['analytics.js', 'analytics.css', 'consent-region.js']) copy(path.join(root, 'assets', file), path.join(dist, 'assets', file));
copy(path.join(root, '_headers'), path.join(dist, '_headers'));
copy(path.join(root, 'assets/palette.css'), path.join(dist, 'assets/palette.css'));
for (const f of ['privacy.html', '404.html', 'd', 'p', 'problems', 'learn', 'guides', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'LICENSE', 'CNAME', '.nojekyll']) if (fs.existsSync(path.join(root, f))) copy(path.join(root, f), path.join(dist, f));

// All icons in one file (id → svg markup) so the workbench does not fetch them one by one.
const iconIndex = JSON.parse(fs.readFileSync(path.join(root, 'assets/icons/index.json'), 'utf8'));
const pack = {};
for (const i of iconIndex.icons || []) { try { pack[i.id] = fs.readFileSync(path.join(root, i.file), 'utf8'); } catch { /* missing file: the loader falls back */ } }
fs.writeFileSync(path.join(dist, 'assets/icons/pack.json'), JSON.stringify(pack));
fs.writeFileSync(path.join(dist, 'assets/icons/index.json'), JSON.stringify({ ...iconIndex, pack: true }));

// Page: one stylesheet, the bundle, and preloads for the files the first screen needs.
const out = res.metafile.outputs;
const mainOut = Object.keys(out).find((k) => out[k].entryPoint === 'core/boot.js') || Object.keys(out).find((k) => out[k].entryPoint);
const rel = (k) => path.relative(dist, path.resolve(root, k)).replaceAll(path.sep, '/');
// Chunks an output needs at start: its static imports, all the way down, minus what `skip` already covers.
function staticChunks(start, skip = new Set()) {
  const seen = new Set(skip); const list = [];
  (function walk(k) {
    if (seen.has(k) || !out[k]) return; seen.add(k); list.push(k);
    for (const i of out[k].imports) if (i.kind === 'import-statement') walk(i.path);
  })(start);
  return list;
}
const first = staticChunks(mainOut);
// The code of each page, fetched with import() when its route opens: found by the source file each chunk starts from.
const chunkOf = (src) => Object.keys(out).find((k) => out[k].entryPoint === src);
const covered = new Set(first);
const routeFiles = { home: 'ui/shell/home.js', learn: 'ui/shell/learn.js', lesson: 'ui/shell/lesson-page.js', practice: 'ui/shell/practice.js', problem: 'ui/shell/problem-page.js', challenge: 'ui/shell/challenge.js', sandbox: 'ui/shell/sandbox.js', drill: 'ui/shell/drill.js', settings: 'ui/shell/settings.js', play: 'ui/play/play.js' };
const M = {};
for (const [name, src] of Object.entries(routeFiles)) { const k = chunkOf(src); M[name] = k ? staticChunks(k, covered).map(rel) : []; }

const head = readIndexScript(M);
function readIndexScript(map) {
  const src = fs.readFileSync(path.join(root, 'tools/gen-preload.mjs'), 'utf8');
  const i = src.indexOf('const script = `'), j = src.indexOf('`;', i);
  // The route script from gen-preload.mjs, with this build's chunk lists in place of the source module lists.
  const body = src.slice(i + 'const script = `'.length, j).replace('${JSON.stringify(routes)}', () => JSON.stringify(map));
  return body;
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/  <link rel="stylesheet" href="assets\/palette\.css">[\s\S]*?<link rel="stylesheet" href="ui\/shell\/layout\.css">/, '  <link rel="stylesheet" href="app.css">');
html = html.replace(/  <!-- preload:start[\s\S]*?<!-- preload:end -->/, () => [
  ...first.map((k) => `  <link rel="modulepreload" href="${rel(k)}">`),
  ...['elements', 'requests', 'events', 'world'].map((n) => `  <link rel="preload" as="fetch" href="catalog/${n}.json" crossorigin>`),
  '  <link rel="preload" as="fetch" href="content/data/lite.json" crossorigin>',
  head,
].join('\n'));
html = html.replace('<script type="module" src="core/boot.js"></script>', '<script type="module" src="js/main.js"></script>');
fs.writeFileSync(path.join(dist, 'index.html'), html);

// Size report
const gz = (f) => zlib.gzipSync(fs.readFileSync(f)).length;
for (const k of Object.keys(out)) console.log(path.relative(root, path.join(root, k)).padEnd(40), String(fs.statSync(k).size).padStart(8), 'raw', String(gz(k)).padStart(7), 'gzip');
console.log('app.css'.padEnd(40), String(fs.statSync(path.join(dist, 'app.css')).size).padStart(8), 'raw', String(gz(path.join(dist, 'app.css'))).padStart(7), 'gzip');
