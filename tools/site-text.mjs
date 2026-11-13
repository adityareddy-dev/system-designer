// Text and URL helpers shared by page markup and SEO tags.
export const SITE = 'https://systemdesigner.io/';
export const clean = value => String(value ?? '').replace(/\u2014/g, ', ').replace(/\s+,/g, ',');
export const esc = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const json = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
