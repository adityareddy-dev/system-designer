// Account UI: the quiet "Sign in" button in the top bar, its small panel, the profile menu, the single nudge and the Challenge leaderboard card.
import { h, ico, clear } from '../ui/shell/dom.js';
import { confirmDialog } from '../ui/shell/overlay.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const PERSON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.75" fill="currentColor" fill-opacity=".18"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
const KEY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="12" r="3.75" fill="currentColor" fill-opacity=".18"/><path d="M11.25 12H20.5M17.5 12v3M20.5 12v2.25"/></svg>';
const PROVIDER_NAME = { google: 'Google', github: 'GitHub', fake: 'the test provider' };

let gisLoading = null;
function loadGis() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (globalThis.google?.accounts?.id ? resolve() : reject(new Error('gis')));
    s.onerror = () => { gisLoading = null; s.remove(); reject(new Error('gis')); };
    document.head.append(s);
  });
  return gisLoading;
}

function initialOf(name) {
  const c = Array.from(String(name || '?').trim())[0] || '?';
  return c.toUpperCase();
}

function avatarEl(user, size = 32) {
  const wrap = h('span', { class: 'ac-avatar', 'aria-hidden': 'true' });
  wrap.style.setProperty('--ac-size', size + 'px');
  const letter = h('span', { class: 'ac-avatar-letter', text: initialOf(user?.name) });
  wrap.append(letter);
  if (user?.avatar) {
    const img = h('img', { class: 'ac-avatar-img', alt: '', width: size, height: size, referrerpolicy: 'no-referrer', decoding: 'async', src: user.avatar });
    img.addEventListener('error', () => img.remove(), { once: true });
    wrap.append(img);
  }
  return wrap;
}

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `${hr} h ago` : `${Math.round(hr / 24)} d ago`;
}

function prettyDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  try { return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return str; }
}

