// Lesson page frame (read, demo, numbers, quiz steps) and the full-screen intro.
import { h, ico, clear, append, lessonOf, buildHash } from './dom.js';
import { mountPlayHost } from './playhost.js';
import { modal } from './overlay.js';
import { transferFor, transferCorrect } from '../../content/transfers.js';
import { sceneMarkup } from '../../assets/scenes/index.js';
import { mountAllocation } from './allocation.js';

function notFoundLesson() {
  return h('div', { class: 'sh-page sh-page--narrow sh-empty' },
    h('h1', { class: 'sh-h1', text: 'Lesson not found' }),
    h('p', { class: 'sh-muted', text: 'That lesson is not in the list.' }),
    h('a', { class: 'sh-btn sh-btn--primary', href: '#/learn' }, 'All lessons'));
}

// On a touch screen "drag" is a tap on the part, then a tap on the line: say so in the captions and hints.
const isTouch = () => { try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches || !!globalThis.matchMedia?.('(max-width: 719px)').matches; } catch { return false; } };
const TOUCH_RULES = [
  [/^Drag the (.+?) onto the line/, 'Tap the $1 in the parts list, then tap the line'],
  [/^Drag (.+?) from the (.+?) group onto the line/, 'Open the $2 group, tap $1, then tap the line'],
  [/^Drag (.+?) between/, 'Tap $1 in the parts list, then tap the line between'],
];
export function touchWording(lesson) {
  if (!lesson || !isTouch()) return lesson;
  let changed = false;
  const fix = (s) => { for (const [re, to] of TOUCH_RULES) if (re.test(s)) { changed = true; return s.replace(re, to); } return s; };
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (!o || typeof o !== 'object') return o;
    const out = {};
    for (const k of Object.keys(o)) out[k] = (k === 'caption' || k === 'hint') && typeof o[k] === 'string' ? fix(o[k]) : walk(o[k]);
    return out;
  };
  const copy = walk(lesson);
  return changed ? copy : lesson;
}

// A still sketch of the intro's starting design (phone, servers, database), drawn while the workbench code loads.
function introSketch() {
  const svg = `<svg class="sh-intro-sketch" viewBox="0 0 520 190" role="img" aria-label="A phone app talks to servers, which read from a database" focusable="false">
<defs><marker id="sh-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1l8 4-8 4z" fill="var(--text-3, #7a8499)"/></marker></defs>
<g fill="none" stroke="var(--text-3, #7a8499)" stroke-width="2" stroke-linecap="round" marker-end="url(#sh-ah)"><path d="M98 95H190"/><path d="M330 95H378"/></g>
<g stroke="var(--border-strong, var(--border))" stroke-width="1.5">
<rect x="36" y="45" width="56" height="100" rx="12" fill="var(--surface-strong)"/>
<rect x="196" y="55" width="128" height="80" rx="14" fill="var(--surface-strong)"/>
<path d="M384 62v66c0 10 20 18 44 18s44-8 44-18V62z" fill="var(--surface-strong)"/>
</g>
<rect x="46" y="60" width="36" height="62" rx="6" fill="var(--accent-soft)"/>
<circle cx="64" cy="134" r="3" fill="var(--text-3, #7a8499)"/>
<g fill="var(--accent)"><rect x="214" y="70" width="92" height="14" rx="5" opacity=".85"/><rect x="214" y="92" width="92" height="14" rx="5" opacity=".65"/><rect x="214" y="114" width="92" height="14" rx="5" opacity=".45"/></g>
<ellipse cx="428" cy="62" rx="44" ry="14" fill="var(--accent-soft)" stroke="var(--border-strong, var(--border))" stroke-width="1.5"/>
<g font-family="var(--font-ui, sans-serif)" font-size="14" font-weight="600" fill="var(--text-2)" text-anchor="middle"><text x="64" y="170">Phone app</text><text x="260" y="170">Servers</text><text x="428" y="170">Database</text></g>
</svg>`;
  const t = document.createElement('div');
  t.innerHTML = svg;
  return t.firstElementChild;
}

const approx = (v) => { const s = String(v); return s.trim().startsWith('≈') ? s : '≈ ' + s; };

