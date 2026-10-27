-- Quotations, versions, sharing, documents and notifications.

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preparing','ready_for_review','sent','viewed','accepted','rejected','expired','cancelled')),
  currency TEXT NOT NULL,
  valid_until TEXT,
  selected_package_id TEXT REFERENCES candidate_combinations(id) ON DELETE SET NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, quote_number)
) STRICT;
CREATE INDEX idx_quotes_org_status ON quotes(organization_id, status, updated_at DESC);
CREATE INDEX idx_quotes_trip ON quotes(trip_request_id);

CREATE TABLE quote_versions (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  itinerary_snapshot_json TEXT NOT NULL,
  pricing_snapshot_json TEXT NOT NULL,
  package_snapshot_json TEXT NOT NULL,
  total_cost_minor_units INTEGER NOT NULL,
  selling_price_minor_units INTEGER NOT NULL,
  gross_profit_minor_units INTEGER NOT NULL,
  gross_margin_basis_points INTEGER NOT NULL,
  fx_snapshot_json TEXT NOT NULL,
  terms_snapshot_json TEXT NOT NULL,
  internal_notes TEXT,
  approval_required INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (quote_id, version_number)
) STRICT;

CREATE TABLE quote_line_items (
  id TEXT PRIMARY KEY,
  quote_version_id TEXT NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost_minor_units INTEGER NOT NULL,
  total_cost_minor_units INTEGER NOT NULL,
  unit_selling_price_minor_units INTEGER NOT NULL,
  total_selling_price_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL,
  is_optional INTEGER NOT NULL DEFAULT 0,
  tax_details_json TEXT NOT NULL DEFAULT '{}',
  source_reference_json TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE INDEX idx_quote_items_version ON quote_line_items(quote_version_id, sort_order);

CREATE TABLE quote_shares (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  access_policy_json TEXT NOT NULL DEFAULT '{}',
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_quote_shares_quote ON quote_shares(quote_id);

CREATE TABLE quote_acceptances (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accept','reject')),
  accepted_by_name TEXT NOT NULL,
  accepted_by_email TEXT NOT NULL,
  comment TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE quote_status_history (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE quote_approvals (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  reasons_json TEXT NOT NULL,
  requested_by TEXT,
  decided_by TEXT,
  decision TEXT CHECK (decision IN ('approved','rejected')),
  decision_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  version_number INTEGER,
  r2_object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_documents_resource ON documents(organization_id, resource_type, resource_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_notifications_user ON notifications(organization_id, user_id, read_at, created_at DESC);

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  provider_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
) STRICT;
