// Lesson text and interactive figure stages.
export default {
  "id": "multi-region",
  "title": "Surviving a region",
  "track": "Stay up",
  "minutes": 4,
  "summary": "A whole region can go dark. Run in two, and send people to the one that is up.",
  "steps": [
    {
      "kind": "read",
      "title": "Zones and regions",
      "text": "A zone is one data centre building; a region is a city-sized group of zones. Spreading over zones survives a fire in one building. A whole region can still fail, which is rare (a few hours a year at most, approx.) but real. Surviving it means a second region with its own copy of the data.",
      "icon": "ev.region-outage"
    },
    {
      "kind": "demo",
      "prompt": "The whole home region will go down at noon. Keep a second region ready and send traffic to it.",
      "setup": {
        "palette": [
          "vm-fleet",
          "sql-replica",
          "global-lb"
        ],
        "requirements": {
          "peakRps": 2000,
          "mix": {
            "read": 1
          },
          "latencyP99Ms": {
            "default": 300
          },
          "availability": 0.99,
          "budgetPerMonth": 5000,
          "userRegions": {
            "us": 0.5,
            "eu": 0.5
          },
          "homeRegion": "us"
        },
        "traffic": {
          "curve": "flat",
          "sources": {
            "web-browser": 1
          }
        },
        "starter": {
          "nodes": [
            {
              "ref": "users",
              "type": "web-browser",
              "x": -480,
              "y": 0,
              "locked": true
            },
            {
              "ref": "glb",
              "type": "global-lb",
              "x": -300,
              "y": 0
            },
            {
              "ref": "app-us",
              "type": "vm-fleet",
              "x": -120,
              "y": -70,
              "units": 3,
              "region": "us"
            },
            {
              "ref": "db",
              "type": "sql-primary",
              "x": 60,
              "y": -70,
              "region": "us"
            }
          ],
          "edges": [
            [
              "users",
              "glb"
            ],
            [
              "glb",
              "app-us"
            ],
            [
              "app-us",
              "db"
            ]
          ]
        },
        "events": [
          {
            "id": "region-outage",
            "at": "12:00",
            "params": {
              "region": "us"
            }
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "availability",
        "op": ">=",
        "value": 0.99
      },
      "hint": "Add servers set to Europe, connect the global balancer to them, add a Read replica in Europe fed by the database, and connect the European servers to it."
    },
    {
      "kind": "figure",
      "figure": "multi-region",
      "view": "main",
      "title": "The price",
      "text": "A standby can take over only with an ownership decision. Asynchronous writes that never reached it remain a recovery gap."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Round trip between regions",
          "value": "≈ 80 ms",
          "how": "US to Europe, approx."
        },
        {
          "label": "Cost of a second full region",
          "value": "≈ 2x",
          "how": "approx."
        },
        {
          "label": "Moving traffic away from a dead region",
          "value": "≈ 1 to 5 minutes",
          "how": "DNS and health checks, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Zones protect against:",
      "choices": [
        "A bad release reaching users",
        "One data centre building failing",
        "A whole region going dark",
        "A slow query on the database"
      ],
      "answer": 1,
      "why": "Zones are separate buildings inside one region."
    },
    {
      "kind": "quiz",
      "q": "What must a second region have to be useful?",
      "choices": [
        "A different colour scheme",
        "Fewer servers than the first region",
        "Its own separate brand name",
        "A matching set of the data it serves"
      ],
      "answer": 3,
      "why": "Servers without data cannot answer."
    },
    {
      "kind": "quiz",
      "q": "Why is writing in two regions hard?",
      "choices": [
        "Regions cannot send messages to each other",
        "Two places can change one item differently",
        "It is against the rules in most countries",
        "The data is far too large to move"
      ],
      "answer": 1,
      "why": "The changes must be reconciled, and that is where conflicts arise."
    }
  ],
  "takeaway": "Multiple regions buy survival at the price of cost and harder data."
};
