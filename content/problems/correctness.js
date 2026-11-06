// Concrete failure traces check correctness separately from the deterministic traffic score.
const delivery = {
  prompt: 'A worker sends a message, then crashes before recording success. What key and delivery states would you store so a retry does not send it twice?',
  discussion: 'Give each logical message a stable key, scoped to its recipient and channel, and enforce a unique constraint on that key. Save the request and an outbox entry in one transaction, then track pending, sending and delivered states. A queue alone does not prevent duplicates. If the provider accepts the send but the worker crashes, retry with the same provider idempotency key or query its status. Without provider support, exactly-once external delivery cannot be guaranteed: discuss whether a possible duplicate or a possible missed message is acceptable.'
};
const payment = {
  prompt: 'The payment provider times out after accepting a charge. What idempotency key and payment state transitions would make a second tap safe?',
  discussion: 'Use a stable key for the logical payment, not a new key for each attempt, and bind it to the payer, amount and currency. Enforce uniqueness and store pending, succeeded and failed states durably. A timeout leaves the outcome unknown, so reconcile with the provider using the same key rather than start a fresh charge. Apply callbacks conditionally so a late failure cannot overwrite success. Record the order update and its outbox event together; a cache lookup followed by a charge leaves a race.'
};
const booking = {
  prompt: 'Two people book the last available slot at once. What schema constraint and transaction would allow only one booking?',
  discussion: 'Identify the scarce resource and time range. Enforce uniqueness for fixed slots, or prevent overlapping reservations with a database constraint or serializable transaction. Check availability and create the reservation atomically in the authoritative store. Cached availability is only a hint. Give each booking request a stable key so retries return the original booking rather than consume another slot.'
};
const record = {
  prompt: 'The same request is delivered twice, and a worker can crash after saving it. What uniqueness constraint and transaction would keep one durable result?',
  discussion: 'Choose a stable business operation id and enforce a unique constraint in the authoritative store. Insert the id, apply the change and save its result in one transaction. A retry returns that result. Recording the id before the change can lose work after a crash; recording it afterwards can apply the change twice. If work continues through a queue, commit an outbox entry in the same transaction and deduplicate at each consumer.'
};
function seat(minutes) {
  return {
    prompt: `A ${minutes}-minute seat hold expires as payment succeeds. What seat schema and state transitions prevent two buyers from owning the seat?`,
    discussion: `Keep one authoritative row per flight or event and seat, with owner, hold token, expires_at and state. Acquire a ${minutes}-minute hold with an atomic conditional update. Move available to held to sold only if the buyer's token still owns an unexpired hold; the expiry worker must check that same token and state before releasing it. Enforce one sale per seat with a unique constraint. Charge using a stable payment idempotency key and reconcile unknown outcomes. If payment succeeds after the hold was lost, refund or void it instead of selling the seat again. Sync replication and a queue do not supply these transaction rules.`
  };
}
const checkpoints = {};
for (const id of ['notification-service', 'invoicing-billing', 'calendar-invites', 'lab-results']) checkpoints[id] = delivery;
for (const id of ['payments-checkout', 'payroll-run', 'food-delivery', 'bnpl-credit', 'tax-deadline-surge']) checkpoints[id] = payment;
for (const id of ['appointment-booking', 'restaurant-reservations', 'hotel-booking', 'vaccine-signup-surge']) checkpoints[id] = booking;
for (const id of ['ev-charging-network', 'bank-ledger', 'chat-app']) checkpoints[id] = record;
checkpoints['concert-ticket-drop'] = seat(5);
checkpoints['airline-booking'] = seat(15);
checkpoints['course-enrollment-day'] = {
  prompt: 'Two students claim the last seat, and one retries. What constraint and transaction prevent overselling or enrolling a student twice?',
  discussion: 'Enforce a unique constraint on course and student. In one transaction, create the enrollment and decrement remaining capacity only when it is positive. Roll back both changes on conflict. A repeated request returns the existing enrollment. A queue can smooth demand, but concurrent consumers still need the constraint and atomic capacity check.'
};
checkpoints['digital-wallet'] = {
  prompt: 'A transfer is retried while another transfer spends the same balance. What transaction and uniqueness rule prevent double spending or creating money?',
  discussion: 'Give each transfer a stable unique id. In one transaction, check available funds, debit the sender, credit the receiver and save the transfer result. Lock the affected balances in a consistent order or use serializable isolation with retries. A duplicate transfer id returns the saved result. Keep immutable balanced ledger entries for audit; a separate debit followed by a credit can lose money after a crash.'
};
checkpoints['flash-sale-inventory'] = {
  prompt: 'Two orders claim the last unit and one payment times out. What inventory transaction and payment states prevent overselling or charging twice?',
  discussion: 'Reserve stock with an atomic conditional decrement only when enough remains, and bind the reservation to a unique order id. Retries return the existing order. Track reserved, paid and released states; release only the reservation still owned by that order. Use a stable provider idempotency key for payment. A timeout is an unknown outcome, so reconcile before retrying or releasing. Refund a late success if the reservation was already released.'
};
checkpoints['bank-ledger'] = {
  prompt: 'What ledger invariant do you protect, and how do concurrent transfers and retries preserve it?',
  discussion: 'Every transfer has immutable entries whose debits equal credits, so money is conserved. Commit all entries, the unique transfer id and the saved result in one transaction. Lock balances in a consistent order or use serializable isolation with retries to prevent spending the same available funds twice. A retry returns the original result. A ledger component and synchronous replication alone do not prove these rules.',
  fields: [
    { label: 'Ledger invariant', options: ['Debits equal credits for each transfer', 'Balances will agree after reconciliation'], correct: 0, explanation: 'Debits and credits must balance within each committed transfer.' },
    { label: 'Transfer commit', options: ['Write debit and credit separately', 'Commit entries and unique transfer id atomically'], correct: 1, explanation: 'One transaction must commit both sides and the transfer id, or commit neither.' }
  ],
  limits: 'The traffic score does not verify balanced ledger entries, transaction isolation, available-funds checks or transfer uniqueness.'
};
checkpoints['concert-ticket-drop'].fields = [
  { label: 'Seat hold transaction', options: ['Read availability, then write a hold', 'Conditionally claim the seat in one transaction'], correct: 1, explanation: 'Claim the authoritative seat atomically and bind it to an owner, hold token and expiry. Expiry and sale must check that same token and state.' },
  { label: 'Payment timeout', options: ['Keep payment pending and reconcile with the same key', 'Mark it failed and charge with a fresh key'], correct: 0, explanation: 'A timeout leaves payment pending with an unknown outcome. Reconcile it using the same key. Confirm the sale only for a valid hold; refund or void a late success after the hold is lost. Terminal success must not be overwritten by a late failure.' }
];
checkpoints['concert-ticket-drop'].limits = 'The traffic score does not verify exclusive seat ownership, atomic hold expiry, payment state transitions or refunds after a lost hold.';
checkpoints['notification-service'] = { ...delivery,
  fields: [
    { label: 'Retry key', options: ['A new key for each delivery attempt', 'One stable message, recipient and channel key'], correct: 1, explanation: 'Retries must reuse the logical message key, scoped to recipient and channel, with durable uniqueness.' },
    { label: 'Provider accepted, worker crashed', options: ['Retry with the same provider key or query its status', 'Send again because local success is missing'], correct: 0, explanation: 'Reconcile the unknown outcome with provider idempotency or a status query. Without provider support, exactly-once external delivery cannot be guaranteed.' }
  ],
  limits: 'The traffic score does not verify key scope, atomic outbox writes or exactly-once delivery at an external provider.'
};
export default checkpoints;

