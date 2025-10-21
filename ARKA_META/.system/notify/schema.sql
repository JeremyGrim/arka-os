PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS notify_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id       TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL,
  v                INTEGER NOT NULL,
  ts               INTEGER NOT NULL,
  project          TEXT,
  to_agent         TEXT,
  session          TEXT,
  provider         TEXT NOT NULL,
  session_prefix   TEXT NOT NULL,
  resource_pointer TEXT NOT NULL,
  constraints_json TEXT,
  metadata_json    TEXT,
  state            TEXT NOT NULL DEFAULT 'queued',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  INTEGER,
  error_last       TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  delivered_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notify_state_next
  ON notify_events(state, next_attempt_at, id);

CREATE INDEX IF NOT EXISTS idx_notify_session
  ON notify_events(session);

CREATE INDEX IF NOT EXISTS idx_notify_proj_agent
  ON notify_events(project, to_agent, provider, session_prefix);

CREATE TABLE IF NOT EXISTS notify_leases (
  lease_id     TEXT PRIMARY KEY,
  holder_pid   INTEGER,
  holder_host  TEXT,
  heartbeat_at INTEGER
);

CREATE TABLE IF NOT EXISTS notify_runs (
  run_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL,
  attempt_no       INTEGER NOT NULL,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  result           TEXT,
  error            TEXT,
  provider_profile TEXT,
  FOREIGN KEY(event_id) REFERENCES notify_events(id)
);

CREATE TABLE IF NOT EXISTS notify_dead_letters (
  event_id      INTEGER PRIMARY KEY,
  message_id    TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  cause         TEXT NOT NULL,
  dead_at       INTEGER NOT NULL,
  FOREIGN KEY(event_id) REFERENCES notify_events(id)
);

CREATE TABLE IF NOT EXISTS notify_actions (
  action_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     INTEGER,
  action       TEXT NOT NULL,
  target       TEXT,
  details_json TEXT,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY(event_id) REFERENCES notify_events(id)
);

CREATE INDEX IF NOT EXISTS idx_notify_actions_action
  ON notify_actions(action, created_at);
