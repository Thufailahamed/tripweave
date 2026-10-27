-- Identity, tenancy, security primitives. SQLite/D1 compatible. Money = integer minor units, times = UTC ISO-8601 TEXT.

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  organization_type TEXT NOT NULL CHECK (organization_type IN ('tour_operator','hotel_management')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending','closed')),
  default_currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'Asia/Colombo',
  country TEXT NOT NULL DEFAULT 'LK',
  branding_configuration TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  identity_provider_subject TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  platform_role TEXT CHECK (platform_role IN ('platform_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','invited')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','staff','read_only','hotel_portfolio_manager')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
) STRICT;
CREATE INDEX idx_memberships_user ON organization_memberships(user_id, status);
CREATE INDEX idx_memberships_org ON organization_memberships(organization_id, status);

-- Server-side sessions. Only a SHA-256 hash of the opaque token is stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  active_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT
) STRICT;
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  safe_metadata_json TEXT NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_audit_org_time ON audit_events(organization_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);

-- Fixed-window rate-limit counters (best-effort abuse protection; WAF rules sit in front).
CREATE TABLE rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
) STRICT;

CREATE TABLE idempotency_keys (
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, key)
) STRICT;

-- Exceptional, time-boxed platform-staff access to tenant data (always audited).
CREATE TABLE platform_access_grants (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_access_grants_user ON platform_access_grants(platform_user_id, expires_at);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'active',
  seat_limit INTEGER NOT NULL DEFAULT 5,
  monthly_optimisation_limit INTEGER NOT NULL DEFAULT 200,
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE organization_settings (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, key)
) STRICT;
