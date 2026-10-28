# TripWeave for Individuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a complete personal trip-planning product for individual travellers: registration, trip creation from an idea, OpenUI planning, editable itinerary, stay options, budget, packing, notes, sharing and print.

**Architecture:** Personal workspaces are ordinary tenants with `account_kind = 'individual'` and the `staff` role, so the existing trip, itinerary, optimisation and package services are reused unchanged. Four consumer-only tables hold budget items, packing items, notes and share tokens. A separate Next.js route group under `/travel` provides the traveller shell; the only AI-authored output continues to be an OpenUI program streamed by the existing planning endpoint.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Tailwind v4, Hono, D1/SQLite, Zod 4, OpenUI (`@openuidev/lang-core`, `@openuidev/react-lang`), Vitest, Leaflet.

**Spec:** `docs/superpowers/specs/2026-10-28-tripweave-individuals-design.md`

## Global Constraints

- Node 22+, pnpm 12, strict TypeScript; do not relax compiler options.
- All money is integer minor units; dates are `YYYY-MM-DD` and rendered in UTC.
- Every private query is scoped by the session's `organization_id`; never accept an org id from the browser.
- New write routes validate bodies with Zod and are rate-limited per user or IP.
- The traveller API requires `account_kind = 'individual'`; the operator UI must redirect individual workspaces to `/travel/trips`.
- Model output never writes prices, ratings or URLs; those render from server snapshots.
- Do not add a generic `Text`, `HTML`, `Button`, `Image`, `Link` or URL component to OpenUI.
- No real booking or payment action; availability language must follow existing supplier labels.
- Existing operator tests, routes and marketing pages must remain green.

## Review Focus

- A business account calling any `/api/v1/traveler/*` route must get 403, and a traveller must never read another traveller's trip, budget, packing, notes or share.
- An expired, revoked or unknown share token must return the same 404 and must not leak whether a trip exists.
- A trip created from a prompt with missing dates or destinations must still be created, with an actionable draft, rather than failing after partial writes.
- An itinerary with only one stop, or one whose dates touch the trip boundaries, must save without an unhandled validation error.
- A budget with items in more than one currency, or a trip with no budget, must display totals honestly and never subtract unlike currencies.
- A packing generate pressed twice must not duplicate items; checked items must survive regeneration.
- The OpenUI traveller mode must hide quote actions and route itinerary/stays clicks into `/travel`, while the operator mode keeps its existing behaviour.

---

### Task 1: Personal workspace identity, shared contracts and schema

**Files:**
- Create: `migrations/0010_traveler.sql`
- Create: `packages/shared/src/traveler.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/database/src/repos/identity.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/test/harness.ts`
- Create: `apps/api/test/traveler.test.ts`

**Interfaces:**
- Produces:
  - `AccountKind = "business" | "individual"`.
  - `travelerRegisterSchema` (email, password, displayName, country, defaultCurrency, timezone, homeCity?, interests?, pace?, turnstileToken?).
  - `TravelerProfile`, `TravelerBudgetItem`, `TravelerPackingItem`, `TravelerNote`, `TravelerShare`, `TravelerPublicTripView`.
  - `identity.createTravelerWorkspace(db, input): Promise<{ organizationId: string; userId: string }>`.
  - `identity.updateUserDisplayName(db, userId, displayName): Promise<void>`.
  - `AuthContext.accountKind: AccountKind | null`.
  - `requireTraveler` middleware and `getTraveler(c)`.
  - `Harness.registerTraveler(name, email?)`.
- API contract: `POST /api/v1/auth/register-traveler` returns 201 `{ data: SessionDescription }` with `organization.accountKind === "individual"` and `organization.role === "staff"`.

- [x] **Step 1: Write the failing API test**

In `apps/api/test/traveler.test.ts`, add:

```ts
import { describe, expect, it } from "vitest";
import { PASSWORD, Harness } from "./harness";

describe("traveller workspaces", () => {
  it("creates a personal workspace with a restricted role and an individual session", async () => {
    const h = new Harness();
    const c = await h.registerTraveler("Maya");
    const me = await c.ok("GET", "/auth/me");
    expect(me.organization.accountKind).toBe("individual");
    expect(me.organization.role).toBe("staff");
    expect(me.permissions).not.toContain("margins:view");
    const trips = await c.ok("GET", "/trips");
    expect(trips.items).toEqual([]);
  });

  it("rejects a business account on traveller-only routes", async () => {
    const h = new Harness();
    const business = await h.register("Acme", "tour_operator");
    const res = await business.get("/traveler/profile");
    expect(res.status).toBe(403);
  });
});
```

`/traveler/profile` will exist in Task 2; keep the second test skipped until then or add it in Task 2. For Task 1, assert `requireTraveler` via a temporary route? Better move the 403 test to Task 2. Keep only the first test in Task 1.

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: FAIL because `registerTraveler` and `/auth/register-traveler` do not exist.

