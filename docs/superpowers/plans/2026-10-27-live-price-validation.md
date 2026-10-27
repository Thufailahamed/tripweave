# Live Price Validation and Cost Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every external hotel price live-checked with an expiry before it can be quoted, while cutting repeated SerpApi calls through caching and job checkpointing.

**Architecture:** SerpApi stays the discovery source. A new Google Hotels `recheckPrice` calls the property-details endpoint and returns a live rate with a 15-minute expiry. A package validation service rechecks every external selection, updates the package in place only when all checks pass, and records a verification summary. Quote creation rejects external packages without a fresh verification. A KV-backed search cache and per-stop job checkpoint reduce calls without weakening quote validity. The existing reprice-with-live-check flow remains, and now produces a verification summary too.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers/D1/KV, Vitest, React/Next.js.

**Spec:** This plan implements the approved direction in `docs/hotel-search-implementation.md` and the cost/correctness analysis in `reports/Cheap hotel price data providers.md`.

**Status:** Implemented and live-verified 28 October 2026. `pnpm test` 227/227 across 26 files, `pnpm typecheck` clean.

## Global Constraints

- A Google Hotels offer is never quote-grade until `recheckPrice` returns `confirmed` or `price_changed` and its `expiresAt` is in the future.
- A quote must never be created from an unverified or expired external package.
- Cached search results are discovery-only; `recheckPrice` must always bypass the cache.
- Strict breakfast remains rate-level evidence only; never promote a property amenity.
- Failed live checks must block the quote, not fall back silently to the stored price.
- No new paid provider is added in this plan.
- Existing Home/SerpApi production behaviour must remain unchanged when the new paths are unused.

## Review Focus

- A stale or failed live check must not be treated as a price change that can still be quoted.
- A partial validation failure must not update the package totals.
- A cache hit must not make a quote look live-checked.
- A retry must not re-query stops that already completed.
- A package containing only company-contract rates must remain quotable without an external live check.

---

### Task 1: Google Hotels live property recheck

**Files:**
- Create: `packages/provider-contracts/src/google-hotels-recheck.ts`
- Create: `packages/provider-contracts/src/google-hotels-recheck.test.ts`
- Modify: `packages/provider-contracts/src/google-hotels.ts`
- Modify: `packages/provider-contracts/src/index.ts` if the new module is not re-exported

**Interfaces:**
- Produces: `GoogleLiveRate`, `parseGooglePropertyRates(body, { rooms })`, `chooseGoogleLiveRate(rates, { requireBreakfast, partySize })`.
- Produces: `GoogleHotelsProvider.recheckPrice(input)` returning `PriceCheckResult`.

- [ ] **Step 1: Write the failing parser test**

```ts
it("parses seller rates and prefers a breakfast-included rate", () => {
  const rates = parseGooglePropertyRates(propertyDetailsFixture(), { rooms: 2 });
  expect(rates.find((r) => r.source === "Booking.com" && r.breakfast === "included")?.totalMinor).toBe(44_600);
  expect(chooseGoogleLiveRate(rates, { requireBreakfast: true, partySize: 2 })?.source).toBe("Booking.com");
  expect(chooseGoogleLiveRate(rates, { requireBreakfast: true, partySize: 3 })).toBeNull();
});
```

- [ ] **Step 2: Run it and confirm the module is missing / test fails**

Run: `pnpm vitest run packages/provider-contracts/src/google-hotels-recheck.test.ts`
Expected: FAIL because `./google-hotels-recheck` does not exist.

- [ ] **Step 3: Implement the parser and chooser**

`parseGooglePropertyRates` walks `featured_prices` (falling back to `prices`), each seller's `rooms`, each room's nested `rates`, and reads `total_rate.extracted_lowest` or `extracted_after_taxes_fees`. It multiplies by `rooms`, deduplicates by source/room/total/breakfast, and marks breakfast `included` only when an inclusion says breakfast is included; “Breakfast ($)” is `not_included`, missing text is `unknown`. `chooseGoogleLiveRate` filters by party size and, when required, by `breakfast === "included"`, then sorts by total.

