// Lesson text and interactive figure stages.
export default {
  "id": "consistent-hashing",
  "title": "Consistent hashing and moving data",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Adding one machine can mean moving a little data or nearly all of it.",
  "steps": [
    {
      "kind": "read",
      "title": "One new machine, a long night",
      "text": "You have eight storage nodes and 8 TB of user records. You add a ninth. The disks have room, but the next morning is spent copying records while live requests wait. Placement decides how much work a small expansion causes. Hashing a user id spreads keys. It does not by itself tell you how to change the number of owners safely.",
      "icon": "el.sharded-sql"
    },
    {
      "kind": "figure",
      "figure": "consistent-hashing",
      "view": "placement",
      "title": "Keep most owners in place",
      "text": "Add or remove an owner under modulo and ring placement. Green marks identify keys that changed owner. Virtual positions can improve spread; a popular key still stays whole."
    },
    {
      "kind": "read",
      "title": "Worked example: moving 8 TB",
      "text": "These copy times assume uniform hashes, equal record sizes, decimal TB and no replicas. They are lower bounds. Reads, checksums, retries and new writes share the same disk and network. Reserve bandwidth and failure headroom, then measure the gap between snapshot completion and actual cutover readiness.",
      "diagram": {
        "label": "Copy lower bounds",
        "parts": [
          [
            "8 TB / 9",
            "A balanced ring copies about 0.89 TB. The source keeps its records."
          ],
          [
            "100 MB/s reserved",
            "0.89 TB takes about 2.5 hours. Modulo copies about 7.11 TB in 19.8 hours."
          ],
          [
            "Still catching up",
            "Live writes, checksums and retries add work after the snapshot."
          ]
        ]
      }
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Modulo move",
          "value": "≈ 7.11 TB",
          "how": "8 TB × 8/9 when changing 8 owners to 9"
        },
        {
          "label": "Ring move",
          "value": "≈ 0.89 TB",
          "how": "8 TB ÷ 9 under balanced uniform placement"
        },
        {
          "label": "Copy floor",
          "value": "≈ 2.5 hours",
          "how": "0.89 TB ÷ 100 MB/s; excludes catch-up and replicas"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Eight equal nodes hold 8 TB without replicas. A balanced ring adds a ninth. Which plan preserves live writes during the move?",
      "choices": [
        "Copy about 0.89 TB and switch after snapshot checksums match",
        "Copy about 0.89 TB, replay changes, then fence the old owner at cutover",
        "Copy about 7.11 TB while retaining the ring placement"
      ],
      "answer": 1,
      "why": "A snapshot can miss writes made during copying. Catch-up and a fenced ownership switch protect them."
    },
    {
      "kind": "defend",
      "q": "Why bother with a ring at only eight nodes? Follow-up: how would you prove the expansion is safe?",
      "checklist": [
        "Compare 7.11 TB of modulo movement with 0.89 TB on a balanced ring",
        "Reserve copy bandwidth alongside foreground and replica work",
        "Fence stale owners and verify snapshot checksums plus replay offsets"
      ],
      "model": "I would first ask how often capacity changes. A stable small database may need no custom ring at all. For frequent changes, reducing a 7.11 TB copy to about 0.89 TB matters. I would reserve migration bandwidth, watch p99 and replica lag, copy and catch up each range, then fence the old owner and switch a versioned map. Stale routers must forward or retry rather than creating another writable copy. Counts and checksums plus write-log offsets establish that the new owner is ready. Old owners stay until verification and a bounded rollback window finish."
    },
    {
      "kind": "figure",
      "figure": "consistent-hashing",
      "view": "migration",
      "title": "Move ownership as carefully as bytes",
      "text": "Move a range while writes arrive. Try snapshot, replay, fence and route in your own order. Check which acknowledged writes the new owner is missing, then reset and fix the sequence."
    },
    {
      "kind": "quiz",
      "q": "One partition key receives 40% of writes. What does doubling virtual nodes do to that key?",
      "choices": [
        "It divides that key across twice as many replica sets",
        "It lets replicas independently accept half its writes without reconciliation",
        "It keeps one replica set; other ranges may balance better"
      ],
      "answer": 2,
      "why": "Virtual nodes divide hash ranges, not one key. Splitting writes needs a different key or protocol."
    },
    {
      "kind": "defend",
      "q": "We added nodes and p99 got worse. What would you inspect? Follow-up: the hottest key still overloads one owner.",
      "checklist": [
        "Inspect migration I/O, cold caches and stale-map retries",
        "Compare bytes per range with write rate on the hottest key",
        "Explain how subkeys change reads or ordering before splitting writes"
      ],
      "model": "I would separate migration I/O from user I/O and check cold caches, range skew and routing retries. Equal bytes do not imply equal work. If repeated reads dominate, caching may help. If one key takes too many writes, use a deliberate subkey scheme with aggregation or a dedicated owner. That changes reads or ordering, so I would test the business invariant before splitting it."
    },
    {
      "kind": "quiz",
      "q": "The snapshot and change replay are complete, but routers still use two map versions. What protects subsequent writes?",
      "choices": [
        "Fence old ownership and forward or retry stale-routed requests",
        "Keep both owners writable until every router reports the new map",
        "Delete the old copy as soon as snapshot checksums match"
      ],
      "answer": 0,
      "why": "Catch-up proves a past state. Fencing stops old routers creating a second write authority after cutover."
    }
  ],
  "takeaway": "Plan the ownership change and the bytes it moves, not just the final node count."
};
