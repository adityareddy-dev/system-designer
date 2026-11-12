// Shared preview-card renderer for problems, daily challenges and lessons.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pretty = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); };


export function previewHtml(r) {
  const pr = r.kind === 'practice';
  const lesson = r.kind === 'lesson';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Inter","Segoe UI","DejaVu Sans",system-ui,sans-serif;color:#eef2fb;background:radial-gradient(900px 500px at 85% 0%,#34469c 0%,rgba(52,70,156,0) 60%),linear-gradient(160deg,#10172b,#0b1020);position:relative}
.mark{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:26px;letter-spacing:.2px}
.mark i{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6f8cff,#41d1c0)}
.kick{position:absolute;left:72px;top:190px;font-size:24px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#9db0ff}
h1{position:absolute;left:72px;top:236px;width:1056px;font-size:80px;line-height:1.06;font-weight:800;letter-spacing:-1.5px}
.meta{position:absolute;left:72px;bottom:140px;font-size:30px;color:#b8c3de}
.foot{position:absolute;left:72px;right:72px;bottom:52px;display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:600}
.pill{padding:12px 26px;border-radius:999px;background:#6f8cff;color:#0b1020;font-weight:700}
.dots{position:absolute;right:72px;top:70px;display:flex;gap:10px}.dots b{width:14px;height:14px;border-radius:50%;background:#41d1c0}.dots b:nth-child(2){background:#6f8cff}.dots b:nth-child(3){background:#f3b94d}
</style></head><body>
<div class="mark"><i></i>System Designer</div><div class="dots"><b></b><b></b><b></b></div>
<div class="kick">${lesson ? 'Learn system design' : pr ? 'Practice problem' : `Daily challenge · ${esc(pretty(r.date))}`}</div>
<h1>${esc(r.title)}</h1>
<div class="meta">${esc([r.difficulty || r.track, r.like || (lesson ? r.minutes + ' minutes' : '')].filter(Boolean).join('  ·  '))}</div>
<div class="foot"><span>${lesson ? 'One idea. Try it. See why it works.' : 'Build it. Survive the day. Beat my design.'}</span><span class="pill">Free account</span></div>
</body></html>`;
}

