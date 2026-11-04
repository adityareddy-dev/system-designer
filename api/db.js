// SQLite storage (node:sqlite): users, their sign-in identities, sessions (hashed tokens only), synced progress and best scores per board.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(user_id);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  board TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  verified INTEGER NOT NULL,
  at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (board, user_id)
);
CREATE TABLE IF NOT EXISTS reports (
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (reporter_id, target_id)
);
DROP INDEX IF EXISTS scores_rank;
CREATE INDEX IF NOT EXISTS scores_rank2 ON scores(board, passed DESC, score DESC, at ASC, user_id ASC);
`;

const MAX_SESSIONS_PER_USER = 20;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  db.exec('PRAGMA user_version = 1;');

  const q = (sql) => db.prepare(sql);
  const st = {
    identity: q('SELECT user_id AS userId FROM identities WHERE provider = ? AND subject = ?'),
    addIdentity: q('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)'),
    addUser: q('INSERT INTO users (name, avatar, created_at) VALUES (?, ?, ?)'),
    user: q('SELECT id, name, avatar, created_at AS createdAt FROM users WHERE id = ?'),
    providers: q('SELECT provider FROM identities WHERE user_id = ? ORDER BY created_at, provider'),
    setAvatar: q('UPDATE users SET avatar = ? WHERE id = ?'),
    setName: q('UPDATE users SET name = ? WHERE id = ?'),
    nameTaken: q('SELECT 1 AS x FROM users WHERE lower(name) = lower(?) AND id != ? LIMIT 1'),
    deleteUser: q('DELETE FROM users WHERE id = ?'),
    addReport: q('INSERT OR REPLACE INTO reports (reporter_id, target_id, reason, at) VALUES (?, ?, ?, ?)'),
    addSession: q('INSERT INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: q('SELECT user_id AS userId FROM sessions WHERE hash = ? AND expires_at > ?'),
    dropSession: q('DELETE FROM sessions WHERE hash = ?'),
    trimSessions: q(`DELETE FROM sessions WHERE user_id = ? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ${MAX_SESSIONS_PER_USER})`),
    expire: q('DELETE FROM sessions WHERE expires_at <= ?'),
    progress: q('SELECT data FROM progress WHERE user_id = ?'),
    putProgress: q('INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
    score: q('SELECT score, stars, passed, verified, at, attempts FROM scores WHERE board = ? AND user_id = ?'),
    addScore: q('INSERT INTO scores (board, user_id, score, stars, passed, verified, at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'),
    betterScore: q('UPDATE scores SET score = ?, stars = ?, passed = ?, verified = ?, at = ?, attempts = attempts + 1 WHERE board = ? AND user_id = ?'),
    bumpAttempts: q('UPDATE scores SET attempts = attempts + 1 WHERE board = ? AND user_id = ?'),
    top: q(`SELECT s.user_id AS userId, s.score, s.stars, s.passed, s.verified, s.at, u.name
            FROM scores s JOIN users u ON u.id = s.user_id WHERE s.board = ?
            ORDER BY s.passed DESC, s.score DESC, s.at ASC, s.user_id ASC LIMIT ?`),
    ahead: q('SELECT COUNT(*) AS n FROM scores WHERE board = ? AND (passed > ? OR (passed = ? AND (score > ? OR (score = ? AND (at < ? OR (at = ? AND user_id < ?))))))'),
    count: q('SELECT COUNT(*) AS n FROM scores WHERE board = ?'),
  };

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  return {
    raw: db,
    close: () => db.close(),
    tx,

    // Finds the user behind a provider identity, links it to `currentUserId` when given, or creates a new user.
    signIn({ provider, subject, name, avatar, currentUserId = null }, now) {
      return tx(() => {
        const found = st.identity.get(provider, subject);
        if (found) {
          if (avatar !== undefined) st.setAvatar.run(avatar, found.userId);
          return { userId: Number(found.userId), created: false };
        }
        if (currentUserId && st.user.get(currentUserId)) {
          st.addIdentity.run(provider, subject, currentUserId, now);
          if (avatar) st.setAvatar.run(avatar, currentUserId);
          return { userId: Number(currentUserId), created: false, linked: true };
        }
        // Display names are unique, ignoring case: a taken name gets a short number so nobody can pass for a top player.
        let unique = name;
        for (let n = 0; st.nameTaken.get(unique, 0); n++) {
          const tag = ' #' + String(1000 + ((n * 7919 + Math.floor(now / 1000)) % 9000));
          unique = Array.from(name).slice(0, 24 - tag.length).join('').trim() + tag;
          if (n > 50) break;
        }
        const r = st.addUser.run(unique, avatar || null, now);
        const userId = Number(r.lastInsertRowid);
        st.addIdentity.run(provider, subject, userId, now);
        return { userId, created: true };
      });
    },
    user(id) {
      const u = st.user.get(id);
      if (!u) return null;
      return { id: Number(u.id), name: u.name, avatar: u.avatar || null, createdAt: Number(u.createdAt), providers: st.providers.all(id).map((r) => r.provider) };
    },
    nameTaken: (name, exceptId = 0) => !!st.nameTaken.get(name, exceptId),
    setName: (id, name) => st.setName.run(name, id),
    deleteUser: (id) => st.deleteUser.run(id),
    report: (reporter, target, reason, now) => st.addReport.run(reporter, target, reason, now),

    addSession(hash, userId, now, ttlMs) {
      st.addSession.run(hash, userId, now, now + ttlMs);
      st.trimSessions.run(userId, userId);
    },
    sessionUser(hash, now) {
      const r = st.session.get(hash, now);
      return r ? Number(r.userId) : null;
    },
    dropSession: (hash) => st.dropSession.run(hash),
    expireSessions: (now) => st.expire.run(now),

    progress(userId) {
      const r = st.progress.get(userId);
      if (!r) return null;
      try { return JSON.parse(r.data); } catch { return null; }
    },
    putProgress: (userId, data, now) => st.putProgress.run(userId, JSON.stringify(data), now),

    // Keeps the best score per user and board. Returns { improved, best }.
    recordScore({ board, userId, score, stars, passed, verified }, now) {
      return tx(() => {
        const prev = st.score.get(board, userId);
        if (!prev) {
          st.addScore.run(board, userId, score, stars, passed ? 1 : 0, verified ? 1 : 0, now);
          return { improved: true, best: { score, stars, passed: !!passed, verified: !!verified, at: now, attempts: 1 } };
        }
        const np = passed ? 1 : 0;
        if (np > Number(prev.passed) || (np === Number(prev.passed) && score > prev.score)) {
          st.betterScore.run(score, stars, passed ? 1 : 0, verified ? 1 : 0, now, board, userId);
          return { improved: true, best: { score, stars, passed: !!passed, verified: !!verified, at: now, attempts: Number(prev.attempts) + 1 } };
        }
        st.bumpAttempts.run(board, userId);
        return { improved: false, best: { score: Number(prev.score), stars: Number(prev.stars), passed: !!prev.passed, verified: !!prev.verified, at: Number(prev.at), attempts: Number(prev.attempts) + 1 } };
      });
    },
    top(board, limit) {
      return st.top.all(board, limit).map((r, i) => ({
        rank: i + 1, userId: Number(r.userId), name: r.name, score: Number(r.score), stars: Number(r.stars),
        passed: !!r.passed, verified: !!r.verified, at: Number(r.at),
      }));
    },
    rankOf(board, userId) {
      const s = st.score.get(board, userId);
      if (!s) return null;
      const ahead = Number(st.ahead.get(board, s.passed, s.passed, s.score, s.score, s.at, s.at, userId).n);
      return { rank: ahead + 1, score: Number(s.score), stars: Number(s.stars), passed: !!s.passed, verified: !!s.verified, at: Number(s.at) };
    },
    count: (board) => Number(st.count.get(board).n),
  };
}