export function renderLesson(host, ctx, route) {
  const lesson = lessonOf(ctx, route.parts[1]);
  if (!lesson) { host.append(notFoundLesson()); return {}; }
  if (lesson.id === 'intro') { ctx.router.replace('#/intro'); return {}; }

  const transfer = transferFor(lesson.id);
  const steps = [...(lesson.steps || []), ...(transfer ? [transfer] : [])];
  let transferDone = false;
  let poolOff = null;
  const total = steps.length + 1; // last page is the takeaway
  let idx = Math.max(0, Math.min(total - 1, parseInt(route.query.step, 10) || 0));
  let play = null;
  let goalOff = null;

  const wrap = h('div', { class: 'sh-lesson-page' });
  const head = h('header', { class: 'sh-lp-head' });
  const body = h('div', { class: 'sh-lp-body' });
  wrap.append(head, body);
  host.append(wrap);

  function stopPlay() {
    poolOff?.(); poolOff = null;
    if (goalOff) { goalOff(); goalOff = null; }
    if (play) { play.destroy(); play = null; }
  }

  function go(n, replace = false) {
    idx = Math.max(0, Math.min(total - 1, n));
    const hash = buildHash(`learn/${lesson.id}`, idx ? { step: idx } : {});
    (replace ? ctx.router.replace : ctx.router.go)(hash);
    draw();
  }

  function navRow({ canBack = true, nextLabel = 'Continue', onNext, nextClass = 'sh-btn--primary', extra = null }) {
    return h('div', { class: 'sh-lp-nav' },
      canBack && idx > 0 ? h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: () => go(idx - 1) }, ico('ui.chevron-left', 18), 'Back') : h('span'),
      extra,
      h('button', { type: 'button', class: 'sh-btn ' + nextClass, onclick: onNext || (() => go(idx + 1)) }, nextLabel, ico('ui.chevron-right', 18)));
  }

  function drawHead() {
    clear(head);
    const dots = h('ol', { class: 'sh-dots', 'aria-label': `Step ${idx + 1} of ${total}` },
      Array.from({ length: total }, (_, i) => h('li', { class: 'sh-dot' + (i < idx ? ' is-done' : i === idx ? ' is-now' : ''), 'aria-current': i === idx ? 'step' : null })));
    head.append(
      h('a', { class: 'sh-back', href: '#/learn' }, ico('ui.chevron-left', 18), 'Lessons'),
      h('div', { class: 'sh-lp-title' }, h('span', { class: 'sh-eyebrow', text: lesson.track || 'Lesson' }), h('h1', { class: 'sh-h1 sh-h1--sm', text: lesson.title })),
      dots);
  }

  function draw() {
    stopPlay();
    clear(body);
    drawHead();
    document.title = `${lesson.title} | System Designer`;
    const step = steps[idx];
    if (!step) return drawTakeaway();
    const card = h('section', { class: 'sh-card sh-lp-card', 'aria-live': 'polite' });
    body.append(card);
    if (step.kind === 'read' && !step.tap) {
      card.classList.add('sh-lp-card--illustrated');
      card.append(h('figure', { class: 'sh-concept-plate', 'aria-label': `${lesson.title}: a diagram of the mechanism`, html: sceneMarkup(lesson.id) }));
    }
    if (step.kind === 'read' && step.tap) {
      drawTap(card, step);
    } else if (step.kind === 'read') {
      append(card, [
        step.icon ? h('div', { class: 'sh-lp-hero-ico' }, ico(step.icon, 40)) : null,
        step.title ? h('h2', { class: 'sh-h2', text: step.title }) : null,
        h('p', { class: 'sh-lp-text', text: step.text }),
        navRow({})]);
    } else if (step.kind === 'numbers') {
      card.append(
        h('h2', { class: 'sh-h2', text: 'The numbers' }),
        h('p', { class: 'sh-muted', text: 'Real-world approximations, rounded to be easy to remember.' }),
        h('div', { class: 'sh-table-wrap' }, h('table', { class: 'sh-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'What' }), h('th', { scope: 'col', text: 'About' }), h('th', { scope: 'col', text: 'Why' }))),
          h('tbody', null, (step.rows || []).map((r) => h('tr', null,
            h('th', { scope: 'row', text: r.label }),
            h('td', { class: 'sh-num' }, h('span', { title: 'Approximate figure', text: approx(r.value) })),
            h('td', { class: 'sh-muted', text: r.how || '' })))))),
        navRow({}));
    } else if (step.kind === 'transfer') {
      drawTransfer(card, step);
    } else if (step.kind === 'quiz') {
      drawQuiz(card, step);
    } else if (step.kind === 'demo') {
      drawDemo(card, step);
    } else {
      card.append(h('p', { class: 'sh-lp-text', text: step.text || '' }), navRow({}));
    }
  }

  // Lesson 1: send real-feeling requests by tapping. Every tap is one question and one answer, with its wait in milliseconds.
  function drawTap(card, step) {
    // a fixed run of waits, mostly quick with the odd slow one, so the next card (p50 and p99) has something to point at (approx.)
    const waits = [84, 96, 72, 110, 91, 640, 78, 103, 88, 121, 85, 760, 93, 99];
    let n = 0;
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const dot = h('span', { class: 'sh-tap-dot', 'aria-hidden': 'true' });
    const lane = h('div', { class: 'sh-tap-lane' },
      h('div', { class: 'sh-tap-end' }, ico('el.mobile-app', 32), h('span', { text: 'Your phone' })),
      h('div', { class: 'sh-tap-wire' }, dot),
      h('div', { class: 'sh-tap-end' }, ico('el.vm-fleet', 32), h('span', { text: 'Servers' })));
    const out = h('p', { class: 'sh-tap-out', role: 'status', text: 'Nothing sent yet.' });
    const log = h('ol', { class: 'sh-tap-log', 'aria-label': 'Waits so far' });
    const next = navRow({});
    const go2 = next.querySelector('.sh-btn--primary');
    go2.disabled = true;
    let busy = false;
    const send = h('button', { type: 'button', class: 'sh-btn sh-btn--primary sh-tap-btn' }, ico('ui.rps', 18), 'Tap to send a request');
    send.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      const ms = waits[n % waits.length];
      n++;
      const finish = () => {
        dot.style.transition = 'none'; dot.style.left = '0%'; dot.style.opacity = '0';
        out.textContent = `Answer back in ${ms} ms (approx.).${ms > 400 ? ' That one was slow: the kind people remember.' : ''}`;
        const li = h('li', { class: ms > 400 ? 'is-slow' : '', text: `${ms} ms` });
        log.prepend(li);
        while (log.children.length > 8) log.lastChild.remove();
        go2.disabled = false;
        busy = false;
      };
      out.textContent = 'Sent. Waiting for the answer...';
      if (reduce) { finish(); return; }
      const t = Math.max(500, Math.min(1500, ms * 2.2));
      dot.style.transition = 'none'; dot.style.left = '0%'; dot.style.opacity = '1';
      void dot.offsetWidth;
      dot.style.transition = `left ${t / 2}ms cubic-bezier(.4,0,.2,1)`; dot.style.left = '100%';
      setTimeout(() => {
        dot.style.transition = `left ${t / 2}ms cubic-bezier(.4,0,.2,1)`; dot.style.left = '0%';
        setTimeout(finish, t / 2);
      }, t / 2);
    });
    append(card, [
      step.icon ? h('div', { class: 'sh-lp-hero-ico' }, ico(step.icon, 40)) : null,
      step.title ? h('h2', { class: 'sh-h2', text: step.title }) : null,
      h('p', { class: 'sh-lp-text', text: step.text }),
      lane, h('div', { class: 'sh-tap-act' }, send, out), log, next]);
  }

  function drawQuiz(card, step) {
    const result = h('div', { class: 'sh-quiz-result', role: 'status' });
    const next = navRow({ nextLabel: 'Continue' });
    next.querySelector('.sh-btn--primary').disabled = true;
    const choices = h('div', { class: 'sh-choices', role: 'group', 'aria-label': 'Answers' });
    // Choices appear in a stable shuffled order, so the right answer is not always in the same place.
    const hash = (str) => { let x = 2166136261; for (let k = 0; k < str.length; k++) { x ^= str.charCodeAt(k); x = Math.imul(x, 16777619); } return x >>> 0; };
    const order = (step.choices || []).map((c, i) => i).sort((a, b) => hash(step.q + '|' + step.choices[a]) - hash(step.q + '|' + step.choices[b]));
    order.forEach((i, pos) => {
      const c = step.choices[i];
      const b = h('button', { type: 'button', class: 'sh-choice' }, h('span', { class: 'sh-choice-key', text: String.fromCharCode(65 + pos) }), h('span', { text: c }));
      b.addEventListener('click', () => {
        const right = i === step.answer;
        b.dataset.state = right ? 'right' : 'wrong';
        b.prepend(ico(right ? 'ui.check' : 'ui.close', 18));
        // a wrong pick gets the idea behind the answer, not just a no
        result.textContent = right ? `Right. ${step.why || ''}` : `Not quite. ${step.why ? 'Think about it this way: ' + step.why.charAt(0).toLowerCase() + step.why.slice(1) + ' ' : ''}Try another.`;
        result.dataset.ok = right ? '1' : '0';
        if (right) {
          choices.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          next.querySelector('.sh-btn--primary').disabled = false;
        } else b.disabled = true;
      });
      choices.append(b);
    });
    card.append(h('h2', { class: 'sh-h2', text: 'Quick check' }), h('p', { class: 'sh-lp-text', text: step.q }), choices, result, next);
  }

  function drawDemo(card, step) {
    // until the goal is met the way on is a quiet "Skip"; reaching the goal turns it into the main button
    const hasGoal = !!step.goal;
    const cont = h('button', { type: 'button', class: 'sh-btn ' + (hasGoal ? 'sh-btn--ghost' : 'sh-btn--primary'), onclick: () => go(idx + 1), title: hasGoal ? 'Move on without finishing this step' : null }, hasGoal ? 'Skip this step' : 'Continue', ico('ui.chevron-right', 18));
    const hintBox = h('p', { class: 'sh-lp-hint', hidden: true, text: step.hint || '' });
    const hintBtn = step.hint ? h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: () => { hintBox.hidden = !hintBox.hidden; } }, ico('ui.hint', 18), 'Hint') : null;
    card.classList.add('sh-lp-card--demo');
    card.append(
      h('div', { class: 'sh-demo-prompt' }, ico('ui.sandbox', 20), h('p', { class: 'sh-lp-text', text: step.prompt })),
      hintBox);
    const stage = h('div', { class: 'sh-demo-stage' });
    if (lesson.id === 'load-balancing') poolOff = mountAllocation(card, ctx);
    card.append(stage, h('div', { class: 'sh-lp-nav' },
      idx > 0 ? h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: () => go(idx - 1) }, ico('ui.chevron-left', 18), 'Back') : h('span'),
      hintBtn, cont));
    play = mountPlayHost(stage, ctx, { mode: 'lesson', lesson: touchWording(lesson), stepIndex: idx, seed: 'lesson-' + lesson.id });
    const mark = () => { cont.classList.add('is-goal'); cont.classList.remove('sh-btn--ghost'); cont.classList.add('sh-btn--primary'); cont.removeAttribute('title'); cont.firstChild.textContent = 'Goal reached. Continue';
      try { cont.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* optional */ }
    };
    const o1 = ctx.bus.on('lesson:goal', (e) => { if (!e || !e.lessonId || e.lessonId === lesson.id) mark(); });
    const o2 = ctx.bus.on('lesson:done', (e) => { if (e && e.lessonId === lesson.id) mark(); });
    goalOff = () => { o1(); o2(); };
  }

  function drawTransfer(card, step) {
    let choice = null;
    const result = h('p', { role: 'status', class: 'sh-quiz-result' });
    const input = h('input', { class: 'sh-input', type: 'number', step: 'any', required: true, 'aria-label': step.calculation });
    const options = h('div', { class: 'sh-choices' });
    step.choices.forEach((text, i) => {
      const b = h('button', { type: 'button', class: 'sh-choice', 'aria-pressed': 'false', onclick: () => { choice = i; [...options.children].forEach((x,j) => x.setAttribute('aria-pressed', String(i === j))); } }, text);
      options.append(b);
    });
    const form = h('form', { onsubmit: event => {
      event.preventDefault();
      if (transferCorrect(step, choice, input.value === '' ? NaN : Number(input.value))) {
        transferDone = true;
        result.textContent = `Prediction checked. ${step.why} The calculation gives ${step.value.toLocaleString('en-US')} ${step.unit}.`;
        result.dataset.ok = '1';
        next.disabled = false;
        form.querySelector('button[type="submit"]').disabled = true;
      } else {
        result.textContent = choice == null ? 'Choose a plan and calculate its result first.' : choice !== step.answer ? `Reconsider the plan. ${step.why}` : 'Your plan fits. Recheck the calculation using the workload and units above.';
        result.dataset.ok = '0';
      }
    } }, h('h2', { class: 'sh-h2', text: 'Try a new situation' }), h('p', { class: 'sh-lp-text', text: step.q }), options,
      h('label', {}, h('p', { text: step.calculation }), input, h('span', { class: 'sh-muted', text: step.unit })),
      h('button', { class: 'sh-btn', type: 'submit', text: 'Check my prediction' }), result);
    const next = h('button', { class: 'sh-btn sh-btn--primary', type: 'button', disabled: true, onclick: () => go(steps.length) }, 'Finish lesson');
    card.append(form, h('div', { class: 'sh-lp-nav' }, h('button', { class: 'sh-btn sh-btn--ghost', type: 'button', onclick: () => go(idx - 1) }, 'Back'), next));
  }

  function drawTakeaway() {
    if (transfer && !transferDone) { idx = steps.length - 1; drawHead(); const check = h('section', { class: 'sh-card sh-lp-card' }); body.append(check); drawTransfer(check, transfer); return; }
    ctx.progress.lessonDone(lesson.id);
    const all = ctx.content.lessons || [];
    const i = all.findIndex((l) => l.id === lesson.id);
    const nextLesson = all.slice(i + 1).find((l) => !ctx.progress.isLessonDone(l.id)) || all[i + 1];
    const related = (ctx.content.problems || []).filter((p) => (p.concepts || []).includes(lesson.id));
    const card = h('section', { class: 'sh-card sh-lp-card sh-lp-done' },
      h('div', { class: 'sh-lp-hero-ico is-ok' }, ico('ui.check', 40)),
      h('p', { class: 'sh-eyebrow', text: 'Takeaway' }),
      h('p', { class: 'sh-takeaway', text: lesson.takeaway || lesson.summary || '' }),
      related.length ? h('div', { class: 'sh-lp-related' },
        h('h2', { class: 'sh-h3', text: `Try it on ${related.length} real problem${related.length === 1 ? '' : 's'}` }),
        h('div', { class: 'sh-chip-wrap' }, related.slice(0, 6).map((p) => h('a', { class: 'sh-chip', href: '#/practice/' + p.id }, p.title)),
          related.length > 6 ? h('a', { class: 'sh-chip', href: '#/practice?c=' + lesson.id }, `All ${related.length}`) : null)) : null,
      h('div', { class: 'sh-lp-nav' },
        h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: () => go(0) }, ico('ui.restart', 18), 'Replay'),
        nextLesson ? h('a', { class: 'sh-btn sh-btn--primary', href: '#/learn/' + nextLesson.id }, `Next: ${nextLesson.title}`, ico('ui.chevron-right', 18))
          : h('a', { class: 'sh-btn sh-btn--primary', href: '#/practice' }, 'Go to Practice', ico('ui.chevron-right', 18))));
    body.append(card);
  }

  draw();
  return {
    title: lesson.title,
    update(r) {
      const n = Math.max(0, Math.min(total - 1, parseInt(r.query.step, 10) || 0));
      if (n !== idx) { idx = n; draw(); }
    },
    destroy: stopPlay,
    get play() { return play; },
  };
}

