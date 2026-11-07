// A pre-run decision check makes the player predict a tradeoff before receiving repair advice.
import { h } from './util.js';
import { transferFor, transferCorrect, workloadTransfer } from '../../content/transfers.js';
export function checkFor(problem) {
  if (problem.id === 'url-shortener') return {
    q: 'A popular link is read 8,000 times/s. It never changes. The database can read 2,000 times/s. Choose a plan for this new workload.',
    choices: ['Double app capacity and leave every read hitting the database', 'Reuse answers, keep the database ready for cache misses', 'Retry every rejected read immediately'], answer: 1,
    why: 'More app capacity cannot increase database throughput. A cold cache still needs a safe miss path.',
    calculation: 'With 90% of answers reused, how many reads/s reach the database?', value: 800, unit: 'reads/s',
  };
  return workloadTransfer(`problem:${problem.id}`, (problem.concepts || []).find(id => transferFor(id)) || 'back-of-envelope', problem.title);
}
export function renderDesignCheck(problem, onReady, onCancel) {
  const test = checkFor(problem);
  let choice = null;
  const options = h('div', { class: 'sh-choices' });
  const number = h('input', { class: 'pl-input', type: 'number', required: true, step: 'any', 'aria-label': test.calculation });
  const reason = h('textarea', { class: 'pl-input', rows: 2, required: true, minlength: 12, maxlength: 500, style: { height: 'auto', padding: '12px' }, 'aria-label': 'Predict the limiting part in your own design and explain why' });
  const feedback = h('p', { role: 'status', class: 'pl-muted' });
  test.choices.forEach((text, i) => options.append(h('button', { class: 'sh-choice', type: 'button', 'aria-pressed': 'false', onclick: () => { choice = i; [...options.children].forEach((b,j) => b.setAttribute('aria-pressed', String(i === j))); } }, text)));
  return h('form', { class: 'pl-modal-card pl-design-check', style: { maxHeight: '100%', overflowY: 'auto', width: 'min(640px, 100%)' }, onsubmit: e => {
    e.preventDefault();
    if (!transferCorrect(test, choice, number.value === '' ? NaN : Number(number.value))) {
      feedback.textContent = choice == null ? 'Choose a plan first.' : choice !== test.answer ? test.why : 'The plan fits. Recheck the calculation before starting.';
      return;
    }
    onReady({ choice, value: Number(number.value), text: reason.value.trim() });
  } }, h('h2', { class: 'pl-h2', text: 'Predict before you run' }),
    h('p', { class: 'pl-muted', text: 'First, apply the idea to a new workload. Then predict what will limit your own design. The traffic day will test that prediction.' }),
    h('p', { text: test.q }), options,
    h('label', {}, h('p', { text: test.calculation }), number, h('small', { text: test.unit })),
    h('label', {}, h('p', { text: 'Which part will limit your own design, and why?' }), reason),
    h('small', { class: 'pl-muted', text: 'The plan and calculation are checked. Your written prediction is saved for comparison, not automatically graded.' }), feedback,
    h('div', { class: 'pl-actions' }, h('button', { class: 'pl-btn', type: 'button', onclick: onCancel }, 'Keep drawing'), h('button', { class: 'pl-btn pl-btn--primary', type: 'submit' }, 'Check and start day')));
}
