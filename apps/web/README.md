# apps/web — Next.js frontend on Cloudflare Workers

## Deployment path (verified locally)
Cloudflare's currently recommended route for Next.js is **vinext** (a Vite-based reimplementation of the Next.js API that targets Workers; documented as beta). `vinext check` reports this app **97% compatible** (0 issues; the single partial item is `reactStrictMode` on the App Router). It was set up with `vinext init --platform=cloudflare --cdn-cache=none --data-cache=none --image-optimization=none`:

- no CDN/response cache and no data cache: every page is authenticated, tenant-specific and API-driven, so caching would be a data-leak risk;
- no image optimisation: the app has no raster assets to optimise (hotel images are served by the API from R2).

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server (port 3000), `/api/*` rewritten to `http://localhost:8787` |
| `pnpm build` / `pnpm start` | Plain Next.js production build/server (useful for type/route validation) |
| `pnpm build:vinext` | Vite build of the Cloudflare Worker (`API_BASE_URL=… pnpm build:vinext` bakes a dev proxy rewrite in) |
| `pnpm start:vinext` | Run the built Worker locally under workerd (`vite preview`) |
| `pnpm deploy:vinext` | `vinext-cloudflare deploy` (needs a Cloudflare account/token) |

Verified in this repository: `vite build` succeeds; the built Worker runs under local workerd, serves every route and proxies `/api/*` to the API Worker; `node scripts/ui-smoke.mjs` (headless Chromium) passes against it. **Not verified:** an actual deployment to a Cloudflare account (no credentials were available).

## Limitations / notes
- `next/font/google`: under vinext fonts may load from the Google Fonts CDN at runtime. Self-host via `next/font/local` if that is unacceptable for privacy/CSP.
- `/api/*` in production is routed to the API Worker by a zone route (`app.example.com/api/*`, see `apps/api/wrangler.jsonc`), so no proxy, no CORS and first-party cookies. A production build without `API_BASE_URL` deliberately has no rewrite.
- `cloudflare.config.ts` sets the Worker name (`web`), compatibility date and the static-assets handler. Add your `accountId`, per-environment names and the hostname/route per Cloudflare's `cf` configuration docs before deploying.
- Fallback if vinext proves unsuitable: the OpenNext adapter (`@opennextjs/cloudflare`) is the other supported path; the app uses only standard App Router features, so migration is a build-config change.

## Structure
`app/(marketing)` public pages · `app/(auth)` sign-in/registration · `app/(app)` authenticated product (tenant shell) · `app/q/[token]` public client proposal · `features/*` feature components and query hooks · `components/ui` design-system primitives · `lib` API client, session, utilities. Conventions: `docs/frontend-conventions.md`.
