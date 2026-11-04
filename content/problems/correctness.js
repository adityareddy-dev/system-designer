// Unscored correctness checkpoints: prompts and editorial discussions keyed by problem id.
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
export default checkpoints;