- [x] **Step 3: Add the migration**

Create `migrations/0010_traveler.sql` with:

```sql
ALTER TABLE organizations ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'business'
  CHECK (account_kind IN ('business','individual'));

CREATE TABLE trip_budget_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transport','stay','food','activities','shopping','other')),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_budget_trip ON trip_budget_items (organization_id, trip_request_id, sort_order);

CREATE TABLE trip_packing_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('documents','clothing','toiletries','tech','health','other')),
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_packing_trip ON trip_packing_items (organization_id, trip_request_id, sort_order);

CREATE TABLE trip_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_notes_trip ON trip_notes (organization_id, trip_request_id, created_at DESC);

CREATE TABLE trip_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_request_id TEXT NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  include_budget INTEGER NOT NULL DEFAULT 1 CHECK (include_budget IN (0,1)),
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_trip_shares_trip ON trip_shares (organization_id, trip_request_id, revoked_at, expires_at);
```

- [x] **Step 4: Add shared contracts**

In `packages/shared/src/traveler.ts` define the categories, pace, interfaces and Zod schemas listed in the Interfaces block. Use `SUPPORTED_CURRENCIES` from `./money` for currency enums and exercise the same password rule as `passwordSchema` (`min(10).max(200)` with at least one letter and one digit). Export it from `packages/shared/src/index.ts`.

- [x] **Step 5: Extend the identity repository**

Add `accountKind` to `OrganizationRow` and map `r.account_kind`. Add
`organizationAccountKind` to `MembershipRow`, select it in `listUserMemberships` and
`getMembership`, and set it from `o.account_kind`.

Add:

```ts
export async function createTravelerWorkspace(
  db: Db,
  input: {
    organizationName: string;
    slug: string;
    country: string;
    currency: string;
    timezone: string;
    user: { email: string; displayName: string; passwordHash: string };
  },
): Promise<{ organizationId: string; userId: string }>
```

The batch inserts the organisation with `account_kind = 'individual'`, the user, a
`staff` membership and a subscription with `seat_limit = 1`. Return the ids.

Add `updateUserDisplayName(db, userId, displayName)` updating `users.display_name` and
`updated_at`.

Export the new repo as `export * as traveler from "./repos/traveler";` when Task 2 adds it.

- [x] **Step 6: Wire the session and middleware**

In `apps/api/src/env.ts` add `accountKind: AccountKind | null` to `AuthContext`.

In `middleware/auth.ts` set `accountKind: chosen?.organizationAccountKind ?? null` in
`authenticate`. Add:

```ts
export function getTraveler(c: AppContext): AuthContext & { organizationId: string; accountKind: "individual" } {
  const t = getTenant(c);
  if (t.accountKind !== "individual") throw new AppError("forbidden", "This area is for personal trip planning");
  return t as AuthContext & { organizationId: string; accountKind: "individual" };
}
export const requireTraveler: MiddlewareHandler<Bindings> = async (c, next) => { getTraveler(c); await next(); };
```

In `routes/auth.ts`:
- `POST /register-traveler`, rate limit 10/hour/IP, Turnstile and platform sign-up checks.
- Reject an existing email with the same conflict message as `/register`.
- Build a slug from `${displayName} travels` via `identity.uniqueSlug`.
- Insert `pricing` via `pricingConfigSchema.parse({})` and `traveler` settings from the
  optional home city/interests/pace.
- Update the subscription to `seatLimit: 1`.
- Audit `traveler.workspace_created`.
- Start the session with the new org, send the verification email, set `auth` with
  `accountKind: "individual"` and return `describeSession`.
- `describeSession` adds `accountKind` to `organization`.
- `completeLogin`, `/register` and `/switch-organization` set `accountKind` from the
  membership/organisation.
- `login` needs no request change; the default redirect is a web concern.

- [x] **Step 7: Add the harness helper**

In `apps/api/test/harness.ts` add:

```ts
async registerTraveler(name: string, email?: string): Promise<Client> {
  const c = this.client();
  const r = await c.post("/auth/register-traveler", {
    email: email ?? `${name.toLowerCase().replace(/\W+/g, "")}@example.com`,
    password: PASSWORD,
    displayName: `${name} Traveller`,
    country: "LK",
    defaultCurrency: "USD",
    timezone: "Asia/Colombo",
  });
  if (r.status !== 201) throw new Error(`registerTraveler failed: ${r.status} ${r.text}`);
  return c;
}
```

- [x] **Step 8: Run the test and fix the seam**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: PASS. Then run `pnpm vitest run apps/api/test/e2e.test.ts apps/api/test/mfa.test.ts` to confirm existing registration/session tests still pass.

- [x] **Step 9: Commit**

