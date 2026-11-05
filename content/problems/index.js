// Problem bank: imports every group file, removes duplicate ids, and files each problem under its industry group.
import { groups as mediaSocial } from './media-social.js';
import money from './money.js';
import healthGovEdu from './health-gov-edu.js';
import realWorld from './real-world.js';
import platformsDev from './platforms-dev.js';
import moreEasy from './more-easy.js';
import hardPicks from './hard-picks.js';
import coverage from './coverage.js';
import hardMore from './hard-more.js';
import hardMoreTelecom from './hard-more-telecom.js';
import fixes from './fixes.js';
import calibration from './calibration.js';
import { applyCalibration } from './calibrate.js';
import twists from './twists.js';
import { twistEvents } from './twist-events.js';
import { applyEvidence } from './evidence.js';
import correctness from './correctness.js';
import deeper from './deeper.js';
import conceptLinks from './concept-links.js';

// Industry groups in display order (CONTRACT 11.1).
const GROUPS = [
  { id: 'core', title: 'Core building blocks', blurb: 'The small services every product leans on: links, limits, search boxes and notifications.' },
  { id: 'media', title: 'Media and streaming', blurb: 'Photos, music, podcasts, news and video: big files, huge crowds and a bandwidth bill.' },
  { id: 'social', title: 'Social and messaging', blurb: 'Likes, chats, stories and feeds: tiny messages with enormous fanout.' },
  { id: 'fintech', title: 'Finance and payments', blurb: 'Money moves: every write must land exactly once and survive a failure.' },
  { id: 'health', title: 'Healthcare', blurb: 'Bookings, records and video visits, with privacy rules and sudden crowds.' },
  { id: 'civic', title: 'Government and education', blurb: 'Deadline days and exam mornings, when everyone arrives at the same minute.' },
  { id: 'mobility', title: 'Mobility and logistics', blurb: 'Drivers, trucks and parcels sending their position every few seconds.' },
  { id: 'travel', title: 'Travel and events', blurb: 'Seats, rooms and tickets: a few hot items and many people trying for them.' },
  { id: 'iot', title: 'IoT and devices', blurb: 'Millions of small devices that wake up together.' },
  { id: 'ai', title: 'AI, ads and search', blurb: 'Model serving, ranking and auctions inside a tight time budget.' },
  { id: 'games', title: 'Games', blurb: 'Leaderboards and matchmaking where every player wants an answer now.' },
  { id: 'productivity', title: 'Productivity', blurb: 'Files, documents and mail that people trust to never lose a word.' },
  { id: 'commerce', title: 'Commerce and retail', blurb: 'Shopping carts and sale days: lots of browsing, few buys, and every unit of stock counted once.' },
  { id: 'telecom', title: 'Telecom and messaging', blurb: 'Texts and calls: carriers with hard limits, and codes that must arrive in seconds.' },
  { id: 'devtools', title: 'Developer platforms', blurb: 'Builds, flags and metrics: the tools that run the other tools.' },
];

// Problem id → group id. Ids not listed stay in their file's group if it is one of the above, else 'core'.
const GROUP_OF = {
  'url-shortener': 'core', 'rate-limiter-service': 'core', 'search-autocomplete': 'core', 'notification-service': 'core',
  'appointment-booking': 'health', 'lab-results': 'health', 'health-records': 'health', 'telehealth-video': 'health', 'pharmacy-stock': 'health', 'vaccine-signup-surge': 'health',
  'benefits-portal': 'civic', 'course-enrollment-day': 'civic', 'online-exam': 'civic', 'tax-deadline-surge': 'civic',
  'package-tracking': 'mobility', 'fleet-telemetry': 'mobility', 'food-delivery': 'mobility', 'ride-hailing-dispatch': 'mobility', 'maps-routing': 'mobility',
  'hotel-booking': 'travel', 'airline-booking': 'travel', 'concert-ticket-drop': 'travel',
  'smart-home-hub': 'iot', 'smart-power-grid': 'iot',
  'recommendations': 'ai', 'ad-serving': 'ai', 'ai-chatbot-serving': 'ai',
  'leaderboards': 'games', 'matchmaking': 'games', 'job-scheduler': 'core', 'firmware-rollout': 'iot', 'battle-royale': 'games',
  'file-sync': 'productivity', 'collaborative-docs': 'productivity', 'email-service': 'productivity',
  'restaurant-reservations': 'travel', 'ev-charging-network': 'iot', 'industrial-sensors': 'iot', 'semantic-search': 'ai', 'game-patch-day': 'games', 'calendar-invites': 'productivity', 'status-page': 'devtools',
  'shopping-cart': 'commerce', 'flash-sale-inventory': 'commerce', 'login-sso': 'core', 'clickstream-analytics': 'devtools', 'otp-sms-delivery': 'telecom', 'call-routing': 'telecom', 'object-storage': 'core',
  'black-friday-marketplace': 'commerce', 'bulk-sms-campaigns': 'telecom',
  'ci-cd-pipeline': 'devtools', 'feature-flag-service': 'devtools', 'observability-platform': 'devtools',
  'logs-platform': 'devtools', 'tracing-platform': 'devtools', 'tenant-metrics': 'devtools',
  'device-notes': 'productivity', 'wearable-health': 'health',
};

