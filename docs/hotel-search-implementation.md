# Live hotel search — implementation plan

Goal: when a trip enquiry is turned into an itinerary, search real hotel sources in addition to the
company catalogue, then feed every usable hotel into the existing package optimiser.

## Sources

1. **Company catalogue** (`internal`) — existing contracted and partner-shared hotels.
2. **Google Hotels** (`google_hotels`, via SerpApi) — live cross-OTA prices, including Booking.com,
   Expedia, Agoda, Hotels.com and others. Requires `SERPAPI_API_KEY`.
3. **OpenStreetMap discovery** (`osm_discovery`) — keyless real-hotel discovery. Prices are
   *estimates* benchmarked against the company catalogue (or category defaults) and are always
   labelled `estimated`. Availability is `unknown`. Overpass is tried first; when it is queued or
   unavailable, the same OSM lodgings are found through Nominatim, so discovery still returns real
   properties.
4. Existing **Hotelbeds** and **Amadeus** adapters stay unchanged and merge into the same flow.

## Rules

- OpenStreetMap fallback listings are dropped when the same hotel is already returned by the company
  catalogue or a live supplier. Live supplier offers for the same hotel are kept as alternatives so
  the optimiser can compare prices.
- Discovery offers never claim confirmed availability or a live-checked price.
- A meal plan that the rate does not publish is marked `mealPlanStatus: "unconfirmed"`. A
  property-level “Free breakfast” amenity is recorded as `boardBasisSource: "property_amenity"` and
  never satisfies a strict meal-plan requirement on its own; “Breakfast ($)” and unlisted
  properties stay `RO`. Rate-level entity checks can promote a Google offer to a confirmed `BB`
  only when they find an explicitly breakfast-included rate; that offer is repriced to the
  breakfast-included total. Strict breakfast quotes otherwise exclude the offer; the existing
  `allowUnconfirmedMealPlans` opt-in remains the way to include unverified board bases, with a
  warning.
- Google Hotels has no room-count parameter, so the provider prices the largest requested room and
  scales the total by the number of rooms the party needs.
- Discovered properties are persisted through `upsertProviderProperty`, so they appear in the hotel
  catalogue and can be reused by later searches.
- No scraping of Booking.com pages. Their partner API is not publicly self-serve; Booking.com
  prices arrive through the Google Hotels aggregation.

## Flow

`enquiry → itinerary (with coordinates) → stageFetch → providers in parallel → dedupe → persist →
optimiser → packages`

The ad-hoc `POST /hotel-search` endpoint uses the same provider stack, persists offers, and returns
the merged results.

## Verified live (27 Oct 2026)

The exact family enquiry produced 59 / 59 / 58 offers per stop (4 / 3 / 3 catalogue, 16 / 18 / 15
Google Hotels, 40 OpenStreetMap). Five packages were produced, all within the USD 4,000 hotel
budget: USD 664, 1,310, 2,199, 3,160 and 2,684. The breakfast requirement selected Google Hotels
properties listed with free breakfast and rejected chargeable/unlisted board bases.

A later rate-level check found that the cheapest package’s three hotels expose no
breakfast-included rate. The package totals above are therefore loose-policy quotes, not confirmed
breakfast-inclusive quotes. See the comparison and recommendation below.

## Keyless Google Hotels spike

`scripts/google-hotels-direct.mjs` is a standalone, keyless feasibility spike. It encodes the
Google Hotels `ts` protobuf (stay dates, occupancy, rooms, currency), fetches the server-rendered
search page, parses property cards, and optionally fetches an entity page and parses the embedded
`ds:1` rate payload. No headless browser and no API key are required.

The entity parser exposes, where Google publishes them:

- property name, address, coordinates, star rating, guest rating and review count;
- provider source, room name, occupancy, cancellation and nightly/stay totals;
- board basis: `included`, `not_included`, `paid`, or `unknown`;
- compact provider cards, which have a source and price but no room, occupancy or board basis.

`chooseEntityRate` selects the cheapest rate for a party size and can require an explicit
breakfast-included rate. Unit tests in `scripts/google-hotels-direct.test.mjs` cover the `ts`
encoder, full and compact rate parsing, strict breakfast selection, whole-unit normalisation and
deduplication of compact cards that duplicate a full rate.

Reproduce the search side with:

```bash
node scripts/google-hotels-direct.mjs \
  --destination=Kandy --checkin=2027-03-05 --checkout=2027-03-09 \
  --adults=1 --children=8 --rooms=1 --out=/private/tmp/direct-kandy.json
node --test scripts/google-hotels-direct.test.mjs
```

## Comparison method

- Sample enquiry: family of 4 (children aged 8 and 11), 10 nights from 5 March 2027, Kandy (4
  nights), Ella (3) and the south coast/Galle (3), hotels only, breakfast included, USD 4,000.
