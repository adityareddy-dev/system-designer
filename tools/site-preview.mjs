// Shared preview-card renderer for problems, daily challenges and lessons.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pretty = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); };


// Fonts are named by placeholders so the fingerprint of a card does not depend on the font files; the renderer swaps in real URLs.
export const PREVIEW_FONTS = { '__SD_GROTESK__': 'space-grotesk.woff2', '__SD_MONO_400__': 'space-mono-400.woff2', '__SD_MONO_700__': 'space-mono-700.woff2' };

export function previewHtml(r) {
  const pr = r.kind === 'practice';
  const lesson = r.kind === 'lesson';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Space Grotesk";font-weight:400 700;src:url(__SD_GROTESK__) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;src:url(__SD_MONO_400__) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:700;src:url(__SD_MONO_700__) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Space Grotesk","Segoe UI",system-ui,sans-serif;color:#141414;background-color:#FFF4E0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Ccircle cx='3' cy='3' r='1.6' fill='%23141414' fill-opacity='.18'/%3E%3C/svg%3E");position:relative}
.card{position:absolute;left:56px;top:44px;width:1088px;height:530px;background:#FFFCF4;border:4px solid #141414;border-radius:10px;box-shadow:10px 10px 0 #141414}
.mark{position:absolute;left:48px;top:40px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:28px}
.mark svg{width:44px;height:44px}
.kick{position:absolute;left:48px;top:126px;font:700 22px "Space Mono",monospace;letter-spacing:1px;text-transform:uppercase;color:#33312C}
h1{position:absolute;left:48px;top:184px;width:980px;font-size:78px;line-height:1.04;font-weight:700;letter-spacing:-2px}
h1 span{background:#FFC93C;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 6px;margin-left:-6px}
.meta{position:absolute;left:48px;bottom:112px;font:400 26px "Space Mono",monospace;color:#33312C}
.foot{position:absolute;left:48px;right:48px;bottom:36px;display:flex;justify-content:space-between;align-items:center;font-size:27px;font-weight:600}
.pill{padding:10px 24px;border:3px solid #141414;border-radius:8px;background:#FF5B3A;color:#141414;font-weight:700;box-shadow:4px 4px 0 #141414}
.dots{position:absolute;right:48px;top:48px;display:flex;gap:10px}.dots b{width:20px;height:20px;border-radius:50%;border:3px solid #141414;background:#FFC93C}.dots b:nth-child(2){background:#FF5B3A}.dots b:nth-child(3){background:#2D5BFF}
</style></head><body><div class="card">
<div class="mark"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="6" fill="#141414"/><path d="M11 14 20 10M11 18l9 4" stroke="#FFF4E0" stroke-width="2"/><circle cx="8.5" cy="16" r="3.5" fill="#FFC93C"/><circle cx="23" cy="8.5" r="3.5" fill="#FF5B3A"/><circle cx="23" cy="23.5" r="3.5" fill="#2D5BFF"/></svg>System Designer</div><div class="dots"><b></b><b></b><b></b></div>
<div class="kick">${lesson ? 'Learn system design' : pr ? 'Practice problem' : `Daily challenge · ${esc(pretty(r.date))}`}</div>
<h1><span>${esc(r.title)}</span></h1>
<div class="meta">${esc([r.difficulty || r.track, r.like || (lesson ? r.minutes + ' minutes' : '')].filter(Boolean).join('  ·  '))}</div>
<div class="foot"><span>${lesson ? 'One idea. Try it. See why it works.' : 'Build it. Survive the day. Beat my design.'}</span><span class="pill">Free account</span></div>
</div></body></html>`;
}
