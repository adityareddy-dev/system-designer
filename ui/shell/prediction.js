// The same written commitment opens lesson and drill alternatives.
import { h } from './dom.js';

export function predictionGate(choices, { prompt = 'What do you expect, and why?', onCommit = () => {} } = {}) {
  let value = '';
  choices.hidden = true;
  const input = h('textarea', { class: 'sh-input', rows: 2, 'aria-label': 'Your calculation or prediction', placeholder: 'Predict what will happen and why.' });
  const receipt = h('p', { class: 'sh-muted sh-prediction-receipt', hidden: true });
  const commit = h('button', { type: 'submit', class: 'sh-btn', disabled: true, text: 'Commit prediction and see choices' });
  const form = h('form', { class: 'sh-prediction-form', onsubmit: event => {
    event.preventDefault();
    if (value || !input.value.trim()) return;
    value = input.value.trim(); input.readOnly = true; commit.hidden = true;
    receipt.textContent = `Your prediction (not graded): ${value}`; receipt.hidden = false;
    choices.hidden = false; onCommit(value); choices.querySelector('button')?.focus();
  } }, h('label', {}, h('p', { text: prompt }), input), commit, receipt);
  input.addEventListener('input', () => commit.disabled = !input.value.trim());
  const key = event => {
    if (!form.isConnected || choices.hidden || event.ctrlKey || event.metaKey || event.altKey || /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (/^[1-9]$/.test(event.key)) choices.querySelectorAll('button')[Number(event.key) - 1]?.click();
  };
  document.addEventListener('keydown', key);
  return { form, get value() { return value; }, destroy() { document.removeEventListener('keydown', key); } };
}
