// Draw controls for following one request type before starting the day.
import { h } from './util.js';

export function createRouteTrace(root, catalog, scene) {
  const select = h('select', { class: 'pl-input', 'aria-label': 'Request type to trace' });
  const output = h('div', { class: 'pl-trace-output', 'aria-live': 'polite' });
  const el = h('details', { class: 'pl-trace', hidden: true }, h('summary', {}, 'Trace a request'),
    h('label', {}, 'Request type ', select), h('p', { class: 'pl-muted', text: 'Highlighted connections carry this type, including cache misses and side calls. Capacity and events are checked during the day.' }), output);
  root.append(el);
  let sim = null, mixKey = '';
  function paint() {
    scene.setTrace([]);
    output.replaceChildren();
    if (!sim || el.hidden || !el.open || !select.value) return;
    const trace = sim.trace(select.value), graph = sim.getGraph();
    const name = (id) => { const n = graph.nodes.find((n) => n.id === id); return n?.label || catalog.elementById.get(n?.type)?.name || id; };
    scene.setTrace(trace.edgeIds);
    output.append(h('p', { text: trace.edgeIds.length ? 'Parts reached: ' + trace.nodeIds.map(name).join(', ') : 'No connections carry this request type.' }));
    for (const stop of trace.stops) output.append(h('p', { text: `${name(stop.nodeId)}: ${stop.reason}` }));
    for (const hop of trace.rejected) output.append(h('p', { text: `${name(hop.from)} → ${name(hop.to)}: ${hop.reason} Carries: ${hop.carries.map((id) => catalog.requestById.get(id)?.plural || id).join(', ') || 'no request types with the current wiring'}. Path to this hop: ${hop.path.map(name).join(' → ')}.` }));
    if (trace.repair) output.append(h('p', { text: `Connect ${name(trace.repair.from)} to ${name(trace.repair.to)}. Complete repair path: ${trace.repair.path.map(name).join(' → ')}. Side calls stay beside this delivery path.` }));
  }
  select.addEventListener('change', paint);
  el.addEventListener('toggle', paint);
  return {
    update(nextSim, mix, visible) {
      sim = nextSim;
      el.hidden = !visible;
      const types = Object.keys(mix || {}).filter((id) => mix[id] > 0 && id !== 'attack');
      const key = types.join(',');
      if (key !== mixKey) {
        mixKey = key;
        select.replaceChildren(...types.map((id) => h('option', { value: id }, catalog.requestById.get(id)?.name || id)));
      }
      paint();
    },
  };
}
