-- Hotel content, supplier agreements, rates and inventory.

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  owner_organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','provider','seed','mock')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'LK',
  region TEXT,
  city TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  category TEXT NOT NULL DEFAULT 'standard' CHECK (category IN ('budget','standard','comfort','boutique','premium','luxury')),
  star_classification REAL,
  review_score REAL,
  review_source TEXT,
  preferred_partner INTEGER NOT NULL DEFAULT 0,
  amenities_json TEXT NOT NULL DEFAULT '[]',
  check_in_time TEXT NOT NULL DEFAULT '14:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  contact_information TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX idx_properties_slug ON properties(COALESCE(owner_organization_id, 'provider'), slug);
CREATE INDEX idx_properties_owner_city ON properties(owner_organization_id, city, status);
CREATE INDEX idx_properties_city ON properties(city, status);

CREATE TABLE property_images (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  r2_object_key TEXT,
  permitted_source_url TEXT,
  content_type TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  image_source TEXT NOT NULL DEFAULT 'upload',
  usage_rights_metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  CHECK (r2_object_key IS NOT NULL OR permitted_source_url IS NOT NULL)
) STRICT;
CREATE INDEX idx_property_images_property ON property_images(property_id, display_order);

CREATE TABLE room_types (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  bed_configuration_json TEXT NOT NULL DEFAULT '[]',
  maximum_adults INTEGER NOT NULL,
  maximum_children INTEGER NOT NULL DEFAULT 0,
  maximum_occupancy INTEGER NOT NULL,
  amenities_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (property_id, name)
) STRICT;

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  supplier_type TEXT NOT NULL DEFAULT 'direct_hotel',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  configuration_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX idx_suppliers_org_key ON suppliers(COALESCE(organization_id, 'platform'), provider_key, name);

CREATE TABLE supplier_agreements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  contract_reference TEXT NOT NULL,
  agreement_type TEXT NOT NULL DEFAULT 'net_rate',
  currency TEXT NOT NULL,
  commission_bp INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  terms_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','draft','terminated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, contract_reference),
  CHECK (effective_to >= effective_from)
) STRICT;
CREATE INDEX idx_agreements_org ON supplier_agreements(organization_id, status, effective_to);

CREATE TABLE partner_access (
  id TEXT PRIMARY KEY,
  source_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receiving_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('property','rate_plan')),
  resource_id TEXT NOT NULL,
  permitted_rate_scope TEXT NOT NULL DEFAULT 'net_rates' CHECK (permitted_rate_scope IN ('net_rates','indicative_only')),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  UNIQUE (source_organization_id, receiving_organization_id, resource_type, resource_id)
) STRICT;
CREATE INDEX idx_partner_access_receiver ON partner_access(receiving_organization_id, status, valid_until);

CREATE TABLE rate_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id TEXT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_agreement_id TEXT REFERENCES supplier_agreements(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  meal_plan TEXT NOT NULL CHECK (meal_plan IN ('RO','BB','HB','FB','AI')),
  rate_type TEXT NOT NULL DEFAULT 'contract',
  currency TEXT NOT NULL,
  pricing_basis TEXT NOT NULL DEFAULT 'per_room_per_night' CHECK (pricing_basis IN ('per_room_per_night','per_person_per_night')),
  cancellation_policy_json TEXT NOT NULL DEFAULT '{}',
  payment_terms_json TEXT NOT NULL DEFAULT '{}',
  effective_from TEXT NOT NULL,
  effective_to TEXT NOT NULL,
  minimum_nights INTEGER NOT NULL DEFAULT 1,
  maximum_nights INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (effective_to >= effective_from)
) STRICT;
CREATE INDEX idx_rate_plans_property ON rate_plans(property_id, status, effective_from, effective_to);
CREATE INDEX idx_rate_plans_org ON rate_plans(organization_id, status);

CREATE TABLE rate_rules (
  id TEXT PRIMARY KEY,
  rate_plan_id TEXT NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  applicable_start_date TEXT NOT NULL,
  applicable_end_date TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  occupancy_conditions_json TEXT NOT NULL DEFAULT '{}',
  tax_treatment_json TEXT NOT NULL DEFAULT '{}',
  extra_person_rules_json TEXT NOT NULL DEFAULT '{}',
  blackout_conditions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (applicable_end_date >= applicable_start_date)
) STRICT;
CREATE INDEX idx_rate_rules_plan ON rate_rules(rate_plan_id, applicable_start_date, applicable_end_date);

CREATE TABLE rate_change_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rate_plan_id TEXT NOT NULL,
  rate_rule_id TEXT,
  change_type TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_rate_history_plan ON rate_change_history(rate_plan_id, created_at DESC);

CREATE TABLE room_inventory (
  id TEXT PRIMARY KEY,
  room_type_id TEXT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  inventory_date TEXT NOT NULL,
  available_quantity INTEGER,
  inventory_source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL,
  UNIQUE (room_type_id, inventory_date)
) STRICT;

CREATE TABLE provider_property_mappings (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  external_property_id TEXT NOT NULL,
  internal_property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  mapping_confidence REAL NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  updated_at TEXT NOT NULL,
  UNIQUE (provider_key, external_property_id)
) STRICT;

CREATE TABLE supplier_offers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  external_offer_reference TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id TEXT REFERENCES room_types(id) ON DELETE SET NULL,
  room_type_name TEXT NOT NULL,
  stay_start_date TEXT NOT NULL,
  stay_end_date TEXT NOT NULL,
  occupancy_json TEXT NOT NULL,
  meal_plan TEXT NOT NULL,
  total_amount_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL,
  tax_amount_minor_units INTEGER,
  fee_amount_minor_units INTEGER,
  cancellation_terms_json TEXT NOT NULL DEFAULT '{}',
  payment_terms_json TEXT NOT NULL DEFAULT '{}',
  retrieved_at TEXT NOT NULL,
  expires_at TEXT,
  availability_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 0,
  offer_json TEXT NOT NULL,
  safe_provider_metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, provider_key, external_offer_reference)
) STRICT;
CREATE INDEX idx_supplier_offers_property ON supplier_offers(organization_id, property_id, stay_start_date);

CREATE TABLE exchange_rates (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  base_currency TEXT NOT NULL,
  rates_json TEXT NOT NULL,
  source TEXT NOT NULL,
  as_of TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_fx_org ON exchange_rates(organization_id, as_of DESC);

CREATE TABLE route_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  distance_km REAL,
  duration_minutes REAL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
