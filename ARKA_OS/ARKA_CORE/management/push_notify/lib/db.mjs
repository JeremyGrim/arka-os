import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const RUNTIME_ROOT = path.resolve('ARKA_META/.system/notify');
const DB_PATH = path.join(RUNTIME_ROOT, 'notify.db');
const SCHEMA_PATH = path.join(RUNTIME_ROOT, 'schema.sql');
const LEASE_ID = 'primary';
const HEARTBEAT_INTERVAL_MS = 2000;
const LEASE_TTL_MS = 10_000;

export function ensureDirectories() {
  fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
}

export function openDatabase() {
  ensureDirectories();
  const firstOpen = !fs.existsSync(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  if (firstOpen) {
    db.exec('ANALYZE;');
  }
  return db;
}

export function withTransaction(db, fn) {
  const wrap = db.transaction(fn);
  return wrap();
}

export function acquireLease(db, pid = process.pid) {
  const now = Date.now();
  const host = os.hostname();
  return withTransaction(db, () => {
    const row = db
      .prepare('SELECT holder_pid, heartbeat_at FROM notify_leases WHERE lease_id = ?')
      .get(LEASE_ID);
    if (row) {
      if (row.holder_pid === pid) {
        db.prepare(
          'UPDATE notify_leases SET heartbeat_at = ? WHERE lease_id = ?'
        ).run(now, LEASE_ID);
        return true;
      }
      if (row.heartbeat_at && now - row.heartbeat_at < LEASE_TTL_MS) {
        return false;
      }
      db.prepare(
        'UPDATE notify_leases SET holder_pid = ?, holder_host = ?, heartbeat_at = ? WHERE lease_id = ?'
      ).run(pid, host, now, LEASE_ID);
      return true;
    }
    db.prepare(
      'INSERT INTO notify_leases (lease_id, holder_pid, holder_host, heartbeat_at) VALUES (?, ?, ?, ?)'
    ).run(LEASE_ID, pid, host, now);
    return true;
  });
}

export function refreshLease(db) {
  return acquireLease(db, process.pid);
}

export function releaseLease(db) {
  withTransaction(db, () => {
    db.prepare('DELETE FROM notify_leases WHERE lease_id = ? AND holder_pid = ?').run(
      LEASE_ID,
      process.pid
    );
  });
}

export function vacuumIfNeeded(db) {
  const pageCount = db.pragma('page_count', { simple: true });
  if (pageCount > 10_000) {
    db.exec('VACUUM;');
  }
}

export { DB_PATH, RUNTIME_ROOT as NOTIFY_RUNTIME_ROOT, LEASE_ID, HEARTBEAT_INTERVAL_MS, LEASE_TTL_MS };
