// Lesson text and interactive figure stages.
export default {
  "id": "work-across-services",
  "title": "Work across services",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Make each step durable and show the user what is still pending.",
  "steps": [
    {
      "kind": "read",
      "title": "Charged, but no order",
      "text": "Checkout calls inventory, then payments, then delivery. The payment succeeds just as the order service crashes. A retry cannot tell whether to charge again. There is no single database transaction across these services. The business needs a durable story for each intermediate state, including an unknown result.",
      "icon": "el.queue"
    },
    {
      "kind": "figure",
      "figure": "work-across-services",
      "view": "saga",
      "title": "Choose the transaction boundary",
      "text": "Choose a step to fail, then run the saga. Undo completed effects in reverse order. A compensation is a new action that can need its own retries."
    },
    {
      "kind": "figure",
      "figure": "work-across-services",
      "view": "outbox",
      "title": "Worked example: one durable order",
      "text": "Commit the order, crash before publishing, then restart. Compare a durable outbox intent with a direct publish. Repeated delivery must still deduplicate at the consumer."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Outage backlog",
          "value": "≈ 360,000 orders",
          "how": "200/s × 1,800 s"
        },
        {
          "label": "Workflow payload",
          "value": "≈ 720 MB",
          "how": "360,000 × 2 KB; before indexes and replicas"
        },
        {
          "label": "Catch-up",
          "value": "≈ 20 minutes",
          "how": "360,000 ÷ (500 - 200)/s"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "An outbox relay publishes, then crashes before marking the row sent. What protects a consumer's local effect on replay?",
      "choices": [
        "Producer-side broker deduplication alone",
        "A consumer cache of seen ids updated before the database mutation",
        "A unique event id committed with the effect and saved result"
      ],
      "answer": 2,
      "why": "A relay can republish, and a consumer can crash too. The deduplication record and local effect must commit together."
    },
    {
      "kind": "defend",
      "q": "Why not use two-phase commit for checkout? Follow-up: are sagas equally atomic?",
      "checklist": [
        "Check provider participation and locks held by prepared transactions",
        "Name pending payment and refund states visible during a saga",
        "Explain why a refund cannot undo fees or a shipment already sent"
      ],
      "model": "Our payment provider does not participate in our transaction, and holding inventory locks across a network failure is expensive. A saga fits local ownership, but it is not equally atomic: people may see an order waiting or a refund pending. I would define those states with product and finance, use stable keys, and reconcile unknown outcomes. If a closed set of databases provides a supported distributed transaction with acceptable availability, two-phase commit may still be a reasonable choice."
    },
    {
      "kind": "read",
      "title": "Bound the unfinished work",
      "text": "A broker acknowledgement is not proof that an order shipped. Persist saga state, retry with jitter, and alert on the age of pending work. Consumers need their own deduplication and local atomicity. Give each compensation its own stable key too. At 200 orders/s and a 30-minute downstream outage, about 360,000 orders accumulate. At 2 KB of durable workflow state each, that is about 720 MB before indexes and replicas. If recovery handles 500/s while new arrivals remain 200/s, net drain is 300/s and catch-up takes about 20 minutes. The UI should show received, awaiting payment, confirmed, refund pending and refunded as appropriate. Set a deadline and a support path for states automation cannot settle."
    },
    {
      "kind": "quiz",
      "q": "Checkout times out while calling a provider that may have accepted the charge. What should it do?",
      "choices": [
        "Show pending and reconcile using the same payment key",
        "Mark failed and submit a new key so the customer can retry",
        "Release the order and treat a later provider success as unrelated"
      ],
      "answer": 0,
      "why": "A timeout leaves an unknown outcome. Preserve the logical payment identity and handle a late success explicitly."
    },
    {
      "kind": "defend",
      "q": "Where exactly is the idempotency key stored? Follow-up: the worker crashes between checking the key and applying the change.",
      "checklist": [
        "Enforce event-key uniqueness in the inventory authority",
        "Commit deduplication, stock mutation and saved result together",
        "Persist external intent and reconcile with the same provider key"
      ],
      "model": "A separate cache check leaves a race. For a local inventory change I insert the unique event key, reserve stock and save the result in one transaction. A duplicate returns that result. For external effects I reuse the same provider idempotency key and use status lookup to reconcile. A negative lookup alone does not rule out an original request still in flight, so it cannot make blind resubmission safe. I persist an intent before the call and reconcile its outcome after a crash. No local table alone makes an unsupported external call exactly once."
    },
    {
      "kind": "quiz",
      "q": "Workers handle 250/s while arrivals stay at 300/s. No work expires or is shed. What happens to the backlog?",
      "choices": [
        "It drains at 250/s because all workers are running",
        "It grows by 50/s until service or admissions change",
        "It stops growing once retries use stable operation ids"
      ],
      "answer": 1,
      "why": "Deduplication avoids repeated effects, but unique arrivals still exceed service by 50/s."
    }
  ],
  "takeaway": "Commit locally, publish through an outbox, and make every later effect safe to repeat or reconcile."
};
