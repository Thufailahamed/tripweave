CREATE TABLE booking_confirmations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_version INTEGER NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed','failed')),
  checked_at TEXT NOT NULL,
  valid_until TEXT,
  currency TEXT NOT NULL,
  total_cost_minor_units INTEGER NOT NULL,
  checks_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, reference)
) STRICT;
CREATE INDEX idx_booking_confirmations_quote ON booking_confirmations(quote_id, quote_version, created_at DESC);