```bash
git add migrations/0010_traveler.sql packages/shared/src packages/database/src apps/api/src/env.ts apps/api/src/middleware/auth.ts apps/api/src/routes/auth.ts apps/api/test/harness.ts apps/api/test/traveler.test.ts
git commit -m "feat(traveler): add personal workspaces and traveller identity"
```

---

### Task 2: Budget, packing, notes, profile and share APIs

**Files:**
- Create: `packages/database/src/repos/traveler.ts`
- Modify: `packages/database/src/index.ts`
- Create: `apps/api/src/routes/traveler.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/traveler.test.ts`

**Interfaces:**
- Produces:
  - `traveler.listBudgetItems/createBudgetItem/updateBudgetItem/deleteBudgetItem`.
  - `traveler.listPackingItems/createPackingItem/updatePackingItem/deletePackingItem/addPackingItemsIfMissing`.
  - `traveler.listNotes/createNote/updateNote/deleteNote`.
  - `traveler.createShare/listActiveShares/getActiveShareByTokenHash/revokeShare/revokeActiveShares/recordShareView`.
  - Router mounted at `/api/v1/traveler`:
    - `GET|PATCH /profile`
    - `GET|POST /trips/:id/budget`, `PATCH|DELETE /trips/:id/budget/:itemId`
    - `GET|POST /trips/:id/packing`, `PATCH|DELETE /trips/:id/packing/:itemId`, `POST /trips/:id/packing/generate`
    - `GET|POST /trips/:id/notes`, `PATCH|DELETE /trips/:id/notes/:noteId`
    - `GET|POST /trips/:id/shares`, `DELETE /trips/:id/shares/:shareId`
  - `POST /trips/:id/shares` returns `{ share, url }`; only the SHA-256 hash is stored.
- Request bodies use the shared traveler schemas. `POST /packing/generate` takes `{}` and is idempotent by label.

- [x] **Step 1: Write failing tests**

Extend `apps/api/test/traveler.test.ts` with a setup helper that creates a traveller,
creates a trip (two adults, 2026-12-10 → 2026-12-14), saves a two-stop itinerary, and
returns `{ h, c, tripId }`.

Assert:
- Budget create/list/update-paid/delete round-trips, rejects negative amounts, and a
  second traveller gets 404 on the first traveller's trip id.
- Packing create/check/delete round-trips; `POST /packing/generate` twice adds no
  duplicate labels and preserves `is_checked`.
- Notes create/update/delete.
- `GET /profile` returns the display name; `PATCH /profile` changes it, home city, and
  default currency; `GET /auth/me` reflects the new display name after refresh.
- Share create returns a URL containing `/t/`; list shows one active share; revoke makes
  the same share disappear.
- Business account receives 403 from `/traveler/profile`.

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: FAIL on missing routes.

- [x] **Step 3: Implement the repository**

Create `packages/database/src/repos/traveler.ts`. Use `newId`, `nowIso`, `query`,
`queryOne`, `execute`, `batch`, `stmt`, `str`, `num`, `numOrNull`, `toJson`/`parseJson`
only where needed. Map `is_paid`/`is_checked` to booleans and `amount_minor_units` to
`amountMinor`.

`addPackingItemsIfMissing` loads existing labels case-insensitively for the trip, filters
the input, and inserts only missing labels in one batch.

`createShare` takes the already-hashed token, expiry, `includeBudget` and creator id.
`getActiveShareByTokenHash` filters `revoked_at IS NULL AND expires_at > ?`.
`recordShareView` increments `view_count` and returns the new count.

Export the repo from `packages/database/src/index.ts`.

- [x] **Step 4: Implement the router**

Create `apps/api/src/routes/traveler.ts` with `travelerRoutes.use("*", requireTraveler)`.
Use `mustTrip(c, id)` to verify ownership before any child-table operation.

Profile:
- `GET /profile`: `identity.findUserById` + `ops.getSetting(db, org, "traveler", defaults)`.
- `PATCH /profile`: parse a partial schema with at least one key; update the user's
  display name, the organisation's `country`/`default_currency`, merge settings and
  return the same shape as GET. Audit `traveler.profile_updated`.

Budget/packing/notes:
- Validate category and non-negative integer amounts.
- New budget items inherit the trip's `budgetCurrency`.
- Return `{ items }` for GET and the created/updated item for writes.
- Audit create/update/delete with the trip id and item id.

Shares:
- `GET /trips/:id/shares`: active shares only, with `id`, `expiresAt`, `includeBudget`,
  `viewCount`, `createdAt`; never the token.
- `POST`: revoke active shares, generate `randomToken(32)`, store `sha256Hex(token)`,
  expiry now + days, return `{ share, url: `${APP_BASE_URL}/t/${token}` }`.
- `DELETE`: revoke one share belonging to the trip.

Mount `v1.route("/traveler", travelerRoutes)` in `apps/api/src/app.ts` after `/public`.

