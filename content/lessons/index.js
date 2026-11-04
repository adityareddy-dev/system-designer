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

export const lessons = [
  intro, requestsAndLatency, backOfEnvelope,
  loadBalancing, caching, cdn, autoscaling,
  replicationLag, sharding, hotKeys, searchIndexing, storageTiers,
  queuesBackpressure, fanout, realtimeConnections,
  consistency, idempotencyRetries,
  rateLimiting, circuitBreakers, multiRegion, observability,
  cost, securityCompliance, aiServing,
];
export const lessonById = new Map(lessons.map((l) => [l.id, l]));
export default { lessons, lessonById };
