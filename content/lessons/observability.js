// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "observability",
  "title": "Seeing problems early",
  "track": "Stay up",
  "minutes": 3,
  "summary": "You cannot fix what you cannot see: metrics, alerts and a way back.",
  "steps": [
    {
      "kind": "read",
      "title": "Three questions",
      "text": "When something breaks you need: is it broken (metrics and alerts), where (logs and traces), and how do I undo it (a safe rollback). Without them, problems are found by angry users, 30 minutes later (approx.).",
      "icon": "el.metrics"
    },
    {
      "kind": "demo",
      "prompt": "A bad release will go out at noon. Set up watching and a quick way back.",
      "setup": {
        "palette": [
          "metrics",
          "alerting",
          "pager",
          "ci-cd",
          "logs",
          "dashboards"
        ],
        "requirements": {
          "peakRps": 2000,
          "mix": {
            "read": 0.95,
            "write": 0.05
          },
          "latencyP99Ms": {
            "default": 300
          },
          "availability": 0.995,
          "budgetPerMonth": 3000,
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
              "units": 4
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
            "id": "bad-deploy",
            "at": "12:00",
            "params": {}
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "availability",
        "op": ">=",
        "value": 0.995
      },
      "hint": "Place Metrics, Alerting, Pager and CI/CD, and connect each one to the servers."
    },
    {
      "kind": "read",
      "title": "Alerts that matter",
      "text": "Alert on what people feel (errors, slow pages), not on every graph. Too many alerts and nobody reads them. A page to a human should mean something needs a human now."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "No monitoring",
          "value": "≈ 30 min to notice",
          "how": "approx."
        },
        {
          "label": "Metrics and alerts",
          "value": "≈ 3 min to notice",
          "how": "approx."
        },
        {
          "label": "One-click rollback",
          "value": "≈ 5 min to fix",
          "how": "versus 30 min by hand, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What does an alert tell you?",
      "choices": [
        "Exactly how to fix it",
        "The root cause of the problem",
        "Something is wrong right now",
        "Which team to blame"
      ],
      "answer": 2,
      "why": "It starts the response; logs and traces help find the cause."
    },
    {
      "kind": "quiz",
      "q": "What speeds up the fix of a bad release most?",
      "choices": [
        "Adding more servers to the busy tier",
        "Doubling the size of the cache",
        "Waiting to see if it clears up",
        "A fast rollback to the last good one"
      ],
      "answer": 3,
      "why": "Undoing the change returns you to a working state."
    },
    {
      "kind": "quiz",
      "q": "Why not alert on every metric?",
      "choices": [
        "It costs too much to send alerts",
        "Metrics are unable to raise alerts",
        "People start ignoring all of them",
        "The alerts arrive far too slowly"
      ],
      "answer": 2,
      "why": "Noise hides the real problem."
    }
  ],
  "takeaway": "Watch what users feel, tell a human fast, and keep a way back."
};
