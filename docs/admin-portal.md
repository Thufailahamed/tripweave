# Platform admin portal

TripWeave has a dedicated platform-staff portal at `/admin`. It is separate from the tenant workspace and is only available to users whose `users.platform_role` is `platform_admin`.

## Sections

| Route | What it does |
|---|---|
| `/admin` | Platform overview: organisation/user/workload totals, 30-day growth, 14-day activity chart, job and quotation status mix, recent sign-ups, latest audit events, jobs needing attention, provider health, system configuration and live alerts. |
| `/admin/organizations` | Searchable/filterable tenant directory; create an organisation with a new or existing owner. |
| `/admin/organizations/:id` | Edit profile (name, slug, type, country, currency, timezone), change status (active / suspended / closed) with a mandatory reason, edit subscription and limits, manage team roles/status, request/revoke time-boxed support access, inspect usage and storage, and read tenant data under a grant. |
| `/admin/users` | Global account directory; create users, filter by organisation, status or platform-admin role. |
| `/admin/users/:id` | Edit identity/status/verification, grant or remove platform-admin rights, add organisation memberships, unlock accounts, send password resets, verify email, disable MFA, force sign-out, inspect sessions and activity, delete accounts. |
| `/admin/jobs` | Every optimisation job across tenants with status, progress, stage, duration and error. |
| `/admin/jobs/:id` | Job detail; cancel queued/running jobs; retry terminal jobs as new jobs (history preserved). Tenant request/result payloads require a support grant. |
| `/admin/audit` | Platform-wide audit log with action/resource/organisation/actor/date filters and safe metadata. Tenant business metadata is redacted without a live grant. |
| `/admin/communications` | Active announcements (app-shell banner) with schedule/status management, plus the email outbox with delivery status and resend. |
| `/admin/providers` | Provider health (24h/7d), external API usage, AI usage, supplier sync jobs, email delivery and integration status. |
| `/admin/support` | Active and historical support grants with immediate revocation. |
| `/admin/settings` | Platform switches (sign-ups, maintenance mode, announcement banner), support email, default plan limits, environment/binding status, platform-admin list, database row counts and manual hourly/daily maintenance runs. |

## Security model

- **Platform-admin gate.** Every `/api/v1/admin/*` route requires an authenticated session whose user has `platform_role = 'platform_admin'`. The web guard is cosmetic; the API enforces it independently.
- **Support grants.** Tenant business content (trips, quotes, customers, job payloads, tenant audit metadata) is only readable while the admin holds an unexpired, unrevoked `platform_access_grants` row for that organisation. Grants are reason-bound (10–500 characters) and last 5–240 minutes. Every read is audited.
- **Metadata redaction.** The platform-wide audit list always shows event type, actor, resource and timestamp. Metadata is hidden for tenant events without a grant.
- **Audit everything.** Admin views, status changes, subscription changes, member changes, user actions, grants, announcement changes, settings, job retries/cancels, email resends and maintenance runs are written to `audit_events` with `action = 'admin.*'`.
- **Self-protection.** Admins cannot suspend, demote or delete their own account. The last active owner of an organisation cannot be demoted or removed. A user who is the sole active owner of any organisation cannot be deleted. Credentials and tokens are stripped from audit metadata (`ops.sanitiseMetadata`).
- **Immediate revocation.** Suspending/closing an organisation revokes all member sessions. Suspending/removing a member, disabling MFA, changing a user to suspended, or force sign-out revokes that user's sessions.

## Platform settings enforcement

Settings are stored in `platform_settings` (one JSON row, key `platform`) and enforced by the API:

| Setting | Enforcement |
|---|---|
| `signupsEnabled` | `/auth/register` returns 403 when false. Existing accounts are unaffected. |
| `maintenanceMode` | A middleware returns `503 maintenance` for tenant/public endpoints while allowing `/auth/*`, `/health*`, `/public/platform` and `/admin/*` so operators can communicate and switch it off. |
| `supportEmail` | Returned on public platform status and maintenance error details. |
| `defaultSeatLimit` | Applied to newly registered/created organisations. |
| `defaultOptimisationLimit` | Applied to newly registered/created organisations. |
| `announcementBannerEnabled` | Master switch for the public announcement banner. |

