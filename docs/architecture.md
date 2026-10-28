# TripWeave architecture

TripWeave is a multi-tenant B2B SaaS that turns one tourist enquiry into several costed, client-ready accommodation packages. It is a **modular monolith** on Cloudflare: one Next.js frontend Worker, one Hono API Worker (which also hosts the Queue consumer, Workflow and Cron handlers), D1 as the only relational database, R2 for binaries.

```
Browser ──► Next.js Worker (apps/web) ──/api/*──► Hono API Worker (apps/api)
                                                     │  ├─ D1  (authoritative data, migrations/)
                                                     │  ├─ R2  (hotel images, quotation PDFs)
                                                     │  ├─ Queue "jobs" ──► consumer ──► Workflow "optimisation"
                                                     │  ├─ Workers AI via AI Gateway (requirement extraction + planning; rules fallback)
                                                     │  ├─ Cron (hourly / daily maintenance)
                                                     │  └─ adapters: Hotelbeds, Amadeus, Google Routes / OSRM, email (Resend)
```

## Repository layout

| Path | Responsibility |
|---|---|
| `packages/shared` | Types, Zod schemas, money (BigInt-safe minor units, FX), dates, permissions matrix, errors. Used by API **and** web. |
| `packages/pricing-engine` | Deterministic costing: rate precedence, nightly pricing, margin/markup/fee/discount maths, FX conversion, approval flags. |
| `packages/itinerary-engine` | Overnight-stop modelling, validation (gaps, detours, unrealistic legs), reorder, suggestion, gazetteer, labelled route estimates. |
| `packages/optimisation-engine` | Hard-constraint filtering, scoring, bounded **beam search**, diversity selection, infeasibility analysis, manual-selection evaluation, grounded explanations. No Cloudflare/HTTP dependencies. |
| `packages/provider-contracts` | `HotelProvider` interface, normalised offers, internal inventory provider, Hotelbeds + Amadeus adapters, mock provider, retry/timeout/concurrency helpers, multi-provider search. |
| `packages/ai` | Requirement parser (Workers AI via AI Gateway / external LLM / deterministic rules), clarifying questions, grounding guards, explanation polishing, OpenUI planning prompt/streaming. |
| `packages/proposal-renderer` | Client-view allow-list (`toClientView`), PDF (pdf-lib, Workers-compatible) and HTML renderers. |
| `packages/database` | D1 repositories (tenant-scoped SQL), clock injection, node:sqlite D1 emulation for tests. |
| `migrations/` | D1 migrations (SQLite SQL, STRICT tables, FKs, indexes). |
| `apps/api` | Hono app, auth/permission middleware, routes, services, Queue/Workflow/Cron entrypoints, integration tests. |
| `apps/web` | Next.js App Router UI. |

Boundaries: the frontend calls the API through typed fetch helpers; routes validate (Zod) and authorise before calling services; services use repositories; adapters normalise supplier data; engines are pure functions. Financial totals, permissions, availability and optimisation results are computed **only** on the server.

## Core flows

**Enquiry → structured trip.** `POST /trips/:id/parse` runs the parser (Workers AI JSON-schema output → Zod validation → bounded retries → grounding against the enquiry text → fallback to deterministic rules). Unknown values stay `null`; clarifying questions and a *suggested* overnight plan are returned for a person to confirm. Nothing is silently finalised.

**Optimisation pipeline** (`apps/api/src/services/optimisation.ts`):
1. `POST /trips/:id/optimisations` validates the itinerary, snapshots constraints/FX, inserts a `queued` job and sends a Queue message (inline `waitUntil` when no queue is bound, e.g. tests).
2. The consumer starts the **Workflow** (durable steps with retries) or runs the pipeline inline. Stages communicate through D1, never step outputs.
3. `claim` (atomic `queued→running`; duplicate messages are no-ops) → `fetch-candidates` (route legs; every provider per stop with timeout/retry/bounded concurrency; failures reported per provider, never fatal; offers persisted with provenance) → `search-and-persist` (beam search, diversity, packages + child rows, job finished, notification).
4. The UI polls `GET /optimisations/:id`.

**Quotation.** A package becomes `quote_versions` snapshots (itinerary, package with supplier offers, full pricing result, FX snapshot, terms). Versions are immutable; shares are bound to a version; the public client view is produced by an allow-list (`toClientView`) so internal costs, suppliers, contracts and notes cannot leak.

**Platform administration.** `/admin` is a separate portal for `platform_role = 'platform_admin'` users. It manages organisations, users/memberships, subscriptions, optimisation jobs, email delivery, announcements and platform-wide audit/provider telemetry. Tenant business content remains grant-gated: reads require an unexpired, reason-bound `platform_access_grants` row, are audited, and audit metadata is redacted without one. Platform settings (`platform_settings`) enforce sign-up availability, maintenance mode and default plan limits in the API. See `docs/admin-portal.md`.

## Data model notes
- Money: integer minor units; supplier currency and amount are always preserved next to converted values; margins in basis points.
- Dates: calendar dates `YYYY-MM-DD` (never timezone-shifted); timestamps UTC ISO strings.
- Tenancy: every private read/write is scoped by `organization_id` derived from the server-side session, never from client input. Partner sharing is explicit, time-boxed and per property or rate plan; contract/agreement details are never shared.
- JSON columns hold snapshots and flexible metadata only; queryable relations (combination items, quote line items, rules) are relational.

## Offer states
`estimated · company_managed · supplier_reported · live_checked · expired · unavailable · requires_confirmation · booked` plus availability `confirmed · unknown · on_request · unavailable`. Missing availability is **never** treated as confirmed. Mock offers carry `isMock`, can never be `live_checked`/`confirmed`, are labelled "illustrative" in every explanation and cannot be quoted. Nothing in the product books or confirms a reservation.

## Decisions and limitations
- **Auth**: server-side sessions (opaque 256-bit token, SHA-256 hash stored, HttpOnly SameSite=Lax cookie, 14-day expiry), PBKDF2-HMAC-SHA256 at the Workers maximum of 100k iterations, lockout + rate limits, CSRF custom-header + Origin check. An external OIDC provider can be added by populating `users.identity_provider_subject`.
- **Rate limiting** uses D1 fixed-window counters (best effort); put WAF rate-limiting rules in front for volumetric protection (see `docs/security.md`).
- **Google Routes** results are not stored (provider terms); estimates are labelled `estimated` and never presented as precise.
- **Hotelbeds** is implemented against its documented APItude shapes and tested with fixtures; it needs credentials and Hotelbeds' certification before production use. Amenities/reviews are content-API data and stay empty rather than invented.
- **Amadeus Self-Service** (Hotel List by geocode → Hotel Search v3) is implemented against the published OpenAPI specs and fixture-tested; it has not been run against the live API. Limits, all deliberate: adults only (searches with children are refused), one room is priced and multiplied by the room count (multi-room availability is reported `unknown`), and star rating/reviews/amenities stay empty. The free test environment only covers a subset of hotels with test prices.
- **Supplier selection** has three layers: `HOTEL_EXTERNAL_PROVIDER` (comma list, the platform allow-list), credentials present, and the organisation's per-supplier switch in *Settings → Integrations*.
- **PDF** text uses WinAnsi standard fonts (non-Latin characters are replaced with `?`); embed a Unicode font in `proposal-renderer` for full multilingual output.
- Rate-limit counters, route cache and KV are non-authoritative. KV is currently unused by core logic.
