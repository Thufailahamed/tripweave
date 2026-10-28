# Deployment (Cloudflare)

Everything runs on Cloudflare: **no Vercel/Render/Railway, no Neon/Supabase/Postgres**. Resource IDs in `apps/api/wrangler.jsonc` are placeholders; create real ones per environment and paste the IDs. Verify current plan limits/pricing for Workers, D1, R2, Queues, Workflows, Workers AI and KV before choosing a plan (Queues and Workflows require a Workers paid plan at the time of writing — verify).

## 1. Create resources (per environment: staging, production)
```bash
cd apps/api
wrangler d1 create tripweave-staging            # → database_id into env.staging.d1_databases
wrangler r2 bucket create tripweave-media-staging
wrangler kv namespace create CACHE --env staging
wrangler queues create tripweave-jobs-staging
wrangler queues create tripweave-jobs-dlq-staging
```
Repeat with `production` names. Workflows (`tripweave-optimisation-<env>`) are created on first deploy from the `workflows` binding.

## 2. Secrets (never in the repo or `vars`)
```bash
wrangler secret put HOTELBEDS_API_KEY --env staging
wrangler secret put HOTELBEDS_SECRET  --env staging
wrangler secret put AMADEUS_CLIENT_ID     --env staging   # free self-service key from developers.amadeus.com
wrangler secret put AMADEUS_CLIENT_SECRET --env staging
wrangler secret put GOOGLE_MAPS_API_KEY --env staging
wrangler secret put EMAIL_PROVIDER_API_KEY --env staging
wrangler secret put TURNSTILE_SECRET_KEY --env staging
wrangler secret put MFA_ENCRYPTION_KEY --env staging   # 32+ random characters, e.g. `openssl rand -base64 32`; keep it stable: changing it locks users out of MFA
# optional external LLM
wrangler secret put LLM_API_KEY --env staging   # plus LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL as secrets or vars
```
Set `EMAIL_FROM_ADDRESS` (a var) and `APP_BASE_URL`, `HOTELBEDS_BASE_URL` / `AMADEUS_BASE_URL` (test vs live; Amadeus live is `https://api.amadeus.com` and needs a separate production key) in the env's `vars`. `ENABLE_MOCK_PROVIDER` must be `false` in production. `REQUIRE_EMAIL_VERIFICATION` is `true` in staging/production (a real email provider must be configured first, otherwise new users can never verify). For the web app, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time to show the bot check.

## 3. Database migrations
Migrations are explicit operator actions — **never run on Worker requests**.
```bash
pnpm --filter @tripweave/api db:migrate:staging      # wrangler d1 migrations apply tripweave-staging --remote --env staging
pnpm --filter @tripweave/api db:migrate:production
```
Take a D1 Time Travel bookmark / export before production migrations. Add new files as `migrations/000N_*.sql` (forward-only).

## 4. Deploy the API Worker
```bash
pnpm --filter @tripweave/api deploy:staging          # wrangler deploy --env staging
```
Route it on the app's hostname so cookies stay first-party and no CORS is needed: `routes: [{ pattern: "app.example.com/api/*", zone_name: "example.com" }]` (already templated per environment). Add the Cloudflare WAF/rate-limit rules from `docs/security.md`.

Create a platform administrator (no UI by design):
```bash
wrangler d1 execute tripweave-staging --remote --env staging --command "UPDATE users SET platform_role='platform_admin' WHERE email='you@example.com'"
```

## 5. Deploy the frontend
See `apps/web/README.md` for the verified Next.js-on-Workers path and commands used in this repository. The browser only talks to the app origin; `/api/*` is routed to the API Worker by the zone route above (in local dev `next.config.ts` rewrites `/api/*` to `API_BASE_URL`).

## 6. Post-deploy verification
1. `GET https://<host>/api/v1/health/ready` → `database: ok`, `storage/queue/workflow: configured`.
2. `node scripts/smoke.mjs https://<host>` (set `SMOKE_ORIGIN=https://<host>`): registers a throw-away org, runs the Queue → Workflow pipeline, builds a quote, opens the public link and renders the PDF in the Workers runtime. Delete the smoke org afterwards.
3. Sign in, open *Settings → Integrations* and confirm platform status (Hotelbeds/Amadeus/routing/AI/email) matches what you configured.
4. Check Workers Logs for `unhandled_error`, D1 metrics, Queue backlog and the DLQ.

## Environments
| | development | staging | production |
|---|---|---|---|
| D1 / R2 / KV / Queue | local (Miniflare) | `*-staging` | `*-production` |
| Workers AI | binding `AI` (`remote: true`) via AI Gateway `default` | binding `AI` via AI Gateway `default` | binding `AI` via AI Gateway `default` |
| Mock provider | allowed | allowed | **disabled** |
| Cookie | `tw_session` | `__Host-tw_session` (Secure) | `__Host-tw_session` (Secure) |

Workers AI requests are routed through AI Gateway `default` (`AI_GATEWAY_ID` in `wrangler.jsonc`). The gateway is in the same account as the Worker; the first authenticated Workers AI request can create `default`, or create a named gateway in **AI → AI Gateway** and set `AI_GATEWAY_ID` accordingly. Local `wrangler dev` uses the AI binding in `remote: true` mode, so it needs `wrangler login`; D1/R2/Queues remain local. If the binding is unavailable, both enquiry extraction and the planning assistant fall back to deterministic rules.

## Honest status
Deployment to a real Cloudflare account was **not performed** from this repository's build environment (no account credentials). Everything marked "verified" in `docs/status.md` was verified locally under `wrangler dev` (workerd, local D1/R2/KV/Queue/Workflow) and by the automated test suite.
