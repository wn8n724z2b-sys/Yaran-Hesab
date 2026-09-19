CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS backup_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  file_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual'
);


CREATE TABLE IF NOT EXISTS security_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admin_password_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
