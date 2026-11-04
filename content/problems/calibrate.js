// Applies calibration.js (figures measured from full simulated days) to a problem: requirement patches and
// reference-design patches (node sizes and knobs, added or removed parts and connections, measured expect values).

// A load balancer spread over several zones has at least one unit in each, the rule the game's own checks apply.
function zoneUnits(problem) {
  const designs = problem.editorial?.designs;
  if (!designs) return problem;
  let touched = false;
  const fixed = designs.map((d) => {
    if (!d.graph || !d.graph.nodes.some((n) => n.type === 'regional-lb' && n.zones > (n.units || 1))) return d;
    touched = true;
    return { ...d, graph: { ...d.graph, nodes: d.graph.nodes.map((n) => (n.type === 'regional-lb' && n.zones > (n.units || 1) ? { ...n, units: n.zones } : n)) } };
  });
  return touched ? { ...problem, editorial: { ...problem.editorial, designs: fixed } } : problem;
}

export function applyCalibration(problem, cal) {
  return zoneUnits(applyCalibrationRaw(problem, cal));
}

function applyCalibrationRaw(problem, cal) {
  if (!cal) return problem;
  const p = { ...problem };
  if (cal.requirements) {
    const r = { ...problem.requirements };
    for (const [k, v] of Object.entries(cal.requirements)) r[k] = v && typeof v === 'object' && !Array.isArray(v) && k !== 'mix' ? { ...(r[k] || {}), ...v } : v;
    p.requirements = r;
  }
  if (cal.events) p.events = cal.events;
  if (cal.traffic) p.traffic = { ...problem.traffic, ...cal.traffic };
  for (const k of ['brief', 'hints', 'numbers', 'clarify', 'daily']) if (cal[k] !== undefined) p[k] = cal[k];
  if (cal.designs && problem.editorial) {
    const designs = problem.editorial.designs.map((d, i) => patchDesign(d, cal.designs[i]));
    p.editorial = { ...problem.editorial, designs, ...(cal.editorial || {}) };
  }
  if (cal.textReplace) {
    const fix = (t) => (typeof t === 'string' ? cal.textReplace.reduce((acc, [a, b]) => acc.split(a).join(b), t) : t);
    p.brief = fix(p.brief);
    if (p.clarify) p.clarify = p.clarify.map((c) => ({ ...c, q: fix(c.q), a: fix(c.a) }));
    if (p.requirements?.notes) p.requirements = { ...p.requirements, notes: p.requirements.notes.map(fix) };
  }
  if (cal.designOrder && p.editorial) p.editorial = { ...p.editorial, designs: cal.designOrder.map((i) => p.editorial.designs[i]).filter(Boolean) };
  return p;
}

const key = (e) => (Array.isArray(e) ? e.join('>') : String(e));

function patchDesign(d, c) {
  if (!c) return d;
  const drop = new Set(c.removeNodes || []);
  let nodes = d.graph.nodes.filter((n) => !drop.has(n.ref)).map((n) => {
    const q = c.nodes && c.nodes[n.ref];
    if (!q) return n;
    const out = { ...n, ...q };
    if (q.knobs) out.knobs = { ...(n.knobs || {}), ...q.knobs };
    return out;
  });
  nodes = nodes.concat(c.addNodes || []);
  const cut = new Set((c.removeEdges || []).map(key));
  const edges = d.graph.edges
    .map((e) => (Array.isArray(e) ? e : String(e).split('>')))
    .filter((e) => !cut.has(key(e)) && !drop.has(e[0]) && !drop.has(e[1]))
    .concat((c.addEdges || []).map((e) => (Array.isArray(e) ? e : String(e).split('>'))));
  return { ...d, ...(c.name ? { name: c.name } : {}), ...(c.why ? { why: c.why } : {}), graph: { nodes, edges }, ...(c.expect ? { expect: c.expect } : {}) };
}
