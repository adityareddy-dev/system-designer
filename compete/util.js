// Small helpers shared inside compete/: tolerant catalog lookups and formatting.
export const DEFAULT_REGIONS = ['us', 'eu', 'apac', 'latam'];
export const DEFAULT_TIERS = ['S', 'M', 'L', 'XL'];

export function asList(v, key) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v instanceof Map) return Array.from(v.values());
  if (typeof v === 'object') {
    if (key && Array.isArray(v[key])) return v[key];
    return Object.values(v).filter((x) => x && typeof x === 'object');
  }
  return [];
}

export function elementList(catalog) {
  const e = catalog?.elements ?? catalog?.elementById ?? catalog?.byId?.elements;
  return asList(e, 'elements');
}
export function elementById(catalog, id) {
  if (typeof catalog?.element === 'function') { const r = catalog.element(id); if (r) return r; }
  const m = catalog?.elementById;
  if (m instanceof Map && m.has(id)) return m.get(id);
  if (m && typeof m === 'object' && m[id]) return m[id];
  return elementList(catalog).find((x) => x.id === id) || null;
}
export function eventList(catalog) {
  const e = catalog?.events ?? catalog?.eventById;
  return asList(e, 'events');
}
export function eventById(catalog, id) {
  const m = catalog?.eventById;
  if (m instanceof Map && m.has(id)) return m.get(id);
  if (m && typeof m === 'object' && !Array.isArray(m) && m[id]) return m[id];
  return eventList(catalog).find((x) => x.id === id) || null;
}
export function knobDefs(catalog) {
  const k = catalog?.knobs ?? catalog?.elements?.knobs ?? catalog?.world?.knobs;
  return k && typeof k === 'object' && !Array.isArray(k) ? k : {};
}
export function regionIds(catalog) {
  const r = catalog?.world?.regions ?? catalog?.regions;
  const list = asList(r).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
  return list.length ? list : DEFAULT_REGIONS;
}
export function tierIds(catalog) {
  const t = catalog?.world?.tiers ?? catalog?.tiers;
  const ids = t && !Array.isArray(t) && typeof t === 'object' ? Object.keys(t) : [];
  return ids.length ? ids : DEFAULT_TIERS;
}
export function problemLookup(ctx, id) {
  const m = ctx?.content?.problemById;
  if (m instanceof Map) return m.get(id) || null;
  if (m && typeof m === 'object') return m[id] || null;
  return (ctx?.content?.problems || []).find((p) => p.id === id) || null;
}

export function hexCss(n) {
  return typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : String(n);
}
export function fmtInt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}
export function fmtMoney(n) {
  n = Number(n) || 0;
  return n >= 100000 ? '$' + Math.round(n / 1000) + 'k' : '$' + fmtInt(n);
}
export function fmtPct(x) {
  const p = (Number(x) || 0) * 100;
  return (p >= 99.9 ? p.toFixed(3) : p.toFixed(2)).replace(/0+$/, '').replace(/\.$/, '') + '%';
}
export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
}
