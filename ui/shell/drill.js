// Drill: a one-minute round of single-decision questions built from the lessons' quiz and numbers items.
import { h, ico, clear } from './dom.js';
import { hashSeed, mulberry32 } from '../../sim/rng.js';
import { toast } from './overlay.js';

const ROUND = 10;
const KEY = 'drill';

const approx = (v) => { const s = String(v).trim(); return s.startsWith('≈') ? s : '≈ ' + s; };
const plainHow = (h) => String(h || '').trim().replace(/[,;]?\s*approx\.?$/i, '').replace(/[,;\s]+$/, '').trim();
const unitOf = (v) => String(v).toLowerCase().replace(/[≈~0-9.,\s-]+/g, ' ').replace(/\b(to|about|a|of)\b/g, '').replace(/\s+/g, ' ').trim();

function shuffle(a, rnd = Math.random) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Every quiz question and every numbers row, as one pool of single-decision items.
export function buildPool(lessons, rnd = Math.random) {
  const quiz = [];
  const rows = [];
  for (const l of lessons || []) {
    for (const s of l.steps || []) {
      if (s.kind === 'quiz' && Array.isArray(s.choices) && s.choices.length >= 3) {
        quiz.push({ kind: 'quiz', lesson: l.title, q: s.q, choices: s.choices, answer: s.answer, why: s.why || '' });
      } else if (s.kind === 'numbers') {
        for (const r of s.rows || []) if (r.label && r.value) rows.push({ lesson: l.title, label: r.label, value: approx(r.value), how: plainHow(r.how) });
      }
    }
  }
  const num = [];
  // a number question needs wrong answers in the same unit that are clearly far from the right one
  const span = (v) => { const m = String(v).replace(/,/g, '').match(/\d+(?:\.\d+)?/g); return m ? [parseFloat(m[0]), parseFloat(m[m.length - 1])] : null; };
  // two answers are far apart when the closest edges of their ranges are at least 4 times apart
  const single = (v) => { const m = String(v).replace(/,/g, '').match(/\d+(?:\.\d+)?/g); return !!m && m.length === 1; };
  const far = (a, b) => { if (!single(a) || !single(b)) return false; const x = span(a), y = span(b); return !!(x && y && x[0] > 0 && y[0] > 0 && (x[1] * 4 <= y[0] || y[1] * 4 <= x[0])); };
  for (const r of rows) {
    if (!single(r.value)) continue;
    const same = rows.filter((x) => x !== r && x.value !== r.value && unitOf(x.value) === unitOf(r.value) && far(x.value, r.value));
    const picks = [];
    for (const x of shuffle(same)) if (!picks.includes(x.value) && picks.length < 3) picks.push(x.value);
    if (picks.length < 2) continue;
    const lbl = r.label.charAt(0).toLowerCase() + r.label.slice(1);
    num.push({ kind: 'num', lesson: r.lesson, q: `Best estimate for: ${lbl}`, measures: r.how, correct: r.value, others: picks, why: `${r.label} is ${r.value} (approx.).${r.how ? ' ' + r.how.replace(/([^.!?])$/, '$1.') : ''}` });
  }
  return { quiz, num };
}

