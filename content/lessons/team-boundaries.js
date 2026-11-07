// Lesson text and interactive figure stages.
export default {
  "id": "team-boundaries",
  "title": "Designs that other teams must live with",
  "track": "Lead the design",
  "minutes": 7,
  "summary": "A boundary is a contract and an operating responsibility, not just a box.",
  "steps": [
    {
      "kind": "read",
      "title": "A shared API changes under three teams",
      "text": "Your team renames a response field. The website updates, but a billing job and an old mobile client fail overnight. The data shape was an informal contract even though nobody wrote it down. A design crosses team boundaries whenever another team must depend on its behavior, availability or change schedule.",
      "icon": "ui.users"
    },
    {
      "kind": "figure",
      "figure": "team-boundaries",
      "view": "api",
      "title": "Put authority with an owner",
      "text": "Change a required API field and watch consumer contracts break. Keep v1, let measured usage fall as consumers migrate, then choose when to retire it."
    },
    {
      "kind": "read",
      "title": "Worked example: the on-call bill",
      "text": "Assume four services each produce two actionable pages a week, and each page consumes 45 minutes including follow-up. That is eight pages and six hours/week, or about 312 hours/year. If only three engineers can operate the stack, those pages and recovery work constrain delivery. Combining services will not automatically remove pages; eliminating duplicated failure paths or clarifying ownership might. For an API deprecation with 200 callers, suppose 180 migrate in month one. The last 20 may include the least observable batch jobs. Count actual endpoint use and caller identity rather than declaring 90% migration complete enough. This is an operating model, not a simulated page count."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Page load",
          "value": "≈ 6 hours/week",
          "how": "4 services × 2 pages × 45 minutes"
        },
        {
          "label": "Annual response time",
          "value": "≈ 312 hours",
          "how": "6 hours/week × 52; excludes preventive work"
        },
        {
          "label": "Remaining callers",
          "value": "20",
          "how": "200 - 180; risk depends on which callers remain"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Three teams write one table and each assumes another owns recovery. What must their contract establish?",
      "choices": [
        "A shared on-call channel with no authority to settle conflicting writes",
        "Allowed writers, invariant enforcement, recovery owner and change rules",
        "One API schema while leaving direct table writes unrestricted"
      ],
      "answer": 1,
      "why": "A communication channel and schema are useful, but do not assign data authority or recovery decisions."
    },
    {
      "kind": "defend",
      "q": "Where would you split this service? Follow-up: another team needs to change independently.",
      "checklist": [
        "Map writes that must commit together and assign their authority",
        "Explain whether an API boundary can preserve the invariant",
        "Assign versioning, dependency-failure behavior and recovery ownership"
      ],
      "model": "I would first map the writes that must commit together and who can operate them. A separate team can own a coherent capability through an API without directly mutating another team's tables. If that boundary splits an invariant, we need a redesigned workflow or must keep the transaction together. I would document data authority, versioning, failure behavior and on-call before treating independent deployment as a benefit. A module boundary may be enough until the operating case is clear."
    },
    {
      "kind": "read",
      "title": "Write a document people can disagree with",
      "text": "Start with the problem, user promises, explicit non-goals and measured constraints. Show one request path, data ownership and the key invariant. Record alternatives and why they lost, then failures, costs, security boundaries, rollout and open questions. Ask reviewers to challenge a specific decision. API contracts need field semantics, error states, idempotency, rate limits and compatibility rules; data contracts need schema, meaning, freshness and deletion behavior. Prefer additive changes, tolerant readers where safe and explicit versions for incompatible meaning. Publish deprecation dates, contact owners, instrument use, offer a migration path and test old clients. Remove the old endpoint only with evidence that consumers have moved or under an agreed exception policy. An empty dashboard is not proof if an annual job has not run."
    },
    {
      "kind": "quiz",
      "q": "Ninety percent of callers migrated to a new API. What evidence supports removing the old endpoint?",
      "choices": [
        "No calls appeared in the last month, even though annual jobs exist",
        "The website and newest mobile app pass their tests",
        "Remaining callers are identified and migrated or covered by an agreed exception policy"
      ],
      "answer": 2,
      "why": "Important infrequent or older consumers can remain after the most visible clients migrate."
    },
    {
      "kind": "defend",
      "q": "How will you deprecate an API used by teams you do not know? Follow-up: one annual caller never appears in the last month's logs.",
      "checklist": [
        "Inventory caller identities through credentials, code and owners",
        "Publish a replacement, support window and owner-tested migration",
        "Account for annual jobs and record exceptions before removal"
      ],
      "model": "I would inventory consumers from credentials, code references, owners and telemetry, then publish the replacement and a support window. Usage logs are evidence, but a month misses annual jobs. I would ask identified owners to test the replacement and check schedules, run a controlled warning phase and keep an explicit exception owner. Removal needs a decision about the remaining risk. I would record that decision so a future on-call engineer does not have to reconstruct it during an outage."
    },
    {
      "kind": "quiz",
      "q": "Two actions share a required local transaction invariant and one operating team. What is a reasonable initial boundary?",
      "choices": [
        "One cohesive module or service that commits the invariant locally",
        "Separate services with compensations assumed to preserve the same atomic visibility",
        "Separate services that each update their own row without a shared decision"
      ],
      "answer": 0,
      "why": "Splitting the writes changes failure and visibility semantics. Keep the transaction local unless another requirement warrants redesigning it."
    }
  ],
  "takeaway": "Name the invariant, the owner and the compatibility promise before drawing a team boundary."
};
