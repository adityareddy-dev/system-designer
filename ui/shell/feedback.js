// Small inline feedback form with native controls and local prompt markers.
import { h } from './dom.js';
import { metrics } from '../../core/metrics.js';
import { APP_VERSION } from '../../core/version.js';
import { countries } from '../../core/countries.js';
import { CONSENT_VERSION, CONSENT_TEXT, feedbackChoices } from '../../core/feedback-contract.js';

const mounted = new WeakMap();
let fieldId = 0;
const anonymous = 'Anonymous, even when signed in. Please leave out personal details.';
const attributed = "We'll keep your comment with the name and role you give. If you add an email, we'll use it only to follow up about your quote.";
export function mountFeedback(host, ctx, page, token = host, general = false, opener = null) {
  if (!ctx?.store) return;
  const previous = mounted.get(host);
  if (!general && previous?.token === token && previous.page === page) { host.append(previous.form); return; }
  const key = 'feedback.seen.' + page;
  if (!general && ctx.store.get(key, false)) return;
  if (!general) ctx.store.set(key, true);
  const form = h('form', { class: 'sh-feedback', 'aria-label': general ? 'Send feedback' : 'How was this?' });
  const title = h('legend', { text: general ? 'How is the game?' : 'How was this?' });
  const group = h('fieldset', {}, title, h('p', { class: 'sh-muted', text: '1 is frustrating. 5 is great.' }));
  const ratings = h('div', { class: 'sh-feedback-ratings' });
  for (let i = 1; i <= 5; i++) ratings.append(h('label', {}, h('input', { type: 'radio', name: 'rating', value: i, required: true, 'aria-label': `${i} out of 5` }), h('span', { text: String(i) })));
  group.append(ratings);
  const comment = h('textarea', { class: 'sh-input', name: 'comment', rows: 2, maxlength: 500, 'aria-label': 'Optional comment', placeholder: 'What worked or got in your way?' });
  const notice = h('p', { class: 'sh-muted', text: anonymous });
  const send = h('button', { class: 'sh-btn', type: 'submit', text: 'Send' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'sh-muted' });
  const dismiss = h('button', { class: 'sh-btn sh-btn--ghost', type: 'button', text: 'Dismiss', onclick: () => {
    const next = opener || host.querySelector('button:not(.sh-feedback button), a[href]');
    form.hidden = true; next?.focus({ preventScroll: true });
  } });
  let more, consent, personal;
  function updateConsent() {
    consent.disabled = !comment.value.trim();
    if (consent.disabled) consent.checked = false;
    if (!consent.checked) {
      personal?.remove(); personal = null; notice.textContent = anonymous;
    } else if (!personal) {
      personal = h('div', { class: 'sh-feedback-personal' });
      for (const [name, text, max, placeholder] of [
        ['name', 'Name', 60], ['title', 'Role, as it should appear', 80, 'e.g. backend engineer'],
        ['email', "Email, if you're OK with a follow-up", 254],
      ]) {
        const input = h('input', { class: 'sh-input', type: name === 'email' ? 'email' : 'text', name, maxlength: max, required: name !== 'email', pattern: name === 'email' ? undefined : '.*\\S.*', placeholder });
        personal.append(h('label', {}, h('span', { text }), input));
        if (name === 'email') {
          const id = 'feedback-email-help-' + ++fieldId; input.setAttribute('aria-describedby', id);
          personal.append(h('p', { id, class: 'sh-muted', text: 'Only for a follow-up about your quote.' }));
        }
      }
      consent.closest('fieldset').append(personal); notice.textContent = attributed;
    }
  }
  function revealMore() {
    if (more || ctx.store.get('feedback.more.asked', false) || !form.checkVisibility() || !form.querySelector('[name=rating]:checked')) return;
    more = h('fieldset', { class: 'sh-feedback-more' }, h('legend', { text: 'A few more questions (optional)' }));
    for (const [name, text, options] of [
      ['helped', 'Did it help?', feedbackChoices.helped],
      ['use', 'What did you use it for?', feedbackChoices.use],
      ['country', 'Country', countries],
      ['role', 'Your role', feedbackChoices.role],
    ]) {
      const select = h('select', { class: 'sh-input', name, 'aria-label': text }, h('option', { value: '', text: name === 'country' ? 'Prefer not to say' : 'Choose an answer (optional)' }));
      for (const [value, label] of options) select.append(h('option', { value, text: label }));
      more.append(h('fieldset', {}, h('legend', { text }), select));
    }
    consent = h('input', { type: 'checkbox', name: 'quote', disabled: !comment.value.trim(), onchange: updateConsent });
    more.append(h('fieldset', {}, h('legend', { text: 'Can I quote you?' }), h('label', { class: 'sh-feedback-consent' }, consent, h('span', { text: CONSENT_TEXT })), h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy' })));
    notice.before(more);
    // Consume only when the attached block is visible. Its controls survive a failed send.
    ctx.store.set('feedback.more.asked', true);
  }
  ratings.addEventListener('change', revealMore);
  comment.addEventListener('input', () => { if (consent) updateConsent(); });
  form.append(group, h('label', {}, h('span', { text: 'Comment (optional, up to 500 characters)' }), comment), notice, h('div', { class: 'sh-btn-row' }, send, dismiss), status);
  form.addEventListener('keydown', e => e.stopPropagation());
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (send.disabled || !form.reportValidity()) return;
    const data = new FormData(form), rating = Number(data.get('rating'));
    if (!rating) return;
    const payload = { rating, comment: comment.value.slice(0, 500), page, version: APP_VERSION };
    const about = Object.fromEntries(['helped', 'use', 'country', 'role'].flatMap(key => data.get(key) ? [[key, data.get(key)]] : []));
    if (Object.keys(about).length) payload.about = about;
    if (consent?.checked) {
      payload.quote = { consent: true, consentVersion: CONSENT_VERSION, name: data.get('name').trim(), title: data.get('title').trim() };
      const email = data.get('email').trim().toLowerCase();
      if (email) payload.quote.email = email;
    }
    send.disabled = true; status.textContent = 'Sending…';
    const ok = await metrics.feedback(payload);
    if (ok) {
      for (const control of form.querySelectorAll('input, textarea, select, button, fieldset')) control.disabled = true;
      status.textContent = 'Thanks for your feedback.';
    } else { send.disabled = false; status.textContent = 'Could not send. You can try again when the service is available.'; }
  });
  host.append(form); mounted.set(host, { token, page, form });
}
