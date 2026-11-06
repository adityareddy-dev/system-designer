// Lesson text and interactive figure stages.
export default {
  "id": "replication-lag",
  "title": "Copies are a little behind",
  "track": "Scale the data",
  "minutes": 3,
  "summary": "Read copies share the load, but they trail the original by a moment.",
  "steps": [
    {
      "kind": "read",
      "title": "Many readers, one writer",
      "text": "A busy database can keep copies called replicas. All changes go to the primary, which sends them on. Replicas answer reads, so one database becomes many. With asynchronous replication, changes arrive later, so a replica can be slightly out of date.",
      "icon": "el.sql-replica"
    },
    {
      "kind": "demo",
      "prompt": "Keep App servers connected to SQL database for writes. Place Read replica beside the database, then connect SQL database to Read replica to copy changes. Next, connect App servers to Read replica for reads. Select Read replica and set its replica count to 4 at size M. At peak, 8,280 reads/s share 5 copies, each handling ≈ 8,000 reads/s; 720 writes/s stay on the primary at ≈ 2,000 writes/s capacity. Primary busy is ≈ 36% writes + 21% reads = 57%. Keep it below 70 percent for a simulated minute.",
      "setup": {
        "palette": [
          "sql-replica"
        ],
        "requirements": {
          "peakRps": 9000,
          "mix": {
            "read": 0.92,
            "write": 0.08
          },
          "latencyP99Ms": {
            "default": 250
          },
          "availability": 0.99,
          "budgetPerMonth": 5000,
          "userRegions": {
            "us": 1
          },
          "homeRegion": "us"
        },
        "traffic": {
          "curve": "flat",
          "sources": {
            "mobile-app": 1
          }
        },
        "starter": {
          "nodes": [
            {
              "ref": "users",
              "type": "mobile-app",
              "x": -480,
              "y": 0,
              "locked": true
            },
            {
              "ref": "app",
              "type": "vm-fleet",
              "x": -300,
              "y": 0,
              "units": 12
            },
            {
              "ref": "db",
              "type": "sql-primary",
              "x": -120,
              "y": 0
            }
          ],
          "edges": [
            [
              "users",
              "app"
            ],
            [
              "app",
              "db"
            ]
          ]
        },
        "events": [
          {
            "id": "replication-lag",
            "at": "12:00",
            "params": {}
          }
        ]
      },
      "goal": {
        "holdSec": 60,
        "metric": "util",
        "node": "db",
        "op": "<=",
        "value": 0.7
      },
      "hint": "A dropped replica needs two links: SQL database → Read replica copies changes; App servers → Read replica carries reads. Keep App servers → SQL database. At peak, 9,000 × 92% = 8,280 reads/s and 9,000 × 8% = 720 writes/s. At size M, the primary handles ≈ 8,000 reads/s or ≈ 2,000 writes/s. Writes alone use 720 ÷ 2,000 = 36%. This model shares reads by capacity across the primary and replicas. With 4 replicas, the primary gets about one fifth of reads: 8,280 ÷ 5 ÷ 8,000 ≈ 21%. Total primary load is ≈ 36% + 21% = 57%, leaving room below 70%. Select Read replica and set its replica count to 4, keeping both databases at size M."
    },
    {
      "kind": "figure",
      "figure": "replication-lag",
      "view": "main",
      "title": "Stale on purpose",
      "text": "An acknowledged primary write is not yet an applied replica write. Advance delivery and read the actual versions."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Normal replica lag",
          "value": "≈ 100 ms",
          "how": "approx."
        },
        {
          "label": "Reads one replica handles",
          "value": "≈ 8,000 a second",
          "how": "simple queries, approx."
        },
        {
          "label": "Primary load with 4 replicas",
          "value": "≈ 57% busy at peak",
          "how": "720 writes/s ÷ 2,000 + (8,280 reads/s ÷ 5 copies) ÷ 8,000 ≈ 36% + 21%. Keep the app-to-primary write link and both replica links."
        },
        {
          "label": "Writes",
          "value": "still only on the primary",
          "how": "replicas do not add write capacity"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Where do writes go with read replicas?",
      "choices": [
        "Any replica, whichever is nearest",
        "A random replica each time",
        "The cache layer in front",
        "The primary, then copied on"
      ],
      "answer": 3,
      "why": "Replicas copy the primary and cannot take writes."
    },
    {
      "kind": "quiz",
      "q": "You post a comment and refresh. It is missing. Likely cause?",
      "choices": [
        "The server you used was deleted",
        "The CDN is switched off",
        "The replica was a moment behind",
        "Comments are never saved"
      ],
      "answer": 2,
      "why": "Reading from a lagging replica returns slightly old data."
    },
    {
      "kind": "quiz",
      "q": "Do replicas add write capacity?",
      "choices": [
        "Yes, almost in a straight line",
        "No, they only add reads",
        "Only if a cache sits in front",
        "Yes, once you add ten of them"
      ],
      "answer": 1,
      "why": "Every write still has to be applied by the primary."
    }
  ],
  "takeaway": "Replicas scale reads. Asynchronous replicas can lag behind the primary; synchronous replication waits for the required acknowledgements before confirming a write, trading latency for stronger guarantees."
};
