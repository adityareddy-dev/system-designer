// Lesson text and interactive figure stages.
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
      "kind": "figure",
      "figure": "copies-quorums",
      "view": "quorum",
      "title": "What overlap proves",
      "text": "Choose a fixed replica set and read/write reply counts. Stop a replica, write, then ask the oldest reachable copies. Overlap guarantees a shared responder only under the assumptions below."
    },
    {
      "kind": "read",
      "title": "Worked example: a zone goes dark",
      "text": "Replica trips can happen in parallel. The write waits for its required responders, not the sum of every trip. Quorum overlap depends on fixed membership and version reconciliation; it does not by itself prove linearizability. The traffic engine does not reproduce individual acknowledgements.",
      "diagram": {
        "label": "Failure boundary",
        "parts": [
          [
            "3 zones, 3 replicas",
            "R = 2 and W = 2 need both survivors after losing one replica. W = 3 cannot complete."
          ],
          [
            "Local + remote",
            "2 ms durable work + 3 ms remote round trip gives a rough 5 ms floor."
          ],
          [
            "Cross a region",
            "An 80 ms trip gives about 82 ms before queueing. Parallel fan-out does not sum every replica trip."
          ]
        ]
      }
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
      "text": "Read repair fixes versions encountered by reads; a quiet record may never be read. Hinted handoff remembers missed writes for a bounded time and consumes disk. Neither replaces anti-entropy repair of all ranges. Repair within the deletion-retention window. A replica absent beyond it may need rebuilding to prevent a purged tombstone from resurrecting data. Verify every affected range and keep repair below the bandwidth that harms foreground requests.",
      "diagram": {
        "label": "Repair competes for capacity",
        "parts": [
          [
            "Detect a gap",
            "Compare versions and checksums; a live replica can still be stale."
          ],
          [
            "Budget repair traffic",
            "Keep disk and network headroom for foreground requests."
          ],
          [
            "Verify convergence",
            "Track oldest gap, bytes remaining and failed repairs."
          ]
        ],
        "flow": true
      }
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
