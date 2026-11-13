// Pointer, touch, wheel and drop input on the canvas. Emits intent events; never changes the graph itself.

import { snap, HALF } from './geom.js';

export const PORT_R = 52;          // port ring radius around a node, world units
const PORT_IN = 43, PORT_OUT = 64;
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 320;
export const DND_TYPE = 'application/x-sd-element';
export const DND_PREFIX = 'x-sd-el/';

export function createInput(canvas, host, d) {
  const { camera, nodes, edges, emit } = d;
  const pointers = new Map();     // id → { x, y, type }
  let rect = canvas.getBoundingClientRect();
  let mode = 'idle';              // idle | pendingNode | pendingCanvas | pan | drag | connect | pinch | longpressed
  let start = null;               // { x, y, t, id, type, button }
  let longTimer = 0;
  let dragId = null, grab = { x: 0, y: 0 }, dragPos = null;
  let connectFrom = null, connectTarget = null;
  let pinch = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  let spaceDown = false;
  let samples = [];
  let hoverWorld = null;

  // A page scaled up with CSS zoom reports client coordinates in screen pixels; the camera works in the canvas's own pixels.
  const local = e => { const k = rect.width > 0 && canvas.clientWidth > 0 ? rect.width / canvas.clientWidth : 1; return { x: (e.clientX - rect.left) / k, y: (e.clientY - rect.top) / k }; };
  const slopFor = type => (type === 'touch' ? 9 : 4);
  const tolFor = type => (type === 'touch' ? 10 : 4) / camera.zoom;

  function activeRingNode(type) {
    if (!d.editable()) return null;
    const id = type === 'mouse' ? (nodes.hovered || nodes.selected) : nodes.selected;
    return id ? nodes.views.get(id) || null : null;
  }

  function inRing(v, w, type) {
    if (!v) return false;
    // The visible side port and the arrow share one finger-sized target.
    const px = (w.x - v.x) * camera.zoom, py = (w.y - v.y) * camera.zoom;
    if (px >= Math.max(HALF * camera.zoom - 12, HALF * camera.zoom * .6) &&
      px <= HALF * camera.zoom + 44 && Math.abs(py) <= 22) return true;
    const dd = Math.hypot(w.x - v.x, w.y - v.y);
    const t = tolFor(type);
    const inBody = Math.abs(w.x - v.x) <= HALF && Math.abs(w.y - v.y) <= HALF && dd < PORT_IN;
    return !inBody && dd >= PORT_IN - t && dd <= PORT_OUT + t;
  }

  // Grid snap plus alignment with other nodes (guides drawn while dragging or placing).
  function snapPos(x, y, excludeId) {
    let sx = snap(x), sy = snap(y);
    let gx = null, gy = null, bx = 10, by = 10;
    for (const v of nodes.list) {
      if (v.id === excludeId) continue;
      const dx = Math.abs(v.tx - x), dy = Math.abs(v.ty - y);
      if (dx < bx) { bx = dx; gx = v; }
      if (dy < by) { by = dy; gy = v; }
    }
    if (gx) sx = gx.tx;
    if (gy) sy = gy.ty;
    const guides = [];
    if (gx) guides.push([sx, Math.min(sy, gx.ty) - HALF - 16, sx, Math.max(sy, gx.ty) + HALF + 16]);
    if (gy) guides.push([Math.min(sx, gy.tx) - HALF - 16, sy, Math.max(sx, gy.tx) + HALF + 16, sy]);
    return { x: sx, y: sy, guides };
  }

  function setCursor(c) { if (canvas.style.cursor !== c) canvas.style.cursor = c; }

  function updateHover(p, type) {
    if (type !== 'mouse' || mode !== 'idle') return;
    const w = camera.screenToWorld(p.x, p.y);
    hoverWorld = w;
    const body = nodes.hit(w.x, w.y, 0);
    const ring = d.editable() && nodes.list.find(v => (!body || body.id === v.id) && inRing(v, w, 'mouse')) || activeRingNode('mouse');
    if (ring && (!body || body.id === ring.id) && inRing(ring, w, 'mouse')) { setCursor('crosshair'); d.ui.setPortRing(ring, true); return; }
    const v = nodes.hit(w.x, w.y, tolFor('mouse'));
    nodes.setHover(v ? v.id : null);
    d.ui.setPortRing(activeRingNode('mouse'), false);
    if (d.ghost.type()) { d.ghost.pointer(w.x, w.y); setCursor('copy'); return; }
    setCursor(v ? (d.editable() ? 'grab' : 'pointer') : edges.hit(w.x, w.y, tolFor('mouse') * 1.5) ? 'pointer' : 'default');
  }

  function cancelGesture() {
    clearTimeout(longTimer);
    if (mode === 'drag' && dragId) nodes.cancelDrag(dragId);
    if (mode === 'connect') d.ui.clearBand();
    d.ui.clearGuides();
    dragId = null; connectFrom = null; connectTarget = null; dragPos = null;
    mode = 'idle';
  }

  function beginPinch() {
    cancelGesture();
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: camera.zoom };
    mode = 'pinch';
  }

  function onDown(e) {
    rect = canvas.getBoundingClientRect();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* capture is best effort */ }
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, type: e.pointerType });
    camera.stop();
    if (pointers.size === 2) { beginPinch(); return; }
    if (pointers.size > 2) return;
    const w = camera.screenToWorld(p.x, p.y);
    start = { x: p.x, y: p.y, t: performance.now(), type: e.pointerType, button: e.button, w };
    samples = [{ x: p.x, y: p.y, t: start.t }];
    if (e.button === 2) { mode = 'idle'; return; }
    if (e.button === 1 || spaceDown) { mode = 'pan'; setCursor('grabbing'); return; }
    if (d.ghost.type()) { d.ghost.pointer(w.x, w.y); mode = 'pendingCanvas'; return; }
    const body = nodes.hit(w.x, w.y, 0);
    const ring = d.editable() && nodes.list.find(v => (!body || body.id === v.id) && inRing(v, w, e.pointerType)) || activeRingNode(e.pointerType);
    if (ring && (!body || body.id === ring.id) && inRing(ring, w, e.pointerType)) {
      mode = 'connect'; connectFrom = ring; connectTarget = null;
      d.ui.drawBand(ring, w.x, w.y, null, true);
      return;
    }
    const v = nodes.hit(w.x, w.y, tolFor(e.pointerType));
    // pressing just outside any part's body (its edge band) starts a connection, hovered or not
    if (!v && d.editable()) {
      const near = nodes.list.find((nv) => inRing(nv, w, e.pointerType));
      if (near) {
        mode = 'connect'; connectFrom = near; connectTarget = null;
        d.ui.setPortRing(near, true);
        d.ui.drawBand(near, w.x, w.y, null, true);
        return;
      }
    }
    if (v) {
      mode = 'pendingNode'; start.id = v.id;
      if (e.pointerType !== 'mouse') {
        longTimer = setTimeout(() => {
          if (mode !== 'pendingNode') return;
          mode = 'longpressed';
          emit('node:longpress', { id: v.id, x: start.x, y: start.y });
        }, LONG_PRESS_MS);
      }
      return;
    }
    mode = 'pendingCanvas';
  }

  function startDrag(id, w) {
    const v = nodes.views.get(id);
    if (!v || !d.editable()) return false;
    dragId = id; grab = { x: w.x - v.x, y: w.y - v.y };
    mode = 'drag';
    setCursor('grabbing');
    emit('node:dragstart', { id });
    return true;
  }

  function onMove(e) {
    const p = local(e);
    const ptr = pointers.get(e.pointerId);
    if (!ptr) { updateHover(p, e.pointerType); return; }
    const px = ptr.x, py = ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      emit('view:manual');
      camera.panBy(mx - pinch.mx, my - pinch.my);
      camera.zoomTo(pinch.z * (dist / pinch.dist), mx, my);
      pinch.mx = mx; pinch.my = my;
      return;
    }
    const moved = start ? Math.hypot(p.x - start.x, p.y - start.y) : 0;
    const w = camera.screenToWorld(p.x, p.y);
    if (mode === 'pendingNode' && moved > slopFor(e.pointerType)) {
      clearTimeout(longTimer);
      if (startDrag(start.id, start.w)) { /* dragging */ }
      else { mode = 'pan'; setCursor('grabbing'); }
    } else if (mode === 'longpressed' && moved > slopFor(e.pointerType)) {
      startDrag(start.id, start.w);
    } else if (mode === 'pendingCanvas' && moved > slopFor(e.pointerType)) {
      mode = 'pan'; setCursor('grabbing');
    }
    if (mode === 'pan') {
      emit('view:manual');
      camera.panBy(p.x - px, p.y - py);
      const t = performance.now();
      samples.push({ x: p.x, y: p.y, t });
      while (samples.length > 2 && t - samples[0].t > 90) samples.shift();
    } else if (mode === 'drag') {
      const sp = snapPos(w.x - grab.x, w.y - grab.y, dragId);
      dragPos = sp;
      nodes.setDrag(dragId, sp.x, sp.y);
      d.ui.drawGuides(sp.guides);
    } else if (mode === 'connect') {
      const v = nodes.hit(w.x, w.y, tolFor(e.pointerType) * 2);
      connectTarget = v && v !== connectFrom ? v : null;
      const ok = connectTarget ? (d.connectCheck ? d.connectCheck(connectFrom.id, connectTarget.id) : true) : true;
      d.ui.drawBand(connectFrom, w.x, w.y, connectTarget, ok);
    } else if (mode === 'pendingCanvas' && d.ghost.type()) {
      d.ghost.pointer(w.x, w.y);
    }
  }

  function onUp(e) {
    const p = local(e);
    const had = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (mode === 'pinch') {
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        start = { x: rest.x, y: rest.y, t: performance.now(), type: rest.type, w: camera.screenToWorld(rest.x, rest.y) };
        mode = 'pan'; samples = [];
      } else if (!pointers.size) mode = 'idle';
      return;
    }
    if (!had) return;
    clearTimeout(longTimer);
    const w = camera.screenToWorld(p.x, p.y);
    const type = e.pointerType;
    if (mode === 'pendingNode') {
      emit('node:tap', { id: start.id });
    } else if (mode === 'pendingCanvas' && start && start.button !== 2) {
      if (d.ghost.type()) {
        const g = d.ghost.place();
        emit('canvas:tap', { x: g.x, y: g.y, sx: p.x, sy: p.y, edgeId: g.edgeId || null });
      } else {
        const ev = edges.hit(w.x, w.y, tolFor(type) * 2);
        if (ev) emit('edge:tap', { id: ev.id });
        else {
          const sp = snapPos(w.x, w.y, null);
          emit('canvas:tap', { x: sp.x, y: sp.y, sx: p.x, sy: p.y });
          const now = performance.now();
          if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
            d.fit(); lastTap.t = 0;
          } else lastTap = { t: now, x: p.x, y: p.y };
        }
      }
    } else if (mode === 'pan') {
      const t = performance.now();
      const first = samples[0];
      if (first && t - first.t > 0 && t - samples[samples.length - 1].t < 60) {
        camera.fling((p.x - first.x) / (t - first.t), (p.y - first.y) / (t - first.t));
      }
    } else if (mode === 'drag' && dragId) {
      const v = nodes.views.get(dragId);
      const pos = dragPos || (v ? { x: v.x, y: v.y } : null);
      d.ui.clearGuides();
      if (pos && v && (pos.x !== v.tx || pos.y !== v.ty)) {
        nodes.endDrag(dragId, true);
        emit('node:dragend', { id: dragId, x: pos.x, y: pos.y });
      } else nodes.cancelDrag(dragId);
    } else if (mode === 'connect') {
      // The final move can be coalesced, so resolve the target at release.
      const v = nodes.hit(w.x, w.y, tolFor(type) * 2);
      d.ui.clearBand();
      if (v && v !== connectFrom) emit('connect', { from: connectFrom.id, to: v.id });
    }
    dragId = null; dragPos = null; connectFrom = null; connectTarget = null;
    mode = 'idle';
    setCursor('default');
    updateHover(p, type);
  }

  function onCancel(e) {
    pointers.delete(e.pointerId);
    cancelGesture();
  }

  function onWheel(e) {
    e.preventDefault();
    rect = canvas.getBoundingClientRect();
    const p = local(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 100;
    emit('view:manual');
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(dy) * 1.5) { camera.panBy(-e.deltaX, 0); return; }
    const k = e.ctrlKey ? 0.01 : 0.0018;
    camera.zoomBy(Math.exp(-dy * k), p.x, p.y);
  }

  function onContext(e) {
    e.preventDefault();
    rect = canvas.getBoundingClientRect();
    const p = local(e);
    const w = camera.screenToWorld(p.x, p.y);
    const v = nodes.hit(w.x, w.y, tolFor('mouse'));
    if (v) emit('node:longpress', { id: v.id, x: p.x, y: p.y });
  }

  function dragType(e) {
    const types = [...(e.dataTransfer?.types || [])];
    const tagged = types.find(t => t.startsWith(DND_PREFIX));
    if (tagged) return tagged.slice(DND_PREFIX.length);
    return types.includes(DND_TYPE) ? '' : null;
  }

  function onDragOver(e) {
    const t = dragType(e);
    if (t === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    rect = canvas.getBoundingClientRect();
    const p = local(e);
    const w = camera.screenToWorld(p.x, p.y);
    if (t) d.ghost.preview(t, w.x, w.y);
  }

  function onDragLeave() { d.ghost.endPreview(); }

  function onDrop(e) {
    const t0 = dragType(e);
    if (t0 === null) return;
    e.preventDefault();
    const type = e.dataTransfer.getData(DND_TYPE) || t0 || e.dataTransfer.getData('text/plain');
    rect = canvas.getBoundingClientRect();
    const p = local(e);
    const w = camera.screenToWorld(p.x, p.y);
    const g = d.ghost.dropAt(type, w.x, w.y);
    d.ghost.endPreview();
    if (type) emit('canvas:drop', { type, x: g.x, y: g.y, edgeId: g.edgeId || null });
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }
  function onKeyDown(e) {
    if (isTyping(e)) return;
    if (e.code === 'Space') spaceDown = true;
    if (e.key === 'Escape' && (mode === 'connect' || mode === 'drag')) cancelGesture();
  }
  function onKeyUp(e) { if (e.code === 'Space') spaceDown = false; }
  function onLeave(e) {
    if (e.pointerType === 'mouse' && !pointers.size) { nodes.setHover(null); d.ui.setPortRing(activeRingNode('mouse'), false); hoverWorld = null; }
  }
  function onBlur() { spaceDown = false; }

  const opts = { passive: false };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, opts);
  canvas.addEventListener('contextmenu', onContext);
  host.addEventListener('dragover', onDragOver);
  host.addEventListener('dragleave', onDragLeave);
  host.addEventListener('drop', onDrop);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    snapPos,
    get mode() { return mode; },
    get hoverWorld() { return hoverWorld; },
    refreshRect() { rect = canvas.getBoundingClientRect(); },
    cancel: cancelGesture,
    destroy() {
      clearTimeout(longTimer);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel, opts);
      canvas.removeEventListener('contextmenu', onContext);
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('dragleave', onDragLeave);
      host.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