- SerpApi and the custom scraper were both queried on a one-room 1-adult + 1-child basis and scaled
  by two rooms, matching the current Google Hotels provider. Totals are after taxes and fees.
- Search-level comparison: three runs per stop, merged union of cards, matched to SerpApi properties
  by name/token. Price deltas use matched properties only.
- Entity-level comparison: 25 shortlisted properties across the three stops. Twenty-two were fetched
  fresh in this pass; three were parsed from earlier live entity fixtures. Strict breakfast uses only
  an explicitly `included` rate for at least two guests; compact/unknown rates are excluded.
- Package-level comparison: the five live optimisation packages from job
  `e622eff4-f9bb-4086-a05c-dc3a632ccc65` were repriced with entity rates, then the same property set
  was checked under a strict breakfast policy. A broader strict floor was also calculated across the
  25-property sample.

## Search-level results

| Stop | Single-run cards | Union cards | SerpApi priced | Matched | Priced coverage | Mean abs delta | Max abs delta | Ratings | Stars | Breakfast agreement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kandy | 19 | 33 | 16 | 14 | 88% | 10.9% | 106.2% | 12/12 | 9/9 | 14/14 |
| Ella | 19 | 34 | 18 | 10 | 56% | 0.1% | 1.0% | 7/7 | 4/4 | 8/10 |
| Galle | 20 | 34 | 15 | 14 | 93% | 4.9% | 19.4% | 13/13 | 6/6 | 14/14 |

Search latency was 1.3–1.7 s per request. There were no consent walls, 429s or 5xx responses in nine
runs. Single-run coverage is materially incomplete, especially in Ella; merging runs helps but still
does not cover every SerpApi property. The two remaining Ella breakfast disagreements are property
amenity inference, not rate-level evidence (`HIDE ELLA` unknown→free, `The Residence` paid→unknown).

## Entity-level results (package properties)

| Stop | Property | SerpApi search | Entity cheapest 2-guest | Entity breakfast-included | Delta vs search | Note |
| --- | --- | ---: | --- | --- | ---: | --- |
| Kandy | Heaven Seven Hotel Kandy | 96 | Vio.com 96, room-only | none | n/a | “Free breakfast” amenity, but the rate is room-only |
| Kandy | Lavendish Hills Kandy | 201 | Booking.com 201, room-only | Booking.com 223 | +22 (+10.9%) | Breakfast rate is a different room/rate |
| Kandy | Theva Residency | 334 | Booking.com 334, room-only | Expedia.com 767 | +433 (+129.6%) | Cheapest compact rate 268 has unknown occupancy/board |
| Kandy | Hotel Suisse Kandy | 324 | Booking.com 668, included | Booking.com 668 | +344 (+106.2%) | SerpApi’s cheaper 324 is Super.com, absent from the entity page |
| Ella | Grand Cliff Ella | 92 | Bluepillow.com 92, compact unknown | none | n/a | No full room rate on the entity page |
| Ella | Marvellous Inn | 134 | Booking.com 134, included | Booking.com 134 | 0% | Search total matches a breakfast rate |
| Ella | HIDE ELLA HOTEL & RESORT | 926 | Agoda 926, included | Agoda 926 | 0% | Search total matches a breakfast rate |
| Galle | Villa Surf Beach | 144 | Booking.com 144, room-only | none | n/a | “Free breakfast” amenity, but the rate is room-only |
| Galle | Tamarind Hill | 320 | Hotels.com 318, included | Hotels.com 318 | −2 (−0.6%) | Entity is slightly cheaper than the search total |
| Galle | Le Grand Galle | 898 | Expedia.com 1,121, included | Expedia.com 1,121 | +223 (+24.8%) | SerpApi’s cheaper 898 is Reservation Day, absent from the entity page |

Across the 25-property sample:

- **10/25 (40%)** exposed an explicit breakfast-included rate.
- **9/25 (36%)** exposed only room-only rates.
- **6/25 (24%)** exposed only compact/unknown rates.
- **7/10** package properties had a breakfast-included rate; **3/10** did not.
- Among the 7 package properties with a breakfast rate, **4/7** were more than 10% above the search
  total (median delta 10.9%, mean absolute delta 38.9%); **3/7** were at parity.

Entity fetches were reliable in this sample: **22/22 succeeded**, median **787 ms**, p95 **1,045 ms**,
mean **820 ms**, max **1,616 ms**. Entity pages are not a complete price source: they missed cheaper
OTA rates that SerpApi found (Super.com, Reservation Day) and sometimes exposed a compact rate below
the full room rate. They are useful for board-basis evidence, not for replacing price discovery.

## Package-level results

