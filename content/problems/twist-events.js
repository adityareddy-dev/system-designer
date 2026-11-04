// Builds the event list of a problem's "new twist" day: every event moved by shiftMin minutes and one more event added.
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

export function twistEvents(problem, spec) {
  const shift = (spec && spec.shiftMin) || 0;
  const events = (problem.events || []).map((e) => ({ ...e, at: hhmm(Math.min(1425, Math.max(5, toMin(e.at) + shift))) }));
  if (spec && spec.extra && !events.some((e) => e.id === spec.extra.id)) events.push({ id: spec.extra.id, at: spec.extra.at, params: {} });
  return events.sort((a, b) => toMin(a.at) - toMin(b.at));
}
