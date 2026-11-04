// Score honesty: decodes a submitted design link, rebuilds the exact scenario (problem, seed, daily variant) and replays the day with the game's own engine.
import fs from 'node:fs';
import { closestShipped } from './similar.js';

const ROOT = new URL('../', import.meta.url);
const DAILY_SEED = /^daily-(\d{4}-\d{2}-\d{2})$/;

export class ReplayError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

let loaded = null;

// The catalog, the problem bank and the engine, loaded once per process (or worker).
export async function loadGame() {
  if (loaded) return loaded;
  const J = (f) => JSON.parse(fs.readFileSync(new URL(`catalog/${f}.json`, ROOT), 'utf8'));
  const { createCatalog } = await import(new URL('sim/catalog.js', ROOT));
  const { createSim } = await import(new URL('sim/engine.js', ROOT));
  const { problems, problemById } = await import(new URL('content/problems/index.js', ROOT));
  const { lessons } = await import(new URL('content/lessons/index.js', ROOT));
  const { dailyFor, applyVariant, isDateStr } = await import(new URL('compete/daily.js', ROOT));
  const { decodeShare } = await import(new URL('compete/share.js', ROOT));
  const catalog = createCatalog({ elements: J('elements'), requests: J('requests'), events: J('events'), world: J('world') });
  loaded = {
    catalog, createSim, problems, problemById, dailyFor, applyVariant, isDateStr, decodeShare,
    problemIds: new Set(problems.map((p) => p.id)),
    lessonIds: new Set(lessons.map((l) => l.id)),
  };
  return loaded;
}

// Resolves the board a seed belongs to: 'practice' plays the base problem, 'daily-YYYY-MM-DD' that day's variant.
export function scenarioFor(game, problemId, seed) {
  const base = game.problemById.get(problemId);
  if (!base) throw new ReplayError('unknown-problem', 'That problem is not in this version of the game.');
  if (seed === 'practice') return { board: 'p:' + problemId, kind: 'problem', problem: base, mode: 'practice', date: null };
  const m = DAILY_SEED.exec(String(seed));
  if (!m || !game.isDateStr(m[1])) throw new ReplayError('bad-seed', 'Only practice and daily challenge scores go on leaderboards.');
  const d = game.dailyFor(m[1], game.problems);
  if (d.problemId !== problemId) throw new ReplayError('not-daily', 'That problem is not the challenge for that day.');
  return { board: 'd:' + m[1], kind: 'daily', problem: game.applyVariant(base, d.variant, game.catalog), mode: 'challenge', date: m[1] };
}

// Leaderboard designs are capped well above anything a problem needs (the largest editorial design has 23 parts and
// 27 connections), so one submission can never hold the scorer for long.
export const DESIGN_CAPS = { nodes: 40, edges: 60, units: 2400 };

// Codes for designs that replay fine but do not go on a leaderboard: the shipped editorial (or a near copy) and the bare starter.
export const NOT_LISTED = new Set(['editorial-design', 'starter-design']);

const shippedCache = new Map();

// Checks a submitted link without replaying it: format, scenario, the locked starting parts, size, and whether it is a
// shipped design. Cheap enough for the request thread, so bad or copied designs never wait in the scorer's queue.
export async function prepare(payload) {
  const game = await loadGame();
  if (typeof payload !== 'string' || payload.length < 2 || payload.length > 24000 || !/^[jz][A-Za-z0-9_-]+$/.test(payload)) throw new ReplayError('bad-payload', 'That is not a design link.');
  let data;
  try { data = await game.decodeShare(payload, game.catalog); } catch (e) { throw new ReplayError('bad-payload', String(e?.message || 'That design link is not valid.').slice(0, 200)); }
  if (data.mode === 'sandbox') throw new ReplayError('bad-mode', 'Sandbox designs have no score.');
  const sc = scenarioFor(game, data.problemId, data.seed);

  // The problem's locked starting parts (the users) must be there, unchanged in type and region.
  const byId = new Map(data.graph.nodes.map((n) => [n.id, n]));
  for (const s of sc.problem.starter?.nodes || []) {
    if (!s.locked) continue;
    const n = byId.get(s.ref ?? s.id);
    if (!n || n.type !== s.type || (s.region && n.region && n.region !== s.region)) throw new ReplayError('starter-changed', 'The design must keep the problem\'s starting parts.');
  }

  const g = data.graph;
  const units = g.nodes.reduce((sum, n) => {
    const as = n.knobs?.autoscale;
    const top = as && typeof as === 'object' && as.on ? Number(as.max) || 0 : 0;
    return sum + Math.max(n.units || 1, Math.min(top, 1000));
  }, 0);
  if (g.nodes.length > DESIGN_CAPS.nodes || g.edges.length > DESIGN_CAPS.edges || units > DESIGN_CAPS.units) {
    throw new ReplayError('too-big', `Leaderboard designs can have up to ${DESIGN_CAPS.nodes} parts, ${DESIGN_CAPS.edges} connections and ${DESIGN_CAPS.units} units in all (autoscale counts at its maximum).`);
  }

  const base = game.problemById.get(data.problemId);
  const near = closestShipped(g, base, game.catalog, shippedCache);
  if (near.copy) {
    if (near.kind === 'starter') throw new ReplayError('starter-design', 'Nothing was built on the starting parts, so there is no score to list.');
    throw new ReplayError('editorial-design', 'This design is the problem\'s editorial design, or very close to it. Leaderboards list designs you make yourself.');
  }
  return { data, sc, near };
}

// payload: the same string a "beat my design" link carries. Returns the server's own score; the score inside the link is only reported back.
export async function replayPayload(payload) {
  const game = await loadGame();
  const { data, sc } = await prepare(payload);
  const sim = game.createSim({ catalog: game.catalog, problem: sc.problem, seed: data.seed, mode: sc.mode });
  try {
    sim.loadGraph(data.graph);
    sim.start();
    sim.advance(86400000);
  } catch (e) {
    throw new ReplayError('replay-failed', String(e?.message || 'The design could not be replayed.').slice(0, 200));
  }
  const r = sim.result();
  if (!r || !r.score || !Number.isFinite(r.score.total)) throw new ReplayError('replay-failed', 'The design could not be replayed.');
  return {
    board: sc.board, kind: sc.kind, date: sc.date, problemId: data.problemId, seed: data.seed,
    score: Math.max(0, Math.min(1000, Math.round(r.score.total))),
    stars: Math.max(0, Math.min(3, r.stars | 0)),
    passed: !!r.passed,
    clientScore: Math.round(data.score?.total ?? 0),
    nodes: data.graph.nodes.length,
  };
}
