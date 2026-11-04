// A written correctness checkpoint, separate from the simulated traffic score.
import { h } from './util.js';

export function renderCorrectness(checkpoint) {
  if (!checkpoint) return null;
  const answer = h('textarea', { class: 'pl-input', rows: 3, style: { height: 'auto', padding: '10px 12px', resize: 'vertical' }, placeholder: 'Describe your schema, key or state transitions.' });
  const discussion = h('div', { hidden: true, 'aria-live': 'polite' });
  const reveal = h('button', { class: 'pl-btn', type: 'button', text: 'Compare with the discussion', disabled: true, onclick: () => {
    discussion.replaceChildren(h('h4', { text: 'Editorial discussion' }), h('p', { text: checkpoint.discussion }));
    discussion.hidden = false;
    reveal.hidden = true;
  } });
  answer.addEventListener('input', () => { reveal.disabled = !answer.value.trim(); });
  return h('section', { class: 'pl-sec', 'aria-label': 'Correctness checkpoint' },
    h('h3', { text: 'Correctness checkpoint' }),
    h('p', { class: 'pl-muted', text: 'Unscored. The traffic score does not verify these rules. Write your choice, then compare it with the discussion.' }),
    h('label', {}, h('p', { text: checkpoint.prompt }), answer),
    reveal, discussion);
}
