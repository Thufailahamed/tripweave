# Implementation status report

Covers roadmap phases 1–7 of the master prompt. "Verified" means executed in this repository's build environment (Windows, Node 24, workerd local runtime); nothing was deployed to a real Cloudflare account because no credentials were available.

## What was implemented

**Phase 1 – Foundation.** pnpm monorepo; Hono API Worker; Next.js app; Wrangler config (dev/staging/production, D1, R2, KV, Queue + DLQ, Workflow, Cron, service-less same-zone routing); 6 D1 migrations (≈45 tables, STRICT, FKs, tenant-first indexes); server-side session auth, password reset, lockout, rate limits, CSRF; RBAC with 6 roles / 27 permissions; tenant isolation; audit log; design system + app shell.

**Phase 2 – Hotels & commercial data.** Properties, images (R2), room types, suppliers, agreements (validity enforced), rate plans/rules with documented precedence, tax/service/extra-person rules, blackouts, inventory, change history, expiry warnings, partner sharing (per property or rate plan, scopes, time-boxed, contract details never shared), enquiries, CSV import (dry-run) / export, pricing engine (margin/markup/fixed, fees, commission, discount limits, approvals, rounding), BigInt-safe money and FX snapshots.

**Phase 3 – Trip planning.** Customers, trips, natural-language extraction (Workers AI JSON schema → Zod → grounding → deterministic fallback), clarifying questions, suggested (never silently final) overnight plans, editable itineraries with validation (gaps, detours, unrealistic legs), Leaflet map, Google Routes / OSRM adapters with labelled estimates.

**Phase 4 – Optimisation.** Provider abstraction (internal, Hotelbeds adapter, mock), normalisation, hard constraints, bounded beam search, five objectives with diversity, explainability, infeasibility analysis with relaxation suggestions, manual replacement + re-pricing with live supplier price checks, Queue → Workflow → D1 pipeline with idempotent claim/retry.

**Phase 5 – Quotations.** Versioned immutable snapshots, FX snapshot per version, optimistic concurrency, lifecycle with enforced transitions, maker-checker approval, secure share links bound to versions, client acceptance, branded PDF (pdf-lib on Workers) stored in R2, allow-listed client view, mobile-first public page.

**Phase 6 – Hardening.** 280 automated tests; security/tenant/abuse tests; supplier-failure tests; browser smoke test; docs.

**Phase 7 – Platform administration.** Dedicated `/admin` portal: platform overview with growth/activity/health alerts; organisation directory, creation, profile/status/subscription/team management; global user directory with account lifecycle, platform-role, membership, session, MFA and password-reset controls; optimisation job browser with cancel/retry; platform-wide audit log with tenant-metadata redaction; announcements and app-shell banner; email outbox with resend; provider/API/AI/sync telemetry; time-boxed support grants with immediate revocation; platform settings enforced server-side (sign-ups, maintenance mode, default limits, banner); manual maintenance runs; database footprint and integration status. `docs/admin-portal.md` documents the security model.

**Phase 8 – OpenUI planning assistant.** A finite, shared component allowlist; server-built, permission-filtered snapshots of the trip, itinerary, hotel offers and package pricing; provider-independent streaming generation; strict parser/ID/action validation; structured clarification forms; deterministic fallback and standard shadcn view; tenant, margin and role tests. `docs/openui-integration.md` documents the authority boundary, allowlist and verification.

**Phase 9 – Individual traveller product.** Personal workspaces (`organizations.account_kind = 'individual'`, restricted `staff` membership), traveller registration/session routing, a warm editorial shell, public landing at `/travel`, trip wizard with AI extraction + deterministic route suggestion, editable itinerary with map, OpenUI planner in traveller mode, stay optimisation with budget handoff, budget tracker, deterministic activity-aware packing, private notes, profile/password, expiring read-only share links, printable public trip page, Wikipedia discovery and archive. New tables: `trip_budget_items`, `trip_packing_items`, `trip_notes`, `trip_shares`. `docs/traveler.md` documents the surface and its limits.