The public (unauthenticated, non-sensitive) status endpoint is `GET /api/v1/public/platform`. It returns sign-up state, maintenance state, support email and the single newest active announcement inside its window. The app shell renders that announcement with per-announcement dismissal stored locally.

## API surface

All routes are under `/api/v1/admin` and require a platform-admin session.

| Method & path | Purpose |
|---|---|
| `GET /overview`, `GET /metrics` | Dashboard aggregates, activity series, alerts, provider health, recent audit. |
| `GET /search` | Organisation/user global search. |
| `GET /organizations`, `POST /organizations` | List/filter organisations; create with a new or existing owner. |
| `GET/PATCH /organizations/:id` | Detail (subscription, usage, members, grants, admin actions); edit profile. |
| `PATCH /organizations/:id/status` | Active/suspended/closed with an audited reason and session revocation. |
| `PUT /organizations/:id/subscription` | Plan, status, seats, monthly optimisation limit. |
| `GET/POST /organizations/:id/members`, `PATCH/DELETE /organizations/:id/members/:membershipId` | Team lifecycle with last-owner protection. |
| `GET/POST /organizations/:id/access-grants` | Grant history; request a time-boxed grant. |
| `GET /organizations/:id/support/{summary,trips,audit}` | Grant-gated tenant data reads (audited). |
| `GET /access-grants`, `DELETE /access-grants/:id` | Platform-wide grant history and immediate revocation. |
| `GET/POST /users`, `GET/PATCH/DELETE /users/:id` | Account directory, creation, lifecycle, platform role, deletion guards. |
| `POST /users/:id/{unlock,force-logout,send-password-reset,verify-email,mfa/disable}` | Account recovery and session controls. |
| `POST /users/:id/memberships` | Add a user to an organisation. |
| `GET /jobs`, `GET /jobs/:id` | Operational job listing and grant-gated payload/result detail. |
| `POST /jobs/:id/cancel`, `POST /jobs/:id/retry` | Stop a job; copy a terminal job into a fresh queued job. |
| `GET /audit`, `GET /audit/facets` | Platform-wide audit log with tenant-metadata redaction and filter facets. |
| `GET /emails`, `GET /emails/stats`, `POST /emails/:id/resend` | Outbox listing, delivery counts and resend. |
| `GET/POST /announcements`, `PATCH/DELETE /announcements/:id` | Banner lifecycle. |
| `GET /providers` | Provider health, external API usage, AI usage, sync jobs, email stats. |
| `GET/PUT /settings` | Platform settings, platform admins, DB row counts, environment bindings. |
| `POST /system/maintenance/{hourly,daily}` | Run scheduled housekeeping immediately. |

## Database changes (migration `0007_admin.sql`)

- `platform_settings(key, value_json, updated_by, updated_at)`
- `platform_announcements(id, title, body, tone, status, starts_at, ends_at, created_by, created_at, updated_at)`
- `platform_access_grants.revoked_at` (grants can be revoked without deleting the audit trail), plus an organisation index.

## First platform administrator

Registration never creates platform admins. Promote an existing account with SQL:

```bash
pnpm --filter @tripweave/api exec wrangler d1 execute tripweave --local --persist-to ../../.wrangler/state \
  --command "UPDATE users SET platform_role='platform_admin' WHERE email='you@example.com'"
```

```bash
wrangler d1 execute tripweave-staging --remote --env staging \
  --command "UPDATE users SET platform_role='platform_admin' WHERE email='you@example.com'"
```

The demo seed user (`demo@tripweave.example`) can be promoted locally for UI testing.

## Verification

```bash
pnpm test                                   # includes apps/api/test/admin.test.ts
pnpm typecheck
node scripts/admin-ui-smoke.mjs             # real headless-Chromium pass over every admin section
```

`scripts/admin-ui-smoke.mjs` requires the seeded demo user and a local promotion to platform admin (command above), plus the web app and API running.
