// HUD strip: clock, speed pill, play/pause, sparklines, live SLO meters, cost meter, dot-scale legend, event banner.
import { h, iconEl, fmtNum, fmtUsd, fmtMs, fmtPct, clamp, approx } from './util.js';
import { shapeSvg } from '../../assets/shapes.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const HIST = 120;            // samples (one per simulated minute) = 2 simulated hours
const SAMPLE_MS = 60000;

export function createHud(host, { catalog, mode, onStart, onPause, onResume, onSpeed, onReset }) {
  const sandbox = mode === 'sandbox';
  const lesson = mode === 'lesson' || mode === 'intro';
  const root = h('section', { class: 'pl-hud' + (sandbox ? ' pl-hud--sandbox' : '') + (lesson ? ' pl-hud--lesson' : ''), 'aria-label': 'Live status' });
  host.append(root);

  // controls
  const playBtn = h('button', { class: 'pl-btn pl-btn--primary pl-play', type: 'button', 'aria-label': 'Start the traffic day' }, iconEl('ui.play', 20), h('span', { class: 'pl-play-l', text: 'Start day' }));
  const resetBtn = h('button', { class: 'pl-btn pl-btn--small pl-reset', type: 'button', 'aria-label': 'Back to drawing', title: 'Stop the day and go back to drawing', onClick: () => onReset?.() }, iconEl('ui.restart', 18), h('span', { class: 'pl-reset-l', text: 'Back to drawing' }));
  const speedPill = h('div', { class: 'pl-speed', role: 'radiogroup', 'aria-label': 'Speed' });
  const speedBtns = SPEEDS.map((s) => {
    const b = h('button', { class: 'pl-speed-b', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `${s} times speed`, onClick: () => onSpeed?.(s) }, `${s}×`);
    speedPill.append(b);
    return [s, b];
  });
  const clock = h('div', { class: 'pl-clock', 'aria-label': 'Simulated time' }, h('span', { class: 'pl-clock-t pl-mono', text: '00:00' }), h('div', { class: 'pl-clock-bar' }, h('i')));
  const ctl = h('div', { class: 'pl-hud-ctl' }, playBtn, resetBtn, clock, speedPill);

  // sparklines
  const cvS = h('canvas', { class: 'pl-spark', 'aria-hidden': 'true' });
  const cvL = h('canvas', { class: 'pl-spark', 'aria-hidden': 'true' });
  const spark = h('div', { class: 'pl-sparks' },
    h('div', { class: 'pl-spark-box' }, h('div', { class: 'pl-spark-l' }, 'Success ', h('b', { class: 'pl-mono pl-sp-s', text: '–' })), cvS),
    h('div', { class: 'pl-spark-box' }, h('div', { class: 'pl-spark-l' }, 'p99 ', h('b', { class: 'pl-mono pl-sp-l', text: '–' })), cvL));

  // meters
  const meters = h('div', { class: 'pl-meters', role: 'group', 'aria-label': 'Live targets' });
  const M = {};
  function meter(key, iconId, label) {
    const val = h('b', { class: 'pl-mono pl-m-v', text: '–' });
    const sub = h('span', { class: 'pl-m-sub' });
    const tick = h('i', { class: 'pl-m-tick' });
    const fill = h('i', { class: 'pl-m-fill' });
    const el = h('div', { class: 'pl-meter', 'data-meter': key },
      h('div', { class: 'pl-m-top' }, iconEl(iconId, 14), h('span', { class: 'pl-m-l', text: label })),
      val, h('div', { class: 'pl-m-bar' }, fill, tick), sub);
    M[key] = { el, val, sub, fill, tick };
    meters.append(el);
  }
  if (sandbox) {
    meter('avail', 'ui.availability', 'Success rate'); meter('lat', 'ui.latency', 'p99 now'); meter('cost', 'ui.cost', 'Cost / mo'); meter('busy', 'ui.hot', 'Busiest element');
  } else {
    meter('avail', 'ui.availability', lesson ? 'Success now' : 'Uptime'); meter('lat', 'ui.latency', 'Speed (p99)'); meter('safe', 'ui.safety', 'Data safety'); meter('cost', 'ui.cost', 'Cost / mo');
  }
  const buildNote = h('div', { class: 'pl-buildnote' });
  if (lesson) {
    meter('lag', 'ui.clock', 'Completion lag');
    M.lag.el.hidden = true;
  }

  // legend
  const legend = h('div', { class: 'pl-legend', 'aria-label': 'Legend' });
  const scaleEl = h('span', { class: 'pl-legend-scale' });
  legend.append(scaleEl, h('span', { class: 'pl-legend-types' }));

  root.append(ctl, h('div', { class: 'pl-hud-mid' }, meters, spark, buildNote), legend);

  // event banner (lives in the stage, not the strip)
  const banner = h('div', { class: 'pl-banner', role: 'status', 'aria-live': 'polite', hidden: '' });
  host.append(banner);

  let phase = 'build';
  let speed = 1;
  const hist = { succ: [], p99: [], nextAt: 0 };
  let colors = readColors();
  let drawn = '';
  let legendKey = '';

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (v, d) => cs.getPropertyValue(v).trim() || d;
    return { ok: g('--ok', '#138A4B'), bad: g('--bad', '#C9372C'), accent: g('--accent', '#5146E5'), t3: g('--text-3', '#6B7486'), border: g('--border-strong', '#ccc') };
  }

  let hasParts = true;
  let lastIssues = [];
  playBtn.addEventListener('click', () => {
    if (phase === 'build') onStart?.();
    else if (phase === 'running') onPause?.();
    else if (phase === 'paused') onResume?.();
  });

  function setPhase(p) {
    phase = p;
    root.dataset.phase = p;
    const lab = playBtn.querySelector('.pl-play-l');
    const ico = playBtn.querySelector('.pl-ic');
    const set = (id, text, aria) => { ico.innerHTML = iconEl(id, 20).innerHTML; lab.textContent = text; playBtn.setAttribute('aria-label', aria); };
    if (p === 'build') set('ui.play', sandbox || lesson ? 'Run' : 'Start day', 'Start the traffic day');
    else if (p === 'running') set('ui.pause', 'Pause', 'Pause');
    else if (p === 'paused') set('ui.play', 'Resume', 'Resume');
    else set('ui.restart', 'Done', 'Day finished');
    playBtn.disabled = p === 'done' || (p === 'build' && !hasParts);
    resetBtn.hidden = p === 'build' || sandbox || lesson;
    speedPill.hidden = p === 'build';
    clock.hidden = p === 'build';
  }

  function setSpeed(s) {
    speed = s;
    for (const [v, b] of speedBtns) { b.setAttribute('aria-checked', String(v === s)); b.classList.toggle('pl-speed-b--on', v === s); }
  }

  let calm = false; // lesson goal reached: the meter the goal was about shows green, the others at most amber
  let calmKey = null;
  const GOAL_METER = { availability: 'avail', errors: 'avail', p99: 'lat', cost: 'cost', duplicates: 'safe', compliance: 'safe' };
  function meterSet(key, { text, sub, frac, tick, status }) {
    if (calm) status = key === calmKey ? 'ok' : status === 'bad' ? 'warn' : status;
    const m = M[key];
    if (!m) return;
    m.val.textContent = text;
    m.sub.textContent = sub || '';
    m.fill.style.width = clamp(frac ?? 0, 0, 1) * 100 + '%';
    if (tick != null) { m.tick.style.left = clamp(tick, 0, 1) * 100 + '%'; m.tick.hidden = false; } else m.tick.hidden = true;
    m.el.dataset.status = status || 'ok';
  }

  function sparkDraw(cv, data, color, min, max, target) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const y = (v) => hh - 2 - clamp((v - min) / (max - min || 1), 0, 1) * (hh - 4);
    if (target != null) { g.strokeStyle = colors.border; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, y(target)); g.lineTo(w, y(target)); g.stroke(); g.setLineDash([]); }
    if (data.length < 2) return;
    g.lineWidth = 1.75; g.lineJoin = 'round'; g.strokeStyle = color; g.beginPath();
    data.forEach((v, i) => { const x = (i / (HIST - 1)) * w; if (i) g.lineTo(x, y(v)); else g.moveTo(x, y(v)); });
    g.stroke();
  }

  function update(st, extra = {}) {
    if (!st) return;
    const tgt = extra.problem?.requirements || {};
    const clockT = st.clockLabel || '00:00';
    clock.firstChild.textContent = clockT;
    clock.querySelector('i').style.width = clamp((st.clockMs || 0) / 86400000, 0, 1) * 100 + '%';
    const t = st.traffic || {};
    const offered = t.offeredRps || 0;
    const succ = offered > 0 ? (t.successRps || 0) / offered : 1;
    const p99 = st.slo?.latency?.p99Ms;
    if ((st.clockMs || 0) < hist.nextAt - SAMPLE_MS || st.phase === 'build') { hist.succ.length = 0; hist.p99.length = 0; hist.nextAt = 0; }
    if ((st.clockMs || 0) >= hist.nextAt && st.phase !== 'build') {
      hist.succ.push(succ); hist.p99.push(p99 ?? 0);
      if (hist.succ.length > HIST) { hist.succ.shift(); hist.p99.shift(); }
      hist.nextAt = (st.clockMs || 0) + SAMPLE_MS;
    }
    root.querySelector('.pl-sp-s').textContent = offered > 0 ? fmtPct(succ) : '–';
    root.querySelector('.pl-sp-l').textContent = p99 != null ? fmtMs(p99) : '–';
    const key = `${st.clockMs}|${hist.succ.length}`;
    if (key !== drawn) {
      drawn = key;
      const minS = Math.min(0.9, ...hist.succ, 1);
      sparkDraw(cvS, hist.succ, succ >= (tgt.availability ?? 0.99) ? colors.ok : colors.bad, minS, 1, tgt.availability);
      const latT = st.slo?.latency?.targetMs ?? tgt.latencyP99Ms?.default;
      sparkDraw(cvL, hist.p99, colors.accent, 0, Math.max(...hist.p99, (latT || 100) * 1.5, 1), latT);
    }

    const cost = st.cost || {};
    const slo = st.slo || {};
    calm = !!(lesson && extra.goalMet);
    calmKey = GOAL_METER[extra.goalMetric] || null;
    if (sandbox) {
      // a low success rate with nothing busy means requests have no path: say so beside the number
      const busyMax = Math.max(0, ...(st.nodes || []).map((n) => n.util || 0));
      const pathNote = offered > 0 && succ < 0.5 && busyMax < 0.2 && lastIssues.some((i) => i.level === 'error' || i.code === 'disconnected')
        ? (lastIssues.some((i) => i.code === 'disconnected') ? 'a source is not connected' : 'some requests have no path') : null;
      meterSet('avail', { text: offered > 0 ? fmtPct(succ) : '–', sub: pathNote || `${fmtNum(t.successRps || 0)} of ${fmtNum(offered)} req/s`, frac: succ, status: succ > 0.99 ? 'ok' : succ > 0.9 ? 'warn' : 'bad' });
      meterSet('lat', { text: p99 != null ? fmtMs(p99) : '–', sub: 'for 99 of 100 requests', frac: p99 ? Math.log10(1 + p99) / 4 : 0, status: p99 > 1000 ? 'bad' : p99 > 300 ? 'warn' : 'ok' });
      meterSet('cost', { text: fmtUsd(cost.perMonth), sub: 'approx. per month', frac: Math.log10(1 + (cost.perMonth || 0)) / 7, status: 'ok' });
      const busiest = (st.nodes || []).reduce((a, n) => (n.util > (a?.util ?? -1) ? n : a), null);
      const el = busiest && catalog.elementById.get(busiest.type);
      meterSet('busy', { text: busiest ? Math.round(busiest.util * 100) + '%' : '–', sub: busiest ? (el?.name || busiest.type) : 'nothing placed', frac: busiest?.util || 0, status: busiest ? (busiest.util > 1 ? 'bad' : busiest.util > 0.7 ? 'warn' : 'ok') : 'ok' });
    } else {
      const a = slo.availability || {};
      // a lesson shows what is happening now, so a fix turns green at once instead of waiting out the earlier minutes
      // with a queue in the picture, work that waits in line is accepted, not failed: show what the door took, and the line beside it
      const queued = lesson ? (st.nodes || []).filter((n) => catalog.elementById.get(n.type)?.kind === 'queue') : [];
      root.classList.toggle('pl-hud--queues', queued.length > 0);
      const accepted = offered > 0 ? clamp(queued.reduce((sum, n) => sum + (n.queueAcceptedRps || 0), 0) / offered, 0, 1) : 1;
      const aVal = lesson ? (queued.length ? accepted : (offered > 0 ? succ : 1)) : (a.actual ?? 1);
      const aTgt = a.target ?? tgt.availability;
      const aOk = aVal >= aTgt;
      const waiting = queued.reduce((x, n) => x + (n.queueDepth || 0), 0);
      if (M.lag) {
        M.lag.el.hidden = !queued.length;
        const age = Math.max(0, ...queued.map((n) => n.oldestJobAgeSec || 0));
        const risk = Math.max(0, ...queued.map((n) => (n.oldestJobAgeSec || 0) / (n.queueLimitSec || 1)));
        const drain = queued.reduce((sum, n) => sum + (n.queueDrainRps || 0), 0);
        meterSet('lag', { text: `≈ ${fmtNum(age)} s oldest`, sub: `≈ ${fmtNum(drain)}/s completed drain (smoothed)`, frac: risk, status: risk >= 1 ? 'bad' : risk >= 0.5 ? 'warn' : 'ok' });
        M.safe.el.querySelector('.pl-m-l').textContent = queued.length ? 'Expiry risk' : 'Data safety';
        M.lat.el.querySelector('.pl-m-l').textContent = queued.length ? 'Acceptance p99' : 'Speed (p99)';
      }
      if (M.avail) M.avail.el.querySelector('.pl-m-l').textContent = queued.length ? 'Accepted' : 'Success now';
      meterSet('avail', { text: fmtPct(aVal), sub: queued.length ? (waiting > 0 ? `${fmtNum(waiting)} jobs waiting in line (approx.)` : `target ${fmtPct(aTgt)}`) : `target ${fmtPct(aTgt)}`, frac: aVal, tick: aTgt, status: aOk ? 'ok' : (queued.length && aVal > 0.9 ? 'warn' : 'bad') });
      const l = slo.latency || {};
      const lt = l.targetMs ?? tgt.latencyP99Ms?.default ?? 200;
      // the request type furthest from its own target right now, against that target
      const ty = l.typeId && Object.keys(tgt.mix || {}).length > 1 ? (catalog.requestById.get(l.typeId)?.plural || '').toLowerCase() : '';
      meterSet('lat', { text: l.p99Ms != null ? fmtMs(l.p99Ms) : '–', sub: `${ty ? ty + ': ' : ''}target ${fmtMs(lt)}${l.shareOk != null ? ' · ' + fmtPct(l.shareOk, 0) + ' of minutes ok' : ''}`, frac: (l.p99Ms || 0) / (lt * 2), tick: 0.5, status: l.p99Ms == null || l.p99Ms <= lt ? 'ok' : 'bad' });
      if (queued.length) {
        const ack = Math.max(0, ...queued.map((n) => n.p99Ms || 0));
        meterSet('lat', { text: `≈ ${fmtMs(ack)}`, sub: 'Queue hop only, before the job completes', status: 'ok' });
      }
      const s = slo.safety || {};
      const bad = (s.lostWrites || 0) > 0 || (s.duplicates || 0) > 0 || (s.complianceFailed?.length || 0) > 0;
      const gaps = s.complianceFailed?.length || 0;
      meterSet('safe', { text: bad ? 'At risk' : 'Safe', sub: `${gaps ? `${gaps} audit gap${gaps > 1 ? 's' : ''} · ` : ''}${fmtNum(s.lostWrites || 0)} lost · ${fmtNum(s.duplicates || 0)} duplicate · ${fmtNum(s.staleReads || 0)} stale`, frac: bad ? 1 : 0, status: bad ? 'bad' : 'ok' });
      if (queued.length) {
        const risk = Math.max(0, ...queued.map((n) => (n.oldestJobAgeSec || 0) / (n.queueLimitSec || 1)));
        const limit = Math.min(...queued.map((n) => n.queueLimitSec || 1));
        meterSet('safe', { text: risk >= 1 ? 'Over deadline' : risk >= 0.5 ? 'Approaching' : 'Within deadline', sub: `Job deadline ≈ ${fmtNum(limit)} s. Acceptance does not guarantee completion.`, frac: risk, status: risk >= 1 ? 'bad' : risk >= 0.5 ? 'warn' : 'ok' });
      }
      const bud = cost.budget || tgt.budgetPerMonth || 1;
      const ratio = (cost.perMonth || 0) / bud;
      // in a lesson about something else, the bill is shown but not judged
      const judged = !lesson || extra.goalMetric === 'cost';
      meterSet('cost', { text: fmtUsd(cost.perMonth), sub: judged ? `budget ${fmtUsd(bud)}` : 'approx. per month', frac: ratio / 2, tick: judged ? 0.5 : null, status: !judged || ratio <= 1 ? 'ok' : ratio <= 1.25 ? 'warn' : 'bad' });
    }
    legendUpdate(st, extra);
  }

  function legendUpdate(st, extra) {
    // One visible dot stands for a round number of requests: 1, 2 or 5 times a power of ten.
    let busiest = 0;
    for (const e of st.edges || []) if (e.rps > busiest) busiest = e.rps;
    let scale = 1;
    if (busiest > 12) { const p = 10 ** Math.floor(Math.log10(busiest / 12)); scale = [1, 2, 5, 10].map((m) => m * p).find((s) => busiest / s <= 12) || p * 10; }
    const types = extra.types || [];
    const key = scale + '|' + types.join();
    if (key === legendKey) return;
    legendKey = key;
    scaleEl.textContent = `1 dot ≈ ${fmtNum(scale)} req/s`;
    scaleEl.title = 'approx.: one visible dot stands for many requests';
    const box = legend.querySelector('.pl-legend-types');
    box.replaceChildren();
    for (const id of types) {
      const rt = catalog.requestById.get(id);
      if (!rt) continue;
      const s = h('span', { class: 'pl-legend-t', title: rt.name, style: { color: `var(--req-${rt.family})` } });
      try { s.innerHTML = shapeSvg(rt.shape, { size: 12, fill: 'currentColor' }); } catch { /* optional */ }
      s.append(h('span', { class: 'pl-legend-n', text: rt.name }));
      box.append(s);
    }
  }

  function showBanner(ev, severity = 2, reduced = false) {
    banner.hidden = false;
    banner.className = 'pl-banner pl-banner--' + severity + (reduced ? ' pl-banner--still' : '');
    banner.replaceChildren(iconEl('ev.' + ev.id, 26, 'pl-ic pl-banner-ic'),
      h('div', { class: 'pl-banner-txt' }, h('b', { text: ev.name }), h('span', { text: ev.description || '' })));
  }
  function hideBanner() { banner.hidden = true; }

  // The size a part needs, from the peak check's own fix: "Web servers: about 25 servers for the peak, you have 2".
  function needText(issues, id) {
    const f = (issues || []).find((i) => i.code === 'peak-risk' && i.nodeId === id && i.fix)?.fix;
    if (!f) return '';
    const lw = String((catalog.elementById.get(((issues || []).find((i) => i.nodeId === id) || {}).type)?.units?.label) || '');
    const unit = (f.word || lw || 'units').toLowerCase();
    return `about ${f.units} ${unit} for the peak, you have ${f.now}`;
  }
  function riskyText(risky, arr, issues) {
    const n = risky[0], el = catalog.elementById.get(n.type), knobs = el?.knobs || [];
    if (risky.length === 1 && el?.kind === 'compute' && knobs.includes('units') && (el.units?.max ?? 1) > 1) {
      const lw = el.units.label || 'unit', word = (/s$/.test(lw) ? lw : lw + 's').replace(/^./, (c) => c.toUpperCase());
      const need = needText(issues, n.id);
      return need ? `${el.name}: ${need}` : `${el.name}: raise ${word}${knobs.includes('autoscale') ? ' or turn on autoscaling' : ''}`;
    }
    if (risky.length > 1) {
      const withFix = risky.map((r) => ({ r, t: needText(issues, r.id) })).find((x) => x.t);
      if (withFix) return `${risky.length} parts may not hold: ${catalog.elementById.get(withFix.r.type)?.name || 'one'} needs ${withFix.t}`;
    }
    return risky.length === 1 ? `${el?.name || 'One part'} may not hold at the normal peak` : `${risky.length} parts may not hold at the normal peak`;
  }
  // Build-step status: a green "holds" only for a design that serves every request type at peak with no open warnings.
  function setBuild(est, issues, sizes) {
    buildNote.replaceChildren();
    const list = issues || [];
    lastIssues = list;
    const errors = list.filter((i) => i.level === 'error');
    const warns = list.filter((i) => i.level === 'warn');
    if (est) {
      const arr = Array.isArray(est.nodes) ? est.nodes : [];
      const built = arr.some((n) => catalog.elementById.get(n.type)?.kind !== 'source');
      const cost = est.perMonth ?? est.cost?.perMonth ?? est.costPerMonth;
      if (built && cost != null) buildNote.append(h('span', { class: 'pl-chip pl-chip--cost', title: 'Fixed monthly cost of the parts; pay-per-use charges are added as the day runs (approx.)' }, iconEl('ui.cost', 14), 'Projected ', approx(fmtUsd(cost) + '/mo'), ' + usage'));
      const risky = arr.filter((n) => n.holds === false || n.ok === false || (n.util ?? n.peakUtil ?? 0) > 1);
      const share = est.successAtPeak ?? 1;
      let chip;
      const typeNames = [...new Set(errors.map((i) => i.type).filter(Boolean))].map((t) => catalog.requestById.get(t)?.plural || t);
      const noPath = typeNames.length ? `${typeNames.length > 2 ? typeNames.slice(0, 2).join(', ') + ' and more' : typeNames.join(' and ')} have no path yet` : 'Some requests have no path yet';
      hasParts = built;
      if (phase === 'build') { playBtn.disabled = !built; playBtn.title = built ? '' : 'Add parts and connect them first'; }
      if (!built) chip = h('span', { class: 'pl-chip' }, iconEl('ui.info', 14), (globalThis.matchMedia?.('(max-width: 719px)').matches ? 'Nothing to test yet: tap Add component, then connect it' : 'Nothing to test yet: drag a part in from the left, then connect it'));
      else if (errors.length) chip = h('button', { class: 'pl-chip pl-chip--warn pl-chip--btn', type: 'button', title: 'Show what is missing' }, iconEl('ui.warn', 14), noPath.charAt(0).toUpperCase() + noPath.slice(1));
      else if (risky.length) chip = h('button', { class: 'pl-chip pl-chip--warn pl-chip--btn', type: 'button', title: 'Show which parts' }, iconEl('ui.warn', 14), riskyText(risky, arr, sizes || []));
      else if (share < 0.999) chip = h('span', { class: 'pl-chip pl-chip--warn' }, iconEl('ui.warn', 14), `About ${fmtPct(share)} would succeed at the normal peak`);
      else {
        // the check runs at the busiest minute of a normal day, and again at the problem's biggest traffic event
        const sp = est.spike;
        const ev = sp ? `the ${sp.name.toLowerCase()} (${Math.round(sp.factor * 10) / 10}×)` : '';
        const tip = 'Checked at the busiest minute of a normal day' + (sp ? ` and at ${ev}` : '') + '. Other events play out when the day runs (approx.).';
        if (sp && !sp.holds) chip = h('button', { class: 'pl-chip pl-chip--warn pl-chip--btn', type: 'button', title: tip }, iconEl('ui.warn', 14), `Holds at the normal peak, not in ${ev}`);
        else if (warns.length) chip = h('span', { class: 'pl-chip', title: tip }, iconEl('ui.info', 14), 'Holds at the normal peak; check the warnings');
        else chip = h('span', { class: 'pl-chip pl-chip--ok', title: tip }, iconEl('ui.check', 14), sp ? `Holds at the normal peak and in ${ev}` : 'Holds at the normal peak');
      }
      buildNote.append(chip);
    }
    const errs = list.filter((i) => i.level !== 'info');
    if (errs.length && hasParts) buildNote.append(h('button', { class: 'pl-chip pl-chip--warn pl-chip--btn', type: 'button', title: 'Show the list' }, iconEl('ui.warn', 14), `${errs.length} thing${errs.length > 1 ? 's' : ''} to check`));
  }

  setPhase('build'); setSpeed(1);
  return {
    el: root, setPhase, setSpeed, update, showBanner, hideBanner, setBuild,
    refreshColors() { colors = readColors(); drawn = ''; },
    resetHistory() { hist.succ.length = 0; hist.p99.length = 0; hist.nextAt = 0; drawn = ''; },
  };
}
