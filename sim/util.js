// Numeric and formatting helpers shared by the simulation modules.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Queueing slowdown q(rho) = 1 + 0.5 rho^2 / (1 - rho), capped.
export function queueFactor(rho, cap) {
  if (!(rho > 0)) return 1;
  if (rho >= 1) return cap;
  const q = 1 + (0.5 * rho * rho) / (1 - rho);
  return q > cap ? cap : q;
}

// Standard normal CDF (Abramowitz and Stegun 7.1.26).
export function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Share of requests slower than `limit` when latency is lognormal with the given p50 and p99.
export function tailBeyond(p50, p99, limit) {
  if (!(limit > 0)) return 1;
  if (!(p50 > 0)) return 0;
  if (p99 <= p50 * 1.0001) return limit < p50 ? 1 : 0;
  const sigma = Math.log(p99 / p50) / 2.3263;
  return 1 - normCdf(Math.log(limit / p50) / sigma);
}

// Sum of p^1 .. p^r (expected retries per request when each attempt fails with probability p).
export function geomRetries(p, r) {
  let s = 0, x = 1;
  for (let i = 0; i < r; i++) { x *= p; s += x; }
  return s;
}

export function withCommas(n) {
  const neg = n < 0;
  let s = String(Math.round(Math.abs(n)));
  let out = '';
  while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? '-' : '') + s + out;
}

// "4", "950", "1.2k", "35k", "3.4M", "2.1B"
export function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a < 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  if (a < 1000) return String(Math.round(n));
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [v, u] of units) {
    if (a >= v) {
      const x = n / v;
      const r = Math.abs(x) < 10 ? Math.round(x * 10) / 10 : Math.round(x);
      return String(r).replace(/\.0$/, '') + u;
    }
  }
  return String(Math.round(n));
}

export function fmtClock(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

export function parseClock(str) {
  if (typeof str === 'number') return str;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return 0;
  return (Number(m[1]) * 60 + Number(m[2])) * 60000;
}

export function fmtPct(x, digits = 1) {
  const v = Math.round(x * 100 * 10 ** digits) / 10 ** digits;
  return String(v);
}

export function round(x, d = 0) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

export function joinNames(names, word = 'and') {
  const u = [...new Set(names)];
  if (u.length === 0) return '';
  if (u.length === 1) return u[0];
  return u.slice(0, -1).join(', ') + ' ' + word + ' ' + u[u.length - 1];
}
