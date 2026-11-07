// A failed transfer asks for competing explanations before showing repair guidance.
import { h } from './util.js';
export function gateTransfer(root, problem, result) {
  if (!problem.twistDay || result.passed || result.transferReflection) return;
  const children = [...root.children];
  children.forEach(el => el.hidden = true);
  const fields = [
    'Which tradeoff changed between the original day and this workload?',
    'Name two possible explanations for the missed target.',
    'Which single experiment separates those explanations? Predict a different measurable result for each.'
  ].map(text => h('label', { class: 'pl-defense-field' }, h('span', { text }), h('textarea', { class: 'pl-input', rows: 3, required: true, minlength: 20, maxlength: 1200 })));
  const form = h('form', { class: 'pl-sec pl-transfer-reflection', onSubmit: e => {
    e.preventDefault();
    const answers = fields.map(f => f.querySelector('textarea').value.trim());
    if (answers.some(v => v.length < 20)) return;
    result.transferReflection = { tradeoff: answers[0], explanations: answers[1], experiment: answers[2] };
    children.forEach(el => el.hidden = false);
    form.replaceChildren(h('h3', { text: 'Your transfer experiment' }), ...answers.map(text => h('p', { text })), h('small', { text: 'Your prediction is saved for comparison. The next run supplies evidence; the writing is not graded by keywords.' }));
  } }, h('h2', { text: 'The twist found a limit' }), h('p', { text: problem.brief }),
    h('p', { text: `Measured: ${(result.slo.availability.actual * 100).toFixed(2)}% served, p99 about ${Math.round(result.slo.latency.worstP99Ms)} ms, $${Math.round(result.slo.cost.perMonth)}/month against $${result.slo.cost.budget}. Commit your reasoning before repair guidance.` }), fields,
    h('button', { class: 'pl-btn pl-btn--primary', type: 'submit', text: 'Commit experiment and inspect the report' }));
  root.prepend(form);
}
