// App shell: top bar, section navigation, route to view switching, toasts, progress wiring.
import { metrics } from '../../core/metrics.js';
import { h, ico, clear, lessonOf } from './dom.js';
import { setOverlayHost, toast, closeAllModals } from './overlay.js';
import { transitionScreen } from './motion.js';
import { completionState } from '../play/completion.js';
import { isPlayRoute } from '../../account/config.js';

const TABS = [
  { id: 'learn', label: 'Learn', icon: 'ui.learn', href: '#/learn' },
  { id: 'practice', label: 'Practice', icon: 'ui.practice', href: '#/practice' },
  { id: 'challenge', label: 'Challenge', icon: 'ui.challenge', href: '#/challenge' },
  { id: 'sandbox', label: 'Sandbox', icon: 'ui.sandbox', href: '#/sandbox' },
  { id: 'guides', label: 'Guides', icon: 'ui.editorial', href: 'guides/' },
];

const LOGO = `<svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true" focusable="false"><rect x="2" y="2" width="28" height="28" rx="6" fill="#141414"/><path d="M11 14 20 10M11 18l9 4" stroke="#FFF4E0" stroke-width="2"/><circle cx="8.5" cy="16" r="3.5" fill="#FFC93C"/><circle cx="23" cy="8.5" r="3.5" fill="#FF5B3A"/><circle cx="23" cy="23.5" r="3.5" fill="#2D5BFF"/></svg>`;

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
  const soundBtn = h('button', { type: 'button', class: 'sh-icon-btn', id: 'sh-sound-btn' });
  const settingsLink = h('a', { class: 'sh-icon-btn', href: '#/settings', 'aria-label': 'Settings', title: 'Settings' }, ico('ui.settings', 20));
  const nav = h('nav', { class: 'sh-nav', 'aria-label': 'Sections' },
    TABS.map((t) => h('a', { class: 'sh-tab', href: t.href, dataset: { tab: t.id } }, ico(t.icon, 20), h('span', { class: 'sh-tab-label', text: t.label }))));
  // The daily challenge is for signed-in players: a signed-out visitor on the hosted site does not see it in the bar.
  let signedIn = false;
  const syncChallengeTab = (st) => {
    if (st && typeof st === 'object') signedIn = !!st.user;
    const tab = nav.querySelector('[data-tab="challenge"]');
    if (tab) tab.hidden = !!(ctx.gate?.required && !signedIn);
  };
  const brand = h('a', { class: 'sh-brand', href: '#/', 'aria-label': 'System Designer home' }, h('span', { class: 'sh-brand-mark', html: LOGO }), h('span', { class: 'sh-brand-name', text: 'System Designer' }));
  // Optional account button; stays empty and hidden when sign-in is not available.
  const accountSlot = h('div', { class: 'sh-account', hidden: true });
  const bar = h('header', { class: 'sh-topbar' }, brand, h('div', { class: 'sh-actions' }, accountSlot, soundBtn, settingsLink));
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

  function refreshButtons() {
    document.documentElement.dataset.contrast = settings.get('highContrast') ? 'high' : 'normal';
    const muted = settings.get('soundMuted');
    soundBtn.replaceChildren(ico(muted ? 'ui.sound-off' : 'ui.sound-on', 20));
    soundBtn.setAttribute('aria-label', muted ? 'Sound is off. Turn on.' : 'Sound is on. Turn off.');
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.title = muted ? 'Sound off' : 'Sound on';
  }
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
    let spec = route?.(r);
    // On the hosted site a play page needs a signed-in player: wait for the account check, then show the real page or the sign-in page.
    if (spec && ctx.gate?.required && isPlayRoute(r.parts)) {
      const real = spec;
      spec = {
        load: () => Promise.all([real.load(), import('../../account/gate.js')]),
        prep: async () => { await ctx.accountReady; if (ctx.account?.isSignedIn()) await real.prep?.(); },
        make: ([m, g], host, rr) => (ctx.account?.isSignedIn() ? real.make(m, host, rr) : g.renderGate(host, ctx, rr)),
      };
    }
    const previous = viewId;
    const trailIndex = routeTrail.lastIndexOf(key);
    const returning = trailIndex >= 0 && trailIndex < routeTrail.length - 1;
    pending = (async () => {
      let mod, error;
      main.setAttribute('aria-busy', 'true');
      try { if (spec) [mod] = await Promise.all([spec.load(), spec.prep ? spec.prep() : null]); }
      catch (err) { metrics.reportError(err, 'shell.js', true); console.error(err); error = err; }
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
        catch (err) { metrics.reportError(err, 'shell.js'); console.error(err); page.append(notFound('Something went wrong drawing this page.')); view = {}; }
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
  offs.push(bus.on('account', syncChallengeTab));
  syncChallengeTab();
  // Signing in on a sign-in page opens the page that was asked for; signing out of a play page goes back to the sign-in page.
  offs.push(bus.on('account', (st) => {
    if (!ctx.gate?.required) return;
    const r = router.current();
    if (!isPlayRoute(r.parts)) return;
    const signedIn = !!st?.user;
    if ((signedIn && view?.gate) || (!signedIn && view && !view.gate && viewId !== null)) show(r, { force: true, focus: false });
  }));
  offs.push(bus.on('toast', (t) => toast(t)));
  offs.push(bus.on('lesson:done', ({ lessonId }) => { if (lessonId) ctx.progress.lessonDone(lessonId); }));
  offs.push(bus.on('play:day-end', (e) => onDayEnd(e)));

  function onDayEnd({ mode, problemId, seed, result, hintsUsed }) {
    if (!result) return;
    if (mode === 'practice' && problemId) {
      const r = ctx.progress.record(problemId, result, hintsUsed || 0);
      const completion = completionState(ctx.content.problemById.get(problemId), result, null, ctx.progress.get(problemId));
      if (result.passed && result.learning && (!result.learning.traceChecked || result.learning.assisted)) toast({ text: completion.message, level: 'info' });
      else if (r.first && (result.stars || 0) > 0) toast({ text: `Solved with ${result.stars || 0} star${result.stars === 1 ? '' : 's'}. Nicely done.`, level: 'ok', ms: 4200 });
      else if (r.improved && r.previousBest != null && (result.stars || 0) > 0) toast({ text: 'New personal best on this problem.', level: 'ok' });
    }
    if (mode !== 'sandbox' && mode !== 'lesson' && mode !== 'intro' && problemId) {
      try { ctx.compete.bests.record(`${mode}:${problemId}:${seed}`, result); } catch { /* ignore */ }
    }
  }

  // Start. First visit goes to the intro unless the integrator turned that off.
  const first = router.current();
  if (ctx.autoIntro !== false && !ctx.gate?.required && (!first.parts || !first.parts.length) && ctx.store.get('seenIntro', false) !== true && lessonOf(ctx, 'intro')) {
    router.replace('#/intro');
  }
  show(router.current());

  return {
    show,
    attachAccount,
    // Test and integration hooks: the live play controller of the current view.
    getPlay: () => (view && view.play ? view.play.controller : null),
    whenPlay: async ({ prepareLesson = false } = {}) => {
      for (;;) {
        const loading = pending;
        await loading;
        if (loading !== pending) continue;
        if (prepareLesson) view?.preparePlay?.();
        const play = view?.play;
        const controller = play ? await play.ready : null;
        // Navigation may replace a host while its modules or canvas are loading.
        if (loading !== pending || play !== view?.play) continue;
        return controller;
      }
    },
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
