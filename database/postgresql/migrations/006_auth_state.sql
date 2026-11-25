-- Review before applying. Run transactionally as dc_migrator after 001-005.
-- Separate private technical schema; no changes to business tables.
CREATE SCHEMA dc_auth AUTHORIZATION dc_migrator;
REVOKE ALL ON SCHEMA dc_auth FROM PUBLIC;
CREATE TABLE dc_auth.sessions (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  CHECK (NOT revoked OR data = '{}'::jsonb)
);
CREATE INDEX sessions_expiration ON dc_auth.sessions(expires_at);
CREATE TABLE dc_auth.login_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  hits integer NOT NULL CHECK (hits >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_limits_expiration ON dc_auth.login_limits(expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA dc_auth FROM PUBLIC;
-- Runtime inherits dc_api. No DDL, sequences, business permissions or public API.
GRANT USAGE ON SCHEMA dc_auth TO dc_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON dc_auth.sessions, dc_auth.login_limits TO dc_api;