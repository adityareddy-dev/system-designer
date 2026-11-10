// Cost claims cut the same measured fleet they name, across every reference workload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems } from '../content/problems/index.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { defenseQuestions } from '../ui/play/interview.js';
import { checkClaim } from '../content/problems/defense-claims.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(new URL(`../catalog/${k}.json`, import.meta.url)))])));
let count = 0;
for (const problem of problems) for (const design of problem.editorial.designs) {
  const sim = createSim({ catalog, problem });
  sim.loadGraph(design.graph); sim.start(); sim.advance(86400000);
  const result = sim.result(), graph = result.graph;
  const fleet = graph.nodes.filter(n => catalog.elementById.get(n.type).units.max > 1 && catalog.elementById.get(n.type).cost?.perUnit)
    .sort((a,b) => result.nodes.find(n => n.id === b.id).usd - result.nodes.find(n => n.id === a.id).usd)[0];
  for (const claim of defenseQuestions(problem, graph, result, catalog).find(q => q.kind === 'cost').claims) {
    assert.equal(claim.nodeId, fleet?.id, problem.id + ' selects the largest measured fleet including tier prices');
    if (fleet) {
      assert(claim.text.includes(`(${fleet.id})`), problem.id + ' names the fleet in the committed claim');
      const replay = checkClaim(claim, { problem, graph, result, catalog });
      assert(replay.steps.some(s => s.startsWith('Cut ') && s.includes(`(${fleet.id})`)), problem.id + ' replays that cut');
    }
    count++;
  }
}
console.log(`${problems.length} workloads, ${count} cost claims name and cut their largest measured paid fleet.`);
