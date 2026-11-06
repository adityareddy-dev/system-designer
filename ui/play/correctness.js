// A written correctness checkpoint, separate from the simulated traffic score.
import { h } from './util.js';

export function checkpointComplete(checkpoint, answer) {
  return !!answer?.text?.trim() && (checkpoint.fields || []).every((field, i) => Number.isInteger(answer.choices?.[i]) && !!field.options[answer.choices[i]]);
}

export function checkpointCorrect(checkpoint, answer) {
  return checkpointComplete(checkpoint, answer) && checkpoint.fields?.length >= 2 && checkpoint.fields.every((field, i) => answer.choices[i] === field.correct);
}

export function renderCheckpointForm(checkpoint, answer = {}, onSubmit, onCancel) {
  const selects = (checkpoint.fields || []).map((field, i) => h('select', { class: 'pl-input', required: true },
    h('option', { value: '', text: 'Choose an answer' }), field.options.map((text, j) => h('option', { value: j, selected: answer.choices?.[i] === j, text }))));
  const line = h('input', { class: 'pl-input', type: 'text', required: true, maxlength: 500, value: answer.text || '' });
  const feedback = h('p', { class: 'pl-muted', role: 'status' });
  const form = h('form', { class: 'pl-modal-card pl-checkpoint', style: { maxHeight: '100%', overflowY: 'auto' }, onSubmit: (event) => {
    event.preventDefault();
    const value = { choices: selects.map((select) => select.value === '' ? null : Number(select.value)), text: line.value.trim() };
    if (checkpointCorrect(checkpoint, value)) onSubmit(value);
    else if (checkpointComplete(checkpoint, value)) feedback.textContent = checkpoint.fields.filter((field, i) => value.choices[i] !== field.correct).map(field => field.explanation).join(' ') + ' Walk through the failure again before starting.';
    else { line.setCustomValidity('Write one line explaining your choice.'); line.reportValidity(); }
  } }, h('h3', { text: 'Correctness checkpoint' }),
  h('p', { text: 'Trace the failure before the day. Both choices are checked and count toward correctness mastery when your traffic day passes. Your explanation is saved for comparison.' }),
  selects.map((select, i) => h('label', {}, h('p', { text: checkpoint.fields[i].label }), select)),
  h('label', {}, h('p', { text: checkpoint.prompt }), line),
  feedback,
  h('div', { class: 'pl-actions' }, h('button', { class: 'pl-btn', type: 'button', onClick: onCancel, text: 'Keep drawing' }),
    h('button', { class: 'pl-btn pl-btn--primary', type: 'submit', text: 'Check choices and start day' })));
  line.addEventListener('input', () => line.setCustomValidity(''));
  return form;
}

export function renderCorrectness(checkpoint, savedAnswer) {
  if (!checkpoint) return null;
  if (savedAnswer) return h('section', { class: 'pl-sec', 'aria-label': 'Correctness checkpoint' },
    h('h3', { text: 'Correctness checkpoint' }),
    h('p', { class: 'pl-muted', text: checkpointCorrect(checkpoint, savedAnswer) ? 'Failure trace checked. Correctness mastery is recorded when the full traffic day passes.' : 'Failure trace needs revision before correctness mastery can be recorded.' }),
    h('p', { class: 'pl-muted', text: checkpoint.limits || 'The traffic score does not verify schema constraints, atomic transactions or business state transitions.' }),
    (checkpoint.fields || []).map((field, i) => h('div', {},
      h('h4', { text: field.label }),
      h('p', { text: `Your choice: ${field.options[savedAnswer.choices[i]]}` }),
      h('p', { text: `${savedAnswer.choices[i] === field.correct ? 'Matches the reference.' : 'Revisit this choice.'} ${field.explanation}` }))),
    h('h4', { text: 'Your explanation' }), h('p', { text: savedAnswer.text }),
    h('h4', { text: 'Reference answer' }), h('p', { text: checkpoint.discussion }),
    h('p', { class: 'pl-muted', text: 'Compare your explanation with these rules. The written line is not automatically graded.' }));
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
