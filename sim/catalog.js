// Catalog loader: fetches the four catalog JSON files and indexes them for the engine and the UI.

export async function loadCatalog(base = new URL('../catalog/', import.meta.url)) {
  const names = ['elements', 'requests', 'events', 'world'];
  const parts = await Promise.all(names.map(async (name) => {
    const res = await fetch(new URL(`${name}.json`, base));
    if (!res.ok) throw new Error(`Could not load catalog/${name}.json (HTTP ${res.status})`);
    return res.json();
  }));
  return createCatalog({ elements: parts[0], requests: parts[1], events: parts[2], world: parts[3] });
}

export function createCatalog({ elements, requests, events, world }) {
  const types = requests.types;
  const T = types.length;
  const typeIndex = new Map(types.map((t, i) => [t.id, i]));
  const attackIdx = typeIndex.has('attack') ? typeIndex.get('attack') : -1;

  const els = elements.elements;
  const elementById = new Map();
  const elementByCode = new Map();
  const handlesMask = new Map();
  const completesMask = new Map();
  for (const e of els) {
    elementById.set(e.id, e);
    elementByCode.set(e.code, e);
    const h = new Uint8Array(T);
    const c = new Uint8Array(T);
    for (const id of e.handles || []) {
      if (id === '*') { for (let i = 0; i < T; i++) if (i !== attackIdx) h[i] = 1; }
      else if (typeIndex.has(id)) h[typeIndex.get(id)] = 1;
    }
    for (const id of e.completes || []) if (typeIndex.has(id)) c[typeIndex.get(id)] = 1;
    handlesMask.set(e.id, h);
    completesMask.set(e.id, c);
  }

  const evs = events.events;
  const eventById = new Map(evs.map((e) => [e.id, e]));
  const requestById = new Map(types.map((t) => [t.id, t]));

  return {
    elements: els,
    elementById,
    elementByCode,
    categories: elements.categories,
    categoryById: new Map(elements.categories.map((c) => [c.id, c])),
    kinds: elements.kinds,
    knobs: elements.knobs,
    requests: types,
    requestById,
    families: requests.families,
    typeIndex,
    events: evs,
    eventById,
    ops: events.ops,
    selectors: events.selectors,
    world,
    version: [elements.version, requests.version, events.version, world.version].join('.'),
    handlesMask,
    completesMask,
    handles(elementId, typeId) {
      const m = handlesMask.get(elementId);
      const i = typeIndex.get(typeId);
      return !!(m && i != null && m[i]);
    },
    completes(elementId, typeId) {
      const m = completesMask.get(elementId);
      const i = typeIndex.get(typeId);
      return !!(m && i != null && m[i]);
    },
    knobDefault(knob) {
      const k = elements.knobs[knob];
      return k ? k.default : undefined;
    },
  };
}
