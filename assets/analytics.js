import { bannerTimeZone } from './consent-region.js';

const ID = 'G-RYGVNBBY85';
const KEY = 'sd.analytics.choice';
let choice = null;
try { const saved = localStorage.getItem(KEY); if (saved === 'accept' || saved === 'decline') choice = saved; } catch { /* Storage may be blocked. */ }
let defaults = globalThis.sdConsentDefaults;
let zone;
try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* Unknown regions need a choice. */ }
let preview = false;
try { preview = new URLSearchParams(location.search).get('preview') === 'hosted' || (new URLSearchParams(location.search).get('preview') !== 'off' && sessionStorage.getItem('sd.preview') === 'hosted'); } catch { /* Preview storage is optional. */ }
const hosted = location.hostname === 'systemdesigner.io';
let banner;
let returnFocus;
const ads = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const allowed = () => choice ? choice === 'accept' : defaults && typeof defaults.analyticsDefault === 'boolean' ? defaults.analyticsDefault : !bannerTimeZone(zone);
const needsChoice = () => !choice && !allowed();
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
const consent = kind => window.gtag('consent', kind, { ...ads, analytics_storage: allowed() ? 'granted' : 'denied' });
consent('default');
window.gtag('js', new Date());
window.gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
// Local copies keep the same consent controls without adding test visits to the live property.
if (hosted) {
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.append(tag);
}
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./analytics.css', import.meta.url).href;
document.head.append(css);

function closeBanner() {
  banner?.remove();
  banner = null;
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}
function save(value) {
  choice = value;
  try { localStorage.setItem(KEY, value); } catch { /* Keep this choice for the current page. */ }
  consent('update');
  closeBanner();
}
function showBanner(focus = false) {
  if (banner || !document.body) return;
  banner = document.createElement('section');
  banner.id = 'sd-cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie choices');
  const text = document.createElement('p');
  text.textContent = 'Allow analytics cookies? We use Google Analytics to see how the site is used. Your choice does not affect play.';
  const actions = document.createElement('div');
  for (const [label, value] of [['Accept', 'accept'], ['Decline', 'decline']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => save(value));
    actions.append(button);
  }
  const privacy = document.createElement('a');
  privacy.href = new URL('../privacy.html', import.meta.url).href;
  privacy.textContent = 'Privacy';
  actions.append(privacy);
  banner.append(text, actions);
  document.body.append(banner);
  if (focus) { returnFocus = document.activeElement; actions.firstElementChild.focus(); }
}
function paint() { if ((hosted || preview) && needsChoice()) showBanner(); else closeBanner(); }
window.sdAnalytics = { openPreferences: () => showBanner(true) };
window.addEventListener('sd:consent-defaults', event => {
  if (typeof event.detail?.analyticsDefault !== 'boolean') return;
  defaults = event.detail;
  consent('update');
  paint();
});
window.addEventListener('storage', event => {
  if (event.key !== KEY) return;
  choice = ['accept', 'decline'].includes(event.newValue) ? event.newValue : null;
  consent('update');
  paint();
});
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-cookie-choices]')) showBanner(true);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true });
else paint();
