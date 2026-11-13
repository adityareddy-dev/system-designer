// A written correctness checkpoint, separate from the simulated traffic score.
import { h } from './util.js';
import { completionState } from './completion.js';

export function checkpointComplete(checkpoint, answer) {
  return !!answer?.text?.trim() && (checkpoint.fields || []).every((field, i) => Number.isInteger(answer.choices?.[i]) && !!field.options[answer.choices[i]]);
}

export function checkpointCorrect(checkpoint, answer) {
  return checkpointComplete(checkpoint, answer) && checkpoint.fields?.length >= 2 && checkpoint.fields.every((field, i) => answer.choices[i] === field.correct);
}

export function renderCheckpointForm(checkpoint, answer = {}, onSubmit, onCancel, onSkip) {
  answer ||= {};
  const selects = (checkpoint.fields || []).map((field, i) => h('select', { class: 'pl-input' },
    h('option', { value: '', text: 'Choose an answer' }), field.options.map((text, j) => h('option', { value: j, selected: answer.choices?.[i] === j, text }))));
  const line = h('input', { class: 'pl-input', type: 'text', maxlength: 500, value: answer.text || '' });
  const feedback = h('p', { class: 'pl-muted', role: 'status' });
  let shown = false;
  const submitBtn = h('button', { class: 'pl-btn pl-btn--primary', type: 'submit', text: 'Check choices and start day' });
  const form = h('form', { class: 'pl-modal-card pl-checkpoint', novalidate: true, style: { maxHeight: '100%', overflowY: 'auto' }, onSubmit: (event) => {
    event.preventDefault();
    const value = { choices: selects.map((select) => select.value === '' ? null : Number(select.value)), text: line.value.trim() };
    if (shown) { onSubmit(value); return; }
    if (!checkpointComplete(checkpoint, value)) { feedback.textContent = 'Pick an answer for each step and write one line, or skip and start the day.'; return; }
    if (checkpointCorrect(checkpoint, value)) { onSubmit(value); return; }
    shown = true;
    feedback.textContent = checkpoint.fields.filter((field, i) => value.choices[i] !== field.correct).map(field => field.explanation).join(' ') + ' Read that, then start the day when you are ready.';
    submitBtn.textContent = 'Start day';
  } }, h('h3', { text: 'Correctness checkpoint' }),
  checkpoint.responsibility ? h('p', {}, h('b', { text: 'Central responsibility: ' }), checkpoint.responsibility) : null,
  h('p', { text: 'Optional. Trace the failure before the day. Each step is checked, but a wrong answer never stops the day. Your explanation is saved for comparison.' }),
  selects.map((select, i) => {
    const reason = h('p', { class: 'pl-trace-reason pl-muted', role: 'status' });
    select.addEventListener('change', () => { reason.textContent = select.value === '' ? '' : 'Your choice: ' + checkpoint.fields[i].options[Number(select.value)] + '. ' + (Number(select.value) === checkpoint.fields[i].correct ? 'Checked. ' : 'Revisit this step. ') + checkpoint.fields[i].explanation; });
    return h('label', {}, h('p', { text: checkpoint.fields[i].label }), select, reason);
  }),
  h('label', {}, h('p', { text: checkpoint.prompt }), line),
  feedback,
  h('div', { class: 'pl-actions' }, h('button', { class: 'pl-btn', type: 'button', onClick: onCancel, text: 'Keep drawing' }),
    h('button', { class: 'pl-btn', type: 'button', 'data-gate': 'skip', onClick: () => (onSkip || onCancel)(), text: 'Skip and start day' }), submitBtn));
  return form;
}

export function renderCorrectness(checkpoint, savedAnswer, completion) {
  if (!checkpoint) return null;
  if (savedAnswer) return h('section', { class: 'pl-sec', 'aria-label': 'Correctness checkpoint' },
    h('h3', { text: 'Correctness checkpoint' }),
    h('p', { class: 'pl-muted pl-checkpoint-status', text: (completion || completionState({ correctness: checkpoint }, { passed: true }, savedAnswer)).message }),
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
    completion ? h('p', { class: 'pl-muted pl-checkpoint-status', text: completion.message }) : null,
    h('p', { class: 'pl-muted', text: 'Unscored. The traffic score does not verify these rules. Write your choice, then compare it with the discussion.' }),
    h('label', {}, h('p', { text: checkpoint.prompt }), answer),
    reveal, discussion);
}