- [ ] **Step 4: Write the failing provider recheck tests**

```ts
it("confirms an unchanged live rate and gives it a 15-minute expiry", async () => {
  const result = await provider().recheckPrice({ offer: googleOffer({ totalAmountMinor: 44_600 }), organizationId: "org", party });
  expect(result.status).toBe("confirmed");
  expect(result.offer?.verificationStatus).toBe("live_checked");
  expect(result.offer?.expiresAt).toBe("2026-10-27T10:15:00.000Z");
});

it("returns price_changed with the live total", async () => { /* live total 46_000 */ });
it("returns unavailable for a strict breakfast offer with no breakfast rate", async () => { /* only RO rate */ });
it("returns not_supported when the offer has no Google property token", async () => { /* ... */ });
```

- [ ] **Step 5: Run the provider tests and confirm they fail**

Run: `pnpm vitest run packages/provider-contracts/src/google-hotels-recheck.test.ts`
Expected: FAIL on `confirmed`/`price_changed`/`unavailable`.

- [ ] **Step 6: Implement `recheckPrice` in `GoogleHotelsProvider`**

Add a private `fetchPropertyDetails` that calls SerpApi with `engine=google_hotels`, `property_token`, the offer's stay, the largest room's adults/children, currency, `gl`, and `hl`. Use `fetchJson` and the existing timeout. On a response error throw `ProviderError`. In `recheckPrice`, read `providerMetadata.propertyToken`; return `not_supported` without a token. Select the live rate using the offer's meal requirement (`BB` confirmed => breakfast required). Return `unavailable` with `offer: null` when no qualifying rate exists. Otherwise return an updated offer with `totalAmountMinor`, `supplierName`, `retrievedAt`, `expiresAt`, `verificationStatus: "live_checked"`, `availabilityStatus: "unknown"`, `providerMetadata.recheck`, and `priceSources`.

- [ ] **Step 7: Run the tests and the provider package typecheck**

Run: `pnpm vitest run packages/provider-contracts/src/google-hotels-recheck.test.ts && pnpm --filter @tripweave/provider-contracts typecheck`
Expected: PASS and clean typecheck.

---

### Task 2: Package live-validation service, persistence and endpoint

**Files:**
- Create: `apps/api/src/services/price-validation.ts`
- Create: `apps/api/test/price-validation.test.ts`
- Modify: `packages/database/src/repos/trips.ts`
- Modify: `apps/api/src/routes/optimisation.ts`
- Modify: `apps/api/src/services/pricing.ts`
- Modify: `apps/api/src/services/optimisation.ts` (reprice verification summary)

**Interfaces:**
- Produces: `PackageValidationCheck`, `PackageValidationSummary`, `validatePackagePrices(ctx, organizationId, packageId, opts?)`.
- Produces: `trips.updatePackageValidation(db, orgId, id, { packageJson, totalCostMinor, items, verification })`.
- Produces: `presentPackage(...).verification`.

- [ ] **Step 1: Write the failing pure quote-gate test**

In `apps/api/test/price-validation.test.ts`:

```ts
it("blocks a Google package until a fresh live check exists", () => {
  expect(() => assertQuotable(packageWithGoogleOffer(), NOW)).toThrow(/live price check/i);
  expect(() => assertQuotable(packageWithGoogleOffer(), NOW, { allVerified: true, status: "verified", checkedAt: NOW.toISOString(), validUntil: "2026-10-27T10:15:00.000Z", checks: [] })).not.toThrow();
});
```

- [ ] **Step 2: Run it and confirm the gate is missing**

Run: `pnpm vitest run apps/api/test/price-validation.test.ts`
Expected: FAIL because the verification argument is not enforced.

- [ ] **Step 3: Implement the quote gate**

