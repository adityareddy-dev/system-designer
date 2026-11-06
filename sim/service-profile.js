// A problem can state the measured quota and price of an external dependency.
export function serviceElement(catalog, problem, type) {
  const el = catalog.elementById.get(type), profile = problem?.services?.[type];
  if (!el || el.kind !== 'external' || !profile) return el;
  return { ...el, ...profile, id: el.id, kind: el.kind, handles: el.handles, completes: el.completes, knobs: el.knobs, units: el.units };
}