const field = (label, options, correct, explanation) => ({ label, options, correct, explanation });
export function correctnessFor(problem) {
  const existing = checkpoints[problem.id] || problem.correctness;
  const words = [problem.brief, ...problem.clarify.map(c => c.a), ...(problem.requirements.notes || [])].join(' ');
  const deliveryProblem = /twice|duplicate|exactly.once|one.time|one unique key|counted twice|repeat.*send/i.test(words);
  const ordering = /sequence|ordering|order of edits|earliest order/i.test(words);
  const durable = problem.requirements.dataSafety !== 'best-effort';
  if (!existing && !deliveryProblem && !ordering && !durable) return null;
  const base = existing || (deliveryProblem && (problem.requirements.mix.notify || problem.requirements.mix.webhook || problem.requirements.mix.payment) ? delivery : record);
  const fields = base.fields || (base === booking ? [
    field('Two requests read the last available slot; one commits, then loses its reply. What protects the retry?', ['A cached availability check before each insert', 'A unique reservation key and an atomic conditional claim in the authoritative store'], 1, 'The committed reservation owns the resource. Retrying its stable key returns the same reservation; an independent read and insert can oversell.'),
    field('The first claim committed before the second request reaches the store. What must the second request do?', ['Reject that claim or offer another slot without decrementing inventory again', 'Accept it because both requests originally saw availability'], 0, 'Only the atomic check at commit can allocate the last resource. A stale search result is not ownership.'),
  ] : ordering ? [
    field('The leader commits operation 42, then crashes before replying. A retry arrives at the new leader. What happens?', ['Allocate a new sequence number and apply it again', 'Find the committed operation id and return its stored result'], 1, 'The new leader recovers the durable sequence and operation ids before accepting work.'),
    field('Two writers are separated by a partition. What preserves the promised order?', ['Fence the old leader and let only the agreed authority commit', 'Let both commit and sort by wall time later'], 0, 'Wall clocks do not prove one order. Fencing prevents an old leader from committing after ownership changes.'),
  ] : deliveryProblem && (problem.requirements.mix.notify || problem.requirements.mix.webhook || problem.requirements.mix.payment) ? [
    field('The provider accepts the operation, then the worker crashes before saving success. What state is durable?', ['Unknown outcome, with the original logical operation key', 'Failed, so the retry gets a new key'], 0, 'Missing local success does not prove the provider rejected the operation.'),
    field('The queue redelivers that operation. What can establish one external effect?', ['Check a local cache, then send without a provider key', 'Reuse the provider idempotency key or reconcile its recorded outcome'], 1, 'A local lookup and a remote side effect are not atomic. Without endpoint support, one external effect cannot be guaranteed; report uncertainty and choose an explicit recovery policy.'),
  ] : [
    field('The server commits a change, then crashes before replying. The client retries. What happens?', ['Commit the operation id, effect and result atomically; return that result on retry', 'Record the id first, then apply the change in a separate write'], 0, 'Recording the id separately can either lose an operation or apply it twice. The effect and deduplication result must commit together.'),
    field('The server acknowledges a write just before its storage fails. Which evidence meets the stated recovery point?', ['A queued backup request with no completed durable copy', problem.requirements.dataSafety === 'no-loss' ? 'A durable copy across the required failure boundary before acknowledgement' : 'A measured replication or backup gap of at most 60 seconds, with a tested replay plan'], 1, 'A scheduled copy is not a completed copy. Match acknowledgement and recovery to the stated loss boundary.'),
  ]);
  const checkpoint = { ...base, fields, version: 2 };
  if (!existing) checkpoint.prompt = `${problem.title}: ${base.prompt}`;
  // Preserve the named checkpoints for saved answers and callers that link to this registry.
  checkpoints[problem.id] = checkpoint;
  return checkpoint;
}