- [x] **Step 5: Run tests**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/database/src/repos/traveler.ts packages/database/src/index.ts apps/api/src/routes/traveler.ts apps/api/src/app.ts apps/api/test/traveler.test.ts
git commit -m "feat(traveler): add budget, packing, notes, profile and share APIs"
```

---

### Task 3: Deterministic packing suggestions

**Files:**
- Create: `apps/api/src/services/traveler-packing.ts`
- Create: `apps/api/src/services/traveler-packing.test.ts`
- Modify: `apps/api/src/routes/traveler.ts` (`POST /packing/generate`)

**Interfaces:**
- Produces `suggestPackingItems(input: { arrivalDate: string | null; departureDate: string | null; destinations: string[]; activities: string[] }): { label: string; category: TravelerPackingCategory }[]`.
- Never returns duplicates; always includes documents, medication, chargers and a
  reusable bottle. Adds activity keywords: `hike|trail|walk` → walking shoes; `beach|swim|snorkel|dive` → swimwear and dry bag; `temple|shrine` → modest clothing; `safari` → neutral clothing and binoculars. Trips over 7 nights add a laundry bag.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { suggestPackingItems } from "./traveler-packing";

describe("suggestPackingItems", () => {
  it("adds activity-aware items without duplicates", () => {
    const items = suggestPackingItems({
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-20",
      destinations: ["Ella", "Mirissa"],
      activities: ["hike to Little Adam's Peak", "beach day", "temple visit"],
    });
    const labels = items.map((i) => i.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("walking shoes");
    expect(labels).toContain("swimwear");
    expect(labels).toContain("modest clothing");
    expect(labels).toContain("laundry bag");
  });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/api/src/services/traveler-packing.test.ts`
Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement and wire**

Implement the pure function. In the router, load the trip and latest itinerary, call the
service, then `addPackingItemsIfMissing`. Return `{ added, items }`.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run apps/api/src/services/traveler-packing.test.ts apps/api/test/traveler.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/services/traveler-packing.ts apps/api/src/services/traveler-packing.test.ts apps/api/src/routes/traveler.ts
git commit -m "feat(traveler): generate activity-aware packing lists"
```

---

### Task 4: Public trip sharing API

**Files:**
- Modify: `packages/database/src/repos/traveler.ts`
- Modify: `apps/api/src/routes/public.ts`
- Modify: `apps/api/test/traveler.test.ts`

**Interfaces:**
- `GET /api/v1/public/trips/:token` → `{ data: TravelerPublicTripView }`; 404 for
  unknown/expired/revoked tokens; increments `view_count` and audits `trip.shared_viewed`.
- View shape: `{ generatedAt, trip: { title, description, arrivalDate, departureDate, party }, itinerary, budget: null | { currency, totalMinor, categories } }`.

- [x] **Step 1: Add failing tests**

In `apps/api/test/traveler.test.ts`:
- Create a share with `includeBudget: true`; fetch it with an anonymous client; assert
  title, stops, and budget total; assert no `notes`, `packing`, `members`, `cost`,
  `margin` or supplier names in the JSON.
- Create with `includeBudget: false`; assert `budget === null`.
- Revoke and assert 404; advance the harness clock beyond expiry and assert 404.
- Create the same token path for two trips; assert each returns its own trip.

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: FAIL on the public route.

- [x] **Step 3: Implement**

Add a `publicRoutes.get("/trips/:token", rateLimit(...))` handler:
- token length >= 30, hash, `getActiveShareByTokenHash`.
- Load trip and latest itinerary by the share's organization id.
- If `includeBudget`, load budget items and sum by currency. If more than one currency,
  return the primary trip currency total and omit mixed-currency items from the total.
  The category rows are `{ category, totalMinor }` for the primary currency.
- Strip stop ids, coordinates, notes, latitude/longitude and internal fields; include
  destination, dates, nights and activities.
- Record view and audit. Do not expose the share id or organization id.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run apps/api/test/traveler.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/database/src/repos/traveler.ts apps/api/src/routes/public.ts apps/api/test/traveler.test.ts
git commit -m "feat(traveler): add read-only public trip sharing"
```

---

### Task 5: Traveller design tokens, landing, auth and shell routing

