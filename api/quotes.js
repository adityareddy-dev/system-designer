// Owner-only removal using the local service database; no public route.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

try {
  const [command, value, ...extra] = process.argv.slice(2);
  const id = Number(value);
  if (command !== 'remove' || !/^[1-9][0-9]*$/.test(value || '') || !Number.isSafeInteger(id) || extra.length)
    throw new Error('Usage: node api/quotes.js remove <positive integer id>');
  const file = process.env.DB_PATH || fileURLToPath(new URL('./data/systemdesigner.db', import.meta.url));
  if (!fs.existsSync(file)) throw new Error('Database not found. Set DB_PATH to the service database.');
  const db = openDb(file);
  try {
    const result = db.raw.prepare('DELETE FROM quotes WHERE id = ?').run(id);
    if (!result.changes) throw new Error(`Quote ${id} not found.`);
    db.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    process.stdout.write(`Removed quote ${id}. Retained backups expire within 7 days.\n`);
  } finally { db.close(); }
} catch (e) { process.stderr.write(`quotes: ${e.message}\n`); process.exitCode = 1; }
