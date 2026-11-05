// The five-step bar: Clarify, Numbers, Draw, Traffic day, Debrief.
import { h } from './util.js';

export const STEPS = [
  ['clarify', 'Clarify'],
  ['numbers', 'Numbers'],
  ['draw', 'Draw'],
  ['day', 'Traffic day'],
  ['debrief', 'Debrief'],
];

export function createSteps(host, { onGo }) {
  const nav = h('nav', { class: 'pl-steps', 'aria-label': 'Problem steps' });
  const list = h('ol', { class: 'pl-steps-list' });
  const btns = {};
  STEPS.forEach(([id, label], i) => {
    const b = h('button', { class: 'pl-step', type: 'button', 'data-step': id, onClick: () => onGo(id) },
      h('span', { class: 'pl-step-n', text: String(i + 1) }), h('span', { class: 'pl-step-l', text: label }));
    btns[id] = b;
    list.append(h('li', {}, b));
  });
  const picker = h('select', { class: 'pl-step-picker', 'aria-label': 'Current step and all problem steps', onChange: () => onGo(picker.value) }, STEPS.map(([id, label], i) => h('option', { value: id }, `${i + 1} · ${label}`)));
  nav.append(list, picker);
  host.append(nav);
  return {
    el: nav,
    // reached: which steps can be clicked right now
    set(step, reached = {}) {
      picker.value = step;
      [...picker.options].forEach((o, i) => { o.disabled = !(reached[o.value] ?? (i <= 2)); });
      const idx = STEPS.findIndex((s) => s[0] === step);
      STEPS.forEach(([id], i) => {
        const b = btns[id];
        b.classList.toggle('pl-step--on', id === step);
        b.classList.toggle('pl-step--done', i < idx);
        if (id === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.disabled = !(reached[id] ?? (i <= 2));
      });
    },
  };
}
