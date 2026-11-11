// A failed transfer asks for competing explanations before showing repair guidance.
import { h, fmtNum } from './util.js';
export function gateTransfer(root, problem, result, catalog) {
  if (!problem.twistDay || result.passed || result.transferReflection) return;
  const children = [...root.children];
  children.forEach(el => el.hidden = true);
  const waiting = [...(result.queues || [])].filter(q => q.lateMessages > 0).sort((a,b) => b.lateMessages - a.lateMessages);
  const queueEvidence = waiting.map(q => {
    const node = result.graph.nodes.find(n => n.id === q.id);
    return `${node?.label || catalog?.elementById.get(node?.type)?.name || q.id} (${q.id}): oldest observed wait about ${fmtNum(q.maxWaitSec)} seconds against a ${fmtNum(q.limitSec)} second waiting deadline; ${fmtNum(q.lateMessages)} jobs late.`;
  }).join(' ');
  const fields = [
    waiting.length ? 'Which tradeoff between paid consumer reserve and the waiting deadline changed in this workload?' : 'Which tradeoff changed between the original day and this workload?',
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
  } }, h('h2', { tabindex: '-1', text: 'The twist found a limit' }), h('p', { text: problem.brief }),
    h('p', { text: `Measured: ${(result.slo.availability.actual * 100).toFixed(2)}% served, p99 about ${Math.round(result.slo.latency.worstP99Ms)} ms, $${Math.round(result.slo.cost.perMonth).toLocaleString('en-US')}/month against $${Number(result.slo.cost.budget).toLocaleString('en-US')}. Commit your reasoning before repair guidance.` }), fields,
    h('button', { class: 'pl-btn pl-btn--primary', type: 'submit', text: 'Commit experiment and inspect the report' }));
  root.prepend(form);
  if (queueEvidence) form.querySelector('h2').after(h('p', { class: 'pl-transfer-evidence', text: 'Waiting evidence: ' + queueEvidence }));
}
