// Searchable, categorized component toolbar built from the catalog (left panel; bottom drawer on phones).
import { h, iconEl, fmtUsd } from './util.js';

export function createToolbar(host, { catalog, palette = null, onArm, onPlace, onDrag, onDrop, onDragEnd }) {
  const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  let allowed = palette ? new Set(palette) : null;
  let suggested = null;
  let suggestedTitle = 'Start with these';
  let armed = null;
  let enabled = true;
  let query = '';
  const collapsed = new Set();
  const root = h('aside', { class: 'pl-toolbar', 'aria-label': 'Components' });
  const search = h('input', { class: 'pl-input', type: 'search', placeholder: 'Search components', 'aria-label': 'Search components', autocomplete: 'off', spellcheck: 'false' });
  const tabs = h('div', { class: 'pl-cattabs', role: 'tablist', 'aria-label': 'Component groups' });
  const body = h('div', { class: 'pl-tb-body', 'aria-label': 'Components: arrow keys move, Enter places the part in the middle of the canvas' });
  let focusId = null; // the one component that is a tab stop (roving tab index)
  const note = h('div', { class: 'pl-tb-note', 'aria-live': 'polite' });
  const grab = h('button', { class: 'pl-tb-grab', type: 'button', 'aria-label': 'Open or close the components drawer', onClick: () => root.classList.toggle('pl-toolbar--open') }, iconEl('ui.plus', 18), h('span', { text: 'Add component' }));
  root.append(grab, h('div', { class: 'pl-tb-head' }, iconEl('ui.search', 16, 'pl-ic pl-tb-sicon'), search), tabs, body, note);
  host.append(root);

  const dragChip = h('div', { class: 'pl-dragchip', hidden: '' });
  document.body.append(dragChip);

  const cats = [...catalog.categories].sort((a, b) => a.order - b.order);
  const els = catalog.elements;

  // Plain words people type for a part, including the common product names it stands for.
  const ALIASES = {
    'sql-primary': 'database db sql postgres postgresql mysql relational rds',
    'kv-store': 'database db key value dynamodb redis store',
    'document-db': 'database db mongodb json documents',
    'wide-column': 'database db cassandra bigtable',
    'cache': 'redis memcached memory',
    'distributed-cache': 'redis memcached cluster memory',
    'queue': 'sqs rabbitmq jobs line backlog message queue',
    'event-stream': 'kafka kinesis log stream',
    'pubsub': 'topic sns fan out',
    'object-storage': 's3 blob files bucket',
    'regional-lb': 'balancer lb nginx alb elb',
    'global-lb': 'balancer lb anycast',
    'vm-fleet': 'servers vms ec2 app server compute',
    'container-cluster': 'kubernetes k8s docker pods',
    'serverless-fn': 'lambda functions faas',
    'search-index': 'elasticsearch opensearch full text',
    'rate-limiter': 'throttle limit waiting room 429',
    'cdn': 'edge cloudfront akamai',
    'websocket-gateway': 'websocket sockets realtime live',
    'identity-provider': 'login auth oauth sso',
    'worker-pool': 'workers background jobs consumers',
  };
  const textOf = (e) => (e.name + ' ' + e.id.replace(/-/g, ' ') + ' ' + (ALIASES[e.id] || '')).toLowerCase();
  function matches(e) {
    if (allowed && !allowed.has(e.id)) return false;
    if (!query) return true;
    const cat = cats.find((c) => c.id === e.category)?.name || '';
    const hay = [e.name, e.id, e.description, cat, ALIASES[e.id] || '', ...(e.goodAt || [])].join(' ').toLowerCase();
    return query.split(/\s+/).every((w) => hay.includes(w));
  }
  // How well a part answers the search: its exact name first, then names that start with it, then a word of the
  // name or a plain alias, then anything in its description.
  // the part a beginner means by a generic word
  const PREFER = { db: 'sql-primary', database: 'sql-primary', sql: 'sql-primary', lb: 'regional-lb', balancer: 'regional-lb', redis: 'cache', memory: 'cache', servers: 'vm-fleet', server: 'vm-fleet', app: 'vm-fleet', workers: 'worker-pool', storage: 'object-storage', files: 'object-storage', search: 'search-index', login: 'identity-provider' };
  function rank(e) {
    const q = query.trim();
    const name = e.name.toLowerCase();
    if (name === q || e.id === q) return 100;
    if (PREFER[q] === e.id) return 95;
    if (name.startsWith(q)) return 90 - name.length / 100;
    const words = textOf(e).split(/[\s()/,-]+/);
    if (words.includes(q)) return 70 - name.length / 100;
    if (words.some((w) => w.startsWith(q))) return 60 - name.length / 100;
    if (textOf(e).includes(q)) return 40;
    return 10;
  }

  function costHint(e) {
    const c = e.cost || {};
    const fixed = (c.base || 0) + (c.perUnit || 0);
    if (fixed > 0) return '≈ ' + fmtUsd(fixed) + '/mo';
    if (c.perMillion || c.perGB || c.perGBMonth || c.perThousandUsers) return 'pay per use';
    return 'free';
  }

  function render() {
    body.replaceChildren();
    tabs.replaceChildren();
    let shown = 0;
    let sug = !query && suggested ? suggested.map((id) => els.find((e) => e.id === id)).filter((e) => e && matches(e)) : [];
    let sugTitle = suggestedTitle;
    if (query) {
      // a search shows its best answers first, so the part named is the first one offered
      sug = els.filter(matches).map((e) => [e, rank(e)]).filter(([, r]) => r >= 40).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);
      sugTitle = 'Best matches';
    }
    if (sug.length) {
      const sec = h('section', { class: 'pl-cat pl-cat--suggest', id: 'pl-cat-suggest' });
      sec.append(h('div', { class: 'pl-cat-head pl-cat-head--static' }, iconEl(query ? 'ui.search' : 'ui.star', 18, 'pl-ic pl-cat-ic'), h('span', { class: 'pl-cat-name', text: sugTitle }), h('span', { class: 'pl-cat-count', text: String(sug.length) })));
      const ul = h('div', { class: 'pl-items', role: 'list' });
      for (const e of sug) ul.append(item(e));
      sec.append(ul, query ? '' : h('p', { class: 'pl-tb-coach', text: 'Drag a part onto the canvas, then drag from the arrow dot on its edge to another part to connect them.' }));
      body.append(sec);
    }
    for (const cat of cats) {
      const items = els.filter((e) => e.category === cat.id && matches(e));
      if (!items.length) continue;
      shown += items.length;
      const isCollapsed = !query && collapsed.has(cat.id);
      const sec = h('section', { class: 'pl-cat', id: 'pl-cat-' + cat.id, style: { '--tint': `var(--cat-${cat.id})` } });
      const head = h('button', { class: 'pl-cat-head', type: 'button', 'aria-expanded': String(!isCollapsed), title: cat.blurb,
        onClick: () => { if (collapsed.has(cat.id)) collapsed.delete(cat.id); else collapsed.add(cat.id); render(); } },
      iconEl('cat.' + cat.id, 18, 'pl-ic pl-cat-ic'), h('span', { class: 'pl-cat-name', text: cat.name }),
      h('span', { class: 'pl-cat-count', text: String(items.length) }), iconEl(isCollapsed ? 'ui.chevron-right' : 'ui.chevron-down', 16));
      sec.append(head);
      if (!isCollapsed) {
        const ul = h('div', { class: 'pl-items', role: 'list' });
        for (const e of items) ul.append(item(e));
        sec.append(ul);
      }
      body.append(sec);
      tabs.append(h('button', { class: 'pl-cattab', type: 'button', role: 'tab', style: { '--tint': `var(--cat-${cat.id})` }, title: cat.name, 'aria-label': cat.name,
        onClick: () => { collapsed.delete(cat.id); render(); body.querySelector('#pl-cat-' + cat.id)?.scrollIntoView({ block: 'start', behavior: 'auto' }); } },
      iconEl('cat.' + cat.id, 18)));
    }
    note.textContent = shown ? '' : `No match for "${query}". Try "cache", "queue" or "database".`;
    root.classList.toggle('pl-toolbar--off', !enabled);
    roving();
  }

  // Only one component is reachable with Tab; arrow keys move between the rest.
  function roving() {
    const list = [...body.querySelectorAll('.pl-item')];
    if (!list.length) return;
    let cur = list.find((n) => n.dataset.el === focusId) || list[0];
    for (const n of list) n.tabIndex = n === cur ? 0 : -1;
  }
  body.addEventListener('keydown', (ev) => {
    const list = [...body.querySelectorAll('.pl-item')];
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') j = Math.min(list.length - 1, i + 1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = list.length - 1;
    if (j < 0) return;
    ev.preventDefault();
    focusId = list[j].dataset.el;
    roving();
    list[j].focus();
  });
  body.addEventListener('focusin', (ev) => {
    const n = ev.target.closest?.('.pl-item');
    if (n && n.dataset.el !== focusId) { focusId = n.dataset.el; roving(); }
  });

  function item(e) {
    const b = h('button', {
      class: 'pl-item' + (armed === e.id ? ' pl-item--armed' : ''), type: 'button', role: 'listitem', 'data-el': e.id,
      title: `${e.description}\nGood at: ${(e.goodAt || []).join('; ')}`,
      'aria-pressed': String(armed === e.id),
    }, iconEl('el.' + e.id, 24, 'pl-ic pl-item-ic'),
    h('span', { class: 'pl-item-txt' }, h('span', { class: 'pl-item-name', text: e.name }), h('span', { class: 'pl-item-sub', text: costHint(e) })));
    wireDrag(b, e);
    return b;
  }

  function wireDrag(b, e) {
    let sx = 0, sy = 0, down = false, dragging = false, pid = null;
    b.addEventListener('pointerdown', (ev) => {
      if (!enabled || ev.button > 0) return;
      down = true; dragging = false; sx = ev.clientX; sy = ev.clientY; pid = ev.pointerId;
    });
    b.addEventListener('pointermove', (ev) => {
      if (!down || ev.pointerType === 'touch') return;
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        dragging = true;
        try { b.setPointerCapture(pid); } catch { /* capture is a nicety */ }
        dragChip.hidden = false;
        dragChip.replaceChildren(iconEl('el.' + e.id, 22), h('span', { text: e.name }));
        root.classList.remove('pl-toolbar--open');
      }
      if (dragging) {
        dragChip.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        onDrag?.(e.id, ev.clientX, ev.clientY);
      }
    });
    const end = (ev) => {
      if (!down) return;
      down = false;
      if (dragging) {
        dragging = false;
        dragChip.hidden = true;
        onDrop?.(e.id, ev.clientX, ev.clientY);
        onDragEnd?.();
        b.dataset.justDragged = '1';
        setTimeout(() => delete b.dataset.justDragged, 0);
      }
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', () => { if (dragging) { dragChip.hidden = true; onDragEnd?.(); } down = dragging = false; });
    b.addEventListener('click', (ev) => {
      if (b.dataset.justDragged || !enabled) return;
      // Keyboard and touch place the part straight into the middle of the canvas; a mouse click arms it.
      if (onPlace && (ev.detail === 0 || coarse)) {
        api.setArmed(null);
        root.classList.remove('pl-toolbar--open');
        onPlace(e.id, { keyboard: ev.detail === 0 });
        return;
      }
      api.setArmed(armed === e.id ? null : e.id);
      onArm?.(armed);
      if (armed) root.classList.remove('pl-toolbar--open');
    });
  }

  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); render(); });
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { search.value = ''; query = ''; render(); search.blur(); }
    if (ev.key === 'Enter') { const first = body.querySelector('.pl-item'); if (first) { ev.preventDefault(); first.focus(); first.click(); } }
    if (ev.key === 'ArrowDown') { const first = body.querySelector('.pl-item'); if (first) { ev.preventDefault(); first.focus(); } }
  });

  const api = {
    el: root,
    setPalette(list) { allowed = list ? new Set(list) : null; render(); },
    setSuggested(list, title = 'Start with these') { suggested = list && list.length ? list : null; suggestedTitle = title; render(); },
    setEnabled(on, reason = '') {
      enabled = on;
      note.textContent = on ? '' : reason;
      root.classList.toggle('pl-toolbar--off', !on);
      root.classList.toggle('pl-toolbar--slim', !on);
      if (!on) root.classList.remove('pl-toolbar--open');
      if (!on) api.setArmed(null);
    },
    setArmed(type) {
      armed = type;
      body.querySelectorAll('.pl-item').forEach((n) => {
        const on = n.dataset.el === type;
        n.classList.toggle('pl-item--armed', on);
        n.setAttribute('aria-pressed', String(on));
      });
    },
    armed: () => armed,
    focusSearch() { root.classList.add('pl-toolbar--open'); search.focus(); search.select(); },
    pulse(elementId) {
      // on a phone the drawer stays shut so the diagram stays visible; the Add button pulses instead
      const narrow = !!globalThis.matchMedia?.('(max-width: 899px)').matches;
      grab.classList.toggle('pl-tb-grab--pulse', !!elementId && narrow);
      if (!narrow) root.classList.add('pl-toolbar--open');
      body.querySelectorAll('.pl-item--pulse').forEach((n) => n.classList.remove('pl-item--pulse'));
      if (!elementId) return;
      collapsed.clear(); query = ''; search.value = ''; render();
      const n = body.querySelector(`[data-el="${elementId}"]`);
      n?.classList.add('pl-item--pulse');
      if (!narrow) n?.scrollIntoView({ block: 'nearest' });
    },
    destroy() { dragChip.remove(); root.remove(); },
  };
  render();
  return api;
}
