// Small HTTP helpers: JSON bodies with a size cap, cookies, the caller's address, typed errors.

export class HttpError extends Error {
  constructor(status, code, message = code, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

// Reads a JSON body of at most `limit` bytes. Anything else is refused before it is parsed.
export async function readJson(req, limit) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'json-only', 'Send JSON.');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, 'too-large', 'That request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new HttpError(413, 'too-large', 'That request is too large.');
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'bad-json', 'That is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad-json', 'Send a JSON object.');
  return body;
}

export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string' || header.length > 8192) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

export function cookie(name, value, { maxAge, path = '/', secure = true } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

// Behind Caddy on the same machine the real address is the last X-Forwarded-For entry; from anywhere else the socket address counts.
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  const local = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const fwd = req.headers['x-forwarded-for'];
  if (local && typeof fwd === 'string' && fwd) {
    const last = fwd.split(',').pop().trim();
    if (/^[0-9a-fA-F:.]{2,45}$/.test(last)) return last;
  }
  return peer || 'unknown';
}

// The key an address is counted under. One home or phone usually gets a whole IPv6 /64, so all of it counts as one;
// IPv4 (also when written as ::ffff:a.b.c.d) counts per address.
export function ipKey(ip) {
  let s = String(ip || '').trim().toLowerCase();
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  if (!s.includes(':')) return s || 'unknown';
  // an IPv4 tail (64:ff9b::1.2.3.4) becomes two groups
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (tail) {
    const b = tail.slice(1).map(Number);
    if (b.some((x) => x > 255)) return s;
    s = s.slice(0, tail.index) + ((b[0] << 8) | b[1]).toString(16) + ':' + ((b[2] << 8) | b[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return s;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return s;
  const groups = [...head, ...Array(fill).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return s;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':') + '::/64';
}

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), ...headers });
  res.end(data);
}

export function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Content-Length': 0, ...headers });
  res.end();
}
