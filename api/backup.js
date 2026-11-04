// Nightly SQLite backup: a consistent copy with VACUUM INTO, keeping the newest 7. Run by systemdesigner-api-backup.timer.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const KEEP = 7;
const dbPath = process.env.DB_PATH;
if (!dbPath || !fs.existsSync(dbPath)) {
  process.stderr.write('backup: DB_PATH is not set or the database does not exist yet.\n');
  process.exit(dbPath ? 0 : 1);
}
const dir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const out = path.join(dir, `systemdesigner-${stamp}.db`);
const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(out);
} finally {
  db.close();
}
fs.chmodSync(out, 0o600);

const old = fs.readdirSync(dir).filter((f) => /^systemdesigner-\d{8}T\d{6}Z\.db$/.test(f)).sort().reverse().slice(KEEP);
for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
process.stdout.write(`backup: wrote ${path.basename(out)}, removed ${old.length} old\n`);
