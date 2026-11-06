// Lesson text and interactive figure stages.
export default {
  "id": "idempotency-retries",
  "title": "Exactly once, on purpose",
  "track": "Stay correct",
  "minutes": 3,
  "summary": "Retries are normal, so every action must be safe to repeat.",
  "steps": [
    {
      "kind": "read",
      "title": "Did my payment go through?",
      "text": "Networks drop answers. A phone taps Pay, the payment succeeds, the reply is lost, and the app tries again. Without care the customer is charged twice. A retry is safe only if repeating the action has the same effect as doing it once. That property is called idempotency.",
      "icon": "el.idempotency-store"
    },
    {
      "kind": "demo",
      "prompt": "The queue delivers some payments twice, and customers are charged twice. Add an idempotency store.",
      "setup": {
        "palette": [
          "idempotency-store"
        ],
        "requirements": {
          "peakRps": 300,
          "mix": {
            "payment": 1
          },
          "latencyP99Ms": {
            "default": 1500
          },
          "availability": 0.99,
          "budgetPerMonth": 3000,
          "userRegions": {
            "us": 1
          },
          "homeRegion": "us",
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
              "units": 2,
              "knobs": {
                "retries": 3
              }
            },
            {
              "ref": "q",
              "type": "queue",
              "x": -120,
              "y": 0
            },
            {
              "ref": "workers",
              "type": "worker-pool",
              "x": 60,
              "y": 0,
              "units": 2
            },
            {
              "ref": "pay",
              "type": "payment-processor",
              "x": 240,
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
              "q"
            ],
            [
              "q",
              "workers"
            ],
            [
              "workers",
              "pay"
            ]
          ]
        },
        "events": [
          {
            "id": "duplicate-delivery",
            "at": "12:00",
            "params": {}
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "duplicates",
        "op": "<=",
        "value": 0
      },
      "hint": "Place an Idempotency store beside the workers and connect the workers to it. Each payment carries a unique key; a repeated key returns the first result."
    },
    {
      "kind": "figure",
      "figure": "idempotency-retries",
      "view": "main",
      "title": "The key",
      "text": "The purchase keeps one key across retries. An atomic ledger returns its stored receipt instead of repeating the charge."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Duplicate rate in a queue",
          "value": "≈ 0.1 to 1 percent",
          "how": "at-least-once delivery, approx."
        },
        {
          "label": "Key lookup",
          "value": "≈ 1 ms",
          "how": "approx."
        },
        {
          "label": "Keep keys for",
          "value": "≈ 24 hours",
          "how": "approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What is an idempotent action?",
      "choices": [
        "Guaranteed to finish very quickly",
        "Safe to run twice, same result",
        "Always stored in a fast cache",
        "Only allowed to run a single time"
      ],
      "answer": 1,
      "why": "Doing it twice has the same effect as once."
    },
    {
      "kind": "quiz",
      "q": "Why do duplicates happen with queues?",
      "choices": [
        "Queues are broken and lose count",
        "Servers copy messages on purpose",
        "Clocks drift between the servers",
        "A message may be delivered twice"
      ],
      "answer": 3,
      "why": "If an acknowledgement is lost, the message is delivered again."
    },
    {
      "kind": "quiz",
      "q": "Where does the idempotency key come from?",
      "choices": [
        "The database, new for each retry",
        "The client, once per action",
        "The CDN, at the edge",
        "The load balancer, per server"
      ],
      "answer": 1,
      "why": "The same key must travel with every retry of one action."
    }
  ],
  "takeaway": "Give every action a key, and repeating it becomes harmless."
};