// Questions for one round: a mix of both kinds, no repeats.
export function pickRound(pool, n = ROUND, rnd = Math.random) {
  const nNum = Math.min(pool.num.length, Math.round(n * 0.3));
  const items = shuffle(pool.quiz, rnd).slice(0, n - nNum).concat(shuffle(pool.num, rnd).slice(0, nNum));
  return shuffle(items, rnd).slice(0, n).map((it) => {
    if (it.kind === 'quiz') {
      const order = shuffle(it.choices.map((c, i) => i), rnd);
      return { q: it.q, lesson: it.lesson, why: it.why, choices: order.map((i) => it.choices[i]), answer: order.indexOf(it.answer) };
    }
    const choices = shuffle([it.correct, ...it.others], rnd);
    return { q: it.q, lesson: it.lesson, measures: it.measures || '', why: it.why, choices, answer: choices.indexOf(it.correct) };
  });
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (s, n) => { const [y, m, d] = s.split('-').map(Number); return localDay(new Date(y, m - 1, d + n)); };

// Days in a row with a finished shared set (today may still be open: yesterday keeps the run alive).
export function drillStreak(days, today) {
  let s = days[today] ? today : shiftDay(today, -1);
  let n = 0;
  while (days[s]) { n++; s = shiftDay(s, -1); }
  return n;
}

export function renderDrill(host, ctx) {
  const today = ctx.compete?.daily?.todayLocal?.() || localDay();
  // A stable daily review drawn from concepts the player has studied.
  const dailyRnd = () => mulberry32(hashSeed('drill-' + today));
  const studied = (ctx.content.lessons || []).filter(l => ctx.progress.isLessonDone(l.id));
  const dailyPool = buildPool(studied.length ? studied : (ctx.content.lessons || []).filter(l => l.track === 'Start'), dailyRnd());
  const pool = buildPool(studied.length ? studied : (ctx.content.lessons || []).filter(l => l.track === 'Start'));
  const saved = () => ctx.store.get(KEY, null) || { best: 0, rounds: 0, days: {} };
  const page = h('div', { class: 'sh-page sh-page--narrow sh-drill' });
  host.append(page);
  let alive = true;
  let keyOff = null;

  function start(daily = false) {
    daily = daily === true;
    const qs = daily ? pickRound(dailyPool, ROUND, dailyRnd()) : pickRound(pool);
    const S = { daily, qs, i: 0, right: 0, streak: 0, bestStreak: 0, skipLeft: 1, answered: false };
    if (!qs.length) { clear(page); page.append(h('h1', { class: 'sh-h1', text: 'Drill' }), h('p', { class: 'sh-muted', text: 'Questions are on their way.' })); return; }
    drawQ(S);
  }

  function head(S) {
    return h('header', { class: 'sh-page-head' },
      h('div', null,
        h('p', { class: 'sh-eyebrow', text: S.daily ? `Today's set, ${today}` : 'Drill' }),
        h('h1', { class: 'sh-h1', text: 'One decision at a time' })),
      h('div', { class: 'sh-drill-stats', 'aria-live': 'polite' },
        h('span', { class: 'sh-progress-pill' }, h('span', { class: 'sh-progress-num', text: `${Math.min(S.i + 1, S.qs.length)}/${S.qs.length}` }), h('span', { text: 'question' })),
        h('span', { class: 'sh-progress-pill sh-drill-streak' }, ico('ui.speed', 16), h('span', { class: 'sh-progress-num', text: String(S.streak) }), h('span', { text: 'in a row' }))));
  }

  function drawQ(S) {
    clear(page);
    S.answered = false;
    const q = S.qs[S.i];
    const result = h('div', { class: 'sh-quiz-result', role: 'status' });
    const bar = h('div', { class: 'sh-bar', role: 'presentation' }, h('span', { class: 'sh-bar-fill' }));
    bar.firstChild.style.width = (S.i / S.qs.length) * 100 + '%';
    const choices = h('div', { class: 'sh-choices', role: 'group', 'aria-label': 'Answers' });
    const nextBtn = h('button', { type: 'button', class: 'sh-btn sh-btn--primary', hidden: true, onclick: () => next(S) }, S.i + 1 >= S.qs.length ? 'See result' : 'Next', ico('ui.chevron-right', 18));
    const skipBtn = h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', disabled: S.skipLeft < 1 || S.i >= S.qs.length - 1, title: 'Move on without it counting for or against you. One skip per round.', onclick: () => {
      if (S.answered || S.skipLeft < 1) return;
      S.skipLeft--;
      // a skipped question goes to the back of the round, so it still gets its turn
      S.qs.push(S.qs.splice(S.i, 1)[0]);
      drawQ(S);
    } }, `Skip (${S.skipLeft} left)`);
    const buttons = q.choices.map((c, pos) => {
      const b = h('button', { type: 'button', class: 'sh-choice' }, h('span', { class: 'sh-choice-key', text: String(pos + 1) }), h('span', { text: c }));
      b.addEventListener('click', () => pick(S, pos, buttons, result, nextBtn, skipBtn));
      choices.append(b);
      return b;
    });
    page.append(head(S), bar,
      h('section', { class: 'sh-card sh-lp-card', 'aria-live': 'polite' },
        h('p', { class: 'sh-eyebrow', text: q.lesson ? `From the lesson: ${q.lesson}` : 'Drill' }),
        h('p', { class: 'sh-lp-text sh-drill-q', text: q.q }),
        q.measures ? h('p', { class: 'sh-muted', text: `What it measures: ${q.measures}` }) : null,
        choices, result,
        h('div', { class: 'sh-lp-nav' }, skipBtn, nextBtn)));
    keyOff?.();
    const onKey = (e) => {
      if (!alive || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= '1' && e.key <= String(buttons.length) && !S.answered) buttons[+e.key - 1].click();
      else if ((e.key === 'Enter' || e.key === 'ArrowRight') && S.answered && document.activeElement?.tagName !== 'BUTTON') nextBtn.click();
    };
    document.addEventListener('keydown', onKey);
    keyOff = () => document.removeEventListener('keydown', onKey);
  }

  function pick(S, pos, buttons, result, nextBtn, skipBtn) {
    if (S.answered) return;
    S.answered = true;
    const q = S.qs[S.i];
    const right = pos === q.answer;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) { b.dataset.state = 'right'; b.prepend(ico('ui.check', 18)); }
      else if (i === pos) { b.dataset.state = 'wrong'; b.prepend(ico('ui.close', 18)); }
    });
    if (right) { S.right++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); } else S.streak = 0;
    result.textContent = right ? `Right. ${q.why}` : `Not quite. ${q.why}`;
    result.dataset.ok = right ? '1' : '0';
    page.querySelector('.sh-drill-streak .sh-progress-num').textContent = String(S.streak);
    skipBtn.hidden = true;
    nextBtn.hidden = false;
    nextBtn.focus();
    try { ctx.audio?.play(right ? 'pass' : 'miss'); } catch { /* sound is optional */ }
  }

  function next(S) {
    S.i++;
    if (S.i >= S.qs.length) return finish(S);
    drawQ(S);
  }

  function finish(S) {
    keyOff?.(); keyOff = null;
    const prev = saved();
    const days = { ...(prev.days || {}) };
    const firstOfDay = S.daily && !days[today];
    if (firstOfDay) days[today] = { right: S.right, of: S.qs.length };
    const isBest = S.bestStreak > (prev.best || 0);
    ctx.store.set(KEY, { best: Math.max(prev.best || 0, S.bestStreak), rounds: (prev.rounds || 0) + 1, days });
    clear(page);
    const pct = Math.round((S.right / S.qs.length) * 100);
    const run = drillStreak(days, today);
    const url = 'https://systemdesigner.io/#/drill';
    const line = S.daily
      ? `System Designer drill ${today}: ${S.right}/${S.qs.length}, ${run}-day drill streak. A review from my lessons: ${url}`
      : `System Designer drill: ${S.right}/${S.qs.length}, longest run ${S.bestStreak}. ${url}`;
    const copy = async () => {
      try { await navigator.clipboard.writeText(line); toast({ text: 'Result copied.', level: 'ok' }); } catch { toast({ text: 'Could not copy. Select the line and copy it.', level: 'bad' }); }
    };
    page.append(
      h('header', { class: 'sh-page-head' }, h('div', null, h('p', { class: 'sh-eyebrow', text: S.daily ? `Today's set, ${today}` : 'Drill' }), h('h1', { class: 'sh-h1', text: 'Round done' }))),
      h('section', { class: 'sh-card sh-lp-card' },
        h('p', { class: 'sh-lp-text', text: `${S.right} of ${S.qs.length} right (${pct} percent). Longest run: ${S.bestStreak} in a row.${isBest && S.bestStreak > 1 ? ' That is a new best.' : ` Your best run is ${Math.max(prev.best || 0, S.bestStreak)}.`}` }),
        run ? h('p', { class: 'sh-lp-text', text: `Drill day streak: ${run} ${run === 1 ? 'day' : 'days'}.${S.daily ? '' : " Finish today's review to keep it going."}` }) : null,
        h('p', { class: 'sh-muted sh-drill-line', text: line }),
        h('div', { class: 'sh-lp-nav' },
          h('a', { class: 'sh-btn sh-btn--ghost', href: '#/learn' }, 'Back to lessons'),
          h('button', { type: 'button', class: 'sh-btn', onclick: copy }, ico('ui.copy', 18), 'Copy result'),
          h('button', { type: 'button', class: 'sh-btn sh-btn--primary', onclick: () => start(false) }, ico('ui.restart', 18), 'Another round'))));
  }

  start(!(saved().days || {})[today]);
  return { title: 'Drill', destroy() { alive = false; keyOff?.(); } };
}