export function createAccountUi(ctx, api) {
  const { bus } = ctx;
  let slotEl = null;
  let trigger = null;
  let pop = null;
  let popKind = null;
  let gisFor = null;
  let nonce = null;      // { value, at }: one-time value for Google's token request, from the service

  // ---- popover plumbing: panels live in #overlay (above the play screen, below dialogs), pinned under the top-bar button
  function place() {
    if (!pop || !slotEl) return;
    const r = (trigger || slotEl).getBoundingClientRect();
    pop.style.setProperty('--ac-top', Math.round(r.bottom + 10) + 'px');
    pop.style.setProperty('--ac-right', Math.max(16, Math.round(document.documentElement.clientWidth - r.right)) + 'px');
  }
  function onDocDown(e) {
    if (!pop) return;
    if (pop.contains(e.target) || slotEl?.contains(e.target)) return;
    if (e.target.closest?.('.sh-scrim')) return;
    closePop(false);
  }
  function onKey(e) {
    if (e.key === 'Escape' && pop && !document.querySelector('.sh-scrim')) { e.stopPropagation(); closePop(true); }
  }
  function closePop(refocus) {
    if (!pop) return;
    pop.remove();
    pop = null;
    popKind = null;
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (refocus && trigger) trigger.focus();
  }
  function openPop(kind, build) {
    closePop(false);
    if (!slotEl) return null;
    pop = build();
    popKind = kind;
    (document.getElementById('overlay') || document.body).append(pop);
    place();
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('button, a[href], input');
    if (first && kind !== 'nudge') first.focus();
    return pop;
  }
  const head = (titleId, title) => h('div', { class: 'ac-pop-head' },
    h('h2', { class: 'ac-pop-title', id: titleId, text: title }),
    h('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => closePop(true) }, ico('ui.close', 18)));

  // ---- sign-in panel
  function signInPanel() {
    const st = api.state();
    const err = h('p', { class: 'ac-err', role: 'status', 'aria-live': 'polite' });
    const list = h('div', { class: 'ac-providers' });
    if (st.providers.google) {
      const gbox = h('div', { class: 'ac-gis', 'aria-label': 'Continue with Google' }, h('span', { class: 'ac-gis-wait', text: 'Loading Google sign-in' }));
      list.append(gbox);
      const fresh = nonce && Date.now() - nonce.at < 5 * 60_000 ? Promise.resolve(nonce.value)
        : api.googleNonce().then((v) => { if (!v) throw new Error('nonce'); nonce = { value: v, at: Date.now() }; return v; });
      Promise.all([loadGis(), fresh]).then(([, n]) => {
        if (!gbox.isConnected) return;
        const id = globalThis.google.accounts.id;
        const clientId = api.googleClientId();
        if (gisFor !== clientId + '|' + n) {
          id.initialize({
            client_id: clientId,
            nonce: n,
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: true,
            context: 'signin',
            callback: async (resp) => {
              err.textContent = '';
              nonce = null;
              try { await api.signInWithGoogle(resp?.credential); closePop(false); } catch { if (err.isConnected) err.textContent = 'Google sign-in did not go through. Open this panel again to retry, or keep playing without it.'; }
            },
          });
          gisFor = clientId + '|' + n;
        }
        clear(gbox);
        id.renderButton(gbox, { type: 'standard', theme: ctx.theme() === 'dark' ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: 272 });
      }, () => {
        if (!gbox.isConnected) return;
        clear(gbox);
        gbox.append(h('span', { class: 'ac-gis-wait', text: 'Google sign-in could not load here.' }));
      });
    }
    if (st.providers.github) {
      list.append(h('a', { class: 'ac-provider', href: api.githubUrl() }, h('span', { class: 'ac-provider-ico', html: KEY }), 'Continue with GitHub'));
    }
    if (st.providers.fake) {
      list.append(h('button', { type: 'button', class: 'ac-provider ac-provider--test', onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try { await api.signInFake('tester', 'Test player'); closePop(false); } catch { err.textContent = 'The test sign-in failed.'; b.disabled = false; }
      } }, h('span', { class: 'ac-provider-ico', html: KEY }), 'Continue as a test player'));
    }
    return h('div', { class: 'ac-pop', role: 'dialog', 'aria-labelledby': 'ac-signin-title' },
      head('ac-signin-title', 'Sign in'),
      h('p', { class: 'ac-text', text: 'Optional. Playing never needs an account. Signing in keeps your progress on every device and puts your scores on the Challenge leaderboards.' }),
      list, err,
      h('p', { class: 'ac-fine' }, 'We keep your provider id, a display name, your avatar link, progress and scores. Nothing is sold, and you can delete it anytime. ',
        h('a', { href: 'privacy.html', class: 'ac-link' }, 'Privacy')));
  }

  // ---- profile menu
  function profileMenu() {
    const st = api.state();
    const u = st.user;
    const via = (u.providers || []).map((p) => PROVIDER_NAME[p] || p).join(' and ');
    const syncLine = h('p', { class: 'ac-sync', role: 'status' });
    const paintSync = () => {
      const s = api.state();
      syncLine.dataset.state = s.sync;
      const text = s.sync === 'syncing' ? 'Syncing your progress...' : s.sync === 'failed' ? 'Sync did not go through. It will try again.' : s.syncedAt ? `Progress synced ${ago(s.syncedAt)}.` : 'Progress syncs as you play.';
      // a mark as well as a tint: a tick when in step, a triangle when a sync failed, a clock while one runs
      syncLine.replaceChildren(ico(s.sync === 'failed' ? 'ui.warn' : s.sync === 'syncing' ? 'ui.clock' : s.syncedAt ? 'ui.check' : 'ui.info', 16), text);
    };
    paintSync();
    const input = h('input', { class: 'sh-input ac-input', id: 'ac-name', maxlength: 24, autocomplete: 'nickname', value: u.name });
    const msg = h('span', { class: 'ac-mini ac-rename-msg', role: 'status' });
    // the answer to Save carries a mark and a colour: a tick when the name was kept, a triangle when it was refused
    const say = (ok, text) => { msg.dataset.state = ok ? 'ok' : 'bad'; msg.replaceChildren(ico(ok ? 'ui.check' : 'ui.warn', 14), text); };
    const form = h('form', { class: 'ac-rename', onsubmit: async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || v === api.displayName()) return;
      try { await api.rename(v); say(true, 'Saved.'); } catch (err2) { say(false, err2?.message || 'Could not save that name.'); }
    } },
      h('label', { class: 'ac-label', for: 'ac-name', text: 'Name on leaderboards and shared links' }),
      h('div', { class: 'ac-rename-row' }, input, h('button', { type: 'submit', class: 'sh-btn' }, 'Save')), msg);
    const el = h('div', { class: 'ac-pop ac-menu', role: 'dialog', 'aria-labelledby': 'ac-menu-title' },
      h('div', { class: 'ac-me' }, avatarEl(u, 44), h('div', { class: 'ac-me-text' },
        h('h2', { class: 'ac-pop-title', id: 'ac-menu-title', text: u.name }),
        h('span', { class: 'ac-mini', text: `Signed in with ${via || 'an account'}` })),
        h('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => closePop(true) }, ico('ui.close', 18))),
      syncLine, form,
      h('div', { class: 'ac-links' },
        h('a', { class: 'ac-link', href: '#/challenge', onclick: () => closePop(false) }, ico('ui.trophy', 16), 'Leaderboards'),
        h('a', { class: 'ac-link', href: 'privacy.html' }, ico('ui.shield', 16), 'Privacy')),
      h('div', { class: 'ac-actions' },
        h('button', { type: 'button', class: 'sh-btn', onclick: async () => { closePop(true); await api.signOut(); } }, 'Sign out'),
        h('button', { type: 'button', class: 'sh-btn sh-btn--ghost ac-danger', onclick: async () => {
          const ok = await confirmDialog({ title: 'Delete your account?', text: 'This removes your name, avatar link, synced progress and leaderboard scores from the server right away. Progress saved on this device stays here.', confirmLabel: 'Delete my account', cancelLabel: 'Keep it', danger: true });
          if (!ok) return;
          try { await api.deleteAccount(); closePop(false); } catch { bus.emit('toast', { text: 'The account could not be deleted right now. Try again shortly.', level: 'warn' }); }
        } }, 'Delete my account')));
    el._paintSync = paintSync;
    return el;
  }

  // ---- the one nudge
  function nudge() {
    const st = api.state();
    if (!slotEl || st.user || !st.available || pop) return;
    const el = openPop('nudge', () => h('div', { class: 'ac-pop ac-nudge', role: 'status' },
      h('p', { class: 'ac-text', text: 'Like where this is going? Sign in to keep your progress on every device and see where this score ranks. Totally optional.' }),
      h('div', { class: 'ac-actions' },
        h('button', { type: 'button', class: 'sh-btn sh-btn--primary', onclick: () => openPop('signin', signInPanel) }, 'Sign in'),
        h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: () => closePop(false) }, 'Not now'))));
    setTimeout(() => { if (pop === el) closePop(false); }, 14000);
  }

  // ---- top bar slot
  function mountHeader(slot) {
    slotEl = slot;
    slot.classList.add('ac-slot');
    function render() {
      const st = api.state();
      if (!st.available) {
        closePop(false);
        clear(slot).hidden = true;
        trigger = null;
        return;
      }
      slot.hidden = false;
      const keep = pop && popKind === 'menu' && st.user ? pop : null;
      if (pop && !keep) closePop(false);
      if (keep) {
        keep._paintSync?.();
        keep.querySelector('#ac-menu-title').textContent = st.user.name;
        keep.querySelector('.ac-me .ac-avatar').replaceWith(avatarEl(st.user, 44));
        trigger.title = st.user.name;
        trigger.setAttribute('aria-label', `Your account: ${st.user.name}`);
        trigger.replaceChildren(avatarEl(st.user, 30));
        return;
      }
      clear(slot);
      if (st.user) {
        trigger = h('button', { type: 'button', class: 'ac-me-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `Your account: ${st.user.name}`, title: st.user.name,
          onclick: () => (popKind === 'menu' ? closePop(true) : openPop('menu', profileMenu)) }, avatarEl(st.user, 30));
      } else {
        trigger = h('button', { type: 'button', class: 'ac-signin-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
          onclick: () => (popKind === 'signin' ? closePop(true) : openPop('signin', signInPanel)) },
          h('span', { class: 'ac-signin-ico', html: PERSON }), h('span', { class: 'ac-signin-label', text: 'Sign in' }));
      }
      slot.append(trigger);
    }
    bus.on('account', render);
    bus.on('route', () => { if (pop && popKind !== 'nudge') closePop(false); });
    render();
  }

  // ---- leaderboard card for the Challenge page
  function leaderboardCard({ date, problemId }) {
    const root = h('section', { class: 'sh-card ac-board', 'aria-labelledby': 'ac-board-title', hidden: true });
    let tab = 'daily';
    let pick = problemId;
    let seq = 0;
    let alive = true;
    const tabsEl = h('div', { class: 'ac-tabs', role: 'tablist', 'aria-label': 'Leaderboard' });
    const body = h('div', { class: 'ac-board-body', role: 'tabpanel', 'aria-live': 'polite' });
    const foot = h('div', { class: 'ac-board-foot' });
    const select = h('select', { class: 'sh-select ac-select', 'aria-label': 'Problem' });
    for (const g of ctx.content.groups || []) {
      const og = h('optgroup', { label: g.title || g.id });
      for (const p of g.problems || []) og.append(h('option', { value: p.id, text: p.title, selected: p.id === pick ? true : undefined }));
      select.append(og);
    }
    select.value = pick;
    select.addEventListener('change', () => { pick = select.value; load(); });
    const tabBtn = (id, label) => h('button', { type: 'button', role: 'tab', class: 'ac-tab', 'aria-selected': String(tab === id), dataset: { tab: id }, onclick: () => { tab = id; paintTabs(); load(); } }, label);
    function paintTabs() {
      clear(tabsEl).append(tabBtn('daily', date === ctx.compete?.daily?.todayLocal?.() ? 'Today' : prettyDate(date)), tabBtn('problem', 'By problem'));
      select.hidden = tab !== 'problem';
    }
    root.append(
      h('div', { class: 'ac-board-head' }, h('h2', { class: 'sh-h2', id: 'ac-board-title' }, ico('ui.trophy', 20), 'Leaderboard'), tabsEl),
      select, body, foot);

    async function reportRow(r, btn) {
      btn.disabled = true;
      try { await api.report(r.uid, 'name'); btn.textContent = 'Reported'; } catch (e) { btn.disabled = false; btn.textContent = 'Retry'; }
    }

    // Every row has the same cells, so the columns line up down the list and in the "you" row under it:
    // a signed-in player's rows all carry the report cell (empty on their own row), a visitor's rows have none.
    function row(r) {
      const member = !!api.state().user;
      return h('li', { class: 'ac-row' + (r.you ? ' is-you' : '') },
        h('span', { class: 'ac-rank sh-num', text: String(r.rank) }),
        avatarEl({ name: r.name }, 26),
        h('span', { class: 'ac-name' }, h('span', { class: 'ac-name-text', title: r.name, text: r.name }),
          (r.you || r.passed === false) ? h('span', { class: 'ac-tags' }, r.you ? h('span', { class: 'ac-you', text: 'you' }) : null, r.passed === false ? h('span', { class: 'ac-you ac-you--miss', title: 'This design missed one or more targets, so it ranks below passing designs', text: 'missed targets' }) : null) : null),
        h('span', { class: 'ac-row-stars' + (r.stars > 0 ? '' : ' is-none'), role: 'img', 'aria-label': `${r.stars} of 3 stars` }, [0, 1, 2].map((i) => ico(i < r.stars ? 'ui.star' : 'ui.star-empty', 14))),
        h('span', { class: 'ac-score sh-num', text: String(r.score) }),
        !member ? null : (!r.you && r.uid) ? h('button', { type: 'button', class: 'ac-report', title: 'Report this name or score', 'aria-label': `Report ${r.name}`, onclick: (ev) => reportRow(r, ev.currentTarget) }, 'Report') : h('span', { 'aria-hidden': 'true' }),
        r.passed === false ? h('span', { class: 'ac-ver ac-ver--no', 'aria-hidden': 'true' }) : (r.replayed ?? r.verified) ? h('span', { class: 'ac-ver', title: 'Score replayed on the server with the same traffic', 'aria-label': 'replayed on the server' }, ico('ui.verified', 16)) : h('span', { class: 'ac-ver ac-ver--no', title: 'Not replayed yet', text: '?' }));
    }

    async function load() {
      const st = api.state();
      if (!alive) return;
      root.hidden = !st.available;
      if (!st.available) return;
      const mine = ++seq;
      clear(body).append(h('p', { class: 'sh-muted ac-board-note', text: 'Loading the leaderboard' }));
      clear(foot);
      let data;
      try { data = await api.leaderboard(tab === 'daily' ? { daily: date } : { problem: pick }); } catch {
        if (mine !== seq || !alive) return;
        clear(body).append(h('div', { class: 'ac-board-fail' }, ico('ui.warn', 18),
          h('p', { class: 'sh-muted ac-board-note', text: 'The leaderboard could not be reached right now.' }),
          h('button', { type: 'button', class: 'sh-btn ac-retry', onclick: () => load() }, 'Try again')));
        return;
      }
      if (mine !== seq || !alive) return;
      root.dataset.member = api.state().user ? '1' : '0';
      clear(body);
      const what = tab === 'daily' ? 'this day\'s challenge' : 'this problem in Practice';
      if (!data.top?.length) {
        body.append(h('p', { class: 'sh-muted ac-board-note', text: `No scores yet for ${what}. Finish it while signed in to be first.` }));
      } else {
        const list = h('ol', { class: 'ac-rows' }, data.top.map(row));
        body.append(list);
        if (data.you && !data.top.some((r) => r.you)) {
          body.append(h('ol', { class: 'ac-rows ac-rows--you', start: data.you.rank }, row({ ...data.you, name: api.displayName(), you: true })));
        }
      }
      foot.append(h('p', { class: 'ac-fine', text: `${data.total} player${data.total === 1 ? '' : 's'}. Best score per player. Equal scores rank the earlier one first. The server replays every design with the same traffic, so each score is the design's real score. It cannot tell who drew a design: one copied from a friend's link counts, but the editorial's designs are not listed.` }));
      if (!api.state().user) {
        foot.append(h('button', { type: 'button', class: 'sh-btn ac-join', onclick: () => { openPop('signin', signInPanel); } }, h('span', { class: 'ac-signin-ico', html: PERSON }), 'Sign in to join'));
      }
    }

    paintTabs();
    // reload when who is looking changes, not on every sync tick
    let seen = '';
    const onAccount = (s) => { const k = `${s.available}|${s.user?.name || ''}`; if (k !== seen) { seen = k; load(); } };
    const offs = [bus.on('account', onAccount), bus.on('account:result', () => load())];
    api.ready.then(() => onAccount(api.state()));
    return { el: root, destroy() { alive = false; offs.forEach((o) => o()); } };
  }

  return { mountHeader, leaderboardCard, nudge, open: () => openPop('signin', signInPanel) };
}
