// Tiny event bus shared by every module through ctx.bus.
export function createBus() {
  const map = new Map();
  const on = (name, fn) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
    return () => map.get(name)?.delete(fn);
  };
  return {
    on,
    once(name, fn) {
      const off = on(name, (p) => { off(); fn(p); });
      return off;
    },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(`bus "${name}" listener failed`, err); }
      }
    },
  };
}
