// Lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "copies-quorums",
  "title": "Copies and quorums",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Copies tolerate failures when placement, acknowledgements and repair match the promise.",
  "steps": [
    {
      "kind": "read",
      "title": "The copy that missed a write",
      "text": "Three replicas hold a delivery address. One is offline when the address changes. The next read reaches that copy first. More copies improved durability, but the answer is old. A replication factor names how many copies should exist. A read or write quorum names how many replies an operation must wait for.",
      "icon": "el.wide-column"
    },
    {
      "kind": "read",
      "title": "What overlap proves",
      "text": "Let N be the number of replicas in a fixed set, W the durable write acknowledgements and R the read replies. If R + W > N, every read set overlaps every completed write set. For N = 3 and R = W = 2, a read started after a completed write contacts at least one replica that accepted it. That replica may now hold a superseding version. The coordinator or client must compare versions and reconcile replies. Intersection alone does not make concurrent writes linearizable. Failed partial writes, sloppy quorums that use substitute nodes, clock-based conflict resolution and membership changes need extra rules. A quorum is a building block, not a transaction."
    },
    {
      "kind": "read",
      "title": "Worked example: a zone goes dark",
      "text": "Put one replica in each of three zones. R = 2 and W = 2 can continue with one replica down, if both remaining replicas answer. W = 3 cannot complete then. Suppose local durable work is 2 ms and reaching the fastest remote replica adds a 3 ms round trip. A write waiting for local plus remote has a rough floor of 5 ms. If it needs an 80 ms cross-region trip instead, expect about 82 ms before queueing. Fan-out can be parallel; do not sum every replica trip. The sim cannot reproduce individual replica acknowledgements, so these are protocol calculations."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Quorum intersection",
          "value": "≈ 1 replica minimum",
          "how": "R + W - N = 2 + 2 - 3"
        },
        {
          "label": "Zone write floor",
          "value": "≈ 5 ms",
          "how": "2 ms durable work + 3 ms remote RTT, illustrative"
        },
        {
          "label": "Physical payload",
          "value": "≈ 30 TB",
          "how": "10 TB logical × replication factor 3, before indexes"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "With fixed N = 3, R = 1 and W = 2, one replica missed a completed write. What does the next read guarantee?",
      "choices": [
        "It sees the write because W is a majority",
        "It may return the old value if it chooses that replica",
        "It sees the write if hinted handoff is enabled"
      ],
      "answer": 1,
      "why": "R + W equals N, so the read and write sets can be disjoint. Hints may repair the stale replica later."
    },
    {
      "kind": "defend",
      "q": "R plus W is bigger than N. Why will you not promise linearizability yet? Follow-up: two writers race.",
      "checklist": [
        "State fixed membership and reconcile versions from intersecting sets",
        "Explain racing writers and reads that expose partial writes",
        "Name the read and write rules needed for a linearizable register"
      ],
      "model": "Intersection only guarantees contact with a replica from each completed write set. Racing writers still need unique ordered versions, and a partial write can be seen by one read then missed by another. For a linearizable quorum register, I would choose a proven protocol: writers obtain a tag above those observed in a quorum, then durably write it to a quorum; readers select the highest tag and write it back to a quorum before returning. Tags include a writer identity to break ties. A leader with consensus and safe reads is another option. The read and recovery rules, not R and W alone, establish the guarantee."
    },
    {
      "kind": "read",
      "title": "Repair is scheduled work",
      "text": "Read repair compares returned versions and updates stale replicas on the read path. Hinted handoff stores a reminder of a missed write and replays it when the missing owner returns. Hints have bounded lifetime and consume disk; they do not replace anti-entropy repair of all ranges. A quiet record may never be read. Repair within the deletion-retention window. In Cassandra, a replica that missed a deletion can resurrect data after the tombstone is purged. If the outage exceeds that window, rebuild the stale replica from current data rather than trusting ordinary repair alone. Otherwise compare and repair all affected ranges before declaring it current. Keep repair bandwidth below the level that breaks foreground requests. Count physical copies in the storage bill, and place them across failure domains rather than three processes on one host."
    },
    {
      "kind": "quiz",
      "q": "Fixed N = 5, R = 3, W = 3. Two replicas are unreachable. Which operations can still meet these counts?",
      "choices": [
        "Reads and writes, if all three survivors reply",
        "Reads only; durable writes need four survivors",
        "Writes only; a read must also contact a failed replica"
      ],
      "answer": 0,
      "why": "Three survivors satisfy both thresholds. Membership, durability and version reconciliation still need a protocol."
    },
    {
      "kind": "defend",
      "q": "Can we lower cross-zone write latency by acknowledging only the local copy? Follow-up: that zone disappears.",
      "checklist": [
        "Explain which acknowledged writes survive loss of the local zone",
        "Calculate the illustrative local and remote waits",
        "Describe the unavailable-zone policy and repair headroom"
      ],
      "model": "Acknowledging locally removes a network wait but changes the failure promise. The newest acknowledged writes may exist only in that zone. If the requirement is to survive its loss without losing acknowledged data, I must wait for a durable copy outside it. I can batch or choose nearby zones, but I cannot remove the communication requirement. Hints help restore a missing replica later; they cannot recover the only copy after it is destroyed. With 2 ms durable work and a 3 ms required remote round trip, the illustrative floor is 5 ms; an 80 ms trip makes it 82 ms. If the remote acknowledgement is unavailable, I must defer writes or explicitly weaken durability. Repair needs reserved bandwidth so recovery does not overload the survivors."
    },
    {
      "kind": "quiz",
      "q": "A replica missed writes after its hints expired. Tombstones still cover the outage. What establishes that cold keys are current?",
      "choices": [
        "Run quorum reads for the busiest keys until latency settles",
        "Wait for its normal heartbeat and successful health checks",
        "Repair all affected ranges and verify completion"
      ],
      "answer": 2,
      "why": "Popular-key reads leave cold ranges unchecked. A healthy process is not evidence of current data."
    }
  ],
  "takeaway": "Name the replica set, acknowledgement count, failure model and reconciliation rule together."
};