Current packages use the loose SerpApi policy. “Entity 2-guest reprice” keeps the same properties and
uses the cheapest known-occupancy entity rate. “Strict breakfast” uses only an explicit
breakfast-included rate; two-room totals are shown.

| Package | Current loose total | Entity 2-guest reprice | Strict breakfast total | Strict delta | Budget status |
| --- | ---: | ---: | ---: | ---: | --- |
| Budget explorer | 664 | 664 (any occupancy) | infeasible as-is; 1,350 like-for-like substitute | +686 (+103%) | within |
| Best value | 1,310 | 1,306 | 1,350 | +40 (+3.1%) | within |
| Comfort journey | 2,199 | 2,195 | 3,061 | +862 (+39.2%) | within |
| Premium experience | 3,160 | 3,156 | 4,022 | +862 (+27.3%) | over by 22 |
| Company preferred | 2,684 | 2,684 | 2,684 | 0% | within; catalogue B&B, no live OTA check |

The budget package is the critical case: Heaven Seven, Grand Cliff and Villa Surf all lack a
breakfast-included entity rate. The cheapest strict package within the ten package properties is
**USD 1,350** (Lavendish 446 + Marvellous 268 + Tamarind 636 for two rooms), which is effectively the
best-value package under strict breakfast. The premium package’s exact property set breaches the
budget by USD 22; a strict re-optimisation can substitute (for example, Lavendish for Theva gives
USD 2,934, or Marvellous for HIDE gives USD 2,438), so the trip remains feasible if the optimiser
re-runs on rate-level offers rather than merely surcharging the existing package.

If custom-only search cards are admitted as inventory, the cheapest strict combination in the
25-property sample is **USD 750** (Kandyan Sweet Villa 152 + Marvellous 268 + Dutch Wall 330 for two
rooms). Those are lower-tier properties and would need to pass the optimiser’s quality scoring; this
is a floor, not a like-for-like replacement for the current packages.

## Findings

1. Search cards are a good price mirror when they match: median price delta is 0%, and ratings and
   stars match exactly. Single-run coverage is not sufficient for production (Ella 56%).
2. Entity pages are fast and reliable in this sample and are the only source that publishes
   rate-level room, occupancy, cancellation and board basis.
3. Rate-level breakfast is often absent: only 40% of the sampled properties exposed a
   breakfast-included rate. Property-level “Free breakfast” is not proof that the cheapest rate
   includes breakfast.
4. SerpApi search totals can materially underquote a breakfast-included rate: four of the seven
   package properties with a breakfast rate were more than 10% higher, including two above 100%.
5. Entity prices are not always the cheapest. They can miss cheaper OTA sources and compact cards,
   so they must not replace SerpApi price discovery.
6. The package effect is not a uniform surcharge. The current cheapest package is not
   breakfast-confirmable, the premium package breaches the budget by a small margin, and a strict
   re-optimisation can still produce under-budget packages. The optimiser must consume rate-level
   offers and re-run, not add a blanket breakfast uplift.
7. Google can change its markup or protobuf, rate-limit, or serve a consent wall. Scraping also
   carries terms-of-service and legal risk. SerpApi remains the safer production dependency.

## Recommendation

**Keep SerpApi as the production discovery and pricing provider. Do not replace it with the custom
scraper.** The custom scraper’s search coverage (56–93%) and missing OTA sources are not good enough
for replacement, and its entity pages are a board-basis verifier rather than a complete price feed.

Recommended integration, gated behind a disabled-by-default `googleHotelsDirect` flag (the
approved design called it `google_hotels_direct`):

1. Run entity enrichment only for properties SerpApi already returned, matched by `property_token`.
   Do not add custom-only search cards to production inventory yet.
2. Fetch a bounded top-N properties per stop (start with 5, maximum 10) with concurrency 2–3, a 15 s
   timeout, retries with backoff, and a circuit breaker. Cache by token + stay + occupancy for a
   short TTL.
3. Attach rate-level metadata to the offer: `boardBasisSource: "rate"`, room name, occupancy,
   cancellation, entity total, strict breakfast total, fetch latency and parse status.
4. For a strict breakfast requirement, use the rate-level breakfast-included total when present.
   When it is absent, keep the offer `unconfirmed` and exclude it from strict packages; do not infer
   breakfast from the property amenity.
5. Keep the custom search-card path in shadow mode until coverage and price accuracy improve. If it
   is later promoted, require a rate-level breakfast rate for breakfast-required trips and a
   SerpApi price cross-check.
6. Change the meal-plan policy so a property-level “Free breakfast” is recorded as
   `boardBasisSource: "property_amenity"` with `mealPlanStatus: "unconfirmed"`, not as a confirmed
   `BB`. The existing `allowUnconfirmedMealPlans` opt-in remains for agents who accept the risk.
