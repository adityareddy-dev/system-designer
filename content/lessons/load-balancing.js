// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "load-balancing",
  "title": "Spreading load",
  "track": "Scale the front",
  "minutes": 3,
  "summary": "A load balancer hands each request to a free server so none is overwhelmed.",
  "steps": [
    {
      "kind": "read",
      "title": "One address, many servers",
      "text": "People type one address. Behind it you can run many servers, but something must choose which one answers. That is the load balancer. It also notices a broken server and stops sending it work.",
      "icon": "el.regional-lb"
    },
    {
      "kind": "demo",
      "prompt": "One server cannot take 3,000 requests a second. Add a load balancer and more servers.",
      "setup": {
        "palette": [
          "regional-lb",
          "vm-fleet"
        ],
        "requirements": {
          "peakRps": 3000,
          "mix": {
            "read": 0.95,
            "write": 0.05
          },
          "latencyP99Ms": {
            "default": 300
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
              "units": 1
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
        "events": []
      },
      "goal": {
        "holdSec": 60,
        "metric": "availability",
        "op": ">=",
        "value": 0.99,
        "between": {"type": "regional-lb", "from": "users", "to": "app", "note": "The load balancer goes between the phone and the servers, so it can share requests out. Drop it onto that line."}
      },
      "hint": "Drag Load balancer between the phone and the servers, then raise the servers to 4 or more."
    },
    {
      "kind": "read",
      "title": "Choosing who is next",
      "text": "Round robin deals requests out in turn, like cards. Least requests picks the server with the fewest in progress. Least requests is better when some requests are slow."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Load balancer hop",
          "value": "≈ 1 ms",
          "how": "approx."
        },
        {
          "label": "Health check every",
          "value": "≈ 30 s",
          "how": "a dead server is dropped within a minute, approx."
        },
        {
          "label": "One balancer",
          "value": "≈ 50,000 requests a second",
          "how": "managed balancers scale up, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What does a load balancer do when one server dies?",
      "choices": [
        "Sends it even more work",
        "Waits until it comes back",
        "Restarts the database",
        "Stops sending it new requests"
      ],
      "answer": 3,
      "why": "Health checks find the broken server and traffic goes to the others."
    },
    {
      "kind": "quiz",
      "q": "Which setting suits requests of very different lengths?",
      "choices": [
        "Round robin, one server after another",
        "Random, picking any server it likes",
        "Fixed, always the very first server",
        "Least requests, the freest server"
      ],
      "answer": 3,
      "why": "Least requests keeps long jobs from piling onto one server."
    },
    {
      "kind": "quiz",
      "q": "Can a load balancer be a single point of failure?",
      "choices": [
        "Never, because it is built to be safe",
        "Yes, unless it runs in several places",
        "Only when it runs in the cloud",
        "Only when it has too few servers"
      ],
      "answer": 1,
      "why": "Managed balancers span several zones for exactly this reason."
    }
  ],
  "takeaway": "A load balancer lets many servers act as one, and hides the ones that fail."
};
