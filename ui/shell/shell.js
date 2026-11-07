// App shell: top bar, section navigation, route to view switching, toasts, progress wiring.
import { h, ico, clear, lessonOf } from './dom.js';
import { setOverlayHost, toast, closeAllModals } from './overlay.js';
import { transitionScreen } from './motion.js';

const TABS = [
  { id: 'learn', label: 'Learn', icon: 'ui.learn', href: '#/learn' },
  { id: 'practice', label: 'Practice', icon: 'ui.practice', href: '#/practice' },
  { id: 'challenge', label: 'Challenge', icon: 'ui.challenge', href: '#/challenge' },
  { id: 'sandbox', label: 'Sandbox', icon: 'ui.sandbox', href: '#/sandbox' },
];

const LOGO = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
<defs><linearGradient id="sh-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
<rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#sh-lg)"/>
<path d="M8 21c4 0 4-10 8-10s4 10 8 10" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
<circle cx="8" cy="21" r="2.4" fill="#fff"/><circle cx="16" cy="11" r="2.4" fill="#fff"/><circle cx="24" cy="21" r="2.4" fill="#fff"/></svg>`;

function parseHash(s) {
  const raw = String(s || '').replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return { path: '/' + path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function mountShell(rootEl, ctx) {
  const { bus, router, settings } = ctx;
  clear(rootEl);
  const overlayEl = document.getElementById('overlay') || rootEl.appendChild(h('div', { id: 'overlay' }));
  setOverlayHost(overlayEl);

  // Chrome
  const themeBtn = h('button', { type: 'button', class: 'sh-icon-btn', id: 'sh-theme-btn' });
  const soundBtn = h('button', { type: 'button', class: 'sh-icon-btn', id: 'sh-sound-btn' });
  const settingsLink = h('a', { class: 'sh-icon-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, ico('ui.settings', 20));
  const nav = h('nav', { class: 'sh-nav', 'aria-label': 'Sections' },
    TABS.map((t) => h('a', { class: 'sh-tab', href: t.href, dataset: { tab: t.id } }, ico(t.icon, 20), h('span', { class: 'sh-tab-label', text: t.label }))));
  const brand = h('a', { class: 'sh-brand', href: '#/', 'aria-label': 'System Designer home' }, h('span', { class: 'sh-brand-mark', html: LOGO }), h('span', { class: 'sh-brand-name', text: 'System Designer' }));
  // Optional account button; stays empty and hidden when sign-in is not available.
  const accountSlot = h('div', { class: 'sh-account', hidden: true });
  const bar = h('header', { class: 'sh-topbar' }, brand, h('div', { class: 'sh-actions' }, accountSlot, themeBtn, soundBtn, settingsLink));
  const attachAccount = () => { try { ctx.account?.mountHeader?.(accountSlot); } catch { /* the game works without accounts */ }
    if (ctx.account) { try { ctx.bus?.emit('account:attached'); } catch { /* ignore */ } }
  };
  attachAccount();
  const main = h('main', { class: 'sh-main', id: 'sh-main', tabindex: '-1' });
  const skip = h('a', { class: 'sh-skip', href: '#sh-main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content');
  const shell = h('div', { class: 'sh-shell' }, skip, bar, nav, main);
  // The intro is full screen but keeps the section bar on phones, so there is always a way out.
  const setImmersive = (on) => { shell.dataset.immersive = on ? '1' : '0'; overlayEl.dataset.immersive = on ? '1' : '0'; shell.dataset.nav = on && view && view.nav ? '1' : '0'; };
  main.addEventListener('sh:immersive', () => setImmersive(view && view.immersive));
  rootEl.append(shell);

  const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' };
  function refreshButtons() {
    document.documentElement.dataset.contrast = settings.get('highContrast') ? 'high' : 'normal';
    const t = settings.get('theme');
    themeBtn.replaceChildren(ico('ui.theme-' + t, 20));
    themeBtn.setAttribute('aria-label', `Theme: ${t}. Switch to ${THEME_NEXT[t]}.`);
    themeBtn.title = `Theme: ${t}`;
    const muted = settings.get('soundMuted');
    soundBtn.replaceChildren(ico(muted ? 'ui.sound-off' : 'ui.sound-on', 20));
    soundBtn.setAttribute('aria-label', muted ? 'Sound is off. Turn on.' : 'Sound is on. Turn off.');
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.title = muted ? 'Sound off' : 'Sound on';
  }
  themeBtn.addEventListener('click', () => settings.set('theme', THEME_NEXT[settings.get('theme')]));
  soundBtn.addEventListener('click', () => {
    const next = !settings.get('soundMuted');
    settings.set('soundMuted', next);
    if (!next) { try { ctx.audio.unlock(); ctx.audio.play('ui.tap'); } catch { /* ignore */ } }
  });
  refreshButtons();

  // First touch unlocks audio (browsers require a gesture).
  const unlock = () => { try { ctx.audio.unlock(); } catch { /* ignore */ } };
  rootEl.addEventListener('pointerdown', unlock, { once: true });
  rootEl.addEventListener('keydown', unlock, { once: true });

  // View switching
  let view = null;
  let lastKey = null;
  let viewId = null;
  let routeTrail = [];

  // Each page's code loads when its route opens. `prep` fetches the one problem or lesson file the page needs.
  const { content } = ctx;
  const dailyProblem = (r) => {
    try {
      const date = /^\d{4}-\d\d-\d\d$/.test(r.parts[1] || '') ? r.parts[1] : undefined;
      return content.ensureProblem(ctx.compete.daily.dailyFor(date).problemId);
    } catch { return null; }
  };
  const routes = {
    '': () => ({ load: () => import('./home.js'), make: (m, host, r) => m.renderHome(host, ctx, r) }),
    intro: () => ({ load: () => import('./lesson-page.js'), prep: () => content.ensureLesson('intro'), make: (m, host, r) => m.renderIntro(host, ctx, r) }),
    learn: (r) => (r.parts[1]
      ? { load: () => import('./lesson-page.js'), prep: () => content.ensureLesson(r.parts[1]), make: (m, host) => m.renderLesson(host, ctx, r) }
      : { load: () => import('./learn.js'), make: (m, host) => m.renderLearn(host, ctx, r) }),
    practice: (r) => (r.parts[1]
      ? { load: () => import('./problem-page.js'), prep: () => content.ensureProblem(r.parts[1]), make: (m, host) => m.renderProblem(host, ctx, r) }
      : { load: () => import('./practice.js'), make: (m, host) => m.renderPractice(host, ctx, r) }),
    challenge: (r) => ({ load: () => import('./challenge.js'), prep: () => dailyProblem(r), make: (m, host) => m.renderChallenge(host, ctx, r) }),
    beat: (r) => ({ load: () => import('./challenge.js'), make: (m, host) => m.renderBeat(host, ctx, r) }),
    drill: (r) => ({ load: () => import('./drill.js'), prep: () => content.ensureLessons(), make: (m, host) => m.renderDrill(host, ctx, r) }),
    sandbox: (r) => ({ load: () => import('./sandbox.js'), make: (m, host) => m.renderSandbox(host, ctx, r) }),
    settings: () => ({ load: () => import('./settings.js'), make: (m, host) => ({ destroy: m.renderSettings(host, ctx) }) }),
  };
  let seq = 0;
  let pending = Promise.resolve();

  function viewKey(r) {
    const p = r.parts;
    // Practice list filters change the query only: keep the view and let it update.
    if (p[0] === 'practice' && !p[1]) return 'practice';
    return r.path;
  }

  function show(routeIn, opts = {}) {
    const r = typeof routeIn === 'string' ? parseHash(routeIn) : routeIn || router.current();
    const full = r.path + '?' + new URLSearchParams(r.query || {}).toString();
    if (!opts.force && full === lastKey) return;
    lastKey = full;
    const key = viewKey(r);
    const mine = ++seq;
    if (!opts.force && view && viewId === key && typeof view.update === 'function') {
      main.removeAttribute('aria-busy');
      pending = Promise.resolve();
      view.update(r);
      setImmersive(view.immersive);
      return;
    }
    const route = routes[r.parts[0] || ''];
    const spec = route?.(r);
    const previous = viewId;
    const trailIndex = routeTrail.lastIndexOf(key);
    const returning = trailIndex >= 0 && trailIndex < routeTrail.length - 1;
    pending = (async () => {
      let mod, error;
      main.setAttribute('aria-busy', 'true');
      try { if (spec) [mod] = await Promise.all([spec.load(), spec.prep ? spec.prep() : null]); }
      catch (err) { console.error(err); error = err; }
      if (mine !== seq) return;
      const depth = path => (path || '').split('/').filter(Boolean).length;
      await transitionScreen(() => {
        if (mine !== seq) return;
        closeAllModals();
        if (view?.destroy) { try { view.destroy(); } catch { /* optional */ } }
        view = null; viewId = key;
        if (returning) routeTrail.length = trailIndex + 1;
        else if (routeTrail.at(-1) !== key) routeTrail.push(key);
        clear(main); main.scrollTop = 0; main.removeAttribute('aria-busy');
        const tab = r.parts[0] === 'beat' ? 'challenge' : ['intro', 'drill'].includes(r.parts[0]) ? 'learn' : r.parts[0];
        nav.querySelectorAll('.sh-tab').forEach(a => {
          if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        const page = h('div', { class: 'sh-view' + (document.documentElement.dataset.transitioning ? ' sh-view--native' : '') }); main.append(page);
        try { view = error || !spec ? (page.append(notFound(error ? 'This page could not load. Check your connection and try again.' : undefined)), {}) : spec.make(mod, page, r) || {}; }
        catch (err) { console.error(err); page.append(notFound('Something went wrong drawing this page.')); view = {}; }
        finish(opts);
      }, { reduced: !previous || ctx.reducedMotion(), direction: returning || depth(previous) > depth(key) ? 'back' : 'forward' });
    })();
  }

  function finish(opts) {
    const immersive = !!view.immersive;
    setImmersive(immersive);
    document.title = (view.title ? view.title + ' | ' : '') + 'System Designer';
    if (opts.focus !== false && !immersive) main.focus({ preventScroll: true });
  }

  function notFound(msg = 'That page does not exist.') {
    return h('div', { class: 'sh-page sh-page--narrow sh-empty' }, h('h1', { class: 'sh-h1', text: 'Nothing here' }), h('p', { class: 'sh-muted', text: msg }), h('a', { class: 'sh-btn sh-btn--primary', href: '#/' }, 'Back to home'));
  }

  // Bus wiring
  const offs = [];
  offs.push(bus.on('route', (r) => show(r)));
  offs.push(bus.on('settings', refreshButtons));
  offs.push(bus.on('toast', (t) => toast(t)));
  offs.push(bus.on('lesson:done', ({ lessonId }) => { if (lessonId) ctx.progress.lessonDone(lessonId); }));
  offs.push(bus.on('play:day-end', (e) => onDayEnd(e)));

  function onDayEnd({ mode, problemId, seed, result, hintsUsed }) {
    if (!result) return;
    if (mode === 'practice' && problemId) {
      const r = ctx.progress.record(problemId, result, hintsUsed || 0);
      if (result.passed && result.learning && !result.learning.traceChecked) toast({ text: 'Traffic passed. Trace still open.', level: 'info' });
      else if (result.passed && result.learning?.assisted) toast({ text: 'Traffic passed with assistance.', level: 'info' });
      else if (r.first && (result.stars || 0) > 0) toast({ text: `Solved with ${result.stars || 0} star${result.stars === 1 ? '' : 's'}. Nicely done.`, level: 'ok', ms: 4200 });
      else if (r.improved && r.previousBest != null && (result.stars || 0) > 0) toast({ text: 'New personal best on this problem.', level: 'ok' });
    }
    if (mode !== 'sandbox' && mode !== 'lesson' && mode !== 'intro' && problemId) {
      try { ctx.compete.bests.record(`${mode}:${problemId}:${seed}`, result); } catch { /* ignore */ }
    }
  }

  // Start. First visit goes to the intro unless the integrator turned that off.
  const first = router.current();
  if (ctx.autoIntro !== false && (!first.parts || !first.parts.length) && ctx.store.get('seenIntro', false) !== true && lessonOf(ctx, 'intro')) {
    router.replace('#/intro');
  }
  show(router.current());

  return {
    show,
    attachAccount,
    // Test and integration hooks: the live play controller of the current view.
    getPlay: () => (view && view.play ? view.play.controller : null),
    whenPlay: async () => { await pending; return view && view.play ? view.play.ready : null; },
    hasPlay: () => !!(view && view.play),
    settled: () => pending,
    destroy() {
      offs.forEach((o) => { try { o(); } catch { /* ignore */ } });
      if (view && view.destroy) { try { view.destroy(); } catch { /* ignore */ } }
      closeAllModals();
      clear(rootEl);
    },
  };
}
