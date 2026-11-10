// Fixed-window request counters per key (an address, a user, or a whole route group), kept in memory and swept as they expire.
// Each route group has its own table, so a flood on one route can never push out the counters of another (sign-in, results).
// A full table drops expired entries first, then the oldest ones still under their limit; an address that is over its
// limit is the last thing to go.

export function createLimiter({ now = Date.now, maxKeys = 100000 } = {}) {
  const tables = new Map();
  const tableOf = (key) => {
    const i = key.indexOf(':');
    const g = i < 0 ? '' : key.slice(0, i);
    let m = tables.get(g);
    if (!m) { m = new Map(); tables.set(g, m); }
    return m;
  };

  function sweepTable(m, t) {
    for (const [k, e] of m) if (e.reset <= t) m.delete(k);
  }

  // Makes room in a full table, a tenth at a time so the work stays small per request: expired entries, then the oldest
  // under their limit, then (only if nearly all are over) the oldest.
  function makeRoom(m, t) {
    sweepTable(m, t);
    const target = Math.floor(maxKeys * 0.9);
    if (m.size <= target) return;
    for (const [k, e] of m) {
      if (m.size <= target) return;
      if (e.count <= e.limit) m.delete(k);
    }
    for (const k of m.keys()) {
      if (m.size <= target) return;
      m.delete(k);
    }
  }

  function sweep(t = now()) {
    for (const m of tables.values()) sweepTable(m, t);
  }

  return {
    // Counts one hit. Returns 0 when allowed, else the seconds until the window resets.
    take(key, limit, windowMs) {
      const t = now();
      const m = tableOf(key);
      let e = m.get(key);
      if (!e || e.reset <= t) {
        if (e) m.delete(key);
        else if (m.size >= maxKeys) makeRoom(m, t);
        // (re)inserted at the end, so table order is the order windows started
        e = { count: 0, reset: t + windowMs, limit };
        m.set(key, e);
      }
      e.count += 1;
      e.limit = limit;
      return e.count <= limit ? 0 : Math.max(1, Math.ceil((e.reset - t) / 1000));
    },
    sweep,
    size: () => { let n = 0; for (const m of tables.values()) n += m.size; return n; },
  };
}

// Limits per route group: [hits, window in ms]. "ip" counts per address (an IPv6 /64 counts as one), "user" per signed-in
// account, "global" for everyone together, counted only for requests that passed their own limits.
export const LIMITS = {
  events: { ip: [30, 60_000] },
  feedback: { ip: [5, 600_000] },
  all: { ip: [300, 60_000] },
  auth: { ip: [20, 60_000], global: [600, 60_000] },
  results: { ip: [60, 600_000], user: [30, 600_000], global: [300, 60_000] },
  progress: { ip: [60, 60_000], user: [30, 60_000] },
  account: { ip: [30, 60_000], user: [10, 60_000] },
  leaderboard: { ip: [120, 60_000] },
  report: { ip: [30, 600_000], user: [10, 600_000] },
};
