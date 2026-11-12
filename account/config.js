// Where the optional sign-in service lives. Nothing here is secret.

export const SITE = 'https://systemdesigner.io';
export const API = 'https://api.systemdesigner.io';

// Turn on once https://api.systemdesigner.io/health answers (API.md, "Go live"). While false the site never contacts the service,
// so visitors see no failed request and no sign-in button.
export const API_LIVE = true;

export const DEV_API_PORT = 8792;

// The service address for this page, or null when accounts are off here (forks, previews, plain local runs).
// A local copy on port 8765 opts in with ?api (port 8792) or ?api=<port>.
export function apiBase(loc = globalThis.location) {
  if (!loc) return null;
  if (loc.origin === SITE) return API_LIVE ? API : null;
  if ((loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && loc.port === '8765' && loc.protocol === 'http:') {
    const q = new URLSearchParams(loc.search || '').get('api');
    if (q === null) return null;
    const port = /^\d{2,5}$/.test(q) ? Number(q) : DEV_API_PORT;
    return port > 0 && port < 65536 ? `http://${loc.hostname}:${port}` : null;
  }
  return null;
}

// Does this page ask for a free account before any play? Only the hosted site does. Forks, localhost and file serves stay open.
// ?preview=hosted shows the hosted behaviour on any other address (kept for the tab), with a stand-in sign-in; ?preview=off ends it.
export function previewHosted(loc = globalThis.location) {
  if (!loc || loc.origin === SITE) return false;
  try {
    const v = new URLSearchParams(loc.search || '').get('preview');
    if (v === 'hosted') { sessionStorage.setItem('sd.preview', 'hosted'); return true; }
    if (v === 'off') { sessionStorage.removeItem('sd.preview'); return false; }
    return sessionStorage.getItem('sd.preview') === 'hosted';
  } catch { return false; }
}
export function accountRequired(loc = globalThis.location) {
  if (!loc) return false;
  if (loc.origin === SITE) return API_LIVE;
  return previewHosted(loc);
}

// The pages that start play. Lists, the front page, settings and the readable pages stay open to everyone.
export function isPlayRoute(parts = []) {
  const [a, b] = parts;
  if (a === 'intro' || a === 'challenge' || a === 'beat' || a === 'sandbox' || a === 'drill') return true;
  return (a === 'learn' || a === 'practice') && !!b;
}
