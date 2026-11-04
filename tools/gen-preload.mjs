// Writes the early-fetch hints into index.html: the modules the first screen always needs as <link rel="modulepreload">,
// and a tiny script that adds the page code (and the workbench code) for the route being opened.
// Run from the app folder after adding or moving a module: node tools/gen-preload.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RE = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g;

// Static imports only, depth first; files in `skip` are already covered.
function graph(entry, skip = new Set()) {
  const seen = new Set(skip);
  const order = [];
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    order.push(file);
    for (const m of src.matchAll(RE)) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1] || m[2]));
      if (dep.endsWith('.js') && fs.existsSync(path.join(root, dep))) walk(dep);
    }
  })(entry);
  return order;
}

const shell = graph('main.js');
const covered = new Set(shell);
const routes = {};
for (const [name, file] of Object.entries({
  home: 'ui/shell/home.js', learn: 'ui/shell/learn.js', lesson: 'ui/shell/lesson-page.js', practice: 'ui/shell/practice.js',
  problem: 'ui/shell/problem-page.js', challenge: 'ui/shell/challenge.js', sandbox: 'ui/shell/sandbox.js', drill: 'ui/shell/drill.js', settings: 'ui/shell/settings.js',
})) routes[name] = graph(file, covered);
// The workbench: loaded by the playable routes (the lesson, problem, intro, beat and sandbox pages).
routes.play = graph('ui/play/play.js', new Set([...covered, ...Object.values(routes).flat().filter((f) => !f.startsWith('ui/play/') && !f.startsWith('render/') && !f.startsWith('sim/'))]));
for (const k of Object.keys(routes)) if (k !== 'play') routes[k] = routes[k].filter((f) => !routes.play.includes(f));

const extra = ['catalog/elements.json', 'catalog/requests.json', 'catalog/events.json', 'catalog/world.json', 'content/data/lite.json'];
const tags = [
  ...shell.map((f) => `  <link rel="modulepreload" href="${f}">`),
  ...extra.map((f) => `  <link rel="preload" as="fetch" href="${f}" crossorigin>`),
].join('\n');

const script = `  <script>
  // Starts fetching the code and data of the page being opened (made by tools/gen-preload.mjs).
  (function () {
    var M = ${JSON.stringify(routes)};
    var hs = location.hash.slice(1); if (hs.charAt(0) === '/') hs = hs.slice(1);
    var parts = hs.split('?')[0].split('/');
    var a = parts[0], b = parts[1], seen = false, use = [], data = [], play = false;
    try { seen = localStorage.getItem('hotpath.v1.seenIntro') === 'true'; } catch (e) {}
    if (a === 'intro' || (!a && !seen)) { use = M.lesson; data = ['content/data/l/intro.json']; play = true; }
    else if (!a) use = M.home;
    else if (a === 'learn') { if (b) { use = M.lesson; data = ['content/data/l/' + b + '.json']; play = true; } else use = M.learn; }
    else if (a === 'practice') { if (b) { use = M.problem; data = ['content/data/p/' + b + '.json']; play = true; } else use = M.practice; }
    else if (a === 'challenge' || a === 'beat') { use = M.challenge; play = a === 'beat'; }
    else if (a === 'sandbox') { use = M.sandbox; play = true; }
    else if (a === 'drill') { use = M.drill; data = ['content/data/lessons.json']; }
    else if (a === 'settings') use = M.settings;
    var head = document.head;
    function add(rel, href, as, cors) { var l = document.createElement('link'); l.rel = rel; l.href = href; if (as) l.as = as; if (cors) l.crossOrigin = ''; head.appendChild(l); }
    use.forEach(function (f) { add('modulepreload', f); });
    data.forEach(function (f) { add('preload', f, 'fetch', true); });
    // The workbench code waits until the page is drawn, so it does not slow the first screen down.
    if (play) document.addEventListener('sd:play', function () {
      M.play.forEach(function (f) { add('modulepreload', f); });
      add('preload', 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js', 'script');
    }, { once: true });
  })();
  </script>`;

const html = fs.readFileSync('index.html', 'utf8');
const block = `  <!-- preload:start (made by tools/gen-preload.mjs) -->\n${tags}\n${script}\n  <!-- preload:end -->`;
fs.writeFileSync('index.html', html.replace(/  <!-- preload:start[\s\S]*?<!-- preload:end -->/, () => block));
console.log(`${shell.length} shell modules; route sets: ${Object.entries(routes).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
