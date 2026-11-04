// Which designs count as the shipped editorial (not listed) and which are a player's own, on the URL shortener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../replay-core.js';
import { closestShipped } from '../similar.js';
import { editorialGraph } from './helpers.js';

const game = await loadGame();
const p = game.problemById.get('url-shortener');
const verdict = (graph) => closestShipped(graph, p, game.catalog);

function graph(parts, wires) {
  const nodes = [
    { id: 'users', type: 'web-browser', x: 0, y: 0, units: 1, zones: 1, knobs: {}, locked: true },
    { id: 'app', type: 'mobile-app', x: 0, y: 0, units: 1, zones: 1, knobs: {}, locked: true },
    ...parts.map(([id, type, units = 1, zones = 1, knobs = {}]) => ({ id, type, x: 0, y: 0, units, zones, knobs })),
  ];
  return { nodes, edges: wires.map(([from, to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' })) };
}
const edit = (fn) => { const g = editorialGraph(p); fn(g); return g; };
const drop = (g, types) => {
  const gone = new Set(g.nodes.filter((n) => types.includes(n.type)).map((n) => n.id));
  g.nodes = g.nodes.filter((n) => !gone.has(n.id));
  g.edges = g.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
};

test('the editorial and mechanical edits of it are copies', () => {
  const cases = {
    'as shipped': editorialGraph(p),
    'another editorial design': editorialGraph(p, 1),
    'one size nudged': edit((g) => { g.nodes.find((n) => n.id === 'api').units += 1; }),
    'every size doubled': edit((g) => { for (const n of g.nodes) if (!n.locked) n.units *= 2; }),
    'unconnected parts added': edit((g) => { for (let i = 0; i < 10; i++) g.nodes.push({ id: 'pad' + i, type: 'vm-fleet', x: 0, y: 0, units: 5, zones: 1, knobs: {} }); }),
    'VMs swapped for containers': edit((g) => { g.nodes.find((n) => n.id === 'api').type = 'container-cluster'; }),
    'monitoring taken out': edit((g) => drop(g, ['metrics', 'alerting'])),
    'monitoring out and VMs swapped': edit((g) => { drop(g, ['metrics', 'alerting']); g.nodes.find((n) => n.id === 'api').type = 'container-cluster'; }),
    'CDN taken out': edit((g) => drop(g, ['cdn'])),
  };
  for (const [label, g] of Object.entries(cases)) {
    const v = verdict(g);
    assert.equal(v.copy, true, `${label}: ${JSON.stringify(v)}`);
    assert.equal(v.kind, 'editorial', label);
  }
});

test('the bare starter, or parts wired to nothing, is the starter', () => {
  const bare = graph([], []);
  assert.deepEqual([verdict(bare).copy, verdict(bare).kind], [true, 'starter']);
  const idle = graph([['x', 'vm-fleet', 4]], []);
  assert.deepEqual([verdict(idle).copy, verdict(idle).kind], [true, 'starter']);
});

test('designs a player draws are their own when the wiring is their own', () => {
  const cases = {
    // CDN, load balancer, app servers, cache, database and monitoring, with sizes of the player's own choosing
    'textbook with a CDN': graph(
      [['edge', 'cdn', 1, 1, { ttlSec: 600 }], ['lb', 'regional-lb', 1, 3], ['web', 'vm-fleet', 8, 3], ['hot', 'distributed-cache', 2], ['db', 'kv-store', 2], ['m', 'metrics'], ['a', 'alerting']],
      [['users', 'edge'], ['app', 'edge'], ['edge', 'lb'], ['lb', 'web'], ['web', 'hot'], ['hot', 'db'], ['web', 'm'], ['m', 'a']]),
    serverless: graph(
      [['gw', 'api-gateway'], ['fn', 'serverless-fn'], ['db', 'document-db', 3]],
      [['users', 'gw'], ['app', 'gw'], ['gw', 'fn'], ['fn', 'db']]),
    'one big box': graph([['web', 'vm-fleet', 12, 2]], [['users', 'web'], ['app', 'web']]),
  };
  for (const [label, g] of Object.entries(cases)) {
    const v = verdict(g);
    assert.equal(v.copy, false, `${label}: ${JSON.stringify(v)}`);
  }
});

test('the same wiring shape is a copy, whatever the sizes or monitoring parts', () => {
  const cases = {
    // the wiring of the third editorial design (load balancer, servers, cache, database) with sizes of the player's own
    'same wiring, own sizes': graph(
      [['lb', 'regional-lb'], ['web', 'vm-fleet', 4], ['hot', 'distributed-cache', 2], ['db', 'kv-store'], ['m', 'metrics'], ['a', 'alerting']],
      [['users', 'lb'], ['app', 'lb'], ['lb', 'web'], ['web', 'hot'], ['hot', 'db'], ['web', 'm'], ['m', 'a']]),
    'sizes scaled unevenly': edit((g) => { let i = 0; for (const n of g.nodes) if (!n.locked) n.units = (n.units || 1) * (i++ % 2 ? 3 : 1.5); }),
    'zones and tiers changed': edit((g) => { for (const n of g.nodes) if (!n.locked) { n.zones = 3; n.tier = 'L'; } }),
    'every size x1.5': edit((g) => { for (const n of g.nodes) if (!n.locked) n.units = (n.units || 1) * 1.5; }),
    'every size x3 and zones kept': edit((g) => { for (const n of g.nodes) if (!n.locked) n.units = (n.units || 1) * 3; }),
    'monitoring swapped for logs and traces': edit((g) => { for (const n of g.nodes) { if (n.type === 'metrics') n.type = 'logs'; if (n.type === 'alerting') n.type = 'traces'; } }),
    'x1.5 with monitoring swapped': edit((g) => { for (const n of g.nodes) if (!n.locked) { n.units = (n.units || 1) * 1.5; if (n.type === 'metrics') n.type = 'logs'; } }),
  };
  for (const [label, g] of Object.entries(cases)) {
    const v = verdict(g);
    assert.equal(v.copy, true, `${label}: ${JSON.stringify(v)}`);
  }
});
