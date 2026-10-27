# TripWeave

AI-assisted accommodation optimisation and quotation SaaS for tour operators and hotel management companies, built on Cloudflare (Workers, D1, R2, Queues, Workflows, Workers AI) with Next.js and Hono.

> **Turn one tourist enquiry into several intelligently optimised, commercially accurate, client-ready accommodation packages in minutes.**

TripWeave is a professional operations tool, not a chatbot: an LLM extracts requirements and phrases explanations, while **deterministic code** does the combination search, pricing, margins and permissions. It never invents hotel prices, availability, reviews or booking confirmations — illustrative data is always labelled and cannot be quoted.

## Quick start (local)

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm --filter @tripweave/api db:migrate:local      # apply D1 migrations to the local (Miniflare) database
pnpm dev:api                                        # Hono Worker on http://localhost:8787 (D1, R2, KV, Queue, Workflow all local)
pnpm db:seed:local                                  # optional: illustrative demo data via the API
pnpm dev:web                                        # Next.js on http://localhost:3000 (proxies /api/* to the Worker)
```

Sign in with `demo@tripweave.example` / `Demo-Passw0rd1` (seed data, development only) or register a new organisation.

The platform admin portal lives at `/admin`. Promote an account locally (never share this SQL with an environment you do not control):

```bash
pnpm --filter @tripweave/api exec wrangler d1 execute tripweave --local --persist-to ../../.wrangler/state \
  --command "UPDATE users SET platform_role='platform_admin' WHERE email='demo@tripweave.example'"
```

See [docs/admin-portal.md](docs/admin-portal.md) for the full portal, security model and settings enforcement.

- Workers AI has no local emulation, so local requirement extraction uses the deterministic rule parser (clearly labelled "rules" in the UI). Test Workers AI with `wrangler dev --remote`.
- Without Hotelbeds or Amadeus credentials only company-managed inventory is searched (for local runs set `HOTEL_EXTERNAL_PROVIDER=hotelbeds,amadeus` in `.dev.vars` alongside the keys); enable the labelled mock provider in *Settings → Integrations* to see supplier-failure handling.

## Verify

```bash
pnpm test                    # 227 unit/integration/e2e tests (real migrations on SQLite, no live suppliers)
pnpm typecheck               # all packages, API and web
node scripts/ui-smoke.mjs     # headless-Chromium UI smoke (needs playwright-core + a running web app and the seeded API)
node scripts/admin-ui-smoke.mjs # headless-Chromium pass over every platform-admin section (requires a seeded admin)
node scripts/smoke.mjs       # end-to-end against a RUNNING API (local or deployed): register → hotels → optimise (Queue→Workflow) → quote → public link → PDF
```

## Documentation
| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Components, flows, decisions and known limitations |
| [docs/admin-portal.md](docs/admin-portal.md) | Platform admin portal: sections, security model, settings enforcement and API |
| [docs/deployment.md](docs/deployment.md) | Cloudflare resources, secrets, migrations, environments, verification checklist |
| [docs/pricing.md](docs/pricing.md) | Margin/markup maths, FX, rate precedence |
| [docs/security.md](docs/security.md) | Auth, tenancy, public links, edge configuration, gaps |
| [docs/d1-scaling.md](docs/d1-scaling.md) | D1 limits and the growth plan |
| [docs/frontend-conventions.md](docs/frontend-conventions.md) | UI rules |
| [docs/status.md](docs/status.md) | Phase report: what is implemented, what is not, credentials/approvals needed |

## Credentials and approvals you must obtain
Nothing external is assumed to be available. See `docs/status.md` for the full list (Cloudflare account resources, Hotelbeds API access and certification, Amadeus Self-Service keys, Google Routes key, email provider, Turnstile, legal review of terms/privacy).
