// Sandbox view: slim bar with five local save slots and a share link around the play canvas.
import { h, ico, clear, buildHash, fmtDate } from './dom.js';
import { mountPlayHost } from './playhost.js';
import { modal, toast } from './overlay.js';

const SLOTS = 5;

function readSlots(store) {
  const raw = store.get('sandbox.slots', null);
  const out = Array.from({ length: SLOTS }, (_, i) => (Array.isArray(raw) && raw[i] && raw[i].graph ? raw[i] : null));
  return out;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function renderSandbox(host, ctx, route0) {
  let play = null;
  let latest = null; // last graph announced by play
  let slotNo = 0;
  let wrap = null;
  let titleEl = null;

  const off = ctx.bus.on('play:graph', (e) => { if (e && e.graph) latest = e.graph; });

  function slotFromRoute(r) {
    const n = parseInt(r.parts[1], 10);
    return n >= 1 && n <= SLOTS ? n : 0;
  }

  function mount(r) {
    if (play) { play.destroy(); play = null; }
    clear(host);
    latest = null;
    slotNo = slotFromRoute(r);
    const slots = readSlots(ctx.store);
    const slot = slotNo ? slots[slotNo - 1] : null;
    if (slotNo && !slot) toast({ text: `Slot ${slotNo} is empty. Starting fresh.`, level: 'info' });

    titleEl = h('h1', { class: 'sh-problem-h1', text: slot ? slot.name : 'Sandbox' });
    const bar = h('div', { class: 'sh-problem-bar' },
      h('a', { class: 'sh-back', href: '#/', 'aria-label': 'Home' }, ico('ui.home', 18), h('span', { class: 'sh-hide-sm', text: 'Home' })),
      h('div', { class: 'sh-problem-title' }, titleEl, h('span', { class: 'sh-problem-like sh-hide-sm', text: 'Any component, any traffic. No game over.' })),
      h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: openSlots, 'aria-haspopup': 'dialog' }, ico('ui.download', 18), h('span', { class: 'sh-hide-sm', text: 'Slots' })),
      h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: shareLink }, ico('ui.share', 18), h('span', { class: 'sh-hide-sm', text: 'Share' })));
    wrap = h('div', { class: 'sh-problem' }, bar);
    host.append(wrap);
    const shared = r.query && r.query.d;
    if (shared && !slot) {
      // A shared sandbox design travels in the link as ?d=<payload>.
      const me = wrap;
      ctx.compete.share.decodeShare(shared).then((d) => {
        if (wrap !== me) return;
        if (d.name) titleEl.textContent = `Sandbox from ${d.name}`;
        play = mountPlayHost(wrap, ctx, { mode: 'sandbox', seed: 'sandbox', graph: d.graph });
      }).catch((err) => {
        if (wrap !== me) return;
        toast({ text: (err && err.message) || 'That sandbox link does not open.', level: 'warn' });
        play = mountPlayHost(wrap, ctx, { mode: 'sandbox', seed: 'sandbox' });
      });
      return;
    }
    play = mountPlayHost(wrap, ctx, { mode: 'sandbox', seed: 'sandbox', graph: slot ? slot.graph : undefined });
  }

  async function shareLink() {
    if (!latest || !(latest.nodes || []).length) { toast({ text: 'Build something first, then share it.', level: 'info' }); return; }
    try {
      const share = ctx.compete.share;
      const payload = await share.encodeShare({ mode: 'sandbox', problemId: 'sandbox', seed: 'sandbox', graph: latest, score: null, name: ctx.account?.displayName?.() || ctx.settings.get('playerName') });
      const url = String(location.href).split('#')[0] + '#/sandbox?d=' + payload;
      if (await copyText(url)) toast({ text: 'Link copied.', level: 'ok' });
      else {
        const box = h('input', { type: 'text', class: 'sh-input', readonly: true, value: url, 'aria-label': 'Share link' });
        modal({ title: 'Copy this link', body: box });
        box.select();
      }
    } catch { toast({ text: 'Could not make a link for this design.', level: 'bad' }); }
  }

  function openSlots() {
    const body = h('div', { class: 'sh-slots' });
    const draw = () => {
      clear(body);
      const slots = readSlots(ctx.store);
      slots.forEach((s, i) => {
        const nameIn = h('input', { type: 'text', class: 'sh-input sh-slot-name', maxlength: '28', 'aria-label': `Name for slot ${i + 1}` });
        nameIn.value = s ? s.name : `Sandbox ${i + 1}`;
        const row = h('div', { class: 'sh-slot' + (slotNo === i + 1 ? ' is-current' : '') },
          h('span', { class: 'sh-slot-n', text: String(i + 1) }),
          h('div', { class: 'sh-slot-main' }, nameIn, h('span', { class: 'sh-muted', text: s ? `${s.nodes} components, saved ${fmtDate(s.savedAt)}` : 'Empty' })),
          h('div', { class: 'sh-slot-actions' },
            h('button', { type: 'button', class: 'sh-btn', onclick: () => save(i, nameIn.value) }, 'Save here'),
            s ? h('a', { class: 'sh-btn', href: buildHash('sandbox/' + (i + 1)), onclick: () => document.querySelector('.sh-scrim .sh-modal-actions button')?.click() }, 'Open') : null,
            s ? h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', 'aria-label': `Delete slot ${i + 1}`, onclick: () => remove(i) }, ico('ui.delete', 18)) : null));
        body.append(row);
      });
    };
    const save = (i, name) => {
      if (!latest || !(latest.nodes || []).length) { toast({ text: 'Nothing to save yet. Add a component first.', level: 'info' }); return; }
      const slots = readSlots(ctx.store);
      slots[i] = { name: (name || `Sandbox ${i + 1}`).trim().slice(0, 28), savedAt: Date.now(), nodes: latest.nodes.length, graph: latest };
      ctx.store.set('sandbox.slots', slots);
      toast({ text: `Saved to slot ${i + 1}.`, level: 'ok' });
      if (slotNo === i + 1 && titleEl) titleEl.textContent = slots[i].name;
      draw();
    };
    const remove = (i) => {
      const slots = readSlots(ctx.store);
      slots[i] = null;
      ctx.store.set('sandbox.slots', slots);
      draw();
    };
    draw();
    modal({ title: 'Save slots', body, wide: true, actions: [{ label: 'Close', value: true }] });
  }

  let sharedKey = route0.query && route0.query.d;
  mount(route0);
  return {
    immersive: true,
    title: 'Sandbox',
    update(r) { if (slotFromRoute(r) !== slotNo || r.parts[1] !== (slotNo ? String(slotNo) : undefined) || (r.query && r.query.d) !== sharedKey) { sharedKey = r.query && r.query.d; mount(r); } },
    destroy() { off(); if (play) play.destroy(); },
    get play() { return play; },
  };
}
