CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE auth_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX auth_rate_limits_cleanup_idx ON auth_rate_limits(updated_at);
