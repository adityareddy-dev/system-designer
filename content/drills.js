// Mechanism-specific drill cases use plausible competing policies and arithmetic mistakes.
import { transferFor } from './transfers.js';
const numericMistakes = {
  'requests-and-latency': [20,80,90], 'back-of-envelope': [8000,750,4500],
  'load-balancing': [60,100,75], caching: [1800,2000,20], autoscaling: [8,7,40], cdn: [950,1000,5],
  'replication-lag': [300,150,1200], sharding: [8000,2000,16000], 'hot-keys': [9900,10000,10],
  'search-indexing': [40,8,400], 'storage-tiers': [20,600,280], 'queues-backpressure': [15,20,200],
  fanout: [1,100000000,1000], 'realtime-connections': [50000,40000,20000], consistency: [4,100,80],
  'idempotency-retries': [2000,0,500], 'rate-limiting': [100,25,300], 'circuit-breakers': [100,10,10000],
  'multi-region': [5000,8000,16000], observability: [200,6000,1200], cost: [800,40,10],
  'security-compliance': [100,360000,60], 'ai-serving': [40,20,10000],
  'consistent-hashing': [1.25,4,5], 'copies-quorums': [0,2,3], 'leader-consensus': [3,2,7],
  'consistency-models': [.04,25,100], 'storage-engine': [5,10,45], 'work-across-services': [240,600,150],
  'ordering-time': [6,4,20], 'device-sync': [8000,20,4], 'privacy-design': [28800,1200,1024],
  'metrics-systems': [8000,160000,100], 'logs-traces': [2,10,2000], 'slos-error-budgets': [.06,60,3],
  'multi-tenancy': [3000,30,300], 'lead-interview': [278,192000000,3000000],
  'simplest-design': [90000,54000,126000], 'running-migrations': [60000,1000,33.3333], 'team-boundaries': [2.5,260,65]
};
const alternatives = {
  'requests-and-latency': ['Move the app to Europe and keep the authoritative database in the US', 'Move both the app and its data to Europe', 'Reduce database processing from 20 ms to 10 ms in the US'],
  'back-of-envelope': ['6 servers', '7 servers', '8 servers'],
  'load-balancing': ['Skip it and share among three healthy servers', 'Wait for the failed quarter to time out before redistributing it', 'Route to the survivors but keep each at its previous 600/s limit'],
  caching: ['A 5 minute TTL with jittered expiry', 'A 30 second TTL and enough database capacity for misses', 'A 30 second refresh interval without bounding how long stale values may be served'],
  autoscaling: ['Raise the ceiling just before launch and scale on CPU', 'Start spare servers before the launch', 'Use a faster alarm but keep the same startup time and initial pool'],
  cdn: ['Both, keyed only by URL and protected with encryption', 'Only the public image', 'Both, using a long TTL to protect origin capacity'],
  'replication-lag': ['Choose the replica with the lowest network latency', 'The primary or a replica confirmed caught up', 'Wait one second, then use the least busy replica'],
  sharding: ['Redistributes that customer evenly without changing the key', 'Leaves that hot customer on one shard', 'Divides all writes by the new shard count, including this customer'],
  'hot-keys': ['Add shards while keeping the same partition key', 'Cache that profile with a freshness policy', 'Add write replicas while continuing to read from the same shard'],
  'search-indexing': ['Wait for one index refresh and assume the record is visible', 'Read the source record by ID', 'Confirm success from an empty cached search result'],
  'storage-tiers': ['Keep recent and old data hot but reduce durability copies', 'Archive everything immediately and accept restores on common reads', 'Keep recent records hot and archive older records with a restore plan'],
  'queues-backpressure': ['The backlog grows at 600 jobs/s', 'The backlog drains', 'It drains at the full 800 jobs/s worker rate'],
  fanout: ['Precompute every follower entry, including inactive followers', 'Use a hybrid and assemble celebrity posts on read', 'Fan out to every follower through a queue and assume that removes the total work'],
  'realtime-connections': ['Scale on CPU because idle sockets need no processing', 'Connection count as well as processing load', 'Use only incoming requests/s and ignore existing sockets'],
  consistency: ['Accept writes on both sides and reconcile by wall-clock timestamp', 'Keep one authoritative writer and reject writes that cannot reach it', 'Confirm writes on a local replica and reconcile balances later'],
  'idempotency-retries': ['Generate a new key after a timeout so it can be retried', 'The same operation key stored atomically with the effect', 'Reuse the key but save it in a separate write after charging'],
  'rate-limiting': ['Give each server a local 100/s allowance and reconcile every second', 'Use shared atomic counters or carefully divided quotas', 'Read a shared counter, admit the request, then increment without an atomic operation'],
  'circuit-breakers': ['Retry timeouts immediately once to hide transient failures', 'Bound the wait, open the circuit, and probe recovery', 'Raise timeouts to avoid false failures while keeping an unbounded waiting pool'],
  'multi-region': ['Its normal half, since routing already spreads the load', 'Enough for the whole workload with spare room', 'Its normal half plus 25% of total traffic'],
  observability: ['Average worker CPU over the full day', 'Queue age and end-to-end latency', 'Accepted enqueue rate without completion or queue-age measurements'],
  cost: ['Keep the full fleet because peak CPU once reached 80%', 'Lower the minimum, retain a warm pool and test scale-up delay', 'Shrink the floor using average load without replaying startup and failure conditions'],
  'security-compliance': ['A tamper-evident audit trail tied to identity', 'Encrypted records without retaining the actor or change history', 'Access logs that can be edited by the same account that changes the records'],
  'ai-serving': ['Keep accepting work because eventual completion maximizes good responses', 'Bound the queue and use a smaller fallback when necessary', 'Raise the timeout while leaving the 500 ms product target unchanged']
};
export function drillCase(id) {
  const test = transferFor(id);
  return test ? { ...test, mistakes: numericMistakes[id], ...(alternatives[id] ? { choices: alternatives[id] } : {}) } : null;
}
