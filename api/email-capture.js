import { HttpError } from './http.js';
import { cleanEmail } from './google.js';

export function captureInput(body) {
  const allowed = new Set(['email', 'marketingOptIn', 'purpose', 'page', 'source']);
  const email = cleanEmail(body.email);
  if (Object.keys(body).some(key => !allowed.has(key)) || !email || /[<>"'`\\\x00-\x1f\x7f]/.test(email)
    || typeof body.marketingOptIn !== 'boolean' || !['guide', 'updates'].includes(body.purpose)
    || (body.purpose === 'updates' && !body.marketingOptIn)
    || typeof body.page !== 'string' || !/^\/(?:guides|learn|p)\/[a-z0-9-]{1,100}\/$/.test(body.page)
    || typeof body.source !== 'string' || !/^[a-zA-Z0-9_.~-]{0,100}$/.test(body.source)) {
    throw new HttpError(400, 'bad-input', 'Enter an email address and choose whether to receive updates.');
  }
  return { ...body, email };
}

export function readingStore(db, tx, enqueue) {
  db.exec(`CREATE TABLE IF NOT EXISTS reading_contacts (
    email TEXT PRIMARY KEY, country TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL,
    captured_at INTEGER NOT NULL, marketing_optin_at INTEGER
  );`);
  const save = db.prepare(`INSERT INTO reading_contacts (email, country, page, source, captured_at, marketing_optin_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET
    country = CASE WHEN excluded.marketing_optin_at IS NOT NULL THEN excluded.country ELSE country END,
    source = CASE WHEN source = '' THEN excluded.source ELSE source END,
    marketing_optin_at = COALESCE(excluded.marketing_optin_at, marketing_optin_at)`);
  return {
    captureEmail({ email, marketingOptIn, page, source }, country, now) {
      return tx(() => {
        save.run(email, country, page, source, now, marketingOptIn ? now : null);
        // Access without updates leaves any existing subscription or opt-out untouched.
        if (marketingOptIn) enqueue(email, true, db.prepare('SELECT source FROM reading_contacts WHERE email = ?').get(email).source);
      });
    },
  };
}