const files = [...mediaSocial, money, healthGovEdu, realWorld, platformsDev, moreEasy, hardPicks, coverage, hardMore, hardMoreTelecom, deeper];

// Request sources stacked in one column sit at least 140 px apart, so their names never overlap on the canvas.
function spaceSources(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return graph;
  const cols = new Map();
  for (const n of graph.nodes) if (n.locked) { const k = Math.round(n.x / 40); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(n); }
  let nodes = graph.nodes;
  for (const list of cols.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.y - b.y);
    const tight = list.some((n, i) => i > 0 && n.y - list[i - 1].y < 130);
    if (!tight) continue;
    const mid = list.reduce((a, n) => a + n.y, 0) / list.length;
    const at = new Map(list.map((n, i) => [n, Math.round(mid + (i - (list.length - 1) / 2) * 140)]));
    nodes = nodes.map((n) => (at.has(n) ? { ...n, y: at.get(n) } : n));
  }
  return nodes === graph.nodes ? graph : { ...graph, nodes };
}
// Reference designs load exactly as written: no zones on parts that have no zones setting, and no two parts closer
// than the board allows (132 by 112, the same spacing the board enforces when a part is dropped), so loading one
// never moves a part. Locked sources stay put; each later part takes the nearest free spot, ties going right.
const NO_ZONES = new Set(['kv-store', 'cdc-connector']);
const GAP_X = 132, GAP_Y = 112;
function tidyParts(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return graph;
  let changed = false;
  const free = (placed, x, y) => !placed.some((q) => Math.abs(q.x - x) < GAP_X && Math.abs(q.y - y) < GAP_Y);
  const cand = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) if (i || j) cand.push([i * 40, j * 40]);
  cand.sort((p, q) => Math.hypot(p[0], p[1] * 1.2) + (p[0] < 0 ? 1 : 0) - Math.hypot(q[0], q[1] * 1.2) - (q[0] < 0 ? 1 : 0));
  const placed = graph.nodes.filter((n) => n.locked).map((n) => ({ x: n.x, y: n.y }));
  const at = new Map();
  const order = graph.nodes.filter((n) => !n.locked).sort((a, b) => a.x - b.x || a.y - b.y);
  for (const n of order) {
    let { x, y } = n;
    if (!free(placed, x, y)) {
      const hit = cand.find(([dx, dy]) => free(placed, x + dx, y + dy));
      if (hit) { x += hit[0]; y += hit[1]; }
    }
    if (x !== n.x || y !== n.y) at.set(n, { x, y });
    placed.push({ x, y });
  }
  const nodes = graph.nodes.map((n) => {
    let m = at.has(n) ? { ...n, ...at.get(n) } : n;
    if (m.zones != null && NO_ZONES.has(m.type)) { const { zones, ...rest } = m; m = rest; }
    if (m !== n) changed = true;
    return m;
  });
  return changed ? { ...graph, nodes } : graph;
}
function spaced(p) {
  const out = { ...p, starter: spaceSources(p.starter) };
  if (p.editorial?.designs) out.editorial = { ...p.editorial, designs: p.editorial.designs.map((d) => ({ ...d, graph: tidyParts(spaceSources(d.graph)) })) };
  return out;
}
const known = new Set(GROUPS.map((g) => g.id));
const byGroup = new Map(GROUPS.map((g) => [g.id, []]));
const problemById = new Map();

for (const file of files) {
  for (const p of file.problems || []) {
    if (!p || !p.id || problemById.has(p.id)) continue;
    const gid = GROUP_OF[p.id] || (known.has(file.group?.id) ? file.group.id : 'core');
    const prob = { ...spaced(applyEvidence(applyCalibration(applyCalibration(p, fixes[p.id]), calibration[p.id]))), group: gid };
    if (conceptLinks[p.id]) prob.concepts = [...new Set([...prob.concepts, ...conceptLinks[p.id]])];
    if (correctness[p.id]) prob.correctness = correctness[p.id];
    // the "new twist" replay: the same problem with its events moved and one more added (tools/gen-twists.mjs)
    const tw = twists[p.id];
    if (tw && !tw.none) prob.twist = { shiftMin: tw.shiftMin, extra: tw.extra, events: twistEvents(prob, tw) };
    problemById.set(p.id, prob);
    byGroup.get(gid).push(prob);
  }
}

const DIFF = { Easy: 0, Medium: 1, Hard: 2 };
export const groups = GROUPS
  .map((g) => ({ ...g, problems: byGroup.get(g.id).sort((a, b) => (DIFF[a.difficulty] ?? 1) - (DIFF[b.difficulty] ?? 1)) }))
  .filter((g) => g.problems.length);
export const problems = groups.flatMap((g) => g.problems);
export { problemById };
// The raw group files, for tools that re-measure the calibration.
export const sourceFiles = files;
export { fixes };
export default { groups, problems, problemById };
