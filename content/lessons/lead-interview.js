// Lesson text and interactive figure stages.
export default {
  "id": "lead-interview",
  "title": "How to lead a design interview",
  "track": "Lead the design",
  "minutes": 6,
  "summary": "Use the hour to make decisions, test assumptions and invite useful disagreement.",
  "steps": [
    {
      "kind": "read",
      "title": "The prompt is only five words",
      "text": "You are asked to design a notification service. You could spend the hour drawing queues, but nobody has said whether messages are promotional emails or urgent medical alerts. Leading the discussion starts by turning a vague noun into a user journey and a few testable promises. State a provisional scope and ask which assumption would most change the design.",
      "icon": "ui.clock"
    },
    {
      "kind": "figure",
      "figure": "lead-interview",
      "view": "clock",
      "title": "A flexible plan for sixty minutes",
      "text": "Spend the sixty minutes deliberately. Scope and numbers make the design testable; leave time for one failure and a trade-off you can defend. The clock only shows what went untouched."
    },
    {
      "kind": "read",
      "title": "Worked example: choose the deep question",
      "text": "Assume a 1 KB payload: the raw events add about 30 GB/day before replicas and delivery attempts. Extra app servers cannot erase a downstream provider limit. The backlog calculation points to admission, deadlines and recovery as the useful depth. It is a worked design example, not a traffic run.",
      "diagram": {
        "label": "The provider is the ceiling",
        "parts": [
          [
            "30 million/day",
            "10 million people × 3 notifications. About 347/s average."
          ],
          [
            "10 times burst",
            "About 3,472/s arrive while the provider admits 2,000/s."
          ],
          [
            "Five-minute backlog",
            "About 441,667 notifications wait. Decide deadlines and recovery before adding app servers."
          ]
        ]
      }
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Average notification rate",
          "value": "≈ 347/s",
          "how": "30 million ÷ 86,400 seconds"
        },
        {
          "label": "Burst rate",
          "value": "≈ 3,470/s",
          "how": "Average × assumed burst factor 10"
        },
        {
          "label": "Five-minute backlog",
          "value": "≈ 442,000",
          "how": "(30 million ÷ 86,400 × 10 - 2,000)/s × 300 s; round at the end"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Eight minutes in, the delivery deadline is still unknown. Which next step best resolves the queue policy?",
      "choices": [
        "Choose an unbounded durable queue now and settle delivery timing later",
        "Agree deadlines by message class before choosing buffering and expiry",
        "Use the provider's acknowledgement latency as the delivery deadline"
      ],
      "answer": 1,
      "why": "Acceptance latency does not define user delivery. The deadline determines whether buffering, expiry or admission is acceptable."
    },
    {
      "kind": "defend",
      "q": "Why did you spend time on numbers before choosing services? Follow-up: your traffic estimate is wrong by ten times.",
      "checklist": [
        "Compare assumed arrival rates with the provider ceiling and deadline",
        "Calculate how the design changes across a tenfold traffic range",
        "Label assumed inputs and name the measurement that could change the design"
      ],
      "model": "With 30 million events/day, average traffic is about 347/s and the assumed tenfold burst is about 3,472/s. A 2,000/s provider is already the peak bottleneck. If the estimate is ten times lower, the roughly 347/s peak fits; ten times higher gives about 34,722/s, where buffering and quotas dominate. I would ask how long delivery may wait and verify sustained account quotas. Those measurements determine whether admission, another provider or a narrower promise is needed. Extra app servers cannot raise a downstream ceiling."
    },
    {
      "kind": "read",
      "title": "Make the reasoning visible",
      "text": "Explain one simple design before alternatives. Tie every component to a requirement and invite pushback on a concrete choice. If a provider limit is unknown, give a plausible range, show which result changes the design and name the measurement needed. End with the key invariant, bottleneck, cost driver and one unresolved risk. Reasoning can be useful even when a reviewer chooses differently.",
      "diagram": {
        "label": "Make a claim testable",
        "parts": [
          [
            "State the promise",
            "Name the user outcome and distinguish assumptions from measurements."
          ],
          [
            "Trace a failure",
            "Walk one request and explain which invariant survives."
          ],
          [
            "Name the experiment",
            "Measure the uncertain limit and say which result changes the design."
          ]
        ]
      }
    },
    {
      "kind": "quiz",
      "q": "The provider limit is unknown and could change the design. What supports the next decision?",
      "choices": [
        "Use the published maximum as sustained account capacity without verification",
        "Size only the average rate and defer provider limits until after launch",
        "State a plausible range, test both ends and name the needed measurement"
      ],
      "answer": 2,
      "why": "A published maximum may not be an account's safe sustained capacity. Test whether the uncertainty changes admission or buffering."
    },
    {
      "kind": "defend",
      "q": "I disagree with your choice of deep dive. How do you respond? Follow-up: there are only fifteen minutes left.",
      "checklist": [
        "Tie the current deep dive to the delivery promise at risk",
        "Ask which competing failure could invalidate the design sooner",
        "Allocate the last fifteen minutes and reserve time to record decisions"
      ],
      "model": "I chose provider admission because it may break the delivery deadline even when our app has spare capacity. I would ask which requirement the alternative deep dive puts at greater risk. If it changes the main design, I would switch. With fifteen minutes left, I would propose ten minutes on that failure, three on recovery and operations, and two to record decisions and unresolved risks. I would keep the rest at a stated high level so we leave with a design we can assess."
    },
    {
      "kind": "quiz",
      "q": "Ten minutes remain. Provider overload may violate delivery deadlines; three other topics are unexplored. How should you use the time?",
      "choices": [
        "Test that bottleneck and its failure policy, then record the remaining risks",
        "Give each of the four topics equal time regardless of user impact",
        "Add a second provider without checking its quota or duplicate-delivery behavior"
      ],
      "answer": 0,
      "why": "Use remaining depth to test the constraint most likely to invalidate the user promise. Extra providers need their own failure analysis."
    }
  ],
  "takeaway": "Lead with a user promise, make assumptions testable and spend depth where it can change the design."
};
