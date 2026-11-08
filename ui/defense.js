// Typed reasoning, reveal and self review shared by lessons and Interview mode.
export function mountDefense(host, step, draft, { id, lesson = false, onReveal = () => {}, onChange = () => {}, locked = false, checkClaim } = {}) {
  const make = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'text') el.textContent = value;
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value);
    }
    el.append(...children);
    return el;
  };
  draft.checked ||= [];
  const answer = make('textarea', { id: id + '-answer', class: 'hp-defense-answer' + (lesson ? ' sh-defend-answer sh-input' : ' pl-input'), rows: 6, required: '', maxlength: 6000, 'aria-describedby': id + '-help' });
  answer.value = draft.answer || '';
  answer.readOnly = !!draft.revealed;
  const model = make('h3', { id: id + '-model', tabindex: '-1', text: step.claims ? 'Test your claims' : 'Compare your answer' });
  const checklist = make('fieldset', { class: 'hp-defense-checklist sh-defend-checklist' }, make('legend', { text: 'Which points did you cover?' }));
  step.checklist.forEach((point, i) => {
    const check = make('input', { type: 'checkbox' });
    check.checked = !!draft.checked[i]; check.disabled = locked;
    check.addEventListener('change', () => { draft.checked[i] = check.checked; onChange(); });
    checklist.append(make('label', { class: 'hp-defense-point sh-defend-point pl-defense-check' }, check, make('span', { text: point })));
  });
  const comparison = make('div', { class: 'hp-defense-model sh-defend-comparison pl-defense-model' }, model, make('p', { text: step.model }), checklist,
    make('p', { class: 'hp-defense-help', text: 'This is your review. An unticked point is something to try in your next answer.' }));
  if (step.claims?.length && checkClaim) {
    draft.claims ||= {};
    const claims = make('fieldset', { class: 'hp-defense-claims' }, make('legend', { text: 'Predict the result of an experiment' }),
      make('p', { text: 'Choose whether each listed claim holds or fails, then commit at least one replay. Rejecting an unsafe claim is a valid prediction. Your prediction is compared with the measured result; an inapplicable experiment is not tested.' }));
    for (const claim of step.claims) {
      const input = make('input', { type: 'checkbox' }); input.checked = !!draft.claims[claim.id];
      const position = make('select', { class: 'pl-input', 'aria-label': 'Your prediction for ' + claim.text },
        make('option', { value: '', text: 'Choose your prediction' }), make('option', { value: 'hold', text: 'I predict this holds' }), make('option', { value: 'fail', text: 'I predict this fails' }));
      position.value = draft.claims[claim.id] ? draft.claims[claim.id].position || 'hold' : '';
      const refresh = () => { input.disabled = locked || !position.value; position.disabled = locked || input.checked; };
      position.addEventListener('change', refresh);
      const trace = make('div', { class: 'pl-claim-trace', 'aria-live': 'polite' });
      const show = () => {
        const result = draft.claims[claim.id];
        trace.replaceChildren();
        if (result) {
          const tested = result.applied !== false && result.outcome !== 'untested';
          const matched = result.matched ?? (result.held === (result.position !== 'fail'));
          trace.append(make('b', { text: !tested ? 'Not tested by this replay' : matched ? 'Prediction matched the replay' : 'Prediction missed the replay' }),
            make('p', { text: 'Your committed prediction: this claim ' + (result.position === 'fail' ? 'fails' : 'holds') + '. ' + (tested ? 'Measured result: the claim ' + (result.held ? 'held' : 'failed') + '.' : 'This replay supplies no evidence for either position.') }),
            make('ol', {}, ...result.steps.map(text => make('li', { text }))));
        }
        refresh();
      };
      input.addEventListener('change', () => {
        if (locked) return;
        if (input.checked && position.value) draft.claims[claim.id] = checkClaim({ ...claim, position: position.value });
        else delete draft.claims[claim.id];
        show(); onChange();
      });
      show(); claims.append(make('p', { text: claim.text }), position,
        make('label', { class: 'hp-defense-point pl-defense-check' }, input, make('span', { text: 'Commit prediction and replay' })), trace);
    }
    model.after(claims);
    const review = make('details', {}, make('summary', { text: 'Review your writing against the model answer' }));
    for (const el of [...comparison.children].filter(el => el !== model && el !== claims)) review.append(el);
    comparison.append(review);
  }
  comparison.hidden = !draft.revealed;
  const reveal = make('button', { type: 'submit', class: lesson ? 'sh-btn' : 'pl-btn pl-btn--primary', 'aria-controls': model.id });
  const refresh = () => {
    reveal.disabled = !answer.value.trim() || !!draft.revealed;
    reveal.textContent = draft.revealed ? 'Model answer revealed' : 'Reveal the model answer';
  };
  answer.addEventListener('input', () => { draft.answer = answer.value; refresh(); });
  const form = make('form', { class: 'hp-defense-form sh-defend-form' },
    make('label', { for: answer.id, class: lesson ? 'sh-h3' : 'pl-defense-field', text: 'Your answer' }),
    make('p', { id: id + '-help', class: 'hp-defense-help', text: lesson ? 'Write your reasoning before the reveal. Your answer stays on this page and is not saved or graded.' : 'Write your reasoning before the reveal. Saving the interview report keeps your answer, claims and computed counterexamples on this device.' }), answer, reveal);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!answer.value.trim() || draft.revealed) return;
    draft.answer = answer.value; draft.revealed = true;
    answer.readOnly = true; comparison.hidden = false; refresh();
    onReveal(); model.focus();
  });
  refresh(); host.append(form, comparison);
  return { lock() { locked = true; comparison.querySelectorAll('input, select').forEach(input => input.disabled = true); } };
}
