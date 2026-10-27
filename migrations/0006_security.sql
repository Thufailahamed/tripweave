-- Email verification and TOTP multi-factor authentication.

ALTER TABLE users ADD COLUMN email_verified_at TEXT;
-- Accounts that exist before this migration are treated as verified so nobody is locked out on upgrade.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_email_verification_user ON email_verification_tokens (user_id);

-- One row per user. enabled_at is NULL while enrolment is pending (secret issued, code not yet confirmed).
-- The secret is stored encrypted (AES-GCM with a Worker secret); last_used_step blocks TOTP code replay.
CREATE TABLE user_mfa (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  enabled_at TEXT,
  last_used_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, code_hash)
) STRICT;

-- Short-lived, single-use proof that the password step succeeded; exchanged for a session after the second factor.
CREATE TABLE mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_mfa_challenges_user ON mfa_challenges (user_id);
