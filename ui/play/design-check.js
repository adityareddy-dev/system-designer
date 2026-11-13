// A pre-run decision check makes the player predict a tradeoff before receiving repair advice.
import { h } from './util.js';
import { transferFor, transferCorrect, workloadTransfer } from '../../content/transfers.js';
export function checkFor(problem) {
  if (problem.id === 'url-shortener') return {
    q: 'A popular link is read 20,000 times/s. It never changes. One database can read about 8,000 simple lookups a second. Choose a plan for this new workload.',
    choices: ['Double app capacity and leave every read hitting the database', 'Reuse answers, keep the database ready for cache misses', 'Retry every rejected read immediately'], answer: 1,
    why: 'More app capacity cannot increase database throughput. A cold cache still needs a safe miss path.',
    calculation: 'With 90% of answers reused, how many reads/s reach the database?', value: 2000, unit: 'reads/s',
  };
  return workloadTransfer(`problem:${problem.id}`, (problem.concepts || []).find(id => transferFor(id)) || 'back-of-envelope', problem.title);
}
// Only the URL shortener has a hand-written scenario. Every other problem used to get a generic one
// (numbers made up from the problem id), so those now ask only for the written prediction.
export function hasScenario(problem) { return problem.id === 'url-shortener'; }
export function renderDesignCheck(problem, onReady, onCancel, onSkip) {
  const scenario = hasScenario(problem);
  const test = scenario ? checkFor(problem) : null;
  let choice = null;
  const options = h('div', { class: 'sh-choices pl-radios', role: 'group', 'aria-label': 'Choose a plan' });
  const number = scenario ? h('input', { class: 'pl-input', type: 'number', step: 'any', 'aria-label': test.calculation }) : null;
  const reason = h('textarea', { class: 'pl-input', rows: 2, minlength: 12, maxlength: 500, style: { height: 'auto', padding: '12px' }, 'aria-label': 'Predict the limiting part in your own design and explain why' });
  const feedback = h('p', { role: 'status', class: 'pl-muted pl-gate-msg' });
  if (scenario) test.choices.forEach((text, i) => options.append(h('button', { class: 'sh-choice', type: 'button', 'aria-pressed': 'false', onclick: () => { choice = i; [...options.children].forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); feedback.textContent = ''; } },
    h('span', { class: 'pl-radio-mark', 'aria-hidden': 'true' }), h('span', { text }))));
  return h('form', { class: 'pl-modal-card pl-design-check', novalidate: true, style: { maxHeight: '100%', overflowY: 'auto', width: 'min(640px, 100%)' }, onsubmit: e => {
    e.preventDefault();
    if (scenario && !transferCorrect(test, choice, number.value === '' ? NaN : Number(number.value))) {
      feedback.textContent = choice == null ? 'Choose a plan first, or skip and start the day.' : choice !== test.answer ? test.why + ' Pick again, or skip and start the day.' : number.value === '' ? 'Type your number for the calculation, or skip and start the day.' : 'The plan fits. Recheck the calculation, or skip and start the day.';
      return;
    }
    if (reason.value.trim().length < 12) { feedback.textContent = 'Write a short prediction of at least 12 characters, or skip and start the day.'; reason.focus(); return; }
    onReady({ choice, value: scenario ? Number(number.value) : null, text: reason.value.trim() });
  } }, h('h2', { class: 'pl-h2', text: 'Predict before you run' }),
    h('p', { class: 'pl-muted', text: scenario ? 'First, apply the idea to a new workload. Then predict what will limit your own design. The traffic day will test that prediction. This is optional.' : 'Predict what will limit your own design. The traffic day will test that prediction. This is optional.' }),
    scenario ? h('p', { text: test.q }) : null, scenario ? options : null,
    scenario ? h('label', {}, h('p', { text: test.calculation }), number, h('small', { text: test.unit })) : null,
    h('label', {}, h('p', { text: 'Which part will limit your own design, and why?' }), reason, h('small', { class: 'pl-muted', text: 'At least 12 characters' })),
    h('small', { class: 'pl-muted', text: scenario ? 'The plan and calculation are checked. Your written prediction is saved for comparison, not automatically graded.' : 'Your written prediction is saved for comparison, not automatically graded.' }), feedback,
    h('div', { class: 'pl-actions' }, h('button', { class: 'pl-btn', type: 'button', onclick: onCancel }, 'Keep drawing'),
      h('button', { class: 'pl-btn', type: 'button', 'data-gate': 'skip', onclick: () => (onSkip || onCancel)() }, 'Skip and start day'),
      h('button', { class: 'pl-btn pl-btn--primary', type: 'submit' }, 'Check and start day')));
}
