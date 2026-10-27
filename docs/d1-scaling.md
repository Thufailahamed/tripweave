# D1 limits and growth plan

D1 is the sole relational database. Verify the current numbers on Cloudflare's *D1 → Limits* page before each production milestone (they change).

Design rules already applied
- Prepared statements only; max ~80 bound parameters per statement (D1 allows 100) — `queryIn` chunks `IN (...)` lists.
- Pagination everywhere (`LIMIT/OFFSET`, page size ≤ 100); bounded provider results; optimiser candidate/beam limits.
- Tenant-first composite indexes (`organization_id, status, updated_at`, etc.).
- No external calls inside batches; `batch()` for atomic multi-statement writes; short operations.
- Binary data (images/PDFs) in R2. Large JSON is limited to snapshots (offers, packages, quote versions).
- Time-ordered lists add `rowid` tie-breakers for deterministic ordering.

Growth levers (in order), all within D1
1. **Prune derived data**: `supplier_offers` (30–60 day retention for offers not referenced by a package/quote), `external_api_usage`, `ai_usage`, `rate_limit_buckets` (hourly cron purges counters), expired `idempotency_keys`, `route_cache`.
2. **Archive cold tenant data to R2** as JSONL (closed trips older than N months) and keep an index row.
3. **Per-database sharding by tenant group**: D1 favours many smaller databases. Introduce a `DB_SHARD_n` binding map keyed by organisation and route in `packages/database` (repositories already take a `Db`). This keeps D1 as the only relational store.
4. Replace hot aggregate queries (dashboard/reports) with incrementally maintained summary rows.

Monitoring: D1 dashboard (rows read/written, storage), Worker CPU/duration, queue depth, `external_api_usage`, `/admin/metrics`.
