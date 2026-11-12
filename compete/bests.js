// Personal bests, play-day streak and a short history, kept in ctx.store under the "bests" key.
import { todayLocal, addDays, isDateStr } from './daily.js';

const MAX_KEYS = 400;
const MAX_HISTORY = 200;
const SKIP_MODES = new Set(['sandbox', 'lesson', 'intro']);

export function createBests(store, now = () => new Date()) {
  const load = () => {
    const d = store.get('bests', null);
    return d && typeof d === 'object' && d.best && d.days && Array.isArray(d.history) ? d : { best: {}, days: {}, history: [] };
  };
  const save = (d) => store.set('bests', d);

  return {
    // Best entry for `${mode}:${problemId}:${seed}`, or null.
    get(key) {
      return load().best[key] || null;
    },

    // Call once per finished traffic day. Returns { isBest, previous } where previous is the old best entry or null.
    record(key, debrief) {
      const [mode, problemId, ...rest] = String(key).split(':');
      if (SKIP_MODES.has(mode) || !debrief?.score) return { isBest: false, previous: null };
      const seed = rest.join(':');
      const d = load();
      const t = now();
      const date = todayLocal(t);
      const entry = {
        total: Math.round(debrief.score.total),
        stars: debrief.stars || 0,
        passed: !!debrief.passed,
        availability: debrief.slo?.availability?.actual ?? null,
        p99Ms: Math.round(debrief.slo?.latency?.worstP99Ms ?? 0),
        costPerMonth: Math.round(debrief.slo?.cost?.perMonth ?? 0),
        date,
        at: t.toISOString(),
      };
      const previous = d.best[key] || null;
      const isBest = !previous || entry.total > previous.total;
      d.best[key] = {
        ...(isBest ? entry : previous),
        attempts: (previous?.attempts || 0) + 1,
        lastTotal: entry.total,
      };
      const day = d.days[date] || { plays: 0, best: 0, challenge: false, cleared: false };
      day.plays += 1;
      day.best = Math.max(day.best, entry.total);
      if (mode === 'challenge') {
        day.challenge = true;
        // only a daily run that earned a star keeps the daily streak going
        day.cleared = !!day.cleared || (debrief.stars || 0) > 0;
      }
      d.days[date] = day;
      d.history.unshift({ key, mode, problemId, seed, ...entry });
      if (d.history.length > MAX_HISTORY) d.history.length = MAX_HISTORY;
      const keys = Object.keys(d.best);
      if (keys.length > MAX_KEYS) {
        // daily results are the record of which problems came up and when: practice bests go first when the table is full
        const daily = (k) => (/^challenge:[^:]+:daily-\d{4}-\d{2}-\d{2}$/.test(k) ? 1 : 0);
        keys.sort((a, b) => daily(a) - daily(b) || (d.best[a].at || '').localeCompare(d.best[b].at || ''));
        for (const k of keys.slice(0, keys.length - MAX_KEYS)) delete d.best[k];
      }
      save(d);
      return { isBest, previous };
    },

    // { problemId: [daily dates played] } from the saved bests, which unrelated practice runs never push out (the history list is capped).
    dailyPlays() {
      const out = {};
      for (const key of Object.keys(load().best)) {
        const m = /^challenge:([^:]+):daily-(\d{4}-\d{2}-\d{2})$/.exec(key);
        if (m) (out[m[1]] ||= []).push(m[2]);
      }
      for (const id of Object.keys(out)) out[id].sort();
      return out;
    },

    // Days in a row with at least one finished day; kind 'challenge' counts only daily runs that earned a star (today may still be open: yesterday keeps the streak alive).
    streak(kind = 'any') {
      return this.streakInfo(kind).current;
    },

    streakInfo(kind = 'any') {
      const d = load();
      const played = (s) => !!d.days[s] && (kind !== 'challenge' || (d.days[s].challenge && d.days[s].cleared !== false));
      const today = todayLocal(now());
      const playedToday = played(today);
      const triedToday = !!d.days[today]?.challenge;
      let cur = 0;
      let s = playedToday ? today : addDays(today, -1);
      while (played(s)) { cur++; s = addDays(s, -1); }
      const dates = Object.keys(d.days).filter((x) => isDateStr(x) && played(x)).sort();
      let longest = 0, run = 0, prev = null;
      for (const x of dates) {
        run = prev && addDays(prev, 1) === x ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = x;
      }
      return { current: cur, longest: Math.max(longest, cur), playedToday, triedToday };
    },

    // Per-day summary for the last `days` days, oldest first: { date, plays, best, challenge }.
    days(days = 30) {
      const d = load();
      const today = todayLocal(now());
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = addDays(today, -i);
        const v = d.days[date];
        out.push({ date, plays: v?.plays || 0, best: v?.best || 0, challenge: !!v?.challenge });
      }
      return out;
    },

    // One row per day and problem, newest first: { key, mode, problemId, seed, date, total (best), stars, passed, attempts }.
    historyByDay(limit = 30) {
      const rows = new Map();
      for (const x of load().history) {
        const date = x.date || String(x.at || '').slice(0, 10);
        const k = date + '|' + x.key;
        const r = rows.get(k);
        if (!r) rows.set(k, { ...x, date, attempts: 1 });
        else {
          r.attempts += 1;
          if (x.total > r.total) Object.assign(r, x, { date, attempts: r.attempts });
        }
      }
      return [...rows.values()].slice(0, limit);
    },

    // Newest first.
    history(limit = 30) {
      return load().history.slice(0, limit);
    },

    // Best entry of the daily challenge for a date, or null.
    challengeBest(date) {
      const d = load();
      let top = null;
      for (const [k, v] of Object.entries(d.best)) {
        if (k.startsWith('challenge:') && k.endsWith(':daily-' + date) && (!top || v.total > top.total)) top = v;
      }
      return top;
    },
  };
}