**Files:**
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/app/(travel)/layout.tsx`
- Create: `apps/web/app/(travel)/travel/(public)/layout.tsx`
- Create: `apps/web/app/(travel)/travel/(public)/page.tsx`
- Create: `apps/web/app/(travel)/travel/(public)/join/page.tsx`
- Create: `apps/web/app/(travel)/travel/(public)/signin/page.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/layout.tsx`
- Create: `apps/web/features/travel/shell.tsx`
- Create: `apps/web/features/travel/public-header.tsx`
- Create: `apps/web/features/travel/join-form.tsx`
- Create: `apps/web/features/travel/sign-in.tsx`
- Create: `apps/web/features/auth/sign-in-form.tsx`
- Modify: `apps/web/app/(auth)/login/page.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/features/marketing/session-cta.tsx`
- Modify: `apps/web/app/(marketing)/layout.tsx`
- Modify: `apps/web/lib/session.tsx`

**Interfaces:**
- `SessionOrganization` gains `accountKind: "business" | "individual"`.
- `SignInForm({ variant, defaultNext, joinHref })` handles password and MFA and writes
  `SESSION_KEY`; default redirect is `/travel/trips` for individual accounts, else `/dashboard`.
- `TravelShell({ children })` is the authenticated top-nav shell.
- `/travel` is public; `/travel/trips` and below require a traveller session.

- [x] **Step 1: Add the visual theme**

Append a `.tw-travel` block to `globals.css` that overrides the semantic tokens to a warm
paper palette (`--background #f6f1e7`, `--foreground #1f1b16`, `--card #fffdf8`,
`--accent #b8502f`, `--border #e4dccb`, etc.), maps `.tw-travel .font-display` to
Instrument Serif and `.tw-travel .tw-hand` to Caveat, and adds print rules:

```css
@media print {
  .tw-no-print { display: none !important; }
  .tw-travel { background: #fff !important; }
  .tw-print-page { break-inside: avoid; }
}
```

- [x] **Step 2: Build the public landing and auth pages**

The landing at `/travel` uses `DestinationPhoto` for a hero, a serif headline, three
sample days, feature panels (plan, stays, budget, packing, share), a destination strip
and a closing CTA. It links to `/travel/join` and `/travel/signin`, and shows "Open my
trips" for an existing traveller session.

`/travel/join` posts to `/auth/register-traveler`, then sets the session query and routes
to `/travel/trips/new`. `/travel/signin` uses the shared `SignInForm`.

- [x] **Step 3: Build the authenticated shell and gate**

`(travel)/travel/(app)/layout.tsx`:
- `useSession()`; null → `/travel/signin?next=<path>`.
- business account → a centred explanation with links to `/dashboard` and `/travel`.
- loading → branded loader; error → `ErrorState`.
- traveller → `<TravelShell>{children}</TravelShell>`.

`TravelShell`: top bar with logo (links `/travel/trips`), My trips, Discover, Profile,
New trip, avatar/name menu and sign out; mobile drawer; footer.
Use `apiPost("/auth/logout")`, clear the query cache, and route to `/travel/signin`.

- [x] **Step 4: Refactor sign-in and redirects**

Move the password/MFA state machine from `(auth)/login/page.tsx` into
`features/auth/sign-in-form.tsx`. The existing page keeps its layout and uses the shared
form with `defaultNext="/dashboard"`. `/travel/signin` uses it with
`defaultNext="/travel/trips"` and `joinHref="/travel/join"`.

In `(app)/layout.tsx`, redirect `session.organization?.accountKind === "individual"` to
`/travel/trips`. Update marketing CTAs to send individual sessions to `/travel/trips` and
business sessions to `/dashboard`. Add "For travellers" links in the marketing header and
footer pointing to `/travel`.

- [x] **Step 5: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`
Expected: PASS.

```bash
git add apps/web/app/globals.css "apps/web/app/(travel)" apps/web/features/travel apps/web/features/auth apps/web/app/"(auth)/login/page.tsx" apps/web/app/"(app)/layout.tsx" apps/web/features/marketing/session-cta.tsx apps/web/app/"(marketing)/layout.tsx" apps/web/lib/session.tsx
git commit -m "feat(traveler): add traveller landing, auth and shell"
```

---

### Task 6: Traveller dashboard, discovery and pure helpers

**Files:**
- Create: `apps/web/features/travel/lib.ts`
- Create: `apps/web/features/travel/lib.test.ts`
- Create: `apps/web/features/travel/hooks.ts`
- Create: `apps/web/features/travel/trip-card.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/page.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/discover/page.tsx`
- Create: `apps/web/features/travel/discover.tsx`

**Interfaces:**
- `tripDestination(trip): string` — first parsed destination, first itinerary stop, or title.
- `daysUntil(date, now?): number | null`.
- `budgetTotals(items, currency): { totalMinor, paidMinor, remainingMinor, mixedCurrency }`.
- `packingProgress(items): { checked, total, percent }`.
- `allocateTravelerRooms(adults, children, childAges): RoomAllocation[]`.
- `travelerTripPayload(input): z.infer<typeof tripRequestSchema>`.
- Hooks: `useTravelerTrips`, `useBudgetItems`, `usePackingItems`, `useTripNotes`,
  `useTripShares`, `useTravelerProfile`, with keys under `["traveler", ...]`.

- [x] **Step 1: Write failing helper tests**

Test room allocation for 2 adults/1 child, 5 adults; budget totals with no budget and
mixed currencies; packing percent clamps to 100; daysUntil for future/past/no date.

- [x] **Step 2: Implement helpers and run tests**

Run: `pnpm vitest run apps/web/features/travel/lib.test.ts`
Expected: PASS.

- [x] **Step 3: Build the dashboard**

`/travel/trips` shows:
- greeting and a "Where to next?" composer that routes to
  `/travel/trips/new?idea=<encoded>`;
- next-trip hero with cover, dates, countdown, budget progress and Open trip;
- all active trips as cards (archive excluded), each with destination, dates, party,
  budget and latest status;
- a small discovery strip.

- [x] **Step 4: Build discovery**

`/travel/discover` uses a curated list of destinations and `usePlaceInfos` (existing
`features/planning/place-image`) to fetch Wikipedia extracts and images. A search field
uses `lookupPlace` for a free-text place and appends the result. Each card has "Plan this
trip" → `/travel/trips/new?destination=<name>&idea=<encoded idea>`.

- [x] **Step 5: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`

