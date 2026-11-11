// Daily totals and anonymous feedback, with calendar-based retention.
export const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

export function cutoff(ms, months) {
  const d = new Date(ms), target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return dayOf(target);
}

export function observationStore(db, tx) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_counts (
      day TEXT NOT NULL, name TEXT NOT NULL, id TEXT NOT NULL, screen TEXT NOT NULL,
      referrer TEXT NOT NULL, error_name TEXT NOT NULL, message TEXT NOT NULL, file TEXT NOT NULL,
      count INTEGER NOT NULL, PRIMARY KEY(day,name,id,screen,referrer,error_name,message,file)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS visitor_counts (day TEXT PRIMARY KEY, count INTEGER NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS feedback (rating INTEGER NOT NULL, comment TEXT NOT NULL,
      page TEXT NOT NULL, version TEXT NOT NULL, day TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS feedback_day ON feedback(day);
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(feedback)').all().map(r => r.name));
  for (const column of ['helped', 'use', 'country', 'role']) {
    if (!columns.has(column)) db.exec(`ALTER TABLE feedback ADD COLUMN "${column}" TEXT NOT NULL DEFAULT ''`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL,
    rating INTEGER NOT NULL, page TEXT NOT NULL, version TEXT NOT NULL, comment TEXT NOT NULL,
    helped TEXT NOT NULL, "use" TEXT NOT NULL, country TEXT NOT NULL, role TEXT NOT NULL,
    name TEXT NOT NULL, title TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
    consent_version TEXT NOT NULL, consent_text TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS quotes_day ON quotes(day);`);
  const hit = db.prepare(`INSERT INTO event_counts VALUES (?,?,?,?,?,?,?,?,1)
    ON CONFLICT(day,name,id,screen,referrer,error_name,message,file) DO UPDATE SET count=count+1`);
  const visitor = db.prepare('INSERT INTO visitor_counts VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1');
  const feedback = db.prepare('INSERT INTO feedback (rating,comment,page,version,day,helped,"use",country,role) VALUES (?,?,?,?,?,?,?,?,?)');
  const quote = db.prepare('INSERT INTO quotes (rating,comment,page,version,day,helped,"use",country,role,name,title,email,consent_version,consent_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const referrers = db.prepare("SELECT DISTINCT referrer FROM event_counts WHERE day = ? AND referrer NOT IN ('', 'other') LIMIT 100");
  return {
    countEvents(day, events, distinct) {
      tx(() => {
        const known = new Set(referrers.all(day).map(row => row.referrer));
        for (const e of events) {
          let referrer = e.referrer || '';
          if (referrer && !known.has(referrer)) {
            if (known.size >= 100) referrer = 'other';
            else known.add(referrer);
          }
          hit.run(day, e.name, e.id || '', e.screen, referrer, e.errorName || '', e.message || '', e.file || '');
        }
        if (distinct) visitor.run(day);
      });
    },
    addFeedback(f, day) {
      tx(() => {
        const a = f.about || {}, values = [f.rating, f.comment, f.page, f.version, day, a.helped || '', a.use || '', a.country || '', a.role || ''];
        feedback.run(...values);
        if (f.quote) {
          const q = f.quote;
          quote.run(...values, q.name, q.title, q.email || '', q.consentVersion, q.consentText);
        }
      });
    },
    cleanupObservation(ms) {
      tx(() => {
        for (const table of ['event_counts', 'visitor_counts']) db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff(ms, 13));
        db.prepare('DELETE FROM feedback WHERE day < ?').run(cutoff(ms, 24));
        db.prepare('DELETE FROM quotes WHERE day < ?').run(cutoff(ms, 24));
        db.prepare("UPDATE quotes SET email = '' WHERE day < ? AND email != ''").run(cutoff(ms, 12));
      });
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    },
  };
}
