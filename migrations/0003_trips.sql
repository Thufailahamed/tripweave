-- Customers, trip requests, itineraries and optimisation results.

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  country TEXT,
  preferred_language TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_customers_org ON customers(organization_id, name);

CREATE TABLE trip_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  arrival_date TEXT,
  departure_date TEXT,
  party_configuration_json TEXT NOT NULL,
  budget_amount_minor_units INTEGER,
  budget_currency TEXT NOT NULL DEFAULT 'USD',
  budget_scope TEXT NOT NULL DEFAULT 'accommodation_only' CHECK (budget_scope IN ('accommodation_only','all_inclusive_trip')),
  preferred_hotel_category TEXT,
  preferred_meal_plan TEXT,
  special_requirements_json TEXT NOT NULL DEFAULT '{}',
  parse_result_json TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','needs_clarification','planning','optimised','quoted','won','lost','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_trips_org_status ON trip_requests(organization_id, status, updated_at DESC);
CREATE INDEX idx_trips_org_customer ON trip_requests(organization_id, customer_id);
CREATE INDEX idx_trips_org_arrival ON trip_requests(organization_id, arrival_date);

CREATE TABLE trip_status_history (
  id TEXT PRIMARY KEY,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE itineraries (
  id TEXT PRIMARY KEY,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  origin TEXT,
  arrival_information_json TEXT NOT NULL DEFAULT '{}',
  departure_information_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','suggested','confirmed','superseded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_request_id, version)
) STRICT;

CREATE TABLE itinerary_stops (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  destination TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  planned_activities_json TEXT NOT NULL DEFAULT '[]',
  travel_constraints_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  UNIQUE (itinerary_id, sequence_number)
) STRICT;

CREATE TABLE optimisation_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','infeasible','cancelled')),
  algorithm_version TEXT NOT NULL,
  request_json TEXT NOT NULL DEFAULT '{}',
  constraints_snapshot_json TEXT NOT NULL DEFAULT '{}',
  scoring_configuration_json TEXT NOT NULL DEFAULT '{}',
  fx_snapshot_json TEXT,
  result_summary_json TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_summary TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
) STRICT;
CREATE INDEX idx_jobs_org_trip ON optimisation_jobs(organization_id, trip_request_id, created_at DESC);
CREATE INDEX idx_jobs_status ON optimisation_jobs(status, created_at);

CREATE TABLE candidate_combinations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  optimisation_job_id TEXT NOT NULL REFERENCES optimisation_jobs(id) ON DELETE CASCADE,
  parent_combination_id TEXT REFERENCES candidate_combinations(id) ON DELETE SET NULL,
  combination_number INTEGER NOT NULL,
  objective_type TEXT NOT NULL,
  selected_offers_json TEXT NOT NULL,
  estimated_cost_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL,
  score REAL NOT NULL,
  objective_score REAL NOT NULL DEFAULT 0,
  score_breakdown_json TEXT NOT NULL DEFAULT '{}',
  package_json TEXT NOT NULL,
  feasibility_status TEXT NOT NULL DEFAULT 'feasible' CHECK (feasibility_status IN ('feasible','over_budget','invalid')),
  verification_summary_json TEXT NOT NULL DEFAULT '{}',
  manually_modified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_combos_job ON candidate_combinations(optimisation_job_id, combination_number);
CREATE INDEX idx_combos_org ON candidate_combinations(organization_id, created_at DESC);

CREATE TABLE candidate_combination_items (
  id TEXT PRIMARY KEY,
  combination_id TEXT NOT NULL REFERENCES candidate_combinations(id) ON DELETE CASCADE,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  cost_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL,
  UNIQUE (combination_id, stop_id)
) STRICT;
CREATE INDEX idx_combo_items_property ON candidate_combination_items(property_id);

CREATE TABLE partner_enquiries (
  id TEXT PRIMARY KEY,
  from_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  to_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  stay_start_date TEXT,
  stay_end_date TEXT,
  guests INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','closed')),
  response TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_enquiries_to ON partner_enquiries(to_organization_id, status, created_at DESC);
CREATE INDEX idx_enquiries_from ON partner_enquiries(from_organization_id, created_at DESC);
