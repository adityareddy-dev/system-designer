// Hint drawer: three tiers revealed one at a time. Hints are free; use is counted.
import { h, iconEl } from './util.js';

const TIERS = ['A nudge', 'The concept and element to consider', 'The mechanism to measure'];

export function createHints(host, { getHints, getNotice = () => '', onUse, snd }) {
  const revealed = { n: 0 };
  const root = h('aside', { class: 'pl-hints', 'aria-label': 'Hints', hidden: '' });
  const list = h('div', { class: 'pl-hints-list' });
  const next = h('button', { class: 'pl-btn pl-btn--primary', type: 'button' });
  const close = h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Close hints', onClick: () => api.close() }, iconEl('ui.close', 18));
  root.append(
    h('div', { class: 'pl-hints-head' }, iconEl('ui.hint', 18), h('b', { text: 'Hints' }),
      h('span', { class: 'pl-muted', text: 'free; your debrief notes how many you used' }), close),
    list, h('div', { class: 'pl-hints-foot' }, next));
  host.append(root);

  function render() {
    const notice = getNotice();
    const hints = notice ? [] : getHints();
    list.replaceChildren();
    if (notice) list.append(h('p', { class: 'pl-muted', text: notice }));
    hints.forEach((t, i) => {
      const open = i < revealed.n;
      list.append(h('div', { class: 'pl-hint' + (open ? ' pl-hint--open' : '') },
        h('div', { class: 'pl-hint-tier', text: `${i + 1}. ${TIERS[i] || 'Hint'}` }),
        open ? h('p', { text: t }) : h('p', { class: 'pl-muted', text: 'Hidden until you ask.' })));
    });
    next.hidden = !hints.length;
    next.disabled = revealed.n >= hints.length;
    next.textContent = revealed.n >= hints.length ? 'All hints shown' : `Show hint ${revealed.n + 1}`;
  }
  next.addEventListener('click', () => {
    if (getNotice()) { render(); return; }
    if (revealed.n < getHints().length) { revealed.n++; onUse?.(revealed.n); snd?.('ui.tap'); render(); list.children[revealed.n - 1]?.scrollIntoView({ block: 'nearest' }); }
  });
  const api = {
    el: root,
    open() { render(); root.hidden = false; (next.hidden ? close : next).focus(); },
    close() { root.hidden = true; },
    toggle() { if (root.hidden) api.open(); else api.close(); },
    reset() { revealed.n = 0; root.hidden = true; },
    used: () => revealed.n,
    isOpen: () => !root.hidden,
  };
  return api;
}
