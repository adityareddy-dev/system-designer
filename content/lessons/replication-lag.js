// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
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
      "text": "A busy database can keep copies called replicas. All changes go to the primary, which sends them on. Replicas answer reads, so one database becomes many. The copies arrive a moment later, so a replica can be slightly out of date.",
      "icon": "el.sql-replica"
    },
    {
      "kind": "demo",
      "prompt": "Reads are too much for the primary. Add a read replica and send reads to it.",
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
      "hint": "Place a Read replica, connect the primary to it, then connect the servers to it as well."
    },
    {
      "kind": "read",
      "title": "Stale on purpose",
      "text": "Replication is usually asynchronous: the primary says \"done\" and sends the change later. That is fast, but a read right after your own write can show the old value. Normal lag is about 100 ms (approx.); in trouble it can reach many seconds."
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
  "takeaway": "Replicas scale reads; remember they are always slightly behind."
};