// The 3-minute intro: full-screen, scripted by ui/play, skippable.
export function renderIntro(host, ctx) {
  const lesson = lessonOf(ctx, 'intro');
  if (!lesson) { host.append(notFoundLesson()); return {}; }
  const wrap = h('div', { class: 'sh-intro' });
  host.append(wrap);
  let finished = false;
  const markSeen = () => ctx.store.set('seenIntro', true);

  const skip = h('a', { class: 'sh-btn sh-intro-skip', href: '#/' }, 'Skip intro', ico('ui.chevron-right', 18));
  const play = mountPlayHost(wrap, ctx, { mode: 'intro', lesson: touchWording(lesson), stepIndex: 0, seed: 'intro', placeholder: introSketch() });
  wrap.append(skip);

  const off = ctx.bus.on('lesson:done', async (e) => {
    if (finished || !e || e.lessonId !== 'intro') return;
    finished = true;
    markSeen();
    ctx.store.set('introTaken', true);
    ctx.progress.lessonDone('intro');
    const r = e.result;
    const held = r && r.availability >= r.target;
    const pct = r ? Math.round(r.availability * 1000) / 10 : null;
    const said = !r ? 'You added servers, a load balancer, a cache and autoscaling.'
      : held ? `You added servers, a load balancer, a cache and autoscaling, and ${pct} percent of requests succeeded through a 3 times spike.`
        : `You added servers, a load balancer, a cache and autoscaling. ${pct} percent of requests succeeded: the spike outran the servers for a while, because new ones take minutes to start.`;
    const pick = await modal({
      title: 'You just did system design',
      body: h('p', { text: `${said} Next: the URL shortener uses the same parts. Count the servers you need on its Numbers step. Where next?` }),
      actions: [{ label: 'Learn the building blocks', value: 'learn' }, { label: 'Quick drill, 1 minute', value: 'drill' }, { label: 'Try the URL shortener', value: 'practice', primary: true }],
      dismissible: false,
    });
    ctx.router.go(pick === 'learn' ? '#/learn' : pick === 'drill' ? '#/drill' : '#/practice/url-shortener');
  });

  return {
    immersive: true,
    nav: true,
    title: 'Intro',
    destroy() { off(); markSeen(); play.destroy(); },
    get play() { return play; },
  };
}
