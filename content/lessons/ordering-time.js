// Lesson text and interactive figure stages.
export default {
  "id": "ordering-time",
  "title": "Ordering and time",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "A timestamp can sort events without proving which event caused another.",
  "steps": [
    {
      "kind": "read",
      "title": "The older edit wins",
      "text": "A laptop clock is five minutes fast. It edits a title, then a phone edits the same title after receiving that change. A last-write-wins rule using device time can keep the laptop's older title. The timestamps look precise, but they do not prove the order people acted in. Clock sync reduces error; it does not remove uncertainty or pauses.",
      "icon": "el.event-stream"
    },
    {
      "kind": "figure",
      "figure": "ordering-time",
      "view": "clocks",
      "title": "Order only what you know",
      "text": "Make edits with two drifting clocks. Receive the laptop history before a phone edit to create a causal dependency. Compare timestamp selection with vector-clock conflict detection."
    },
    {
      "kind": "figure",
      "figure": "ordering-time",
      "view": "counter",
      "title": "Worked example: concurrent edits",
      "text": "Increment both devices, merge by component maximum, then merge again. Counter state can converge without treating repeated snapshots as new increments. Arbitrary text still needs a conflict policy."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Clock error",
          "value": "≈ 300 seconds",
          "how": "A five-minute fast device can beat later wall-clock writes"
        },
        {
          "label": "Vector payload",
          "value": "≈ 800 bytes",
          "how": "100 participants × 8-byte counters, before identities"
        },
        {
          "label": "Merged counter",
          "value": "7",
          "how": "max([4,0],[0,3]) = [4,3], then sum"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Lamport(A) is smaller than Lamport(B). What can the counters alone establish?",
      "choices": [
        "A is an ancestor in B's causal history",
        "A occurred earlier in wall-clock time within clock-sync error",
        "They do not distinguish causal order from concurrency"
      ],
      "answer": 2,
      "why": "Causality implies increasing Lamport time. Increasing Lamport time does not imply causality or wall-clock order."
    },
    {
      "kind": "defend",
      "q": "Why not use last-write-wins for notes? Follow-up: users rarely edit at the same time.",
      "checklist": [
        "Show how a fast device clock can discard a causally later edit",
        "Compare the harm of losing a note with the measured conflict rate",
        "Preserve conflict versions or define a tested field or text merge"
      ],
      "model": "It may be acceptable for a low-value preference with a clear timestamp rule. A note can hold irreplaceable work. Rare conflicts still hurt, and device clocks can make a causally later edit lose. I would retain conflicting versions or use a field or text merge suited to the editor, with a visible recovery path. I would measure conflicts before adopting a complex CRDT, but never equate a low conflict rate with permission to silently delete work."
    },
    {
      "kind": "read",
      "title": "Convergence is not every invariant",
      "text": "Convergence does not guarantee that the merged result preserves a business invariant. Concurrent adds, removes and text edits need deliberate rules and enough history to explain conflicts. A stock decrement may require coordination or preallocated rights. Prefer per-key order for dependent commands; independent counters or different users often need less coordination. If a requirement says newest, ask newest by whose observation.",
      "diagram": {
        "label": "Pick the invariant before the merge rule",
        "parts": [
          [
            "Independent counters",
            "Merge per-participant maxima without adding a repeated state twice."
          ],
          [
            "Concurrent text edits",
            "Keep operation identities and a deliberate conflict policy."
          ],
          [
            "One remaining seat",
            "Coordinate or allocate rights before accepting competing decrements."
          ]
        ]
      }
    },
    {
      "kind": "quiz",
      "q": "Vectors [3,1] and [2,2] describe edits to one field. How should a causal merge classify them?",
      "choices": [
        "Concurrent; neither vector includes the other history",
        "The first is later because its largest component is larger",
        "They describe the same version because both components sum to four"
      ],
      "answer": 0,
      "why": "Each vector is larger in one component. Summing counters discards the participant information needed to compare histories."
    },
    {
      "kind": "defend",
      "q": "Do we need one global event order? Follow-up: payments and click counters share the stream.",
      "checklist": [
        "Separate account spending decisions from independent click counts",
        "Scope authority and stream order to the account or other invariant key",
        "Preserve event ids and causal links when workflows cross partitions"
      ],
      "model": "A payment account needs an authority for spending decisions, while independent click counters can merge. A single global order would couple unrelated tenants and limit throughput. I would partition by the invariant's key, retain stable event ids and causal references where workflows cross keys, and explicitly coordinate the few operations that require a shared decision. A stream's per-partition sequence is not a global transaction."
    },
    {
      "kind": "quiz",
      "q": "Two disconnected sellers share a convergent sold-ticket counter but have no allocated rights. What prevents overselling?",
      "choices": [
        "Merge the counters frequently enough that both sellers eventually agree",
        "Coordinate admission or allocate bounded rights before disconnection",
        "Check each local counter before admitting a sale, then merge by maximum"
      ],
      "answer": 1,
      "why": "Local checks can both spend the last seat. Convergence alone only reveals the oversold total later."
    }
  ],
  "takeaway": "Use clocks to express what is known, and choose an explicit policy for concurrent work."
};
