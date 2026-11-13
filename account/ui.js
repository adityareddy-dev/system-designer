// Account UI: the quiet "Sign in" button in the top bar, its small panel, the profile menu, the single nudge and the Challenge leaderboard card.
import { h, ico, clear } from '../ui/shell/dom.js';
import { confirmDialog } from '../ui/shell/overlay.js';
import { accountRequired } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const PERSON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.75" fill="currentColor" fill-opacity=".18"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
const KEY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="12" r="3.75" fill="currentColor" fill-opacity=".18"/><path d="M11.25 12H20.5M17.5 12v3M20.5 12v2.25"/></svg>';
const GOOGLE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1z"/><path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76z"/></svg>';
const GITHUB = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>';
const MARK = '<svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="6" fill="#141414"/><path d="M11 14 20 10M11 18l9 4" stroke="#FFF4E0" stroke-width="2"/><circle cx="8.5" cy="16" r="3.5" fill="#FFC93C"/><circle cx="23" cy="8.5" r="3.5" fill="#FF5B3A"/><circle cx="23" cy="23.5" r="3.5" fill="#2D5BFF"/></svg>';
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
  let scrim = null;
  let marketingShown = false;
  let nonce = null;      // { value, at }: one-time value for Google's token request, from the service

  // ---- popover plumbing: panels live in #overlay (above the play screen, below dialogs), pinned under the top-bar button
  function place() {
    if (!pop || !slotEl || pop.classList.contains('ac-pop--modal')) return;
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
    if (e.key === 'Tab' && pop?.classList.contains('ac-pop--modal') && !document.querySelector('.sh-scrim')) {
      const f = [...pop.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), iframe')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !pop.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  // While a sign-in dialog is open the page behind it cannot take focus or be read past the dialog.
  function setBehind(on) {
    const app = document.getElementById('app');
    if (!app || typeof app.setAttribute !== 'function') return;
    if (on) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); } else { app.removeAttribute('inert'); app.removeAttribute('aria-hidden'); }
  }
  function closePop(refocus) {
    if (!pop) return;
    setBehind(false);
    pop.remove();
    scrim?.remove();
    scrim = null;
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
    const host = document.getElementById('overlay') || document.body;
    if (pop.classList.contains('ac-pop--modal')) { scrim = h('div', { class: 'ac-scrim' }); host.append(scrim); setBehind(true); }
    host.append(pop);
    place();
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('button, a[href], input');
    if (first && kind !== 'nudge') first.focus();
    if (pop.classList.contains('ac-pop--modal') && !pop.contains(document.activeElement)) { pop.tabIndex = -1; pop.focus(); }
    return pop;
  }
  const head = (titleId, title) => h('div', { class: 'ac-pop-head' },
    h('h2', { class: 'ac-pop-title', id: titleId, text: title }),
    h('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => closePop(true) }, ico('ui.close', 18)));

  // ---- sign-in card: one card for the dialog and for the gate page. Google and GitHub, nothing else to fill in.
  // The first sign-in makes the account, so there is no separate sign-up form.
  function signInCard({ onDone, headingId, heading = 'Sign in or create an account', lead = accountRequired() ? 'Free. Use your Google or GitHub account. The first time you sign in, your account is made for you.' : 'Optional. Signing in keeps your progress on every device and puts your scores on the Challenge leaderboards. The first time, your account is made for you.', showClose } = {}) {
    const st = api.state();
    const done = () => { try { onDone?.(); } catch { /* ignore */ } };
    const err = h('p', { class: 'ac-err', role: 'status', 'aria-live': 'polite' });
    const list = h('div', { class: 'ac-providers' });
    const preview = !!st.providers.preview;
    const googleBtn = (label, onclick) => h('button', { type: 'button', class: 'ac-provider ac-provider--google', onclick }, h('span', { class: 'ac-provider-ico', html: GOOGLE }), h('span', { class: 'ac-provider-label', text: label }));
    const githubBtn = (el) => el;
    if (preview) {
      const pick = async (e, which) => {
        const b = e.currentTarget;
        b.disabled = true;
        try { await api.signInPreview(which); done(); } catch { err.textContent = 'The preview sign-in failed.'; b.disabled = false; }
      };
      list.append(googleBtn('Continue with Google', (e) => pick(e, 'google')));
      list.append(h('button', { type: 'button', class: 'ac-provider ac-provider--github', onclick: (e) => pick(e, 'github') }, h('span', { class: 'ac-provider-ico', html: GITHUB }), h('span', { class: 'ac-provider-label', text: 'Continue with GitHub' })));
    } else {
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
                try { await api.signInWithGoogle(resp?.credential); done(); } catch { if (err.isConnected) err.textContent = 'Google sign-in did not go through. Try again, or use GitHub.'; }
              },
            });
            gisFor = clientId + '|' + n;
          }
          clear(gbox);
          const w = Math.max(200, Math.min(400, Math.round(gbox.getBoundingClientRect().width) || 320));
          id.renderButton(gbox, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width: w });
        }, () => {
          if (!gbox.isConnected) return;
          clear(gbox);
          gbox.append(h('span', { class: 'ac-gis-wait', text: 'Google sign-in could not load here. Try GitHub.' }));
        });
      }
      if (st.providers.github) {
        const gh = h('a', { class: 'ac-provider ac-provider--github', href: api.githubUrl() }, h('span', { class: 'ac-provider-ico', html: GITHUB }), h('span', { class: 'ac-provider-label', text: 'Continue with GitHub' }));
        list.append(gh);
      }
      if (st.providers.fake) {
        list.append(h('button', { type: 'button', class: 'ac-provider ac-provider--test', onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try { await api.signInFake('tester', 'Test player'); done(); } catch { err.textContent = 'The test sign-in failed.'; b.disabled = false; }
        } }, h('span', { class: 'ac-provider-ico', html: KEY }), h('span', { class: 'ac-provider-label', text: 'Continue as a test player' })));
      }
    }
    return h('div', { class: 'ac-card', role: headingId ? 'dialog' : undefined, 'aria-labelledby': headingId, 'aria-modal': headingId ? 'true' : undefined },
      h('div', { class: 'ac-card-head' },
        h('span', { class: 'ac-card-mark', html: MARK, 'aria-hidden': 'true' }),
        showClose ? h('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => closePop(true) }, ico('ui.close', 18)) : null),
      h('h2', { class: 'ac-card-title', id: headingId, text: heading }),
      h('p', { class: 'ac-card-lead', text: lead }),
      list, err,
      h('p', { class: 'ac-fine ac-agree' }, 'By continuing you agree to the ', h('a', { href: 'privacy.html', class: 'ac-link' }, 'Privacy policy'), '.'),
      preview ? h('p', { class: 'ac-fine ac-preview-note', text: 'Preview of the hosted site. This sign-in is a stand-in.' }) : null);
  }

  function signInPanel() {
    const el = signInCard({ headingId: 'ac-signin-title', showClose: true, onDone: () => { if (popKind === 'signin') closePop(false); } });
    el.classList.add('ac-pop', 'ac-pop--modal');
    return el;
  }

  // The email we hold and the marketing choice, with the switch to change it. Used in the account menu and in Settings.
  function emailBlock(u, { firstChoice = false } = {}) {
    const id = 'ac-sv-' + Math.random().toString(36).slice(2, 7);
    const box = h('input', { type: 'checkbox', class: 'ac-check', id, checked: u?.marketingOptIn ? true : undefined });
    const msg = h('span', { class: 'ac-mini ac-sv-msg', role: 'status' });
    if (!firstChoice) box.addEventListener('change', async () => {
      box.disabled = true;
      try { await api.setMarketingOptIn(box.checked); msg.dataset.state = 'ok'; msg.textContent = box.checked ? 'Saved. Email updates are on.' : 'Saved. Email updates are off.'; }
      catch { box.checked = !box.checked; msg.dataset.state = 'bad'; msg.textContent = 'Could not save that. Try again.'; }
      box.disabled = false;
    });
    const save = h('button', { type: 'button', class: 'ac-btn ac-btn--primary', text: 'Save choice', onclick: async () => {
      save.disabled = true;
      box.disabled = true;
      try { await api.setMarketingOptIn(box.checked); closePop(true); trigger?.focus(); }
      catch { msg.dataset.state = 'bad'; msg.textContent = 'Could not save that. Try again.'; save.disabled = false; box.disabled = false; }
    } });
    return h('div', { class: 'ac-email' },
      h('p', { class: 'ac-label', text: 'Email on your account' }),
      h('p', { class: 'ac-email-addr', text: u?.email || 'None. Your sign-in did not give us a verified address.' }),
      h('label', { class: 'ac-optin', for: id }, box, h('span', { text: 'Email me new problems, tips and product news. Unsubscribe any time.' })),
      msg, firstChoice ? save : null);
  }

  function marketingPanel() {
    return h('div', { class: 'ac-pop ac-pop--modal ac-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ac-marketing-title' },
      head('ac-marketing-title', 'Email updates'),
      h('p', { class: 'ac-text', text: 'Choose whether you want email updates. You can change this in Settings.' }),
      emailBlock(api.state().user, { firstChoice: true }));
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
      h('div', { class: 'ac-rename-row' }, input, h('button', { type: 'submit', class: 'ac-btn' }, 'Save')), msg);
    const el = h('div', { class: 'ac-pop ac-menu', role: 'dialog', 'aria-labelledby': 'ac-menu-title' },
      h('div', { class: 'ac-me' }, avatarEl(u, 44), h('div', { class: 'ac-me-text' },
        h('h2', { class: 'ac-pop-title', id: 'ac-menu-title', text: u.name }),
        h('span', { class: 'ac-mini', text: `Signed in with ${via || 'an account'}${api.isPreview?.() ? ' (preview)' : ''}` })),
        h('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => closePop(true) }, ico('ui.close', 18))),
      syncLine, form, emailBlock(u),
      h('div', { class: 'ac-links' },
        h('a', { class: 'ac-row-link', href: '#/challenge', onclick: () => closePop(false) }, ico('ui.trophy', 18), h('span', { text: 'Leaderboards' }), ico('ui.chevron-right', 16)),
        h('a', { class: 'ac-row-link', href: 'privacy.html' }, ico('ui.shield', 18), h('span', { text: 'Privacy and your data' }), ico('ui.chevron-right', 16))),
      h('div', { class: 'ac-actions' },
        h('button', { type: 'button', class: 'ac-btn', onclick: async () => { closePop(true); await api.signOut(); } }, 'Sign out'),
        h('button', { type: 'button', class: 'ac-btn ac-btn--danger', onclick: async () => {
          const ok = await confirmDialog({ title: 'Delete your account?', text: 'This removes your account, synced progress and leaderboard scores. We keep your email until the unsubscribe is sent. Progress saved on this device stays here.', confirmLabel: 'Delete my account', cancelLabel: 'Keep it', danger: true });
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
        h('button', { type: 'button', class: 'ac-btn ac-btn--primary', onclick: () => openPop('signin', signInPanel) }, 'Sign in'),
        h('button', { type: 'button', class: 'ac-btn ac-btn--quiet', onclick: () => closePop(false) }, 'Not now'))));
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
      if (!st.user) marketingShown = false;
      if (st.user?.marketingPromptPending && !marketingShown) {
        marketingShown = true;
        setTimeout(() => { if (api.state().user?.marketingPromptPending) openPop('marketing', marketingPanel); }, 0);
      }
      if (popKind === 'marketing' && st.user?.marketingPromptPending) return;
      const keep = pop && popKind === 'menu' && st.user ? pop : null;
      if (pop && !keep) closePop(false);
      if (keep) {
        keep._paintSync?.();
        const check = keep.querySelector('.ac-check');
        if (check && !check.disabled) check.checked = !!st.user.marketingOptIn;
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
          onclick: () => {
            // on the sign-in page the card is already there: move focus to it instead of stacking a dialog on top
            const inline = document.querySelector('.ac-gate-side .ac-card');
            const first = inline?.querySelector('input, button, a[href]');
            if (first) { inline.scrollIntoView({ block: 'center' }); first.focus(); return; }
            popKind === 'signin' ? closePop(true) : openPop('signin', signInPanel);
          } },
          h('span', { class: 'ac-signin-label', text: 'Sign in' }));
      }
      slot.append(trigger);
    }
    bus.on('account', render);
    bus.on('route', () => { if (pop && popKind !== 'nudge' && popKind !== 'marketing') closePop(false); });
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
        foot.append(h('button', { type: 'button', class: 'ac-btn ac-btn--primary ac-join', onclick: () => { openPop('signin', signInPanel); } }, 'Sign in to join'));
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

  return { mountHeader, leaderboardCard, nudge, signInCard, emailBlock, open: () => openPop('signin', signInPanel) };
}
