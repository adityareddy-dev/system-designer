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
  const hit = db.prepare(`INSERT INTO event_counts VALUES (?,?,?,?,?,?,?,?,1)
    ON CONFLICT(day,name,id,screen,referrer,error_name,message,file) DO UPDATE SET count=count+1`);
  const visitor = db.prepare('INSERT INTO visitor_counts VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1');
  const feedback = db.prepare('INSERT INTO feedback VALUES (?,?,?,?,?)');
  return {
    countEvents(day, events, distinct) {
      tx(() => {
        for (const e of events) hit.run(day, e.name, e.id || '', e.screen, e.referrer || '', e.errorName || '', e.message || '', e.file || '');
        if (distinct) visitor.run(day);
      });
    },
    addFeedback: (f, day) => feedback.run(f.rating, f.comment, f.page, f.version, day),
    cleanupObservation(ms) {
      tx(() => {
        for (const table of ['event_counts', 'visitor_counts']) db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff(ms, 13));
        db.prepare('DELETE FROM feedback WHERE day < ?').run(cutoff(ms, 24));
      });
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    },
  };
}
