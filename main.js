// Boot: loads the catalog and content, builds ctx, applies theme and sound settings, mounts the shell, exposes test hooks.
import { createBus } from './core/bus.js';
import { createStore } from './core/store.js';
import { createRouter } from './core/router.js';
import { loadCatalog } from './sim/catalog.js';
import { loadContent } from './content/loader.js';
import { createSettings } from './ui/shell/settings.js';
import { createProgress } from './ui/shell/progress.js';
import { mountShell } from './ui/shell/shell.js';
import { createAudio } from './assets/sound.js';
import { getPalette } from './assets/palette.js';
import { createCompete } from './compete/index.js';
import { metrics } from './core/metrics.js';
import { accountRequired } from './account/config.js';

const root = document.documentElement;
const media = (q) => { try { return globalThis.matchMedia ? matchMedia(q) : null; } catch { return null; } };
const motionQuery = media('(prefers-reduced-motion: reduce)');

// Runtime errors are kept for window.__game.getState().errors.
const runtimeErrors = [];
addEventListener('error', (e) => runtimeErrors.push({ code: 'runtime', message: String(e.message || e.error || 'error') }));
addEventListener('unhandledrejection', (e) => runtimeErrors.push({ code: 'runtime', message: String(e.reason?.message || e.reason || 'rejection') }));

function fatal(msg) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'sh-boot sh-boot--bad';
  box.setAttribute('role', 'alert');
  const h = document.createElement('strong');
  h.textContent = 'The game could not start.';
  const p = document.createElement('p');
  p.textContent = msg;
  box.append(h, p);
  app.append(box);
}