Extend `assertQuotable(pkg, now, verification?)` in `apps/api/src/services/quotes.ts`. For every `source === "external"` selection require `verification.allVerified === true`, a `validUntil` later than `now`, `offer.verificationStatus === "live_checked"`, and a future `offer.expiresAt`. Keep the existing mock/unavailable/expired checks. Pass `rec.verification` at both quote-creation call sites in `apps/api/src/routes/quotes.ts`.

- [ ] **Step 4: Write the failing validation service test**

Use a fake `HotelProvider` whose `recheckPrice` returns `confirmed` for Kandy, `price_changed` for Ella, and `unavailable` for Galle. Create a package with three external selections and call `validatePackagePrices`. Assert the package is not updated when any check fails, and the verification status is `failed`. Add a second test where all three pass: the package totals update, `allVerified` is true, `validUntil` is 15 minutes later, and the DB record carries the summary.

- [ ] **Step 5: Implement `validatePackagePrices`**

Load the package, its job, itinerary and `loadJobSearchInput` so FX conversion is available. For each external selection call `recheckOffer` (skip internal with status `not_required`). Convert each returned offer total to the package currency; a missing conversion is a failure. If every external check is `confirmed` or `price_changed`, replace selections, recompute `totalCostMinor` and `costPerNightMinor`, persist the package and verification. If any check fails, persist only the `failed` verification summary and leave package prices untouched. Catch provider errors per offer and turn them into a failed check.

- [ ] **Step 6: Add persistence and endpoint**