```bash
git add apps/web/features/travel apps/web/app/"(travel)/travel/(app)/trips/page.tsx" "apps/web/app/(travel)/travel/(app)/discover/page.tsx"
git commit -m "feat(traveler): add dashboard, discovery and helpers"
```

---

### Task 7: Trip creation wizard and trip editing

**Files:**
- Create: `apps/web/features/travel/trip-wizard.tsx`
- Create: `apps/web/features/travel/edit-trip-dialog.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/new/page.tsx`
- Modify: `apps/web/features/travel/lib.ts`
- Modify: `apps/web/features/travel/lib.test.ts`

**Interfaces:**
- `createTripFromWizard(input, api): Promise<{ tripId: string; warnings: string[] }>`:
  1. POST `/trips`.
  2. If the idea is at least 10 characters, POST `/trips/:id/parse` with `apply: true`.
  3. If no itinerary exists after parsing and destinations are known, POST
     `/trips/:id/itinerary/suggest` and PUT the stops.
  4. Return the id and non-fatal warnings; never throw after the trip exists.
- `EditTripDialog({ trip, open, onOpenChange })` patches title, dates, party, budget,
  budget currency and preferred hotel category.

- [x] **Step 1: Extend helper tests**

Test `createTripFromWizard` with a fake API: parse success creates a route; parse failure
still returns the trip id with a warning; no idea skips parse; destinations fallback calls
suggest.

- [x] **Step 2: Implement the wizard**

The page reads `idea`, `destination` and `welcome` from search params inside a Suspense
boundary. The form collects idea, title, destinations (TagInput), dates, adults, children,
budget, currency, stay style, pace and interests. It shows a four-stage progress list and
a summary panel. On success, routes to `/travel/trips/:id?created=1`.

- [x] **Step 3: Implement edit dialog**

Use `PATCH /trips/:id`; rooms are allocated with `allocateTravelerRooms`; on success
invalidate `tripKeys.detail(id)`, `tripKeys.itinerary(id)` and the traveller trip list.
Display `ApiError.fieldErrors` inline.

- [x] **Step 4: Typecheck and commit**

Run: `pnpm vitest run apps/web/features/travel/lib.test.ts && pnpm --filter @tripweave/web typecheck`

```bash
git add apps/web/features/travel "apps/web/app/(travel)/travel/(app)/trips/new/page.tsx"
git commit -m "feat(traveler): add trip creation wizard and trip editor"
```

---

### Task 8: Trip dossier layout and overview

**Files:**
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/layout.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/page.tsx`
- Create: `apps/web/features/travel/trip-header.tsx`
- Create: `apps/web/features/travel/trip-overview.tsx`

**Interfaces:**
- Header fetches `useTrip(id)`, shows back link, cover, title, dates, party, edit action
  and tabs: Overview, Plan, Itinerary, Stays, Budget, Packing, Notes, Share.
- Overview fetches trip, itinerary, budget, packing, notes and latest packages; shows
  route, countdown, next best action, budget and packing progress, latest note and a
  "Plan with AI" CTA.
- Archive action calls `PATCH /trips/:id { status: "archived" }` and returns to
  `/travel/trips`.

- [x] **Step 1: Implement the header and overview**

Use `DestinationPhoto`, `dateRange`, `money`, `Badge`. Keep loading and not-found states
explicit. Make the tab bar horizontally scrollable on mobile with `aria-current`.

- [x] **Step 2: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`

```bash
git add "apps/web/app/(travel)/travel/(app)/trips/[id]" apps/web/features/travel/trip-header.tsx apps/web/features/travel/trip-overview.tsx
git commit -m "feat(traveler): add trip dossier and overview"
```

---

### Task 9: Itinerary editor with map

**Files:**
- Create: `apps/web/features/travel/itinerary-editor.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/itinerary/page.tsx`

