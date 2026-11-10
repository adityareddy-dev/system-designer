// Hash router: parses #/path?query, emits `route` on the bus on every change.
function parse(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const qs = q < 0 ? '' : raw.slice(q + 1);
  let parts = [];
  try { parts = path.split('/').filter(Boolean).map(decodeURIComponent); } catch { parts = path.split('/').filter(Boolean); }
  return { path: '/' + path, parts, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function createRouter(bus) {
  let cur = parse(location.hash);
  let replacedAt = -Infinity;
  const norm = (h) => (String(h).startsWith('#') ? String(h) : '#' + String(h).replace(/^\/?/, '/'));
  function onHash(event) {
    // Hash events retain their creation time while waiting in the browser's queue.
    if (event && event.timeStamp < replacedAt) return;
    // A later navigation may already have changed location while this event waited.
    cur = parse(event?.newURL ? new URL(event.newURL).hash : location.hash);
    bus.emit('route', cur);
  }
  addEventListener('hashchange', onHash);
  return {
    current: () => cur,
    go(hash) {
      const h = norm(hash);
      if (location.hash === h) { onHash(); return; }
      location.hash = h;
    },
    back() { history.back(); },
    replace(hash) {
      const h = norm(hash);
      history.replaceState(history.state, '', location.pathname + location.search + h);
      replacedAt = performance.now();
      onHash();
    },
    parse,
  };
}
