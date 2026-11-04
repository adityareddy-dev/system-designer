// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "hot-keys",
  "title": "When one item is popular",
  "track": "Scale the data",
  "minutes": 3,
  "summary": "Sharding spreads keys, not popularity. One star item can still overload one shard.",
  "steps": [
    {
      "kind": "read",
      "title": "The celebrity problem",
      "text": "Shards split keys evenly, but not attention. If one post goes viral, every request for it lands on the one shard that holds it. That shard melts while the others sit idle.",
      "icon": "ev.hot-key"
    },
    {
      "kind": "demo",
      "prompt": "One item gets a third of all reads. Protect the shards with a cache.",
      "setup": {
        "palette": [
          "cache",
          "distributed-cache"
        ],
        "requirements": {
          "peakRps": 20000,
          "mix": {
            "read": 0.97,
            "write": 0.03
          },
          "latencyP99Ms": {
            "default": 250
          },
          "availability": 0.99,
          "budgetPerMonth": 6000,
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
              "units": 24
            },
            {
              "ref": "db",
              "type": "sharded-sql",
              "x": -120,
              "y": 0,
              "units": 6
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
            "id": "hot-key",
            "at": "12:00",
            "params": {
              "share": 0.3
            }
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "availability",
        "op": ">=",
        "value": 0.99,
        "between": {"types": ["cache", "distributed-cache"], "from": "app", "to": "db", "note": "The cache has to sit between the servers and the database, so the popular item is answered from memory. Drop it onto that line."}
      },
      "hint": "Place a Cache between the servers and the database so the popular item is answered from memory."
    },
    {
      "kind": "read",
      "title": "Ways out",
      "text": "Cache the hot item so the shard is rarely asked. Keep several copies of it. Or split the key, for example by adding a small number to the end, and combine the pieces on read."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "One shard handles",
          "value": "≈ 1/6 of traffic when even",
          "how": "with six shards"
        },
        {
          "label": "A hot item with 30 percent of reads",
          "value": "≈ 2.5 times a fair share on its shard",
          "how": "its shard carries 30 + 70 ÷ 6 ≈ 42 percent of reads, against a fair 16.7 percent: 42 ÷ 16.7 ≈ 2.5"
        },
        {
          "label": "Cache answer",
          "value": "≈ 0.5 ms",
          "how": "approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Does adding shards fix a hot key?",
      "choices": [
        "Yes, more shards always spread it out",
        "Only if you also turn replicas off",
        "Yes, once you add ten more shards",
        "No, that key still sits on one shard"
      ],
      "answer": 3,
      "why": "The hot key is still stored in one place."
    },
    {
      "kind": "quiz",
      "q": "Which is a good fix?",
      "choices": [
        "Lower the timeout on every call",
        "Add a second database just for writes",
        "Keep a cached copy of the hot item",
        "Send the hot item to every shard"
      ],
      "answer": 2,
      "why": "A cache answers most requests without touching the shard."
    },
    {
      "kind": "quiz",
      "q": "Why do hot keys surprise teams?",
      "choices": [
        "Small tests always catch them first",
        "Hot keys cannot be measured in a log",
        "They only show up in the night hours",
        "The average load looks perfectly fine"
      ],
      "answer": 3,
      "why": "Overall utilisation is low while one shard is overwhelmed."
    }
  ],
  "takeaway": "Spread keys with shards and spread attention with caches and copies."
};