**Interfaces:**
- Editor state: `{ destination, latitude, longitude, arrivalDate, departureDate, activitiesText, notes }[]`.
- Save: `PUT /trips/:id/itinerary` with `confirm: false`; Confirm: same with
  `confirm: true`; validation errors from `ApiError.details.issues` are shown.
- Suggest: `POST /trips/:id/itinerary/suggest` with destinations/nights, then save.
- Map: dynamic import of `features/trips/itinerary-map`.

- [x] **Step 1: Implement the editor**

Load `useItineraryView`. If empty, show a destination input and "Suggest a route".
Otherwise render ordered cards with `PlaceInput`, date inputs, an activities textarea
(one per line), notes, up/down/delete buttons, and a map. The user can add a stop. Saving
invalidates `tripKeys.itinerary(id)` and `tripKeys.detail(id)`.

- [x] **Step 2: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`

```bash
git add apps/web/features/travel/itinerary-editor.tsx "apps/web/app/(travel)/travel/(app)/trips/[id]/itinerary/page.tsx"
git commit -m "feat(traveler): add editable itinerary and map"
```

---

### Task 10: Stays that turn packages into budget items

**Files:**
- Create: `apps/web/features/travel/stays-panel.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/stays/page.tsx`
- Modify: `apps/web/features/travel/lib.ts`
- Modify: `apps/web/features/travel/lib.test.ts`

**Interfaces:**
- `packageStayEstimate(pkg): { label, amountMinor, currency } | null` — null when no
  selling price.
- `POST /trips/:id/optimisations` with
  `{ objectives: ["best_value","budget_explorer"], constraints: { ...defaults, strictBudget: false, includeExternalProviders: true } }`.
- Poll `GET /optimisations/:id` with `useJob`; refresh packages when it settles.
- "Add stay estimate" creates a budget item with category `stay`.

- [x] **Step 1: Test the pure estimate helper**

Test a package with pricing returns the selling price and all hotel names; a package
without pricing returns null.

- [x] **Step 2: Implement the panel**

Require a confirmed itinerary before enabling "Find stays"; show a link to the itinerary
and a one-click "Confirm itinerary" only when there are no blocking issues. Show job
progress, infeasible/failed states with the existing funnel data, then package cards:
hotel names per stop, selling price, per-night, within-budget badge, verification state,
and "Add stay estimate". Always state that prices are not a booking.

- [x] **Step 3: Typecheck, test and commit**

Run: `pnpm vitest run apps/web/features/travel/lib.test.ts && pnpm --filter @tripweave/web typecheck`

```bash
git add apps/web/features/travel "apps/web/app/(travel)/travel/(app)/trips/[id]/stays/page.tsx"
git commit -m "feat(traveler): add stay options and budget handoff"
```

---

### Task 11: Budget, packing, notes and profile pages

**Files:**
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/budget/page.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/packing/page.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/notes/page.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/profile/page.tsx`
- Create: `apps/web/features/travel/budget-panel.tsx`
- Create: `apps/web/features/travel/packing-panel.tsx`
- Create: `apps/web/features/travel/notes-panel.tsx`
- Create: `apps/web/features/travel/profile-panel.tsx`

**Interfaces:**
- Budget: add/edit/delete/toggle paid; totals and progress; "Set trip budget" inline.
- Packing: add/check/delete; generate; grouped by category; progress.
- Notes: add/edit/delete with timestamps.
- Profile: display name, home city, country, currency, interests, pace, dietary notes,
  change password, resend verification, sign out.

- [x] **Step 1: Implement budget**

Show planned, paid and remaining; if mixed currency, show a warning and per-currency
totals. Add form uses `MoneyInput`; category select. Inline edit with save/cancel.

- [x] **Step 2: Implement packing**

Group items; checkbox toggles; delete; add; generate with a loading state. Progress is
announced with `aria-live`.

- [x] **Step 3: Implement notes and profile**

Notes are a simple composer and timeline. Profile uses `GET/PATCH /traveler/profile`,
`POST /auth/change-password` and `POST /auth/resend-verification`; on display-name change,
invalidate the session query.

- [x] **Step 4: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`

```bash
git add "apps/web/app/(travel)/travel/(app)/trips/[id]" "apps/web/app/(travel)/travel/(app)/profile" apps/web/features/travel/budget-panel.tsx apps/web/features/travel/packing-panel.tsx apps/web/features/travel/notes-panel.tsx apps/web/features/travel/profile-panel.tsx
git commit -m "feat(traveler): add budget, packing, notes and profile"
```

---

### Task 12: Share page and public trip document

**Files:**
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/share/page.tsx`
- Create: `apps/web/features/travel/share-panel.tsx`
- Create: `apps/web/app/(travel)/t/[token]/layout.tsx`
- Create: `apps/web/app/(travel)/t/[token]/page.tsx`
- Create: `apps/web/features/travel/public-trip.tsx`

