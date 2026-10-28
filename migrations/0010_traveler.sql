-- Personal trip planning for individual travellers. A personal workspace is an organisation
-- with account_kind = 'individual'; existing trip/optimisation tables stay unchanged.

ALTER TABLE organizations ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'business'
  CHECK (account_kind IN ('business','individual'));

CREATE TABLE trip_budget_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transport','stay','food','activities','shopping','other')),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_budget_trip ON trip_budget_items (organization_id, trip_request_id, sort_order);

CREATE TABLE trip_packing_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('documents','clothing','toiletries','tech','health','other')),
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_packing_trip ON trip_packing_items (organization_id, trip_request_id, sort_order);

CREATE TABLE trip_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_notes_trip ON trip_notes (organization_id, trip_request_id, created_at DESC);

CREATE TABLE trip_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  include_budget INTEGER NOT NULL DEFAULT 1 CHECK (include_budget IN (0,1)),
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_trip_shares_trip ON trip_shares (organization_id, trip_request_id, revoked_at, expires_at);