7. Pilot for two weeks on the sample and live enquiries. Acceptance gates: entity enrichment success
   ≥90% for shortlisted properties; p95 added latency ≤2 s; no increase in provider failure rate; no
   429/consent walls; measured strict-breakfast package delta reviewed; legal sign-off on scraping.
8. Rotate the SerpApi key that was used during testing.

## Implementation status (27 Oct 2026)

Approved and implemented behind the top-level `googleHotelsDirect` integration setting, default
`false`. SerpApi remains the production discovery and pricing provider.

- `@tripweave/provider-contracts` exposes `fetchGoogleHotelsEntity`, the `ts` encoder, entity parser,
  compact/full rate dedupe and strict rate selection. It has a 15 s timeout, exponential backoff,
  consent-wall detection and typed errors.
- `GoogleHotelsProvider` enriches the cheapest five distinct `property_token`s per stop (hard maximum
  10) with concurrency 2, a three-failure circuit breaker, a 15-minute default cache and failure
  isolation. A failed entity fetch leaves the SerpApi offer untouched and records the error code.
- Enrichment metadata is attached under `providerMetadata.directEnrichment`: status, cache flag,
  latency, rate count, entity total, and the strict breakfast total/source/room/guests/cancellation.
  Property-level breakfast remains `boardBasisSource: "property_amenity"`; rate-level evidence is
  `"rate"`.
- `withStrictBreakfastOffer` promotes a Google offer to confirmed `BB` at the strict
  breakfast-included total only when breakfast is required. A breakfast-only rate is never used to
  satisfy a half-board requirement, and unconfirmed offers are rejected when breakfast is required
  unless `allowUnconfirmedMealPlans` is set.
- The flag is wired through the integrations API, the optimisation pipeline and `POST /hotel-search`,
  and has a switch on Settings → Integrations. With the flag off, no entity page is requested.
- Live verification caught one integration bug the unit test had missed: the constraint read the
  strict total from the top level while the provider stored it under `directEnrichment`. The test
  fixture now mirrors the real nested shape and the constraint reads both nested and legacy flat
  metadata.

### Sample trip — strict breakfast, pilot enabled

The exact sample enquiry (family of 4, 10 nights from 5 March 2027, Kandy → Ella → Galle,
USD 4,000 accommodation budget, breakfast included) was re-run with `googleHotelsDirect: true` and
`requiredMealPlans: ["BB"]`. Job `82735f64-5225-4d22-bf93-3a72bb183eed`:

| Objective | Package cost | Make-up |
|---|---:|---|
| Budget explorer | USD 936 | Richmond House (Booking.com), Ravana Range (Agoda), de MODA (Agoda) — all strict `BB` |
| Best value | USD 986 | Lavendish Hills, Ravana Range, de MODA — all strict `BB` |
| Comfort journey | USD 1,459 | Lavendish Hills and Ravana Range strict `BB`, company B&B in Galle |
| Premium experience | USD 2,162 | Lavendish Hills strict `BB`, company B&B in Ella and Galle |
| Company preferred | USD 2,684 | company B&B throughout |

All five packages are feasible and within the USD 4,000 budget. The strict breakfast run does not
reproduce the earlier blanket-repriced table (best value 1,350, comfort 3,061, premium 4,022): the
optimiser re-optimises around the rate-level offers and finds cheaper strict combinations. That is
the intended behaviour. The earlier table remains a like-for-like repricing of the previous
shortlist, not the best strict-breakfast package.

In this run, 55 Google offers were candidates across the three stops; 15 were inside the top-N and
were fetched (5 per stop), all 15 succeeded, and 6 exposed an explicit breakfast-included rate
(3 Booking.com, 3 Agoda). The remaining 40 were correctly skipped as `outside_top_n`. The funnel
rejected 54, 55 and 57 offers respectively on meal plan and accepted 5 per stop; no unconfirmed
board basis entered a strict package. Google provider search latency including enrichment was
5.1–6.4 s per stop; OSM discovery was 2.8–9.4 s; all provider outcomes were `ok`.

## Verification

- `node --test scripts/google-hotels-direct.test.mjs` — 6/6 passing.
- `pnpm test` — 199/199 passing across 19 files, including 10 entity/encoder/fetch tests, 5 provider
  enrichment tests and the strict-breakfast policy tests.
- `pnpm typecheck` — clean across all workspaces.
- Live comparison: 9 search runs (3 per stop) and 22 fresh entity fetches, 0 failures; per-entity
  median 787 ms, p95 1,045 ms.
- Live strict pilot: 15/15 enriched entity fetches succeeded; 0 provider failures; all five packages
  feasible and within budget.
- Known pilot gates still open: legal sign-off on scraping, two-week live measurement, and rotation
  of the SerpApi key used during testing.