**Interfaces:**
- Share panel: `GET/POST /traveler/trips/:id/shares`, `DELETE .../:shareId`; expiry select
  (7/30/90 days) and include-budget toggle; copy URL; print preview link.
- Public page fetches `/public/trips/:token`; renders cover, title, dates, party,
  itinerary days, map and optional budget summary; `Print / save PDF` button.

- [x] **Step 1: Implement the share panel**

After creating a link, show it once with a copy button and a warning that the link grants
read-only access. List active shares with expiry and view count; revoke.

- [x] **Step 2: Implement the public document**

Use `useQuery` with `apiGet<TravelerPublicTripView>(`/public/trips/${token}`)`. On 404 show
a calm "This link has expired" card. Use `.tw-travel` and `tw-no-print` on controls.
Add `robots: { index: false, follow: false }` metadata in the layout.

- [x] **Step 3: Typecheck and commit**

Run: `pnpm --filter @tripweave/web typecheck`

```bash
git add "apps/web/app/(travel)/travel/(app)/trips/[id]/share" "apps/web/app/(travel)/t" apps/web/features/travel/share-panel.tsx apps/web/features/travel/public-trip.tsx
git commit -m "feat(traveler): add share links and printable public trip"
```

---

### Task 13: OpenUI traveller planner mode

**Files:**
- Modify: `apps/web/features/planning/planning-panel.tsx`
- Modify: `apps/web/features/planning/fallback-view.tsx`
- Create: `apps/web/app/(travel)/travel/(app)/trips/[id]/plan/page.tsx`
- Modify: `apps/web/features/planning/planning-panel.test.tsx`

**Interfaces:**
- `PlanningPanel({ tripId, mode?: "operator" | "traveler", persistKey?: string })`.
- In traveller mode: filter `open_quote`, set `canCreateQuotes` false, route
  `open_packages`/`open_optimise` to `/travel/trips/:id/stays` and `open_itinerary` to
  `/travel/trips/:id/itinerary`.
- `PlanningFallbackView` accepts `mode` and uses the same route mapping. Operator mode is
  the default and must not change.
- `persistKey` stores the last 20 turns in localStorage; New chat clears it. Storage
  failures are ignored.

- [x] **Step 1: Add failing tests**

In `planning-panel.test.tsx`:
- Render traveller mode, trigger `open_packages`, assert `router.push` received
  `/travel/trips/t1/stays`.
- Assert `open_quote` is not offered/rendered.
- Render operator mode and assert `/trips/t1/packages` still works.

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/features/planning/planning-panel.test.tsx`
Expected: FAIL on the new props/routes.

- [x] **Step 3: Implement**

Add the props, a `scrubTravelerSnapshot` helper, route mapping, fallback mode and
localStorage persistence. Keep all existing default behavior.

- [x] **Step 4: Create the plan page**

Use a dynamic import with `ssr: false` and `<PlanningPanel tripId={id} mode="traveler" persistKey={`tw.traveler.plan.${id}`} />`. Add a short page intro explaining that prices and availability come from the server.

- [x] **Step 5: Run tests**

Run: `pnpm vitest run apps/web/features/planning/planning-panel.test.tsx`
Expected: PASS, including all pre-existing tests.

- [x] **Step 6: Commit**

```bash
git add apps/web/features/planning/planning-panel.tsx apps/web/features/planning/fallback-view.tsx apps/web/features/planning/planning-panel.test.tsx "apps/web/app/(travel)/travel/(app)/trips/[id]/plan/page.tsx"
git commit -m "feat(traveler): add OpenUI planning mode for personal trips"
```

---

### Task 14: Verification, docs and local handoff

**Files:**
- Modify: `README.md`
- Create: `docs/traveler.md`
- Modify: `docs/status.md`
- Modify: `docs/openui-integration.md`

**Interfaces:**
- README quick-start includes `pnpm dev:api`, `pnpm dev:web`, then open `/travel`.
- `docs/traveler.md` documents the workspace model, routes, data model, sharing and the
  browser-only chat history.
- `docs/status.md` lists the new traveller surface and its limitations.
- `docs/openui-integration.md` documents traveller mode and route mapping.

- [x] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass.

- [x] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: pass.

- [x] **Step 3: Build the web app**

Run: `pnpm --filter @tripweave/web build`
Expected: production build passes.

- [x] **Step 4: Apply the local migration and smoke the UI**

Run:
```bash
pnpm --filter @tripweave/api db:migrate:local
pnpm dev:api
pnpm dev:web
```
Then in a browser: `/travel` → join → create a trip with an idea → open Plan, Itinerary,
Budget, Packing, Notes, Share → open the public link → print preview. Sign out and back
in. Check the browser console and network tab for 4xx/5xx errors.

- [x] **Step 5: Commit**

```bash
git add README.md docs/traveler.md docs/status.md docs/openui-integration.md
git commit -m "docs(traveler): document the individual trip planner"
```
