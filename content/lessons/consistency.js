// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "consistency",
  "title": "Which copy is the truth",
  "track": "Stay correct",
  "minutes": 3,
  "summary": "With several copies, you choose between always-latest and always-fast.",
  "steps": [
    {
      "kind": "read",
      "title": "Two copies, two answers",
      "text": "With a primary and a replica, two people can read different values for a moment. Strong consistency means every read sees the latest write, and costs a little speed. Eventual consistency means copies catch up soon, and is faster and cheaper.",
      "icon": "ev.replication-lag"
    },
    {
      "kind": "demo",
      "prompt": "Users must see their own edits at once. Make writes safe and read the latest from the primary.",
      "setup": {
        "palette": [
          "sql-replica"
        ],
        "requirements": {
          "peakRps": 3000,
          "mix": {
            "read": 0.8,
            "write": 0.2
          },
          "latencyP99Ms": {
            "default": 300
          },
          "availability": 0.99,
          "budgetPerMonth": 5000,
          "userRegions": {
            "us": 1
          },
          "homeRegion": "us",
          "readYourWrites": true,
          "dataSafety": "no-loss"
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
              "units": 5
            },
            {
              "ref": "db",
              "type": "sql-primary",
              "x": -120,
              "y": 0,
              "knobs": {
                "replication": "async"
              }
            },
            {
              "ref": "copy",
              "type": "sql-replica",
              "x": 60,
              "y": 0,
              "units": 2
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
            ],
            [
              "app",
              "copy"
            ],
            [
              "db",
              "copy"
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
        "holdSec": 120,
        "metric": "errors",
        "op": "<=",
        "value": 0.005
      },
      "hint": "Set the database Replication to sync so no write is lost. For reads that must be current, send them to the primary, not the replica."
    },
    {
      "kind": "read",
      "title": "Choose per screen",
      "text": "You do not have to pick one for the whole app. A bank balance and a \"payment sent\" screen need the latest. A like count or a view counter can be a few seconds late. Use the expensive guarantee only where it matters."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Async write",
          "value": "≈ 5 ms",
          "how": "approx."
        },
        {
          "label": "Sync write to a second copy",
          "value": "≈ 8 to 15 ms",
          "how": "adds a round trip, approx."
        },
        {
          "label": "Replica lag in trouble",
          "value": "≈ 30 s",
          "how": "rare, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Strong consistency means:",
      "choices": [
        "Reads are always the fastest possible",
        "Data is always encrypted on disk",
        "Writes can never fail",
        "Reads see the latest write"
      ],
      "answer": 3,
      "why": "It never shows you an older value than the last write."
    },
    {
      "kind": "quiz",
      "q": "Which screen can be eventually consistent?",
      "choices": [
        "Account balance after a transfer",
        "A like counter",
        "A seat that was just booked",
        "A payment that was just made"
      ],
      "answer": 1,
      "why": "Nobody is harmed if a like count is a few seconds old."
    },
    {
      "kind": "quiz",
      "q": "What does sync replication protect against?",
      "choices": [
        "Slow queries when many users read at once",
        "Losing a saved write if the primary dies",
        "Sudden traffic spikes at the busiest hour",
        "Cache entries going out of date too soon"
      ],
      "answer": 1,
      "why": "The write exists on two machines before you are told it worked."
    }
  ],
  "takeaway": "Pick the strongest guarantee only where being wrong would hurt."
};
