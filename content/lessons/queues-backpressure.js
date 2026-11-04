// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "queues-backpressure",
  "title": "Waiting instead of breaking",
  "track": "Work later",
  "minutes": 3,
  "summary": "A queue lets a burst wait in line instead of crashing the thing behind it.",
  "steps": [
    {
      "kind": "read",
      "title": "A line at the bakery",
      "text": "If work arrives faster than it can be done, you can drop it or make it wait. A queue is the line. The sender says \"got it\" at once, and workers take items at their own pace. Waiting is better than breaking, as long as the line does not grow forever.",
      "icon": "el.queue"
    },
    {
      "kind": "demo",
      "prompt": "A burst of writes is more than the database can take. Put a queue and workers in front of it. Acceptance means the queue took the job, not that it finished. Completion lag shows the oldest waiting job; expiry risk compares its age with the job deadline. The model tracks traffic as rates rather than individual jobs.",
      "setup": {
        "palette": [
          "queue",
          "worker-pool"
        ],
        "requirements": {
          "peakRps": 1500,
          "mix": {
            "write": 1
          },
          "latencyP99Ms": {
            "default": 500
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
              "units": 6
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
            "id": "viral-spike",
            "at": "12:00",
            "params": {
              "factor": 3
            }
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "errors",
        "op": "<=",
        "value": 0.01,
        "drain": true
      },
      "hint": "Place a Queue and Background workers, so the path is servers, queue, workers, database. Then give the workers enough units for the normal 1,500 writes a second (about 10, at about 200 jobs a second each, approx.), or the line grows all day and work waits past its limit. The size M database handles ≈ 2,000 writes/s, so adding workers beyond that cannot raise completed drain. The burst brings ≈ 4,500 writes/s: the queue must wait for arrivals to fall, or you must increase database capacity or slow senders."
    },
    {
      "kind": "read",
      "title": "Backpressure",
      "text": "If the line keeps growing, the system must push back: slow senders, say \"try later\", or drop the least important work. Without it, the queue fills up and delays grow until the data is stale."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Standard queue",
          "value": "≈ 100,000 messages a second",
          "how": "managed, approx."
        },
        {
          "label": "Database writes",
          "value": "≈ 2,000 a second",
          "how": "one SQL primary, approx."
        },
        {
          "label": "Backlog of 1 million at 2,000 a second",
          "value": "≈ 8 minutes to clear",
          "how": "With no new arrivals: 1,000,000 / 2,000 / 60 ≈ 8.3 minutes."
        },
        {
          "label": "1,500 arrivals and 2,000 completed a second",
          "value": "≈ 33 minutes to clear 1 million",
          "how": "Net drain is service minus arrivals: 2,000 - 1,500 = 500 jobs a second. Time to clear = backlog / (service rate - arrival rate), so 1,000,000 / (2,000 - 1,500) / 60 ≈ 33.3 minutes. At equal rates the backlog stays; with more arrivals it grows."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What does a queue buy you?",
      "choices": [
        "More capacity for the database",
        "Time to catch up after a burst",
        "Perfect order for every message",
        "Faster answers to every user"
      ],
      "answer": 1,
      "why": "It smooths bursts; it does not add capacity."
    },
    {
      "kind": "quiz",
      "q": "The queue grows all day and never shrinks. What now?",
      "choices": [
        "Nothing, queues can grow forever",
        "Delete the queue and start fresh",
        "Buy a bigger database server",
        "Add workers or slow the senders"
      ],
      "answer": 3,
      "why": "Work is arriving faster than it is done; either side must change."
    },
    {
      "kind": "quiz",
      "q": "What is backpressure?",
      "choices": [
        "A database setting that caps how large a row can be",
        "Telling senders to ease off as the line grows",
        "A kind of cache that clears older entries early",
        "A copy of the queue kept in a second region"
      ],
      "answer": 1,
      "why": "It stops overload from growing without end."
    }
  ],
  "takeaway": "Queues turn spikes into waiting; backpressure stops the waiting from growing forever."
};