## Verification performed
| Check | Result |
|---|---|
| `pnpm test` — 48 files, 430 tests (pricing, itinerary, optimiser, providers incl. Amadeus, AI, OpenUI planning, renderer incl. Unicode PDF, D1 repositories, API e2e, security, MFA/email verification, XLSX import, platform admin, traveller APIs/packing/public sharing) on real migrations over SQLite | pass |
| Migration 0006 applied with `wrangler d1 migrations apply --local` (real D1 runtime); `wrangler deploy --dry-run` bundles the Worker (4.7 MB, 1.6 MB gzip, within the 3 MB free-plan limit); `next build` passes | pass |
| Sample Sinhala/Tamil/Cyrillic/Greek quotation PDF rendered with pdf.js and inspected by eye | pass (see below) |
| `pnpm typecheck` (strict TS, all packages + API + web) | pass |
| Migrations applied with `wrangler d1 migrations apply --local` (real D1 runtime) | pass |
| `wrangler dev` (workerd; D1/R2/KV/Queue/Workflow local) + `scripts/smoke.mjs`: register → hotels → optimise via Queue→Workflow → quote → public link → PDF → client accept | pass |
| `next build` (40 routes) and `vite build` (vinext, Cloudflare Worker) | pass |
| Live Workers AI through AI Gateway `default` (Gemma 4 26B A4B); editorial planner and trip-dossier page in light, dark and mobile | pass (TripHero, destination photography, package tabs, budget meter, photographic trip cover, underline tabs; no fallback, no console/5xx errors) |
| Built Worker under local workerd + `scripts/ui-smoke.mjs` (headless Chromium): all pages, trip→packages, quote, mobile public page, signed-out redirect, no console/API errors | pass |
| Traveller API smoke (`scripts/traveler-smoke.mjs`): personal workspace → trip → confirmed itinerary → budget → generated packing → note → share → anonymous public view → revoke → 404 | pass |
| Traveller browser smoke (`scripts/traveler-ui-smoke.mjs`): landing → join → wizard → dossier → budget → packing → notes → share/public page → OpenUI planner → stays → itinerary → discover → profile → sign out/in, no page or API errors | pass |
| Deployment to Cloudflare | **not performed** |

## Defects found by verification and fixed (selection)
Admin routes shadowed all tenant routes; unused SQL parameter in `scope=own` listing; clock mismatch between API and DB layer; Budget Explorer not cost-minimising; Premium losing its combination to a balanced objective; supplier cost leaking to users without margin visibility (cost + selling price reveals margin); admin role escalation by non-owners; indicative-only shares exposing net amounts; approving a rejected quote version; partial pricing overrides resetting defaults; extra quote items dropped on revision; parser misses ("family of 4", trip-length nights).

