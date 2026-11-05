// Original lesson data. Worked figures are approximations, not engine measurements.
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
      "kind": "read",
      "title": "Keep most owners in place",
      "text": "With hash(key) mod N, changing N changes nearly every remainder. For uniform hashes and a move from 8 to 9, only about 1/9 of keys keep the same numbered owner. About 8/9 move. On a ring, hash both keys and node positions into the same space. A key belongs to the next node clockwise. Adding a node takes part of its neighbours' ranges. In a balanced 8 to 9 expansion, about 1/9 of logical data changes owner. Virtual nodes put many positions per machine on the ring. They smooth random imbalance and let larger machines take more ranges. They do not make one hot key smaller."
    },
    {
      "kind": "read",
      "title": "Worked example: moving 8 TB",
      "text": "Assume uniform keys, no replicas and decimal TB. Modulo placement moves about 7.11 TB; a balanced ring moves about 0.89 TB. At a reserved 100 MB/s, the ring copy alone takes about 8,900 seconds, or 2.5 hours. Modulo needs about 19.8 hours. These are lower bounds: reads, checksums, retries and catching up new writes also use disk and network. Replication changes the bytes and failure headroom. This is a worked example because the sim does not model range movement."
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
      "q": "A ninth node joins eight equal nodes. Which migration plan leaves room for real traffic?",
      "choices": [
        "Copy all ranges at line speed and delete originals immediately",
        "Budget about 0.89 TB of logical copying, throttle it and replay concurrent changes",
        "Assume virtual nodes eliminate copying"
      ],
      "answer": 1,
      "why": "A ring reduces movement. It still needs a copy, a catch-up phase and a safe ownership switch."
    },
    {
      "kind": "defend",
      "q": "Why bother with a ring at only eight nodes? Follow-up: how would you prove the expansion is safe?",
      "checklist": [
        "Compare movement with modulo using the actual data size",
        "Account for foreground work and replica traffic",
        "Describe catch-up, versioned cutover and verification"
      ],
      "model": "I would first ask how often capacity changes. A stable small database may need no custom ring at all. For frequent changes, reducing a 7.11 TB copy to about 0.89 TB matters. I would reserve migration bandwidth, watch p99 and replica lag, copy and catch up each range, then switch a versioned map. Counts and checksums plus write-log offsets establish that the new owner is ready. Old owners stay until verification and a bounded rollback window finish."
    },
    {
      "kind": "read",
      "title": "Move ownership as carefully as bytes",
      "text": "Publish a versioned placement map. Copy a snapshot of a range, replay changes made during the copy, then switch routing with an explicit ownership version. Keep a forwarding or retry path while clients learn the new map. Delete the old copy only after checking the new owner and the rollback window. Rate limit copying against foreground p99, not just available bandwidth. A hot tenant may need subkeys, a cache for repeated reads, or a dedicated placement. More virtual nodes cannot split a single record's writes."
    },
    {
      "kind": "quiz",
      "q": "One tenant does 40% of writes to one partition key. You double virtual nodes. What changes?",
      "choices": [
        "That key now uses twice as many machines",
        "Writes become reads",
        "Other ranges may balance better; that key still has one replica set"
      ],
      "answer": 2,
      "why": "Virtual nodes spread ranges. Splitting this workload requires changing the key or isolating it."
    },
    {
      "kind": "defend",
      "q": "We added nodes and p99 got worse. What would you inspect? Follow-up: the hottest key still overloads one owner.",
      "checklist": [
        "Check copy bandwidth, disk pressure and cache warming",
        "Distinguish bytes per range from requests per key",
        "Propose a key-specific remedy with its correctness cost"
      ],
      "model": "I would separate migration I/O from user I/O and check cold caches, range skew and routing retries. Equal bytes do not imply equal work. If repeated reads dominate, caching may help. If one key takes too many writes, use a deliberate subkey scheme with aggregation or a dedicated owner. That changes reads or ordering, so I would test the business invariant before splitting it."
    },
    {
      "kind": "quiz",
      "q": "Copying is finished but routers still use two map versions. What is missing?",
      "choices": [
        "An ownership version and a transition path for stale routers",
        "A longer hash digest alone",
        "More disk capacity only"
      ],
      "answer": 0,
      "why": "A completed byte copy does not make every writer agree on the owner."
    }
  ],
  "takeaway": "Plan the ownership change and the bytes it moves, not just the final node count."
};