Add `trips.updatePackageValidation` updating `candidate_combinations.package_json`, `estimated_cost_minor_units`, `verification_summary_json`, and each `candidate_combination_items.cost_minor_units`. Add `POST /packages/:id/validate` with `packages:write`, a 120/hour rate limit, audit action `package.price_validated`, and a response containing the presented package and verification (costs redacted without `margins:view`). Add `verification: rec.verification` to `presentPackage`.

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm vitest run apps/api/test/price-validation.test.ts && pnpm --filter @tripweave/api typecheck`
Expected: PASS and clean.

---

### Task 3: UI live-check state and quote gating

**Files:**
- Modify: `apps/web/features/trips/types.ts`
- Modify: `apps/web/features/trips/package-card.tsx`

**Interfaces:**
- Consumes: `PackageView.verification` and `POST /packages/:id/validate`.

- [ ] **Step 1: Add the type and a failing type-level expectation**

Add `verification?: { status?: "verified" | "failed"; allVerified?: boolean; checkedAt?: string; validUntil?: string | null; checks?: { stopId: string; status: string; message?: string }[] }` to `PackageView`. Update the quote mutation’s error handling to display the backend problems.

- [ ] **Step 2: Add the live-check panel**

In `PackageCard`, detect external selections. If any exist and verification is missing/expired, render an alert “Live price check required” and a button “Check live prices” calling `apiPost<{ package: PackageView; verification: ... }>('/packages/${pkg.id}/validate', {})`. On success, update the React Query cache and toast. If verified, show “Prices checked at … valid until …”.

- [ ] **Step 3: Gate the quote button**

Disable “Create quotation” for an external package without a fresh verification, with a short explanation. Keep the backend rejection as the final guard.

- [ ] **Step 4: Run typecheck and build**

Run: `pnpm --filter @tripweave/web typecheck`
Expected: clean.

---

### Task 4: KV-backed discovery cache

**Files:**
- Create: `apps/api/src/services/search-cache.ts`
- Modify: `packages/provider-contracts/src/types.ts`
- Modify: `packages/provider-contracts/src/google-hotels.ts`
- Modify: `apps/api/src/services/providers.ts`
- Create: `packages/provider-contracts/src/google-hotels-cache.test.ts`

**Interfaces:**
- Produces: `HotelSearchCache` with `get(key)` / `set(key, value, ttlSeconds)`.
- Produces: `GoogleHotelsConfig.cache?: HotelSearchCache` and `cacheTtlSeconds?: number`.

- [ ] **Step 1: Write the failing cache test**

```ts
it("reuses a fresh discovery result and marks it cached", async () => {
  const cache = new MemorySearchCache();
  const p = provider({ cache, cacheTtlSeconds: 900 });
  const first = await p.getAvailability(input);
  const second = await p.getAvailability(input);
  expect(fetchCalls).toBe(1);
  expect(second[0]!.providerMetadata?.priceCache).toMatchObject({ cached: true });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run packages/provider-contracts/src/google-hotels-cache.test.ts`
Expected: FAIL because the provider ignores the cache.

- [ ] **Step 3: Implement the cache**

Add the interface and provider options. Key the cache by destination, check-in/out, party, currency, `gl`/`hl`. Check after `getAvailability` starts and before the network call; store after enrichment. A hit returns cloned offers with `providerMetadata.priceCache = { cached: true, cachedAt }` and `expiresAt` set to the cache expiry. A cache error is ignored. `recheckPrice` never reads or writes the cache.

- [ ] **Step 4: Implement the KV adapter**

`KvSearchCache` uses `env.CACHE.get(key, "json")` and `put(key, JSON.stringify(value), { expirationTtl: ttlSeconds })`. `defaultBuildProviders` passes it when `env.CACHE` exists. Use a 900-second TTL.

- [ ] **Step 5: Run the cache test and typecheck**

Run: `pnpm vitest run packages/provider-contracts/src/google-hotels-cache.test.ts && pnpm --filter @tripweave/provider-contracts typecheck && pnpm --filter @tripweave/api typecheck`
Expected: PASS and clean.

---

### Task 5: Per-stop fetch checkpoint

**Files:**
- Modify: `apps/api/src/services/optimisation.ts`
- Modify: `apps/api/test/hotel-search.test.ts` or create `apps/api/test/optimisation-checkpoint.test.ts`

**Interfaces:**
- Produces: `JobSummary.fetchedStops?: string[]` and `pendingStops(stops, fetchedStops)`.

- [ ] **Step 1: Write the failing checkpoint test**

```ts
it("does not re-query a stop that already completed", () => {
  expect(pendingStops([{ id: "a" }, { id: "b" }], ["a"])).toEqual([{ id: "b" }]);
});
```

- [ ] **Step 2: Implement the helper and stageFetch use**

In `stageFetch`, skip stops in `summary.fetchedStops`, keep their existing candidates, and save the summary after each successful stop. If a later stop fails, the next attempt starts at the unfinished stop. Do not skip when no candidates were stored for that stop.

- [ ] **Step 3: Run the checkpoint test and API typecheck**

Run: `pnpm vitest run apps/api/test/optimisation-checkpoint.test.ts && pnpm --filter @tripweave/api typecheck`
Expected: PASS and clean.

---

### Task 6: End-to-end live verification and documentation

**Files:**
- Modify: `docs/hotel-search-implementation.md`
- Modify: `apps/api/src/env.ts` if `PRICE_VALIDITY_MINUTES` is exposed

- [ ] **Step 1: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass and every workspace typechecks.

- [ ] **Step 2: Restart the API and validate the sample package**

Use the sample trip and latest package. Call `POST /packages/:id/validate`. Assert:
- response `allVerified: true`
- every Google selection has `verificationStatus: "live_checked"`
- `validUntil` is 15 minutes after `checkedAt`
- a quote attempt before validation returns 422 with a live-check problem
- a quote after validation succeeds
- a deliberately stale package (validUntil in the past) is rejected.

- [ ] **Step 3: Verify the cache and checkpoint**

Call the same hotel search twice within 15 minutes and confirm the second response is marked `priceCache.cached` and does not add a SerpApi call. Fail a simulated second-stop search and confirm the retry skips the first stop.

- [ ] **Step 4: Document the new behaviour**

Add to `docs/hotel-search-implementation.md`:
- live recheck endpoint and 15-minute validity
- quote gate behavior
- KV cache TTL and discovery-only rule
- checkpoint behavior
- the fact that Hotelbeds/RateHawk remain the long-term bookable supply layer and are not replaced by this work.
