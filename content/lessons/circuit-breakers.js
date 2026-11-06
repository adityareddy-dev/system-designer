// Lesson text and interactive figure stages.
export default {
  "id": "circuit-breakers",
  "title": "Timeouts and failing fast",
  "track": "Stay up",
  "minutes": 3,
  "summary": "When a dependency is slow, give up early so your servers do not pile up waiting.",
  "steps": [
    {
      "kind": "read",
      "title": "A slow friend is worse than a dead one",
      "text": "A dead service fails fast. A slow one holds your servers waiting until they have no room for anything else. Set a timeout so you stop waiting after a short time, and add a circuit breaker that stops calling a failing service for a while and answers from a fallback.",
      "icon": "el.circuit-breaker"
    },
    {
      "kind": "demo",
      "prompt": "The map service has become slow and is dragging everything down. Add a timeout and a circuit breaker.",
      "setup": {
        "palette": [
          "circuit-breaker"
        ],
        "requirements": {
          "peakRps": 1200,
          "mix": {
            "read": 1
          },
          "latencyP99Ms": {
            "default": 1000
          },
          "availability": 0.99,
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
              "ref": "maps",
              "type": "maps-api",
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
              "maps"
            ]
          ]
        },
        "events": [
          {
            "id": "slow-dependency",
            "at": "12:00",
            "params": {}
          }
        ]
      },
      "goal": {
        "holdSec": 120,
        "metric": "p99",
        "op": "<=",
        "value": 1000,
        "between": {
          "type": "circuit-breaker",
          "from": "app",
          "to": "maps",
          "note": "The breaker goes between the servers and the map service, so a slow map cannot drag the servers down. Drop it onto that line."
        }
      },
      "hint": "Set the servers' Timeout to 300 ms and place a Circuit breaker between the servers and the map service."
    },
    {
      "kind": "figure",
      "figure": "circuit-breakers",
      "view": "main",
      "title": "Open, closed, half open",
      "text": "Closed calls go through. Repeated failures open the breaker; one probe after a cooldown tests whether it can close again."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Default wait on many systems",
          "value": "≈ 30 s",
          "how": "far too long, approx."
        },
        {
          "label": "A good timeout",
          "value": "≈ 3x normal p99",
          "how": "for example 300 ms if p99 is 100 ms"
        },
        {
          "label": "Breaker stays open",
          "value": "≈ 30 s",
          "how": "approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Why is a slow service worse than a dead one?",
      "choices": [
        "Slow services cost much more to run",
        "Dead services are always repaired faster",
        "Callers wait and run out of capacity",
        "Slow services write bigger log files"
      ],
      "answer": 2,
      "why": "Waiting requests pile up and starve healthy ones."
    },
    {
      "kind": "quiz",
      "q": "What does an open breaker do?",
      "choices": [
        "Retries each call harder and faster",
        "Deletes the service and starts again",
        "Sends the same call to every server",
        "Fails calls fast, shows a fallback"
      ],
      "answer": 3,
      "why": "It gives the failing service room to recover."
    },
    {
      "kind": "quiz",
      "q": "A timeout of 30 seconds on a 100 ms service is:",
      "choices": [
        "Fine, since waiting longer is safer",
        "Far too long for a 100 ms service",
        "Required by most databases",
        "Too short to ever work"
      ],
      "answer": 1,
      "why": "You would wait 300 times longer than normal before giving up."
    }
  ],
  "takeaway": "Wait briefly, stop calling what is failing, and have a fallback."
};
