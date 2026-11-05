// Original lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "leader-consensus",
  "title": "Agreeing on one leader",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "A leader needs a safe election and a way to stop old owners from acting.",
  "steps": [
    {
      "kind": "read",
      "title": "Two schedulers both think they own the job",
      "text": "A scheduler pauses for twenty seconds. Its lease expires, so another scheduler takes over. The first wakes and sends an invoice anyway. A lease can tell the service who should own a job. It cannot stop a paused process from using an old decision. Choosing one leader and enforcing that choice are separate parts of the design.",
      "icon": "el.coordination-service"
    },
    {
      "kind": "read",
      "title": "Raft in plain words",
      "text": "Raft keeps a replicated sequence of decisions. A follower that stops hearing heartbeats becomes a candidate in a new term and asks for votes. Each voter persists at most one vote per term and only votes for a candidate whose log is sufficiently up to date. A majority elects a leader. The leader appends entries and replicates them; it can advance commit by counting a majority for an entry from its current term, which also commits the preceding log. Followers apply committed decisions in order. Elections alone are not consensus: log rules preserve decisions through later elections. This assumes crash faults, not malicious voters."
    },
    {
      "kind": "read",
      "title": "Worked example: a five-node split",
      "text": "Five voters need three. In a 3 versus 2 partition, the three can elect and commit; the two cannot. With a 2 versus 2 versus 1 split, nobody can commit. Two majorities always share a voter, but persistent voting and log rules are what make that intersection useful. An isolated old leader can still believe it is leader in an older term. It must not serve unsafe reads or issue unfenced effects. The game does not model Raft terms or logs, so this example is arithmetic, not a live election."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Five voters",
          "value": "≈ 3 replies",
          "how": "floor(5/2) + 1; tolerates two unavailable voters"
        },
        {
          "label": "Three voters",
          "value": "≈ 2 replies",
          "how": "Tolerates one unavailable voter; often enough"
        },
        {
          "label": "Fencing boundary",
          "value": "42 rejects 41",
          "how": "Durably compare tokens where the side effect is accepted"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "A five-voter cluster splits into groups of three and two. What may the two-node side do safely?",
      "choices": [
        "Elect itself with both votes",
        "Serve arbitrary latest reads as leader",
        "Reject or defer operations requiring a majority"
      ],
      "answer": 2,
      "why": "A minority cannot establish a new committed order. Cached reads need an explicit weaker promise."
    },
    {
      "kind": "defend",
      "q": "We have a majority election. How could we still send an invoice twice? Follow-up: the provider does not accept fencing tokens.",
      "checklist": [
        "Distinguish leader selection from external effects",
        "Use stable operation keys and reconciliation",
        "Admit the boundary when a provider offers no deduplication"
      ],
      "model": "A paused previous leader can send a delayed call. I would fence writes in our own store and persist one invoice operation with an outbox. A provider idempotency key should stay the same across leaders and retries. If the provider has neither idempotency nor a status lookup, we cannot prove exactly-once external sending from our election alone. We must choose and explain the duplicate-versus-missing risk and reconcile it."
    },
    {
      "kind": "read",
      "title": "Make stale ownership harmless",
      "text": "Give each ownership grant a durable increasing fencing token. The resource that accepts a write stores the highest accepted token and rejects older ones. If owner 41 pauses and owner 42 writes, a later request carrying 41 is rejected by the resource. A check in the old process is insufficient. A coordination service is useful for small shared decisions: membership, leases and ownership maps. It is a poor place for every user record or high-volume event. If a database transaction, a unique constraint or a managed queue already owns the invariant, use that instead. Keep the coordination cluster independent enough to survive the failures it must resolve."
    },
    {
      "kind": "quiz",
      "q": "The old worker checks its lease, then pauses before writing. What closes the race?",
      "choices": [
        "A fencing check at the storage resource",
        "A shorter lease alone",
        "A local boolean saying leader"
      ],
      "answer": 0,
      "why": "Only the receiver can reject a delayed request after ownership changes."
    },
    {
      "kind": "defend",
      "q": "Should every request consult the coordination service? Follow-up: its quorum is down for ten minutes.",
      "checklist": [
        "Keep coordination off the high-volume data path",
        "Define cached decisions and expiry rules",
        "Prefer bounded unavailability over conflicting ownership"
      ],
      "model": "I would cache a versioned owner map and use the coordinator for changes. Existing owners can work only within the protocol's valid authority, with receiver-side fencing. If fresh authority cannot be obtained, operations that require exclusive ownership stop. Public cached reads may continue under a separate promise. Losing a quorum should not silently create two owners. I would consider whether an existing transactional store could own this small decision more simply."
    },
    {
      "kind": "quiz",
      "q": "A SQL unique constraint already prevents two owners claiming one invoice. What justifies a new coordination cluster?",
      "choices": [
        "Any feature with more than one process",
        "A separate cross-process invariant that the database cannot reasonably own",
        "Reducing the number of failure modes automatically"
      ],
      "answer": 1,
      "why": "A new distributed service adds operational work. Start with the invariant and the existing authoritative store."
    }
  ],
  "takeaway": "Consensus preserves one committed order; fencing carries that authority to the resource."
};
