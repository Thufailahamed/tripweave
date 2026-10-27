# Security model

| Concern | Implementation |
|---|---|
| Sessions | Opaque 256-bit random token; only its SHA-256 is stored (`sessions`); HttpOnly + SameSite=Lax + Secure (`__Host-` prefix in staging/production); 14-day absolute expiry; revoked on logout, password change/reset, suspension. |
| Passwords | PBKDF2-HMAC-SHA256, 100k iterations (Workers cap), per-user salt, constant-work verification for unknown users, generic error messages, 5-failure account lock (15 min), per-IP and per-email rate limits. |
| Multi-factor | Optional per user. TOTP (RFC 6238, SHA-1, 6 digits, 30 s, ±1 step drift) with replay protection (the accepted time-step is stored and must increase). The seed is encrypted at rest with AES-256-GCM using the `MFA_ENCRYPTION_KEY` Worker secret; enrolment is refused if the key is absent and sign-in fails closed if it is later removed. Ten single-use recovery codes (only SHA-256 hashes stored). After the password step the API returns a 5-minute single-use challenge token, not a session; five wrong codes burn it. Disabling MFA or reissuing codes needs the password plus a current code. Tested against the RFC 6238 vectors in `apps/api/test/mfa.test.ts`. |
| Email verification | Registration emails a single-use link (48 h, only the hash stored). `REQUIRE_EMAIL_VERIFICATION=true` (set in staging/production) limits unverified accounts to `/auth/*`; platform admins are exempt. A completed password reset also verifies the address. Accounts that predate migration 0006 are marked verified. |
| CSRF | All unsafe methods need `X-Requested-With: tripweave` and, when present, an `Origin` equal to the app origin. No CORS is granted. |
| Tenant isolation | `organization_id` comes from the server-side session; every repository query is tenant-scoped; cross-tenant lookups return 404. Tested in `apps/api/test/*.test.ts` and `packages/database/src/repos.test.ts`. |
| Permissions | Role → permission matrix in `packages/shared/src/permissions.ts`, enforced per route with `requirePermission`. Margins (`margins:view`), contracts (`agreements:manage`), pricing/integration settings and team management are separate permissions. |
| Public quotations | 256-bit tokens (hash stored), expiry, revocation, bound to a quote **version**; identical 404 for unknown/expired/revoked; allow-listed client view only; `noindex`, `no-store`, strict CSP; rate limited. |
| Platform staff | No standing access to tenant data. A reason-bound, time-boxed grant is required and every grant and read is written to the tenant's audit log. |
| Audit | `audit_events` (actor, action, resource, safe metadata, request id). Keys that look like credentials are stripped before storage. |
| Secrets | Cloudflare secrets (`wrangler secret put`), never in `vars`, the repo, the browser or the audit log. |
| Uploads | JPEG/PNG/WebP only, 5 MB cap, magic-byte verification, stored in R2 under tenant-prefixed keys, served only to organisations that can see the property. |
| AI | Enquiry text is delimited data, never instructions; model output is schema-validated and grounded against the text; explanation rewrites are rejected if they add numbers or entities. AI never touches money or permissions. |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS in production, `no-store` on API responses. |

## Recommended Cloudflare edge configuration
- WAF managed rules + a rate-limiting rule on `POST /api/v1/auth/*` (e.g. 20 req/min/IP) and `/api/v1/public/*`.
- Turnstile: set `TURNSTILE_SECRET_KEY` on the API and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` when building the web app. The widget (`apps/web/components/turnstile.tsx`) is rendered on register and forgot-password only when the site key is present. If you add a Content-Security-Policy, allow `https://challenges.cloudflare.com` for `script-src`, `frame-src` and `connect-src`.
- Access to the Workers dashboard/API tokens limited by least privilege; separate staging/production resources.

## Known gaps / to review before production
Legal text is template-only; PBKDF2 at 100k iterations is below current OWASP guidance (a platform limit — consider an external IdP/WebAuthn); MFA is optional per user (no organisation-wide enforcement, no WebAuthn/passkeys, no SSO yet); an owner who loses both the authenticator and the recovery codes needs a platform operator to clear `user_mfa` after an out-of-band identity check; D1 rate-limit counters are best-effort; no malware scanning on uploads; no data-retention/erasure tooling yet.
