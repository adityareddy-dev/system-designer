// localStorage wrapper: JSON values, every call guarded so the game works with storage blocked.
export function createStore(prefix = 'hotpath.v1.') {
  const mem = new Map();
  let ls = null;
  try { ls = globalThis.localStorage; const k = prefix + '__probe'; ls.setItem(k, '1'); ls.removeItem(k); } catch { ls = null; }
  return {
    get(key, fallback) {
      try {
        const raw = ls ? ls.getItem(prefix + key) : mem.get(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (ls) ls.setItem(prefix + key, raw); else mem.set(key, raw);
        return true;
      } catch { return false; }
    },
    remove(key) {
      try { if (ls) ls.removeItem(prefix + key); else mem.delete(key); } catch { /* ignore */ }
    },
  };
}