## Not implemented / known limitations
- **No real booking or reservation workflow** (by design; offers are never presented as bookings). `booked` exists only as a state name. This applies to the individual traveller product too.
- **Traveller chat history is browser-local** (last 20 turns per trip, `localStorage`); it does not sync devices and the server still stores no transcripts. Traveller trips can be archived, not permanently deleted from the UI. Stay search needs an enabled provider. The traveller country selector is a practical shortlist while the API accepts any ISO alpha-2 code. Budget totals never convert unlike currencies; the UI warns instead.
- **Booking.com, Expedia Rapid, Agoda and others are NOT connected.** Booking.com's Demand API (accommodations is a beta) and Expedia Rapid are partner-gated: they need an approved partnership or certification before credentials exist, and their response schemas were not available to build against. Adapters should be written once sandbox access is granted. Scraping these sites is not an option (terms of service).
- **Amadeus Self-Service adapter** is written from the published OpenAPI specs and fixture-tested (9 tests) but has never run against the live API; it needs `AMADEUS_CLIENT_ID/SECRET`. Adults only, one-room pricing, no stars/reviews (see architecture.md).
- **Hotelbeds** adapter is fixture-tested against documented shapes; real use needs credentials, sandbox testing and Hotelbeds certification. Amenities/reviews stay empty (content API not integrated).
- **Workers AI** extraction path is exercised only with fake clients; no live model was called. Verify the configured model id and JSON-schema support in your account.
- **Email**: outbox always written; delivery via Resend only when configured (untested against the live API).
- **Turnstile**: server check and the browser widget are implemented, but the widget has only been type-checked and built, never shown against Cloudflare's real challenge (needs a site key).
- **Auth** uses PBKDF2 at the Workers limit (100k). Optional TOTP MFA and email verification are implemented and tested, but MFA is per-user only (no organisation-wide enforcement, no WebAuthn/passkeys, no SSO), and email verification is only enforced when `REQUIRE_EMAIL_VERIFICATION=true` and a real email provider is configured (unverified in this environment: email delivery is untested against Resend). The MFA/verification UI has been type-checked and built but not clicked through in a browser.
- **Reports** are operational (quotations, suppliers, AI usage) inside a tenant. Platform-wide analytics live in the admin portal overview; there is no separate BI export feed.
- **Support access is read-only.** Platform admins can manage organisations, users, subscriptions and platform settings, and can read grant-gated tenant content, but they cannot impersonate a tenant user or perform tenant workflow actions (create trips, send quotes). Add a membership if a human genuinely needs to operate inside a tenant.
- **PDF** embeds Noto Sans (Latin, Greek, Cyrillic), Noto Sans Sinhala and Noto Sans Tamil when a quotation contains such text, with proper shaping and mark placement (verified visually for Sinhala, Tamil, Cyrillic and Greek). Other scripts (Arabic and other right-to-left scripts, Hebrew, Devanagari, CJK, emoji) still print as `?`. Sinhala and Tamil are regular weight only, so bold headings in those scripts are not bold.
- XLSX import reads the first worksheet's cell values only (formulas use their cached result); it has been tested on generated workbooks, not on files saved by real Excel/LibreOffice/Google Sheets. Quote line-item sources are not exposed for prefill.
- Several list endpoints return raw snake_case rows (history/approvals/admin metrics); UI handles them. Left as is: converting them means changing the API contract and every consumer for no functional gain.
- Mock provider hint for non-admin roles.
- Legal pages are templates requiring counsel review. Route-matrix terms: Google results are intentionally not stored.

## Credentials / approvals / actions needed
1. Cloudflare account: create D1/R2/KV/Queues per environment (see `docs/deployment.md`), paste IDs; Workers paid plan for Queues/Workflows (verify); zone for `app.example.com`.
2. Secrets: `AMADEUS_CLIENT_ID/SECRET` (free self-service signup), `HOTELBEDS_API_KEY/SECRET` (needs Hotelbeds API agreement + certification), `GOOGLE_MAPS_API_KEY` (Routes API), `EMAIL_PROVIDER_API_KEY` + sender domain, `TURNSTILE_SECRET_KEY`, optional external LLM.
3. Create the first platform admin via SQL (see the deployment doc). The demo seed credentials must never reach a shared environment (`scripts/seed.mjs` refuses non-local URLs without `--force`).
4. Legal review of terms/privacy; data-protection assessment for customer PII; decide data-retention periods.
5. Choose and configure WAF/rate-limit rules (docs/security.md).

## Next concrete steps
1. Deploy to staging, run `scripts/smoke.mjs` and `scripts/ui-smoke.mjs` against it.
2. Obtain Hotelbeds sandbox credentials; run a live availability + checkrate trial; add recorded fixtures.
3. Run a Workers AI extraction pilot on real enquiries; tune the prompt/model; create a Turnstile site and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Add MFA/SSO and email verification; embed a Unicode font in the PDF renderer.
5. Pilot with 1–2 operators; capture feedback on scoring weights (`packages/optimisation-engine/src/scoring.ts`) and defaults.
