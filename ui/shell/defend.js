// Lesson defense drafts stay in memory until the mounted lesson closes.
import { h } from './dom.js';
import { mountDefense } from '../defense.js';
export function drawDefend(card, step, draft, nav) {
  const next = nav.querySelector('.sh-btn--primary');
  next.disabled = !draft.revealed;
  card.append(h('h2', { class: 'sh-h2', text: 'Defend your choice' }), h('p', { class: 'sh-lp-text', text: step.q }));
  mountDefense(card, step, draft, { id: 'sh-defend', lesson: true, onReveal: () => next.disabled = false });
  card.append(nav);
}
