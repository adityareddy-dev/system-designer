// Public reading forms use the hosted service. Forks remain readable and never send addresses to it.
const SITE = 'https://systemdesigner.io';
const API = 'https://api.systemdesigner.io';
const ACCESS = 'sd.reading.access.v1';
const SOURCE = 'sd.reading.source.v1';
const boxes = [...document.querySelectorAll('[data-email-capture]')];
const reveal = () => document.querySelectorAll('.sd-gated').forEach(part => { part.hidden = false; });

async function request(method, body) {
  const response = await fetch(API + '/email-capture', {
    method, credentials: 'omit', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error('capture unavailable');
  return response.json();
}

if (location.origin !== SITE) {
  reveal();
} else {
  let access = false, source = '';
  try { access = localStorage.getItem(ACCESS) === '1'; } catch { /* access still works for this page */ }
  try {
    const tag = new URLSearchParams(location.search).get('utm_source');
    if (tag && /^[a-zA-Z0-9_.~-]{1,100}$/.test(tag)) sessionStorage.setItem(SOURCE, tag);
    source = sessionStorage.getItem(SOURCE) || '';
    if (!/^[a-zA-Z0-9_.~-]{0,100}$/.test(source)) source = '';
  } catch { /* attribution is optional */ }
  if (access) reveal();
  const defaults = boxes.length ? request('GET').then(data => data?.consent?.marketingDefault === true).catch(() => false) : Promise.resolve(false);
  for (const box of boxes) {
    const guide = box.dataset.purpose === 'guide';
    if (guide && access) continue;
    box.hidden = false;
    const form = box.querySelector('form'), fields = form.querySelector('fieldset');
    const check = form.elements.marketingOptIn, email = form.elements.email;
    const status = box.querySelector('[data-capture-status]');
    // The site never hears about an unsubscribe from an email link, so the reading gate starts unticked.
    defaults.then(on => { check.checked = !guide && on; fields.disabled = false; status.textContent = ''; });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (fields.disabled || !form.reportValidity()) return;
      if (!guide && !check.checked) {
        status.textContent = 'Select email updates to join the weekly list.';
        check.focus();
        return;
      }
      fields.disabled = true;
      status.textContent = 'Saving your choice…';
      try {
        const result = await request('POST', {
          email: email.value.trim(), marketingOptIn: check.checked, purpose: box.dataset.purpose,
          page: location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/'), source,
        });
        if (result?.ok !== true) throw new Error('capture not saved');
        if (guide) {
          reveal();
          try { localStorage.setItem(ACCESS, '1'); } catch { /* this page stays open */ }
          const heading = document.querySelector('.sd-gated h2');
          if (heading) { heading.tabIndex = -1; heading.focus(); }
        }
        form.hidden = true;
        status.textContent = guide ? (check.checked ? 'The rest is open. Your email updates choice is saved.' : 'The rest is open. No updates request was made.') : 'Your email updates choice is saved.';
      } catch {
        status.textContent = 'We could not save your choice. Please try again.';
      } finally { fields.disabled = false; }
    });
  }
}
