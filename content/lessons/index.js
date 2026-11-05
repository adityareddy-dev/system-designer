// Lessons in track order (DESIGN 3.1). Each file exports one lesson object.
import intro from './intro.js';
import requestsAndLatency from './requests-and-latency.js';
import backOfEnvelope from './back-of-envelope.js';
import loadBalancing from './load-balancing.js';
import caching from './caching.js';
import cdn from './cdn.js';
import autoscaling from './autoscaling.js';
import replicationLag from './replication-lag.js';
import sharding from './sharding.js';
import hotKeys from './hot-keys.js';
import searchIndexing from './search-indexing.js';
import storageTiers from './storage-tiers.js';
import queuesBackpressure from './queues-backpressure.js';
import fanout from './fanout.js';
import realtimeConnections from './realtime-connections.js';
import consistency from './consistency.js';
import idempotencyRetries from './idempotency-retries.js';
import rateLimiting from './rate-limiting.js';
import circuitBreakers from './circuit-breakers.js';
import multiRegion from './multi-region.js';
import observability from './observability.js';
import cost from './cost.js';
import securityCompliance from './security-compliance.js';
import aiServing from './ai-serving.js';

import consistentHashing from './consistent-hashing.js';
import copiesQuorums from './copies-quorums.js';
import leaderConsensus from './leader-consensus.js';
import consistencyModels from './consistency-models.js';
import storageEngine from './storage-engine.js';
import workAcrossServices from './work-across-services.js';
import orderingTime from './ordering-time.js';
import deviceSync from './device-sync.js';
import privacyDesign from './privacy-design.js';
import metricsSystems from './metrics-systems.js';
import logsTraces from './logs-traces.js';
import slosErrorBudgets from './slos-error-budgets.js';
import multiTenancy from './multi-tenancy.js';
import leadInterview from './lead-interview.js';
import simplestDesign from './simplest-design.js';
import runningMigrations from './running-migrations.js';
import teamBoundaries from './team-boundaries.js';

export const lessons = [
  intro, requestsAndLatency, backOfEnvelope,
  loadBalancing, caching, cdn, autoscaling,
  replicationLag, sharding, hotKeys, searchIndexing, storageTiers,
  queuesBackpressure, fanout, realtimeConnections,
  consistency, idempotencyRetries,
  rateLimiting, circuitBreakers, multiRegion, observability,
  cost, securityCompliance, aiServing,
  consistentHashing, copiesQuorums, leaderConsensus, consistencyModels,
  storageEngine, workAcrossServices, orderingTime, deviceSync, privacyDesign,
  metricsSystems, logsTraces, slosErrorBudgets, multiTenancy,
  leadInterview, simplestDesign, runningMigrations, teamBoundaries,
];
export const lessonById = new Map(lessons.map((l) => [l.id, l]));
export default { lessons, lessonById };
