-- Platform administration: global settings, announcements and grant revocation.

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE platform_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('info','success','warning','danger')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_platform_announcements_status ON platform_announcements(status, created_at DESC);

-- Support grants can now be revoked before they expire, without deleting the audit trail.
ALTER TABLE platform_access_grants ADD COLUMN revoked_at TEXT;
CREATE INDEX idx_access_grants_org ON platform_access_grants(organization_id, expires_at DESC);
