// Small inline feedback form with native keyboard controls and a local dismissal marker.
import { h } from './dom.js';
import { metrics } from '../../core/metrics.js';
import { APP_VERSION } from '../../core/version.js';

const mounted = new WeakMap();
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
  const comment = h('textarea', { class: 'sh-input', rows: 2, maxlength: 500, 'aria-label': 'Optional comment', placeholder: 'What worked or got in your way?' });
  const send = h('button', { class: 'sh-btn', type: 'submit', text: 'Send' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'sh-muted' });
  const dismiss = h('button', { class: 'sh-btn sh-btn--ghost', type: 'button', text: 'Dismiss', onclick: () => {
    const next = opener || host.querySelector('button:not(.sh-feedback button), a[href]');
    form.hidden = true; next?.focus({ preventScroll: true });
  } });
  form.append(group, h('label', {}, h('span', { text: 'Comment (optional, up to 500 characters)' }), comment),
    h('p', { class: 'sh-muted', text: 'Anonymous, even when signed in. Please leave out personal details.' }), h('div', { class: 'sh-btn-row' }, send, dismiss), status);
  form.addEventListener('keydown', e => e.stopPropagation());
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (send.disabled) return;
    const rating = Number(new FormData(form).get('rating'));
    if (!rating) return;
    send.disabled = true; status.textContent = 'Sending…';
    const ok = await metrics.feedback({ rating, comment: comment.value.slice(0, 500), page, version: APP_VERSION });
    if (ok) { group.disabled = true; comment.disabled = true; status.textContent = 'Thanks for your feedback.'; }
    else { send.disabled = false; status.textContent = 'Could not send. You can try again when the service is available.'; }
  });
  host.append(form); mounted.set(host, { token, page, form });
}
