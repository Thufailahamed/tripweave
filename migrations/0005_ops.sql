-- Operational telemetry: provider health, external API usage, synchronisation jobs.

CREATE TABLE external_api_usage (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  provider_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_code TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  cost_micros INTEGER,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_api_usage_provider ON external_api_usage(provider_key, created_at DESC);
CREATE INDEX idx_api_usage_org ON external_api_usage(organization_id, created_at DESC);

CREATE TABLE supplier_sync_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  provider_key TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_summary TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
) STRICT;
CREATE INDEX idx_sync_jobs_provider ON supplier_sync_jobs(provider_key, created_at DESC);

CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  engine TEXT NOT NULL,
  model TEXT,
  input_chars INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_ai_usage_org ON ai_usage(organization_id, created_at DESC);
