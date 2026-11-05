import { h } from './dom.js';

// Deliberate self review. The draft lives only in the mounted lesson, never in progress or sync.
export function drawDefend(card, step, draft, nav) {
  const answer = h('textarea', { id: 'sh-defend-answer', class: 'sh-input sh-defend-answer', rows: 6,
    'aria-describedby': 'sh-defend-help', required: true });
  answer.value = draft.answer || '';
  const next = nav.querySelector('.sh-btn--primary');
  next.disabled = !draft.revealed;
  const comparison = h('div', { class: 'sh-defend-comparison', hidden: !draft.revealed });
  const model = h('h3', { class: 'sh-h3', tabindex: '-1', text: 'Compare your answer', id: 'sh-defend-model' });
  const checklist = h('fieldset', { class: 'sh-defend-checklist' },
    h('legend', { text: 'Which points did you cover?' }));
  draft.covered ||= [];
  step.checklist.forEach((point, i) => {
    const check = h('input', { type: 'checkbox' });
    check.checked = !!draft.covered[i];
    check.addEventListener('change', () => { draft.covered[i] = check.checked; });
    checklist.append(h('label', { class: 'sh-defend-point' }, check, h('span', { text: point })));
  });
  comparison.append(model, h('p', { class: 'sh-lp-text', text: step.model }), checklist,
    h('p', { class: 'sh-muted', text: 'This is your review. An unticked point is something to try in your next answer.' }));
  const reveal = h('button', { type: 'submit', class: 'sh-btn', disabled: !answer.value.trim() || draft.revealed,
    'aria-controls': 'sh-defend-model', text: draft.revealed ? 'Model answer revealed' : 'Reveal the model answer' });
  answer.readOnly = !!draft.revealed;
  answer.addEventListener('input', () => { draft.answer = answer.value; reveal.disabled = !answer.value.trim(); });
  const form = h('form', { class: 'sh-defend-form', onsubmit: event => {
    event.preventDefault();
    if (!answer.value.trim() || draft.revealed) return;
    draft.answer = answer.value;
    draft.revealed = true;
    answer.readOnly = true;
    comparison.hidden = false;
    reveal.disabled = true;
    reveal.textContent = 'Model answer revealed';
    next.disabled = false;
    model.focus();
  } }, h('label', { for: answer.id, class: 'sh-h3', text: 'Your answer' }),
    h('p', { id: 'sh-defend-help', class: 'sh-muted', text: 'Write your reasoning before the reveal. A few sentences are enough. Your answer stays on this page and is not saved or graded.' }),
    answer, reveal);
  card.append(h('h2', { class: 'sh-h2', text: 'Defend your choice' }),
    h('p', { class: 'sh-lp-text', text: step.q }), form, comparison, nav);
}
