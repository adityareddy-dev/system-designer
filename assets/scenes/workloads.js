// A small recurring cast connects a technical mechanism to the people waiting on it.
import { sceneMarkup } from './index.js';
const byLesson = {
 intro:'notification','requests-and-latency':'rider','back-of-envelope':'checkout',
 'load-balancing':'rider',caching:'checkout',cdn:'notification',autoscaling:'checkout',
 'replication-lag':'notification',sharding:'clocks','hot-keys':'checkout','search-indexing':'notification','storage-tiers':'oncall',
 'queues-backpressure':'clocks',fanout:'notification','realtime-connections':'rider',
 consistency:'checkout','idempotency-retries':'checkout','rate-limiting':'notification','circuit-breakers':'oncall',
 'multi-region':'rider',observability:'oncall',cost:'oncall','security-compliance':'oncall','ai-serving':'notification',
 'consistent-hashing':'oncall','copies-quorums':'checkout','leader-consensus':'clocks','consistency-models':'checkout',
 'storage-engine':'oncall','work-across-services':'checkout','ordering-time':'clocks','device-sync':'notification',
 'privacy-design':'notification','metrics-systems':'oncall','logs-traces':'oncall','slos-error-budgets':'oncall',
 'multi-tenancy':'clocks','lead-interview':'notification','simplest-design':'oncall','running-migrations':'oncall','team-boundaries':'clocks',
};
export const lessonScene = id => 'people-'+(byLesson[id]||'notification');
export function workloadScene(problem,group){
 const id=problem.id;
 if(/schedul|calendar|clock|enrollment|exam|matchmaking/.test(id))return 'people-clocks';
 if(/notification|sms|email|chat|social|feed|comments|stories/.test(id))return 'people-notification';
 if(/payment|billing|payroll|ledger|wallet|stock|cart|sale|marketplace|reservation|booking|ticket|pharmacy/.test(id))return 'people-checkout';
 if(/ride|routing|tracking|fleet|delivery|charging|maps/.test(id))return 'people-rider';
 return 'people-'+({commerce:'checkout',fintech:'checkout',mobility:'rider',travel:'rider',devtools:'oncall',iot:'clocks',civic:'clocks',productivity:'clocks',games:'notification',core:'oncall'}[group]||'notification');
}
export function workloadMarkup(problem,group){return sceneMarkup(workloadScene(problem,group));}
