// Original lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "copies-quorums",
  "title": "Copies and quorums",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Copies buy failure tolerance, but only a stated protocol buys the guarantee.",
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
      "text": "Let N be the fixed set of replicas, W the write acknowledgements and R the read replies. If R + W > N, every read set overlaps every completed write set. For N = 3 and R = W = 2, at least one read reply contains the acknowledged version. The client must compare versions and reconcile replies. Intersection alone does not make concurrent writes linearizable. Failed partial writes, sloppy quorums that use substitute nodes, clock-based conflict resolution and membership changes need extra rules. A quorum is a building block, not a transaction."
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
      "q": "With N = 3, R = 1 and W = 2, one replica missed the write. Is the next read guaranteed to see it?",
      "choices": [
        "Yes, there are three copies",
        "No, the single read may choose the stale replica",
        "Yes, if a hint exists somewhere"
      ],
      "answer": 1,
      "why": "R + W equals N, so the sets can be disjoint. A stored hint is not a read freshness guarantee."
    },
    {
      "kind": "defend",
      "q": "R plus W is bigger than N. Why will you not promise linearizability yet? Follow-up: two writers race.",
      "checklist": [
        "State fixed-set intersection and version comparison",
        "Explain concurrency and partial-write ambiguity",
        "Name a stronger protocol when real-time ordering is required"
      ],
      "model": "The overlap guarantees contact with at least one member of each completed write set, under a fixed membership. It does not choose a single order for competing writers or deal with every partially completed write. Clock timestamps can even choose a later clock over a causally later edit. For a real-time register I would use a proven read/write protocol with repair rules, or a leader with consensus and safe reads. I would not infer that guarantee from two integers."
    },
    {
      "kind": "read",
      "title": "Repair is scheduled work",
      "text": "Read repair compares returned versions and updates stale replicas on the read path. Hinted handoff stores a reminder of a missed write and replays it when the missing owner returns. Hints have bounded lifetime and consume disk; they do not replace anti-entropy repair of all ranges. A quiet record may never be read. After a long outage, compare ranges and repair them before declaring the copy healthy. Keep repair bandwidth below the level that breaks foreground requests. Count physical copies in the storage bill, and place them across failure domains rather than three processes on one host."
    },
    {
      "kind": "quiz",
      "q": "N = 5, R = 3, W = 3. Two replicas are unreachable. What is possible?",
      "choices": [
        "Reads and writes if all three survivors answer",
        "Only reads, by arithmetic alone",
        "Neither operation can ever complete"
      ],
      "answer": 0,
      "why": "Three survivors satisfy both counts. Latency, version reconciliation and correct membership still matter."
    },
    {
      "kind": "defend",
      "q": "Can we lower cross-zone write latency by acknowledging only the local copy? Follow-up: that zone disappears.",
      "checklist": [
        "Explain the acknowledgement durability boundary",
        "Quantify the remote trip",
        "Discuss availability and repair cost"
      ],
      "model": "Acknowledging locally removes a network wait but changes the failure promise. The newest acknowledged writes may exist only in that zone. If the requirement is to survive its loss without losing acknowledged data, I must wait for a durable copy outside it. I can batch or choose nearby zones, but I cannot remove the communication requirement. Hints help restore a missing replica later; they cannot recover the only copy after it is destroyed."
    },
    {
      "kind": "quiz",
      "q": "A replica returns after hints expired. Which recovery is sufficient?",
      "choices": [
        "Wait for popular keys to be read",
        "Mark it current because the process restarted",
        "Run range repair and verify it before relying on it"
      ],
      "answer": 2,
      "why": "Read repair cannot cover cold keys, and expired hints cannot replay missing writes."
    }
  ],
  "takeaway": "Name the replica set, acknowledgement count, failure model and reconciliation rule together."
};
