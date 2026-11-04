// Inspector: what the selected element is, how busy it is now, what it costs, and its knobs.
import { h, iconEl, fmtNum, fmtUsd, fmtMs, fmtPct, approx, statusGlyph } from './util.js';
import { stepCount } from './draw-controls.js';
import { capacityText, inspectorStatus } from './inspector-facts.js';

export function createInspector(host, { catalog, getNode, getHome, onKnob, onDelete, onDuplicate, onConnect, onClose, lesson = false }) {
  const root = h('aside', { class: 'pl-inspector', 'aria-label': 'Inspector', hidden: '' });
  host.append(root);
  let curId = null;
  let editable = true;
  let reason = '';
  let live = {};
  let folded = false;
  let focusKnob = null;
  const refs = {};

  const world = catalog.world;
  const tiers = world.tiers;
  const regions = world.regions;

  function nodeValue(node, el, knob) {
    const def = catalog.knobs[knob] || {};
    if (knob === 'units') return node.units ?? el.units?.default ?? 1;
    if (knob === 'zones' || knob === 'region' || knob === 'tier') return node[knob] ?? def.default;
    return node.knobs?.[knob] ?? def.default;
  }

  function stepper(value, min, max, onSet, label) {
    const inp = h('input', { class: 'pl-num', type: 'number', min: String(min), max: String(max), value: String(value), 'aria-label': label });
    const set = (v) => { v = Math.min(max, Math.max(min, Math.round(+v || min))); inp.value = String(v); onSet(v); };
    inp.addEventListener('change', () => set(inp.value));
    return h('span', { class: 'pl-stepper' },
      h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Less ' + label, onClick: () => set(stepCount(+inp.value, -1, min, max)) }, iconEl('ui.minus', 16)),
      inp,
      h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'More ' + label, onClick: () => set(stepCount(+inp.value, 1, min, max)) }, iconEl('ui.plus', 16)));
  }

  function segmented(options, value, onSet, label, fmt = String) {
    const g = h('div', { class: 'pl-seg', role: 'radiogroup', 'aria-label': label });
    options.forEach((o) => {
      const on = String(o) === String(value);
      g.append(h('button', { class: 'pl-seg-b' + (on ? ' pl-seg-b--on' : ''), type: 'button', role: 'radio', 'aria-checked': String(on), onClick: () => onSet(o) }, fmt(o)));
    });
    return g;
  }

  function toggle(on, onSet, label) {
    return h('button', { class: 'pl-switch' + (on ? ' pl-switch--on' : ''), type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onClick: () => onSet(!on) }, h('span', { class: 'pl-switch-dot' }));
  }

  function knobRow(el, node, knob) {
    const def = catalog.knobs[knob];
    if (!def) return null;
    let val = nodeValue(node, el, knob);
    const set = (v) => onKnob(node.id, knob, v);
    let label = def.label;
    let control;
    if (knob === 'units') {
      if ((el.units?.max ?? 1) <= 1) return null;
      label = `${(el.units.label || 'Units')[0].toUpperCase()}${(el.units.label || 'Units').slice(1)}s`;
      control = stepper(val, el.units.min ?? 1, el.units.max, set, label);
    } else if (knob === 'zones') {
      if (el.managed) return h('div', { class: 'pl-knob' }, h('div', { class: 'pl-knob-top' }, h('span', { class: 'pl-knob-l', text: 'Zones' }), h('span', { class: 'pl-muted', text: 'Managed: spread over several zones for you' })));
      control = segmented(def.options, val, (z) => { set(+z); if ((node.units ?? 1) < +z) onKnob(node.id, 'units', +z); }, 'Zones');
    } else if (knob === 'tier') {
      control = segmented(def.options, val, set, 'Size', (o) => `${o}`);
    } else if (knob === 'region') {
      const sel = h('select', { class: 'pl-select', 'aria-label': 'Region' });
      sel.append(h('option', { value: 'problem', text: `Home region (${regions.find((r) => r.id === getHome())?.name || getHome() || '–'})` }));
      regions.forEach((r) => sel.append(h('option', { value: r.id, text: r.name })));
      sel.value = val || 'problem';
      sel.addEventListener('change', () => set(sel.value));
      control = sel;
    } else if (knob === 'autoscale') {
      const a = { on: false, min: 1, max: 20, targetUtil: 0.6, ...(val || {}) };
      const wrap = h('div', { class: 'pl-auto' });
      const unitsWord = (el.units?.label || 'unit').replace(/s$/, '') + ((node.units || 1) === 1 ? '' : 's');
      wrap.append(toggle(a.on, (v) => {
        // switching on keeps the servers already there as the floor
        const u = Math.max(1, node.units || 1);
        set(v ? { ...a, on: true, min: u, max: Math.max(a.max, u * 3, 20) } : { ...a, on: false });
      }, 'Autoscale'));
      if (a.on) {
        wrap.append(h('div', { class: 'pl-auto-row' }, h('span', { text: 'Never fewer than' }), stepper(a.min, 1, Math.max(a.max, 1), (v) => set({ ...a, min: v }), 'fewest units')));
        wrap.append(h('div', { class: 'pl-auto-row' }, h('span', { text: 'Never more than' }), stepper(a.max, 1, el.units?.max || 100, (v) => set({ ...a, max: v }), 'most units')));
        wrap.append(h('div', { class: 'pl-auto-row' }, h('span', { text: 'Aim for busy level' }), segmented([0.5, 0.6, 0.7], a.targetUtil, (v) => set({ ...a, targetUtil: v }), 'Target busy level', (o) => Math.round(o * 100) + '%')));
        wrap.append(h('div', { class: 'pl-knob-help pl-auto-note', text: `Starts at ${node.units || 1} ${unitsWord}. It never shrinks below the first number, and new ones take 2 to 4 minutes to start, so keep that number at what the peak needs.` }));
      }
      control = wrap;
    } else if (def.type === 'bool') {
      control = toggle(!!val, set, def.label);
    } else if (def.type === 'int') {
      control = stepper(val ?? 0, knob === 'warmPool' ? 0 : 1, 100000, set, def.label);
    } else {
      const opts = def.options === 'params.modes' ? el.params?.modes || [] : def.options || [];
      const fmt = knob === 'ttlSec' ? ttlText : knob === 'timeoutMs' ? (o) => fmtMs(o) : knob === 'sampling' ? (o) => Math.round(o * 100) + '%' : knob === 'retentionDays' ? (o) => o + ' d' : String;
      if (opts.length <= 4 && knob !== 'ttlSec' && knob !== 'timeoutMs') control = segmented(opts, val, set, def.label, fmt);
      else {
        const sel = h('select', { class: 'pl-select', 'aria-label': def.label });
        opts.forEach((o) => sel.append(h('option', { value: String(o), text: fmt(o) })));
        sel.value = String(val);
        sel.addEventListener('change', () => { const o = opts.find((x) => String(x) === sel.value); set(o); });
        control = sel;
      }
    }
    const help = knob === 'mode'
      ? (el.params?.modes?.includes('round-robin') ? 'Round robin sends requests to each server in turn. Least requests chooses the server with the fewest requests in progress, useful when some requests take longer.' : 'Choose how this part routes requests. ' + (el.description || ''))
      : def.help || '';
    const row = h('div', { class: 'pl-knob', 'data-knob': knob }, h('div', { class: 'pl-knob-top' }, h('span', { class: 'pl-knob-l', text: label })), control, h('div', { class: 'pl-knob-help', text: help }));
    row.querySelectorAll('button,input,select').forEach((n) => { n.disabled = !editable; });
    return row;
  }

  const ttlText = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : s < 86400 ? `${s / 3600} h` : '1 day');

  function costLines(el, node) {
    const c = el.cost || {};
    const units = node.units ?? el.units?.default ?? 1;
    const tierCost = tiers[node.tier || 'M']?.cost ?? 1;
    const lines = [];
    if (c.base) lines.push(['Fixed', c.base]);
    if (c.perUnit) lines.push([`${units} × ${(el.units?.label || 'unit')}${units > 1 ? 's' : ''} (size ${node.tier || 'M'})`, c.perUnit * units * tierCost]);
    const frag = h('div', { class: 'pl-cost' });
    let total = 0;
    for (const [l, v] of lines) { total += v; frag.append(h('div', { class: 'pl-cost-row' }, h('span', { text: l }), approx(fmtUsd(v) + '/mo'))); }
    if (c.perMillion) frag.append(h('div', { class: 'pl-cost-row' }, h('span', { text: 'Per million requests' }), approx('$' + c.perMillion)));
    if (c.perGB) frag.append(h('div', { class: 'pl-cost-row' }, h('span', { text: 'Per GB sent out' }), approx('$' + c.perGB)));
    if (c.perGBMonth) frag.append(h('div', { class: 'pl-cost-row' }, h('span', { text: 'Per GB stored a month' }), approx('$' + c.perGBMonth)));
    if (c.perThousandUsers) frag.append(h('div', { class: 'pl-cost-row' }, h('span', { text: 'Per 1,000 monthly users' }), approx('$' + c.perThousandUsers)));
    if (!frag.children.length) frag.append(h('div', { class: 'pl-muted', text: 'No direct cost to you.' }));
    else if (lines.length > 1) frag.append(h('div', { class: 'pl-cost-row pl-cost-total' }, h('span', { text: 'Fixed total' }), approx(fmtUsd(total) + '/mo')));
    if (c.note) frag.append(h('div', { class: 'pl-muted pl-small', text: c.note }));
    return frag;
  }

  function render() {
    root.replaceChildren();
    const node = curId && getNode(curId);
    if (!node) { root.hidden = true; return; }
    const el = catalog.elementById.get(node.type);
    if (!el) { root.hidden = true; return; }
    root.hidden = false;
    root.classList.toggle('pl-inspector--folded', folded);
    const cat = catalog.categories.find((c) => c.id === el.category);
    const locked = !!node.locked;

    const head = h('div', { class: 'pl-insp-head', style: { '--tint': `var(--cat-${el.category})` } },
      iconEl('el.' + el.id, 28, 'pl-ic pl-insp-ic'),
      h('div', { class: 'pl-insp-title' }, h('b', { text: node.label || el.name }), h('span', { class: 'pl-muted pl-small', text: cat?.name || '' })),
      h('button', { class: 'pl-icon-btn pl-insp-fold', type: 'button', 'aria-label': folded ? 'Show the part settings' : 'Fold the part settings', 'aria-expanded': String(!folded), onClick: () => api.fold(!folded) }, iconEl('ui.chevron-down', 18)),
      h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Close inspector', onClick: () => onClose?.() }, iconEl('ui.close', 18)));
    const actions = h('div', { class: 'pl-insp-actions' },
      h('button', { class: 'pl-btn pl-btn--small', type: 'button', onClick: () => onConnect?.(node.id) }, iconEl('ui.connect', 16), 'Connect to…'),
      h('button', { class: 'pl-btn pl-btn--small', type: 'button', disabled: locked || !editable ? '' : null, onClick: () => onDuplicate?.(node.id) }, iconEl('ui.duplicate', 16), 'Duplicate'),
      h('button', { class: 'pl-btn pl-btn--small pl-btn--danger', type: 'button', disabled: locked || !editable ? '' : null, onClick: () => onDelete?.(node.id) }, iconEl('ui.delete', 16), 'Delete'));
    if (locked || !editable) actions.append(h('div', { class: 'pl-muted pl-small pl-lockline' }, iconEl('ui.lock', 14), locked ? 'Part of the problem: it cannot be removed.' : reason));

    // live block
    const meter = h('div', { class: 'pl-bar' }, h('div', { class: 'pl-bar-fill' }));
    refs.meter = meter; refs.status = h('span', { class: 'pl-live-status' }); refs.util = h('b', { class: 'pl-mono' });
    refs.sub = h('div', { class: 'pl-muted pl-small pl-mono' });
    const liveBox = h('div', { class: 'pl-live' }, h('div', { class: 'pl-live-top' }, refs.status, refs.util), meter, refs.sub);
    if (el.capacity == null) liveBox.append(h('div', { class: 'pl-muted pl-small', text: 'Not in the request path: it does not carry traffic itself.' }));

    // numbers
    const facts = h('dl', { class: 'pl-facts' });
    if (el.capacity) {
      facts.append(h('dt', { text: 'Handles' }), h('dd', {}, approx(capacityText(el, node, tiers))));
    }
    if (el.latencyMs) facts.append(h('dt', { text: 'Adds' }), h('dd', {}, approx(`${fmtMs(el.latencyMs.p50)} typical, ${fmtMs(el.latencyMs.p99)} slow`), el.latencyMs.note ? h('span', { class: 'pl-muted pl-small', text: ' ' + el.latencyMs.note }) : null));
    facts.append(h('dt', { text: 'Uptime alone' }), h('dd', {}, approx(fmtPct(el.availability) + ' of the time, one copy in one zone')));

    const knobs = h('div', { class: 'pl-knobs' });
    for (const k of el.knobs || []) { const r = knobRow(el, node, k); if (r) knobs.append(r); }
    const replicaCount = el.id === 'sql-replica' ? knobs.querySelector('.pl-knob[data-knob="units"]') : null;

    const focusRow = lesson && focusKnob ? knobs.querySelector(`.pl-knob[data-knob="${focusKnob}"]`) : null;
    if (focusRow) {
      // a lesson step names one setting: show only that, with a one-line description and the rest folded away
      const oneLine = (el.description || '').split(/(?<=[.!?])\s/)[0];
      const more = h('details', { class: 'pl-insp-more' }, h('summary', { text: 'More details' }),
        liveBox,
        section('Good at', h('ul', { class: 'pl-list' }, (el.goodAt || []).map((g) => h('li', { text: g })))),
        section('The trade-off', h('p', { text: el.tradeoff })),
        section('What it can do', facts),
        section('Cost a month', costLines(el, node)),
        knobs.children.length > 1 ? section('Other settings', knobs) : null,
        el.failureModes?.length ? section('How it breaks', h('ul', { class: 'pl-list' }, el.failureModes.map((f) => h('li', { text: f.text })))) : null);
      root.classList.add('pl-inspector--focus');
      root.append(head, h('div', { class: 'pl-insp-scroll' }, actions, focusRow, h('p', { class: 'pl-desc', text: oneLine }), more));
      const sc = root.querySelector('.pl-insp-scroll'); if (sc) sc.scrollTop = 0;
      paintLive();
      return;
    }
    root.classList.remove('pl-inspector--focus');
    // on a phone the sheet opens on the settings, and the long text waits under "More details"
    if (globalThis.matchMedia?.('(max-width: 719px)').matches && knobs.children.length) {
      const more = h('details', { class: 'pl-insp-more' }, h('summary', { text: 'More details' }),
        section('Good at', h('ul', { class: 'pl-list' }, (el.goodAt || []).map((g) => h('li', { text: g })))),
        section('The trade-off', h('p', { text: el.tradeoff })),
        section('What it can do', facts),
        section('Cost a month', costLines(el, node)),
        el.failureModes?.length ? section('How it breaks', h('ul', { class: 'pl-list' }, el.failureModes.map((f) => h('li', { text: f.text })))) : null);
      root.append(head, h('div', { class: 'pl-insp-scroll' }, actions, replicaCount, section('Settings', knobs), h('p', { class: 'pl-desc', text: el.description }), liveBox, more));
      const sc = root.querySelector('.pl-insp-scroll'); if (sc) sc.scrollTop = 0;
      paintLive();
      return;
    }
    root.append(head, h('div', { class: 'pl-insp-scroll' },
      replicaCount,
      h('p', { class: 'pl-desc', text: el.description }),
      actions, liveBox,
      section('Good at', h('ul', { class: 'pl-list' }, (el.goodAt || []).map((g) => h('li', { text: g })))),
      section('The trade-off', h('p', { text: el.tradeoff })),
      section('What it can do', facts),
      section('Cost a month', costLines(el, node)),
      knobs.children.length ? section('Settings', knobs) : null,
      el.failureModes?.length ? section('How it breaks', h('ul', { class: 'pl-list' }, el.failureModes.map((f) => h('li', { text: f.text })))) : null));
    paintLive();
  }

  function section(title, content) {
    return h('section', { class: 'pl-insp-sec' }, h('h4', { text: title }), content);
  }

  function paintLive() {
    if (!refs.meter?.isConnected) return;
    const s = live;
    const util = s.util ?? 0;
    const { name, text } = inspectorStatus(s);
    refs.status.replaceChildren(statusGlyph(name, 16), text);
    refs.status.title = 'Available means the process is up. Load and request failures are shown separately.';
    refs.status.className = 'pl-live-status pl-st-' + name;
    refs.util.textContent = Math.round(util * 100) + '% busy';
    const fill = refs.meter.firstChild;
    fill.style.width = Math.min(100, util * 100) + '%';
    fill.className = 'pl-bar-fill pl-bg-' + name;
    const bits = [];
    if (s.p99Ms != null) bits.push('p99 ' + fmtMs(s.p99Ms));
    if (s.failRps > 0.5) bits.push(fmtNum(s.failRps) + ' req/s failing');
    if (s.queueDepth > 0.5) bits.push('queue ' + fmtNum(s.queueDepth));
    refs.sub.textContent = bits.join(' · ');
  }

  const api = {
    el: root,
    show(id) { if (id !== curId) folded = false; curId = id; live = {}; render(); },
    fold(on) { if (folded === !!on) return; folded = !!on; if (curId) render(); },
    setFocus(k) { k = k || null; if (focusKnob === k) return; focusKnob = k; if (curId) render(); },
    hide() { curId = null; root.hidden = true; },
    refresh() { if (curId) { const sc = root.querySelector('.pl-insp-scroll')?.scrollTop || 0; render(); const n = root.querySelector('.pl-insp-scroll'); if (n) n.scrollTop = sc; } },
    update(simNode) { if (simNode && simNode.id === curId) { live = simNode; paintLive(); } },
    setEditable(on, why = '') { if (editable !== on || reason !== why) { editable = on; reason = why; this.refresh(); } },
    current: () => curId,
  };
  return api;
}
