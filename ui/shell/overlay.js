// Toasts and modals rendered into #overlay.
import { h, ico, clear } from './dom.js';

let host = null;
let toastBox = null;
let modalBox = null;
let openModals = [];

export function setOverlayHost(el) {
  host = el;
  clear(host);
  toastBox = h('div', { class: 'sh-toasts', 'aria-live': 'polite', 'aria-atomic': 'false' });
  modalBox = h('div', { class: 'sh-modals' });
  host.append(modalBox, toastBox);
}

// On a workbench page toasts sit just above whatever is pinned to the bottom (status bar, coach line, Add component, settings sheet)
// instead of on top of it.
let toastTimer = 0;
function placeToasts() {
  if (!toastBox) return;
  if (!toastBox.children.length) { clearInterval(toastTimer); toastTimer = 0; toastBox.style.bottom = ''; return; }
  const root = document.querySelector('.pl-root');
  toastBox.style.bottom = '';
  // on a workbench the note docks in a bottom corner, away from the middle of the diagram, the card action rows and the debrief heading
  if (root) toastBox.dataset.dock = 'corner'; else delete toastBox.dataset.dock;
  if (!root) return;
  const base = parseFloat(getComputedStyle(toastBox).bottom) || 24;
  let top = Infinity;
  for (const sel of ['.pl-hud', '.pl-caption', '.pl-tb-grab', '.pl-inspector', '.pl-toolbar--open', '.pl-slow']) {
    const el = root.querySelector(sel);
    if (!el || el.hidden || !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top < innerHeight * 0.4 || r.top > innerHeight) continue;
    top = Math.min(top, r.top);
  }
  if (top < Infinity) toastBox.style.bottom = Math.max(base, innerHeight - top + 10) + 'px';
}

export function toast({ text, level = 'info', ms = 3200 }) {
  if (!toastBox) return;
  const iconId = { ok: 'ui.check', warn: 'ui.warn', bad: 'ui.error', info: 'ui.info' }[level] || 'ui.info';
  // the same message twice in a row shows once
  for (const old of toastBox.children) if (old.dataset.text === text) return;
  // one note at a time: a newer note replaces the one showing, but a plain info note never pushes out a warning or an error
  const rank = { info: 0, ok: 1, warn: 2, bad: 3 };
  const showing = [...toastBox.children].filter((n) => !n.dataset.leaving);
  if (showing.some((n) => (rank[n.dataset.level] ?? 0) > (rank[level] ?? 0))) return;
  showing.forEach((n) => n.remove());
  const t = h('div', { class: 'sh-toast', dataset: { level, text }, role: level === 'bad' ? 'alert' : 'status' }, ico(iconId, 18), h('span', { text }));
  toastBox.append(t);
  placeToasts();
  if (!toastTimer) toastTimer = setInterval(placeToasts, 250);
  const kill = () => { t.dataset.leaving = '1'; setTimeout(() => t.remove(), 160); };
  setTimeout(kill, ms);
  t.addEventListener('click', kill);
}

// modal({ title, body, actions: [{ label, primary, danger, value }] }) resolves to the chosen value, or null if dismissed.
export function modal({ title, body, actions = [{ label: 'Close', value: true }], wide = false, dismissible = true }) {
  return new Promise((resolve) => {
    if (!modalBox) return resolve(null);
    const prevFocus = document.activeElement;
    const done = (v) => {
      scrim.dataset.leaving = '1';
      openModals = openModals.filter((m) => m !== scrim);
      setTimeout(() => scrim.remove(), 140);
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch { /* ignore */ } }
      resolve(v);
    };
    const btns = actions.map((a) => h('button', {
      type: 'button', class: 'sh-btn' + (a.primary ? ' sh-btn--primary' : '') + (a.danger ? ' sh-btn--danger' : ''),
      onclick: () => done(a.value === undefined ? a.label : a.value),
    }, a.label));
    const titleId = 'sh-modal-title-' + Math.random().toString(36).slice(2, 7);
    const card = h('div', { class: 'sh-modal' + (wide ? ' sh-modal--wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('h2', { class: 'sh-modal-title', id: titleId, text: title }),
      h('div', { class: 'sh-modal-body' }, body),
      h('div', { class: 'sh-modal-actions' }, btns));
    const scrim = h('div', { class: 'sh-scrim', onpointerdown: (e) => { if (dismissible && e.target === scrim) done(null); } }, card);
    function onKey(e) {
      if (openModals[openModals.length - 1] !== scrim) return;
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); done(null); }
      if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    openModals.push(scrim);
    modalBox.append(scrim);
    (btns.find((b) => b.classList.contains('sh-btn--primary')) || btns[0] || card).focus();
  });
}

export async function confirmDialog({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const r = await modal({
    title, body: h('p', { text }),
    actions: [{ label: cancelLabel, value: false }, { label: confirmLabel, value: true, primary: !danger, danger }],
  });
  return r === true;
}

export function closeAllModals() {
  for (const m of openModals) m.remove();
  openModals = [];
}