async function boot() {
  const bus = createBus();
  const store = createStore();
  const settings = createSettings(store, bus);
  const progress = createProgress(store, bus);
  const router = createRouter(bus);
  const audio = createAudio();
  // The catalog and the content list (titles and card fields) load side by side; a problem or lesson file loads when its page opens.
  const [catalog, content] = await Promise.all([loadCatalog(), loadContent()]);
  const { problemById } = content;

  // One theme: the cream workbench.
  const theme = () => 'light';
  const reducedMotion = () => {
    const m = settings.get('reducedMotion');
    return m === 'reduce' ? true : m === 'full' ? false : !!motionQuery?.matches;
  };

  let perf = null;
  let perfLoad = null;
  // The frame counters live in the sim hooks, which only matter once a workbench opens.
  const loadPerf = () => (perfLoad ||= import('./sim/hooks.js').then((pm) => { if (pm && !perf) { perf = pm.createPerf(); globalThis.__perf = perf.data; } return pm; }).catch(() => null));

  const ctx = {
    catalog,
    content,
    bus, store, router, settings, progress, audio,
    compete: null,
    theme, reducedMotion,
    palette: () => getPalette(theme()),
    recordFrame: (f) => (perf ? perf.record(f) : undefined),
  };
  ctx.compete = createCompete(ctx);
  metrics.bind(ctx);
  // Optional sign-in: loaded after the first screen; when it cannot start, the game simply has no account features.
  ctx.account = null;
  // The hosted site (or ?preview=hosted) asks for a free account before any play; every other copy plays with no account.
  ctx.gate = { required: accountRequired() };
  let accountDone;
  ctx.accountReady = new Promise((r) => { accountDone = r; });

  // Theme, motion and contrast live on <html> so every stylesheet can follow them.
  let shownTheme = null;
  function applyLook() {
    const t = theme();
    root.dataset.theme = t;
    root.dataset.motion = reducedMotion() ? 'reduce' : 'full';
    root.dataset.contrast = settings.get('highContrast') ? 'high' : 'normal';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#FFF4E0');
    if (t !== shownTheme) { shownTheme = t; bus.emit('theme', { theme: t }); }
  }
  function applySound() {
    try {
      audio.setMaster(settings.get('soundMaster'));
      audio.setMuted(settings.get('soundMuted'));
      audio.setAmbient(settings.get('ambient'));
    } catch { /* audio is optional */ }
  }
  applyLook();
  applySound();
  bus.on('settings', ({ key }) => {
    if (key === 'theme' || key === 'reducedMotion' || key === 'highContrast') applyLook();
    if (key === 'soundMaster' || key === 'soundMuted' || key === 'ambient') applySound();
  });
  motionQuery?.addEventListener?.('change', () => { applyLook(); bus.emit('settings', { key: 'reducedMotion', value: settings.get('reducedMotion') }); });

  // The readable home page uses a content anchor before the game takes over.
  if (location.hash === '#content') router.replace('#/');
  // The page's first screen stays until the game's own first view is ready (mountShell swaps it in).
  const appEl = document.getElementById('app');
  const shell = mountShell(appEl, ctx);
  const startAccount = () => import('./account/index.js').then((m) => { ctx.account = m.createAccount(ctx); shell.attachAccount?.(); return ctx.account.ready; }).catch(err => { metrics.reportError(err, 'index.js', true); ctx.account = null; }).finally(() => accountDone());
  if (ctx.gate.required) startAccount();

  // ---- window.__game: drives the mounted play controller (CONTRACT 13.1)
  const nextRoute = (hash) => new Promise((resolve) => {
    const h = String(hash).startsWith('#') ? hash : '#' + hash;
    if (location.hash === h) { shell.show(h, { force: true }); resolve(); return; }
    const t = setTimeout(() => { off(); resolve(); }, 4000);
    const off = bus.once('route', () => { clearTimeout(t); resolve(); });
    router.go(h);
  });
  async function playFor(hash, opts) {
    await nextRoute(hash);
    const c = await shell.whenPlay(opts);
    if (!c) throw new Error('No workbench on ' + hash);
    await loadPerf();
    return c;
  }
  const need = () => {
    const c = shell.getPlay();
    if (!c) throw new Error('Open a problem, a lesson demo or the sandbox first.');
    return c;
  };
  const withErrors = (st) => {
    if (st && runtimeErrors.length) {
      const seen = new Set(st.errors.map((e) => e.message));
      st.errors.push(...runtimeErrors.filter((e) => !seen.has(e.message)));
    }
    return st;
  };
  globalThis.__game = {
    async loadProblem(id) {
      if (!problemById.has(id)) throw new Error('Unknown problem: ' + id);
      const c = await playFor('#/practice/' + id);
      return withErrors(await c.loadProblem(id));
    },
    async loadSandbox() {
      const c = await playFor('#/sandbox');
      return withErrors(c.getState());
    },
    async loadLesson(id, stepIndex) {
      const lesson = await content.ensureLesson(id);
      if (!lesson) throw new Error('Unknown lesson: ' + id);
      if (id === 'intro') return withErrors((await playFor('#/intro')).getState());
      const steps = lesson.steps || [];
      const n = stepIndex ?? Math.max(0, steps.findIndex((s) => s.kind === 'demo'));
      const c = await playFor(`#/learn/${id}${n ? '?step=' + n : ''}`, { prepareLesson: true });
      return withErrors(c.getState());
    },
    // an optional fourth argument drops the part onto that connection, as dragging onto a line does
    placeComponent: (type, x, y, edgeId) => need().placeComponent(type, x, y, edgeId),
    connect: (fromId, toId) => need().connect(fromId, toId),
    setKnob: (nodeId, knob, value) => need().setKnob(nodeId, knob, value),
    startTraffic: () => withErrors(need().startTraffic()),
    setSpeed: (n) => need().setSpeed(n),
    step: (simMs) => withErrors(need().step(simMs)),
    getState() {
      const c = shell.getPlay();
      if (c) return withErrors(c.getState());
      return { route: router.current().path, mode: null, problemId: null, step: null, phase: null, clock: { simMs: 0, label: '00:00' }, speed: 1,
        nodes: [], edges: [], traffic: null, slo: null, cost: null, score: null, scoreLive: null, events: [], errors: [...runtimeErrors] };
    },
    pause: () => need().pause(),
    reset: () => need().reset(),
  };
  // Ready means the first screen has been drawn: the route's page exists, then two animation frames pass (a timer stands in when frames are throttled).
  await shell.settled();
  await new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    setTimeout(fin, 400);
    try { requestAnimationFrame(() => requestAnimationFrame(fin)); } catch { fin(); }
  });
  const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 200));
  // A page with a workbench is ready once its counters exist; a text page does not wait for them.
  if (shell.hasPlay()) {
    await loadPerf();
    // Ready also means the stage has drawn: wait for the canvas (capped, so a slow network or a failed library still ends in ready).
    await Promise.race([shell.whenPlay().catch(() => null), new Promise((r) => setTimeout(r, 20000))]);
  } else idle(loadPerf);
  root.dataset.ready = '1';
  if (!ctx.gate.required) idle(startAccount);
}

boot().catch((err) => {
  metrics.reportError(err, 'main.js');
  console.error(err);
  fatal(err && err.message ? err.message : String(err));
});
