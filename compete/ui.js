// Compete UI pieces the shell mounts into hosts it owns: daily panel, share dialog, "beat my design" landing.
import { icon } from '../assets/icons/index.js';
import { eventById, fmtInt, fmtMoney, fmtPct, cleanName, problemLookup } from './util.js';
import { ShareError } from './share.js';

function h(tag, cls, text, attrs) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
function btn(label, iconId, cls = 'hp-btn') {
  const b = h('button', cls);
  b.type = 'button';
  if (iconId) b.insertAdjacentHTML('beforeend', icon(iconId, { size: 18 }));
  b.append(h('span', null, label));
  return b;
}
const fmtDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

export function createCompeteUi(ctx, api) {
  const toast = (text, level = 'info') => ctx.bus?.emit('toast', { text, level });

  // Daily challenge panel: today's scenario, what changed in the variant, streak, last 30 days.
  function renderDailyPanel(host, { date = api.daily.todayLocal(), onPlay } = {}) {
    host.replaceChildren();
    const d = api.daily.forDate(date);
    const root = h('section', 'cp-daily');
    root.setAttribute('aria-label', 'Daily challenge');
    host.append(root);
    if (!d.problem) {
      root.append(h('p', 'cp-muted', 'No challenge is available for this day.'));
      return { destroy() { host.replaceChildren(); } };
    }
    const info = api.bests.streakInfo('challenge');
    const best = api.bests.challengeBest(date);
    const head = h('div', 'cp-daily-head');
    head.append(h('div', 'cp-kicker', date === api.daily.todayLocal() ? "Today's challenge" : 'Challenge'), h('h2', 'cp-title', d.problem.title), h('p', 'cp-sub', `${fmtDate(date)}  ·  ${d.problem.difficulty}  ·  ${d.problem.like || ''}`));
    root.append(head);

    const v = d.variant;
    const shift = v.shiftMin === 0 ? 'on schedule' : `${Math.abs(v.shiftMin)} min ${v.shiftMin > 0 ? 'later' : 'earlier'}`;
    const size = Math.round((v.magnitude - 1) * 100);
    const facts = h('ul', 'cp-facts');
    const li = (t) => facts.append(h('li', null, t));
    li(`Events happen ${shift} than the standard version.`);
    li(size === 0 ? 'Event sizes are standard.' : `Events are about ${Math.abs(size)}% ${size > 0 ? 'bigger' : 'smaller'}.`);
    if (v.extraEventId) li(`Extra event today: ${eventById(ctx.catalog, v.extraEventId)?.name || v.extraEventId} at ${v.extraAt}.`);
    li('One shot: the design is locked once the traffic day starts.');
    root.append(facts);

    const stats = h('div', 'cp-stats');
    const stat = (iconId, label, value) => {
      const s = h('div', 'cp-stat');
      s.insertAdjacentHTML('beforeend', icon(iconId, { size: 20 }));
      const t = h('div');
      t.append(h('div', 'cp-stat-v', value), h('div', 'cp-stat-l', label));
      s.append(t);
      stats.append(s);
    };
    stat('ui.streak', info.current === 1 ? 'day in a row' : 'days in a row', info.current ? String(info.current) : "Play today's challenge to start");
    stat('ui.trophy', 'longest run of days', String(info.longest));
    stat('ui.star', 'your best today', best ? `${fmtInt(best.total)}` : 'not played');
    root.append(stats);

    const act = h('div', 'cp-actions');
    const play = btn(best ? 'Try again' : 'Play today', 'ui.play', 'hp-btn hp-btn--primary');
    play.addEventListener('click', () => onPlay?.(d));
    act.append(play);
    root.append(act);

    // Last 30 days as bars; played days are filled, with a tick shape so colour is not the only cue.
    const days = api.bests.days(30);
    const strip = h('div', 'cp-strip');
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', 'Last 30 days');
    for (const day of days) {
      const a = h('a', 'cp-day' + (day.plays ? ' cp-day--played' : '') + (day.date === date ? ' cp-day--current' : ''));
      a.href = '#/challenge/' + day.date;
      a.setAttribute('role', 'listitem');
      a.setAttribute('aria-label', `${fmtDate(day.date)}: ${day.plays ? 'best ' + day.best : 'not played'}`);
      a.title = `${day.date}${day.plays ? '  ·  best ' + day.best : ''}`;
      const bar = h('span', 'cp-day-bar');
      bar.style.height = day.plays ? Math.max(12, Math.round(day.best / 10)) + '%' : '4%';
      a.append(bar);
      strip.append(a);
    }
    root.append(h('div', 'cp-kicker', 'Last 30 days'), strip);
    return { destroy() { host.replaceChildren(); } };
  }

  // Share dialog: card preview, link, copy, share/download. result is DebriefData.
  function openShareDialog(host, { result, problem, graph, thumbCanvas, mode = result?.mode || 'practice', seed = result?.seed, date, onClose } = {}) {
    const back = h('div', 'cp-backdrop');
    const dlg = h('div', 'cp-dialog hp-glass');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Share your design');
    back.append(dlg);
    const title = h('h2', 'cp-title', 'Challenge a friend');
    const close = h('button', 'hp-icon-btn cp-close', null, { 'aria-label': 'Close' });
    close.type = 'button';
    close.insertAdjacentHTML('beforeend', icon('ui.close', { size: 20 }));
    const preview = h('div', 'cp-preview');
    const img = h('img', 'cp-preview-img', null, { alt: `Result card: ${problem?.title || ''}, score ${fmtInt(result?.score?.total)} out of 1,000` });
    const wait = h('div', 'cp-preview-wait', 'Preparing your card');
    wait.setAttribute('role', 'status');
    img.hidden = true;
    img.addEventListener('load', () => { img.hidden = false; wait.hidden = true; });
    preview.append(img, wait);
    const nameRow = h('label', 'cp-field');
    nameRow.append(h('span', 'cp-field-l', 'Your name on the card (optional)'));
    const name = h('input', 'hp-input', null, { maxlength: '24', autocomplete: 'nickname', placeholder: 'Your name' });
    name.value = ctx.account?.displayName?.() || ctx.settings?.get?.('playerName') || '';
    nameRow.append(name);
    const linkRow = h('div', 'cp-linkrow');
    const link = h('input', 'hp-input cp-link', null, { readonly: '', 'aria-label': 'Design link' });
    const copy = btn('Copy link', 'ui.copy');
    linkRow.append(link, copy);
    const meta = h('p', 'cp-muted');
    const act = h('div', 'cp-actions');
    const shareBtn = btn('Share image', 'ui.share', 'hp-btn hp-btn--primary');
    const dl = btn('Download image', 'ui.download', 'hp-btn hp-btn--ghost');
    act.append(shareBtn, dl);
    dlg.append(title, close, preview, nameRow, linkRow, meta, act);
    host.append(back);

    let blob = null, url = '', objUrl = '', alive = true, timer = 0, run = 0;
    const build = async () => {
      const mine = ++run;
      const nm = cleanName(name.value);
      try {
        const payload = await api.share.encodeShare({ mode, problemId: problem.id, seed, graph: graph || result.graph, score: api.share.scoreOf(result), name: nm });
        const u = api.share.shareUrl(payload, seed, problem.id);
        if (alive && mine === run) { url = u; link.value = u; meta.textContent = `Link is ${fmtInt(u.length)} characters. Everything is in the link, nothing is uploaded.`; }
        const b = await api.card.renderCard({ result: { ...result, mode }, problem, catalog: ctx.catalog, palette: ctx.palette(), thumbCanvas, date, url: u, name: nm });
        if (!alive || mine !== run) return;
        blob = b;
        if (objUrl) URL.revokeObjectURL(objUrl);
        objUrl = URL.createObjectURL(b);
        img.src = objUrl;
      } catch (err) {
        meta.textContent = 'Could not make the link: ' + (err?.message || 'unknown problem');
      }
    };
    const onName = () => { clearTimeout(timer); timer = setTimeout(build, 350); };
    name.addEventListener('input', onName);
    name.addEventListener('change', () => ctx.settings?.set?.('playerName', cleanName(name.value)));

    copy.addEventListener('click', async () => {
      if (!url) return;
      try { await navigator.clipboard.writeText(url); }
      catch { link.select(); try { document.execCommand('copy'); } catch { /* ignore */ } }
      toast('Link copied', 'ok');
    });
    shareBtn.addEventListener('click', async () => {
      if (!blob) return;
      const r = await api.card.shareCard(blob, { title: `${problem.title}: ${fmtInt(result.score.total)} points`, text: `I scored ${fmtInt(result.score.total)} on ${problem.title}. Can you beat my design?`, url });
      if (r === 'downloaded') toast('Image saved. Paste the link next to it.', 'ok');
    });
    dl.addEventListener('click', async () => { if (blob) { api.card.downloadCard(blob, problem.title); } });

    const prevFocus = document.activeElement;
    const closeDlg = () => {
      if (!alive) return;
      alive = false; clearTimeout(timer);
      if (objUrl) URL.revokeObjectURL(objUrl);
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      prevFocus?.focus?.();
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeDlg(); return; }
      if (e.key !== 'Tab') return;
      const f = [...dlg.querySelectorAll('button, input, a[href]')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    close.addEventListener('click', closeDlg);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) closeDlg(); });
    build();
    close.focus();
    return { close: closeDlg };
  }

  // Landing for #/beat/<payload>. onPlay({ shareData, problem, overlay }) starts the scenario; onGhost(bool) toggles the faint overlay.
  async function renderBeatLanding(host, payload, { onPlay, onGhost } = {}) {
    host.replaceChildren();
    const root = h('section', 'cp-beat');
    host.append(root);
    let data;
    try {
      data = await api.share.decodeShare(payload);
    } catch (err) {
      const msg = err instanceof ShareError ? err.message : 'This link could not be opened.';
      root.append(h('h2', 'cp-title', 'This link did not open'), h('p', 'cp-muted', msg));
      const go = h('a', 'hp-btn hp-btn--primary', 'Browse practice problems');
      go.href = '#/practice';
      root.append(go);
      return { data: null, destroy() { host.replaceChildren(); } };
    }
    const base = problemLookup(ctx, data.problemId);
    if (!base) {
      root.append(h('h2', 'cp-title', 'Problem not found'), h('p', 'cp-muted', `This link is for "${data.problemId}", which this version of the game does not have.`));
      const go = h('a', 'hp-btn hp-btn--primary', 'Browse practice problems');
      go.href = '#/practice';
      root.append(go);
      return { data, destroy() { host.replaceChildren(); } };
    }
    const dm = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(data.seed);
    const problem = dm ? api.daily.applyVariant(base, api.daily.dailyFor(dm[1]).variant) : base;
    const who = data.name || 'A friend';
    root.append(h('div', 'cp-kicker', 'Beat my design'), h('h2', 'cp-title', `${who} scored ${fmtInt(data.score.total)} on ${problem.title}`));
    const row = h('div', 'cp-stats');
    const chip = (l, v) => { const s = h('div', 'cp-stat'); const t = h('div'); t.append(h('div', 'cp-stat-v', v), h('div', 'cp-stat-l', l)); s.append(t); row.append(s); };
    chip('their score', fmtInt(data.score.total) + ' / 1,000');
    chip('requests that worked', '≈ ' + fmtPct(data.score.availability));
    chip('slowest p99', '≈ ' + fmtInt(data.score.p99Ms) + ' ms');
    chip('cost per month', '≈ ' + fmtMoney(data.score.costPerMonth));
    root.append(row, h('p', 'cp-muted', `${problem.difficulty}  ·  ${problem.like || ''}  ·  ${data.graph.nodes.length} elements. Numbers are approximate. When you finish, the game replays their design with the same traffic and marks their score verified if it matches.`));
    const ghostWrap = h('label', 'cp-check');
    const ghost = h('input', null, null, { type: 'checkbox' });
    ghostWrap.append(ghost, h('span', null, 'Show their design as a faint ghost while I build'));
    ghost.addEventListener('change', () => onGhost?.(ghost.checked));
    const act = h('div', 'cp-actions');
    const play = btn('Play this scenario', 'ui.play', 'hp-btn hp-btn--primary');
    play.addEventListener('click', () => onPlay?.({ shareData: data, problem, overlay: { graph: data.graph, target: data.score, name: who, show: ghost.checked } }));
    act.append(play);
    root.append(ghostWrap, act);
    return { data, problem, destroy() { host.replaceChildren(); } };
  }

  return { renderDailyPanel, openShareDialog, renderBeatLanding };
}
