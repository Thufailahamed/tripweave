# SerpApi Google Hotels Cost Optimization

**Research date:** 27 October 2026. All SerpApi prices below were verified on that date at [serpapi.com/pricing](https://serpapi.com/pricing) and [serpapi.com/enterprise](https://serpapi.com/enterprise). SearchApi prices were verified on the same date at [searchapi.io/pricing](https://www.searchapi.io/pricing). The startup discount was last checked 1 October 2026 by Superscout and the JoinSecret page was modified 27 October 2026.

**Scope and assumptions:** the platform currently makes one Google Hotels search per itinerary stop, with three stops in the sample trip, plus ad-hoc searches. A "search" below means one successful SerpApi API call unless explicitly called an "itinerary search" (three calls). All prices are USD list prices, excluding tax. Calculations are mine and are labelled as such.

---

## 1. SerpApi's 2026 plans, free tier, per-search pricing, overage and enterprise terms

### Takeaway
SerpApi sells monthly blocks of searches, not metered per-search overage. In 2026 the self-serve ladder runs from Free (250 searches/month) through Starter ($25/1,000), Developer ($75/5,000), Production ($150/15,000), Big Data ($275/30,000), Searcher ($725/100,000), Volume ($1,475/250,000), Infrastructure ($2,750/500,000) and Cloud plans up to 54 million. Effective cost falls from $25 per 1,000 searches on Starter to $3.75 per 1,000 on Cloud 1M. There is no annual billing advertised; plans are month-to-month. Enterprise is $3,750/month for a base that includes 100,000 searches, with additional usage at $7.50 per 1,000 on-demand or $2.75 per 1,000 reserved.

### Cited Findings
- The self-serve plan table is: Free $0 / 250 searches / 50 per hour; Starter $25 / 1,000 / 200 per hour; Developer $75 / 5,000 / 1,000 per hour; Production $150 / 15,000 / 3,000 per hour; Big Data $275 / 30,000 / 6,000 per hour; Searcher $725 / 100,000 / 20,000 per hour; Volume $1,475 / 250,000 / 50,000 per hour; Infrastructure $2,750 / 500,000 / 100,000 per hour; Cloud 1M $3,750 / 1,000,000 / 110,000 per hour; Cloud 2M $5,675 / 2,000,000; Cloud 5M $11,475 / 5,000,000; Cloud plans scale to 54M ($106,050/month for 54,000,000 searches) — [SerpApi Pricing](https://serpapi.com/pricing).
- Only successful searches count toward the monthly allowance. Cached, errored and failed searches are not counted. The number of results returned does not affect the credit count: a response with 100 results and an empty result set both count as one search — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Cached searches are free and are not counted toward the monthly searches. A cache is served only when the query and all parameters are exactly the same, and the cache expires after one hour. `no_cache=true` forces a fresh fetch — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- There is no conventional per-search overage on self-serve plans. When searches run out, the account can use Automatic Early Renewal, which triggers a full early renewal, replenishes searches, resets the renewal date and starts a new billing cycle. Manual renewal is also possible. On downgrade, remaining searches are moved to an "Extra Credits" balance — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Enterprise is priced at $3,750/month and searches are billed according to usage. On-demand searches cost $7.50 per 1,000 ($15.00 with Ludicrous Speed, $30.00 with Ludicrous Speed Max). Reserved searches cost $2.75 per 1,000 ($5.50 / $11.00 with the speed modes). The recommended base plan includes 100,000 complimentary searches per month; unused reserved credits do not roll over; pagination queries count as separate searches — [SerpApi Enterprise](https://serpapi.com/enterprise).
- Every self-serve plan can be combined with a speed mode. Best Effort is the default at 1× plan price. Ludicrous Speed costs 2× the base price and Ludicrous Speed Max costs 4× the base price — [SerpApi Pricing](https://serpapi.com/pricing).
- U.S. Legal Shield, which provides up to $2 million of coverage for scraping and parsing search-engine data, is included on Production and above but not on Free, Starter or Developer — [SerpApi Pricing](https://serpapi.com/pricing); [SerpApi Legal](https://serpapi.com/legal).
- The refund policy is a full refund within seven days of subscription unless more than 20% of searches have been used — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Plans are month-to-month and can be upgraded, downgraded or cancelled at any time. Upgrades are charged pro rata; downgrades take effect at the next renewal, with unused searches added to Extra Credits — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Throughput is the guaranteed number of successful searches per hour, and SerpApi recommends spreading searches evenly across the hour — [SerpApi Pricing](https://serpapi.com/pricing).

**Calculated effective rates (my arithmetic from the official table):**

| Plan | $/month | Searches/month | $ per 1,000 searches | Throughput/hour | Legal Shield |
|---|---:|---:|---:|---:|---|
| Free | 0 | 250 | 0 | 50 | No |
| Starter | 25 | 1,000 | 25.00 | 200 | No |
| Developer | 75 | 5,000 | 15.00 | 1,000 | No |
| Production | 150 | 15,000 | 10.00 | 3,000 | Yes |
| Big Data | 275 | 30,000 | 9.17 | 6,000 | Yes |
| Searcher | 725 | 100,000 | 7.25 | 20,000 | Yes |
| Volume | 1,475 | 250,000 | 5.90 | 50,000 | Yes |
| Infrastructure | 2,750 | 500,000 | 5.50 | 100,000 | Yes |
| Cloud 1M | 3,750 | 1,000,000 | 3.75 | 110,000 | Yes |
| Cloud 2M | 5,675 | 2,000,000 | 2.84 | 120,000 | Yes |
| Cloud 5M | 11,475 | 5,000,000 | 2.30 | 150,000 | Yes |

### Inferences
- Because plans are prepaid blocks, a 30% reduction in calls often produces a 0% reduction in spend unless it crosses a plan boundary. This drives the stepwise savings in Section 5.
- If Legal Shield is a hard requirement, the practical entry price is Production at $150/month, not Starter at $25 or Developer at $75. At low volume that is a bigger cost driver than the search count.
- Enterprise is not a cost-saving option at this platform's likely volume: the $3,750/month base is more than five times Searcher ($725/100,000). It is a custom-terms, compliance and SLA product, not a discount tier.
- Speed modes should be left off unless latency is demonstrably costing conversions; enabling Ludicrous Speed doubles the whole bill.

### Gaps
- No public self-serve "extra credit" per-search price was found. The FAQ mentions Extra Credits only in the context of downgrades; the only explicit per-search rates published are the enterprise on-demand ($7.50/1,000) and reserved ($2.75/1,000) rates.
- The enterprise page says the $3,750/month base includes 100,000 complimentary searches per month and that searches beyond that are billed at the on-demand or reserved rate. It does not say whether the complimentary allowance is permanent or promotional; confirm with SerpApi sales.
- No published annual billing or annual discount was found. The pricing page says month-to-month only.

---

## 2. How a Google Hotels search is billed and what one call returns

### Takeaway
One successful Google Hotels API call counts as one search, regardless of how many properties or booking sites are in the response. A standard first page returns about 20 properties, each with multiple OTA prices, ratings, amenities, coordinates and a `property_token`. Pagination, property-detail requests, reviews, photos, autocomplete and price-calendar requests are separate billable calls. The billing unit is the call, not the property.

### Cited Findings
- A Google Hotels request requires `q` (or `property_token`), `check_in_date` and `check_out_date`; `adults`, `children`, `children_ages`, `currency`, `gl` and `hl` are optional. The response contains `properties[]` with `name`, `property_token`, `gps_coordinates`, `rate_per_night`, `total_rate`, a `prices[]` array (source, nightly rate, total rate, free cancellation) and `overall_rating` — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- The documented response example paginates from `current_from: 1` to `current_to: 20` and exposes a `next_page_token` — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- `next_page_token` retrieves the next page of results. Each page is a separate API request — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- SerpApi states explicitly that "pagination queries count as separate searches" — [SerpApi Enterprise](https://serpapi.com/enterprise).
- A property-detail request uses `property_token` and returns name, address, phone, prices, nearby places, check-in/out times and rate detail. It is a separate request from the destination search — [Google Hotels API documentation](https://serpapi.com/google-hotels-api); [Google Hotels Property Details](https://serpapi.com/google-hotels-property-details).
- Reviews, photos, price calendar and autocomplete are separate engines/endpoints (`google_hotels_reviews`, `google_hotels_photos`, `google_hotels_price_calendar`, `google_hotels_autocomplete`), so each successful call is another search — [Google Hotels API documentation](https://serpapi.com/google-hotels-api); [SerpApi Pricing](https://serpapi.com/pricing).
- The pricing FAQ confirms that result count does not change the credit count: "responses with 100 results or empty result sets will both count as 1 search" — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Internal evidence: one live run per stop returned 19 / 19 / 20 cards, of which 16 / 18 / 15 had usable Google Hotels prices. The platform did not paginate — `docs/hotel-search-implementation.md` (internal, 27 October 2026).

### Inferences
- One call prices dozens of options because each of roughly 20 properties carries several OTA prices. Querying per property would be roughly 10–20× more expensive for the same coverage.
- A three-stop itinerary needs three calls for discovery (one per destination), not three calls per property. The current design is already near the minimum for a multi-city trip.
- If page 2 is needed for coverage, each stop becomes two calls and a three-stop itinerary becomes six calls — a 100% cost increase. That may be justified for high-value trips but should not be the default.
- A successful but empty response still costs a search. Destination/date validation before the call is therefore a cost control, not just a UX control.

### Gaps
- SerpApi does not document a hard "20 results per page" guarantee. The example and the internal runs show 20, but Google may vary the page size by query or market. Treat 20 as typical, not contractual.
- I found no Google Hotels-specific surcharge: it appears to consume the same one-search credit as other engines. SerpApi does not publish per-engine price differences.

---

## 3. How many SerpApi calls a typical itinerary needs

### Takeaway
The floor is one call per destination per date/occupancy combination, so the three-stop sample needs three calls, not one per property. The current platform is already at that floor for discovery. The real waste is repeat searches for the same destination/dates/occupancy, workflow retries, ad-hoc searches and searching before an enquiry is qualified. Batching stops is only viable when stops share a metro or region because Google Hotels has no multi-city parameter.

### Cited Findings
- The provider builds one request per `getAvailability` call with `engine=google_hotels`, `q=Hotels in ${destination}`, `check_in_date`, `check_out_date`, `adults`, `children`, `children_ages`, `currency`, `hl`, `gl` and `api_key`. It then prices every returned property from `p.prices[]`; it does not make per-property SerpApi calls — `packages/provider-contracts/src/google-hotels.ts` (internal).
- There is no application-level search cache in `fetchProperties`; every `getAvailability` invocation makes an HTTP request to SerpApi, although SerpApi's own one-hour cache can serve exact repeats for free. The only platform cache is a 15-minute in-memory entity-page cache used for the top five properties — `packages/provider-contracts/src/google-hotels.ts` and `docs/hotel-search-implementation.md` (internal).
- `recheckPrice` returns `not_supported` with the message "Aggregated prices change frequently. Run the search again to refresh every source." Refreshing one offer therefore means rerunning the whole destination search — `packages/provider-contracts/src/google-hotels.ts` (internal).
- The optimization pipeline loops over stops and calls `searchAllProviders` once per stop. The workflow retries the entire `fetch-candidates` step up to two times, so a failure late in the loop can re-query stops that already succeeded — `apps/api/src/services/optimisation.ts` and `apps/api/src/workflows/optimisation.ts` (internal).
- `searchAllProviders` also wraps each provider call in `withRetry` with up to two retries (three attempts) for retryable errors — `packages/provider-contracts/src/registry.ts` (internal).
- The live sample produced 59 / 59 / 58 total offers per stop and 16 / 18 / 15 Google Hotels offers per stop, with 1.3–1.7 seconds per request and no pagination — `docs/hotel-search-implementation.md` (internal, 27 October 2026).
- Google Hotels documents a single `q` search query and no multi-city or multi-destination parameter; `property_token` is for one property — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- SerpApi's built-in cache is free for exact query/parameter repeats within one hour — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- Entity-page enrichment fetched 22/22 shortlisted properties successfully, median 787 ms, p95 1,045 ms, but missed cheaper OTA rates that SerpApi found (Super.com and Reservation Day were cited) and is described as a board-basis verifier, not a complete price feed — `docs/hotel-search-implementation.md` (internal).
- OpenStreetMap fallback is keyless discovery; its prices are estimates benchmarked against the company catalogue or category defaults, and availability is unknown — `docs/hotel-search-implementation.md` (internal).
- Single-run search coverage against the union of three runs was 56–93% by stop (Kandy 88%, Ella 56%, Galle 93%), while union coverage was 33/34/34 cards. A single run is therefore not always complete — `docs/hotel-search-implementation.md` (internal).
- SerpApi's terms prohibit reproducing, duplicating, copying, selling, reselling or exploiting the service without permission, and SerpApi does not warrant that results are accurate or reliable — [SerpApi Legal](https://serpapi.com/legal).

### Inferences
- The call floor for the sample is three calls per itinerary. The current design is not wasteful at the per-property level; it is wasteful at the repeat, retry and unqualified-enquiry level.
- Caching by normalised destination + check-in + check-out + adults + children + children ages + rooms + currency + `gl` + `hl` can eliminate repeat calls across users, trips and agents. The platform's own cache is the main missing lever.
- Deduplicating overlapping trips is the same mechanism as caching: if two trips share the same key, one call serves both. If dates, occupancy or currency differ, the result is not safely reusable.
- Qualification gating is the largest non-technical lever. If only 30–50% of enquiries reach the quote stage, searching at quote stage rather than enquiry stage can cut 50–70% of calls without touching the API integration.
- Keep first-page-only unless coverage is demonstrably inadequate. The internal Ella coverage of 56% is a quality warning, but the answer is targeted pagination for high-value/qualified trips, not pagination everywhere.
- Entity pages for board-basis verification already avoid five SerpApi property-detail calls per stop (15 per itinerary). Keep that pattern; do not replace it with SerpApi property-detail calls.
- Batching stops is only realistic for same-metro/region stops (for example two Bangkok districts). Kandy, Ella and Galle are separate hotel markets; one call per stop is the safe minimum. A single "Sri Lanka" query is not a documented substitute for three local searches.
- Use catalogue/OSM for discovery, coordinates, amenities and star ratings; call SerpApi only for live cross-OTA prices. OSM prices are estimates and should not be used for firm quotes.
- Retry hygiene matters: checkpoint successful stops per job and do not re-query them on retry. On an ambiguous timeout, check SerpApi's search archive before rerunning, because a completed server-side search can still be billed even if the client timed out.
- Avoid ancillary engines (reviews, photos, price calendar, autocomplete) in the quote path. Each is a separate search; use own data, OSM/Nominatim or cached data instead.

### Gaps
- No measured repeat-search rate, cache-hit rate or ad-hoc share exists in the repository. The 20–50% savings from caching is an assumption until instrumented.
- The internal docs show coverage gaps but not the cost of fixing them. A two-run or page-2 policy would double calls; the quality gain is not quantified.
- The legal position on storing and redisplaying SerpApi/Google Hotels prices beyond the immediate quote is unresolved. SerpApi's terms restrict reproduction/resale; internal quoting is likely different from publishing a price database, but legal review is needed.
- No evidence that Google Hotels accepts a multi-city `q` reliably. It is undocumented and should not be relied on.

---

## 4. Which optimizations reduce spend, and by how much

### Takeaway
The highest-return levers are (1) an application-level search cache keyed by destination + dates + occupancy, (2) deduplicating overlapping trips through the same cache, (3) gating SerpApi calls to qualified enquiries, and (4) fixing retry/checkpoint behaviour so a failed job does not re-query stops that already succeeded. First-page-only and entity-page verification are already implemented and should be kept. Batching stops is marginal because Google Hotels has no multi-city query; catalogue/OSM fallback is useful for discovery but not for firm quotes.

### Cited Findings
- The provider makes one request per destination per `getAvailability` call and has no application-level search cache — `packages/provider-contracts/src/google-hotels.ts` (internal).
- SerpApi's own cache only covers exact query/parameter repeats for one hour and is free; `no_cache=true` forces a billable fresh search — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- The workflow retries the entire `fetch-candidates` step up to two times, so a late failure can re-query earlier stops, and `searchAllProviders` retries each provider call up to two times on retryable errors — `apps/api/src/workflows/optimisation.ts` and `packages/provider-contracts/src/registry.ts` (internal).
- The platform does not paginate; a live run returned 19 / 19 / 20 cards per stop and 16 / 18 / 15 priced Google Hotels offers — `docs/hotel-search-implementation.md` (internal).
- Entity-page enrichment is bounded to the top five properties per stop (hard maximum ten), uses concurrency 2 and a 15-minute cache, and does not call SerpApi — `docs/hotel-search-implementation.md` (internal).
- Entity pages succeeded 22/22 times in the sample, median 787 ms, p95 1,045 ms, but missed cheaper OTA rates and should be treated as a board-basis verifier, not a complete price feed — `docs/hotel-search-implementation.md` (internal).
- OpenStreetMap fallback is keyless and returns real properties, but its prices are estimates and availability is unknown — `docs/hotel-search-implementation.md` (internal).
- Google Hotels documents a single `q` search query and no multi-city parameter — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- Reviews, photos, price calendar and autocomplete are separate engines, each a separate search — [Google Hotels API documentation](https://serpapi.com/google-hotels-api); [SerpApi Pricing](https://serpapi.com/pricing).
- The ad-hoc `POST /hotel-search` route is rate-limited to 120 requests/hour per user and validates destination, dates and party; the optimization route is limited to 30 runs/hour per user — `apps/api/src/routes/optimisation.ts` (internal).
- The platform records provider calls with organisation, operation, status and latency, which can be used to baseline call volume and cache effectiveness — `apps/api/src/services/optimisation.ts` (internal). The callback fires once per provider search, after retries, so it records the final outcome rather than each attempt.

**Optimization levers (effort and call-cut estimates are my judgement, not vendor claims):**

| Lever | What it changes | Effort | Est. call cut | Evidence / caveat |
|---|---|---|---:|---|
| App-level search cache, keyed by normalised destination + check-in + check-out + adults + children + ages + rooms + currency + `gl` + `hl` | Reuses results across users, trips and agents; bypass only for quote-grade rechecks | 1–3 days | 20–40% | SerpApi only caches exact repeats for 1 h; the platform has no search cache today. Use KV/D1, not in-memory, because Worker isolates do not share memory. |
| Deduplicate overlapping trips | Same cache key serves two trips with identical destination, dates and occupancy | 1 day (part of cache) | 10–20% | Exact matches only; a one-day date shift or different party size is not safely reusable. |
| Gate searches on qualified enquiries | Search at quote/agent-review stage, not at first enquiry | 2–5 days workflow/UI | 30–70% | Biggest non-technical lever. Depends on the enquiry-to-quote funnel; 50–70% if only 30–50% reach quote. No public benchmark. |
| Retry and checkpoint per stop | Cache successful stop results inside the job; do not re-query completed stops on retry | 1–2 days | 5–15% | The workflow retries `fetch-candidates` up to twice and `searchAllProviders` retries each provider call up to twice; a late failure can duplicate earlier calls. Use SerpApi async/archive on ambiguous timeouts where possible. |
| Keep first-page-only | Do not add `next_page_token` to every search | Already done | 0% vs current | Each extra page is another search; a three-stop itinerary would go from 3 to 6 calls. |
| Entity pages for verification | Verify board basis/room on shortlisted properties without SerpApi property-detail calls | Already done, default off | Avoids +5 calls/stop (+15/itinerary) | 22/22 success, but it is Google scraping with legal/ToS risk and incomplete price coverage. Keep behind the existing flag and legal review. |
| Batch same-metro stops | Query a region once and filter by coordinates | 3–5 days | 0–33% | Only works when stops share a hotel market; no multi-city parameter. Kandy/Ella/Galle are separate markets. |
| Catalogue/OSM pre-filter | Use free inventory/estimates for feasibility, then SerpApi only for shortlisted/qualified trips | 1–2 weeks | 10–30% | OSM prices are estimates, not firm quotes. Internal sample has 40 OSM offers per stop, so discovery coverage exists. |
| Avoid ancillary engines | Drop reviews/photos/price-calendar/autocomplete from the quote path | 0–1 day | 0–10% | Each is a separate search; use own data, OSM/Nominatim or cached data. |
| CI/staging hygiene | Keep automated tests on fixtures; use the free tier for manual QA; separate keys | 0–1 day | 5–10% | 250 free searches/month; mock tests already exist in the repo. |
| Per-organisation/ad-hoc quotas | Add an organisation-level budget on top of the existing per-user limits; keep date/party validation | 0.5–1 day | 0–15% | The ad-hoc path already validates dates/party and limits each user to 120 searches/hour; the remaining risk is many users or a high per-user cap. |
| Query/filter tuning | Use `sort_by=3`, `max_price`, `rating` or `property_types` to improve page-1 relevance | 1–2 days | 0–15% | Cost-neutral per call; may improve coverage without pagination, but must be tested for quality. |

### Inferences
- Do the first four levers in that order: cache, dedup, qualification gate, retry hygiene. They are low-risk, reversible and do not change the vendor.
- Do not double-count savings. Cache and qualification overlap: a qualified-enquiry gate reduces the population that ever reaches the cache. Measure the combined effect, not the sum of independent estimates.
- Target at least a 50% reduction, not 30%. At the common 10k-calls/month baseline, a 30% cut leaves you on the same $150 Production plan; only reaching 5,000 calls or fewer gets Developer at $75.
- At low volume the cost per itinerary is cents. A 3-stop itinerary costs roughly $0.02–$0.08 in SerpApi fees depending on plan, so weeks of engineering to save a few dollars is not justified. Focus on accuracy and on avoiding wasted calls from retries/ad-hoc use.
- Entity pages are not "free" in a risk sense: they save SerpApi calls but shift effort and legal exposure to Google scraping. If legal sign-off is unavailable, disable enrichment and accept fewer verified board bases, or use SerpApi property details only for committed bookings.
- Catalogue/OSM fallback is best used as a pre-filter, not as a replacement for live pricing. It can answer "is this trip feasible?" cheaply, but the final quote should use live SerpApi prices.

### Gaps
- No measured cache-hit rate, repeat-search rate, ad-hoc share or retry-duplication rate exists. The percentages above are planning estimates.
- The existing provider-call log records final outcomes, not each retry attempt; a timed-out attempt that SerpApi completed server-side may be billed but not visible in the log.
- The internal sample is one family trip to Sri Lanka; it may not represent destinations with denser or sparser Google Hotels coverage.
- No costed engineering estimate for each lever; effort is expressed in days, not money.
- Legal review of entity-page scraping and long-lived price storage is still open.

---

## 5. Monthly cost at 1k / 10k / 100k searches, and savings at 30% / 50% / 80%

### Takeaway
At list prices, 1,000 SerpApi calls/month cost $25 (Starter), 10,000 cost $150 (Production 15k), and 100,000 cost $725 (Searcher). Because SerpApi sells blocks, a 30% call reduction saves $0 at all three volumes; a 50% reduction saves $0 / $75 / $0; only an 80% reduction produces material savings ($25 / $75 / $450). In itinerary terms (three calls each), 1,000 / 10,000 / 100,000 itineraries cost $75 / $275 / $2,750, and an 80% cut saves $50 / $125 / $2,025.

### Cited Findings
- The self-serve plan prices and monthly allowances used in the cost model are: Starter $25/1,000; Developer $75/5,000; Production $150/15,000; Big Data $275/30,000; Searcher $725/100,000; Volume $1,475/250,000; Infrastructure $2,750/500,000; Cloud 1M $3,750/1,000,000 — [SerpApi Pricing](https://serpapi.com/pricing).
- SerpApi does not sell metered per-search overage on self-serve plans. When the allowance runs out, Automatic Early Renewal buys another full plan block — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Only successful searches count toward the allowance, and the number of results returned does not change the credit count — [SerpApi Pricing FAQ](https://serpapi.com/pricing).

**Cost model assumptions:** cheapest single plan that covers the volume; no early-renewal block stacking; no ad-hoc buffer; no startup discount; USD list price; Legal Shield not required. If Legal Shield is required, Production at $150 is the floor. If ad-hoc searches add 10–20%, add them to the call count before choosing the plan.

**Call-volume identity:** monthly calls = (stops per itinerary) × itinerary searches + ad-hoc searches + retry duplicates not served by SerpApi's 1-hour cache + ancillary-engine calls. The sample has three stops; the tables below assume three. Add the other terms before choosing a plan.

**Cost at 1k / 10k / 100k SerpApi calls:**

| SerpApi calls/month | ≈ 3-stop itineraries | Cheapest single plan | $/month | $/call | $/itinerary |
|---:|---:|---|---:|---:|---:|
| 1,000 | 333 | Starter (1k) | 25 | 0.025 | 0.075 |
| 10,000 | 3,333 | Production (15k) | 150 | 0.015 | 0.045 |
| 100,000 | 33,333 | Searcher (100k) | 725 | 0.00725 | 0.02175 |

The 10,000-call row uses 10,000 of Production's 15,000-call allowance; `$/call` is spend divided by calls used, not the plan's full-capacity rate.

**Cost at 1k / 10k / 100k itinerary searches (three calls each):**

| Itinerary searches/month | SerpApi calls/month | Cheapest single plan | $/month | $/itinerary |
|---:|---:|---|---:|---:|
| 1,000 | 3,000 | Developer (5k) | 75 | 0.075 |
| 10,000 | 30,000 | Big Data (30k) | 275 | 0.0275 |
| 100,000 | 300,000 | Infrastructure (500k) | 2,750 | 0.0275 |

At 100,000 itineraries the plan covers 500,000 calls but only 300,000 are used; the effective rate is $2,750 / 300,000 = $0.00917 per call. At about 166,667 itineraries (500,000 calls) the same $2,750 plan yields $0.0165 per itinerary.

**Cost cliffs (cheapest single plan):**

| Calls/month | Plan | $/month | Effective $/1,000 |
|---:|---|---:|---:|
| 0–250 | Free | 0 | 0 |
| 251–1,000 | Starter | 25 | 25.00 |
| 1,001–5,000 | Developer | 75 | 15.00 |
| 5,001–15,000 | Production | 150 | 10.00 |
| 15,001–30,000 | Big Data | 275 | 9.17 |
| 30,001–100,000 | Searcher | 725 | 7.25 |
| 100,001–250,000 | Volume | 1,475 | 5.90 |
| 250,001–500,000 | Infrastructure | 2,750 | 5.50 |
| 500,001–1,000,000 | Cloud 1M | 3,750 | 3.75 |

**Savings from 30% / 50% / 80% call reductions — API-call baseline:**

| Baseline | Baseline $/month | −30% calls | New $ | Saving | −50% calls | New $ | Saving | −80% calls | New $ | Saving |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 25 | 700 | 25 | 0 (0%) | 500 | 25 | 0 (0%) | 200 | 0 | 25 (100%) |
| 10,000 | 150 | 7,000 | 150 | 0 (0%) | 5,000 | 75 | 75 (50%) | 2,000 | 75 | 75 (50%) |
| 100,000 | 725 | 70,000 | 725 | 0 (0%) | 50,000 | 725 | 0 (0%) | 20,000 | 275 | 450 (62%) |

**Savings from 30% / 50% / 80% call reductions — itinerary baseline (three calls each):**

| Baseline itineraries | Baseline $/month | −30% calls | New $ | Saving | −50% calls | New $ | Saving | −80% calls | New $ | Saving |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 75 | 2,100 | 75 | 0 (0%) | 1,500 | 75 | 0 (0%) | 600 | 25 | 50 (67%) |
| 10,000 | 275 | 21,000 | 275 | 0 (0%) | 15,000 | 150 | 125 (45%) | 6,000 | 150 | 125 (45%) |
| 100,000 | 2,750 | 210,000 | 1,475 | 1,275 (46%) | 150,000 | 1,475 | 1,275 (46%) | 60,000 | 725 | 2,025 (74%) |

**Why the savings are lumpy.** The 30,000 → 30,001 boundary is the worst: Big Data at $275 becomes Searcher at $725, a 164% jump. At 10,000 itineraries/month, a 10% ad-hoc buffer (30,000 → 33,000 calls) triggers exactly that jump unless you use early renewal. Two Big Data renewals ($550 for 60,000 calls) are cheaper than Searcher ($725); three Production renewals ($450 for 45,000 calls) are cheaper still when 45,000 calls are enough, but not when volume is higher. Confirm the renewal mechanics and throughput with SerpApi before relying on this.

**Other early-renewal examples (confirm with SerpApi):**
- 2,000 calls: two Starter renewals = $50, versus Developer $75. Saves an extra $25.
- 50,000 calls: two Big Data renewals = $550, versus Searcher $725. Saves $175 (24%).
- 150,000 calls: two Searcher renewals = $1,450, versus Volume $1,475. Saves $25 (2%).

These are marginal and add billing complexity. The main table deliberately uses the simplest single-plan model so the estimates are conservative.

**Cost per booking.** At a 10% enquiry-to-booking conversion, 1,000 itineraries/month produce 100 bookings and a $75 API bill = $0.75 per booking; 10,000 itineraries produce 1,000 bookings and $275 = $0.275 per booking; 100,000 produce 10,000 bookings and $2,750 = $0.275 per booking. At 5% conversion these double. The API cost is roughly $0.28–$1.50 per booking across the 5–10% conversion assumptions, which argues for prioritising quote accuracy over squeezing the last 20% of calls.

### Inferences
- The common intuition that "a 30% call cut saves 30% of spend" is false on SerpApi. The only savings that matter are the ones that cross a plan boundary.
- At 1,000 calls/month, the maximum possible saving in these scenarios is $25/month (drop to Free). At 10,000, the maximum is $75/month; going to 1,000 calls or fewer saves more. At 100,000, the maximum is $450/month; going to 15,000 calls or fewer saves more.
- If the platform is at 10,000 itinerary searches/month (30,000 calls), the single most valuable action may be to stay under 30,000 calls; a small ad-hoc buffer can raise the bill from $275 to $725 (a 164% increase).
- At 100,000 itinerary searches/month, an 80% reduction saves $2,025/month ($24,300/year) and is worth real engineering. At 1,000 itineraries, the same 80% saves $50/month ($600/year), which is not worth a large project.

### Gaps
- Actual monthly call volume, ad-hoc share and itinerary-to-booking conversion are unknown. The tables are scenario estimates, not a bill.
- The early-renewal examples assume SerpApi allows repeated early renewals in one billing period and that throughput carries over; the FAQ does not spell this out. Confirm before budgeting.
- No enterprise quote was obtained. Enterprise may be negotiable at 100k+ calls, but published enterprise pricing is more expensive than Searcher at that volume.
- Taxes, currency conversion and payment fees are excluded.

---

## 6. Cheaper plans, annual billing, startup/nonprofit discounts and prepaid credits

### Takeaway
The legitimate price levers are the free tier (250 searches/month), the startup deal of 50% off for 12 months through JoinSecret (new or non-paying users only), and buying a larger block to lower the effective per-search rate. There is no annual billing advertised, no official nonprofit discount found, and no self-serve prepaid-credit discount documented. Enterprise reserved searches at $2.75/1,000 look cheap per search but are dominated by the $3,750/month base at this platform's scale.

### Cited Findings
- Free plan: $0 for 250 searches/month at 50 searches/hour — [SerpApi Pricing](https://serpapi.com/pricing).
- Startup deal: 50% off for 12 months through JoinSecret. Superscout lists it as "50% off for 12 months", last checked 1 October 2026, and says it is for "new or non-paying users only" — [Superscout](https://superscout.co/perk/serpapi).
- JoinSecret's own page says the promotion is for new or non-paying users and "can be used if you have not signed up for SerpApi yet or if you're using it on the free version." Access requires JoinSecret Premium at $149/year, and applications are manually approved. The page claims "save up to $780" — [JoinSecret](https://joinsecret.com/serpapi).
- SerpApi's pricing page says "Month-to-month. Cancel anytime." and does not list an annual billing option or annual discount — [SerpApi Pricing](https://serpapi.com/pricing).
- Enterprise supports prepay or postpay invoices. Reserved searches are $2.75 per 1,000 ($5.50 with Ludicrous Speed, $11.00 with Max); on-demand searches are $7.50 per 1,000 ($15.00 / $30.00). The recommended base is $3,750/month and includes 100,000 searches — [SerpApi Enterprise](https://serpapi.com/enterprise).
- The self-serve FAQ mentions Extra Credits only as the destination for unused searches after a downgrade. It does not publish a self-serve price for buying extra credits — [SerpApi Pricing FAQ](https://serpapi.com/pricing).
- Legal Shield (up to $2 million) is included on Production and above, not on Free, Starter or Developer — [SerpApi Pricing](https://serpapi.com/pricing); [SerpApi Legal](https://serpapi.com/legal).
- I found no SerpApi nonprofit discount on the pricing page, FAQ or enterprise page — [SerpApi Pricing](https://serpapi.com/pricing); [SerpApi FAQ](https://serpapi.com/faq).

**Calculated startup-deal prices (50% off current list, my arithmetic):**

| Plan | List $/month | Startup $/month | Searches/month |
|---|---:|---:|---:|
| Starter | 25 | 12.50 | 1,000 |
| Developer | 75 | 37.50 | 5,000 |
| Production | 150 | 75.00 | 15,000 |
| Big Data | 275 | 137.50 | 30,000 |
| Searcher | 725 | 362.50 | 100,000 |
| Volume | 1,475 | 737.50 | 250,000 |
| Infrastructure | 2,750 | 1,375.00 | 500,000 |
| Cloud 1M | 3,750 | 1,875.00 | 1,000,000 |

### Inferences
- The startup deal is the biggest price lever that requires no engineering, if the platform is eligible. At 10,000 calls/month it turns Production from $150 to $75 (saves $900/year before the $149 JoinSecret fee); at 100,000 calls it turns Searcher from $725 to $362.50 (saves $4,350/year).
- JoinSecret Premium costs $149/year. At 10,000 calls the net 12-month saving is about $751; at 100,000 it is about $4,201. At 1,000 calls the saving is only $150 gross ($1 net of the membership), so it is not worth it at very low volume.
- If the platform already pays SerpApi, it is not eligible for the "new or non-paying" deal. Do not create a new account to get around eligibility; that risks losing history, legal coverage and support continuity.
- Annual billing is not a lever. The only "prepay" saving is buying a larger monthly block at a lower effective rate, or an enterprise contract with custom terms.
- Enterprise is not cheaper at small volume: $3,750/month buys 100,000 searches, which is $37.50 per 1,000, five times Searcher's $7.25. The reserved $2.75/1,000 rate is below the self-serve rates through Cloud 2M, but the $3,750 base keeps enterprise more expensive than the Cloud plans at every published volume; it is a custom-terms/SLA product, not a discount.
- The free tier is best used for development/staging and manual QA, not for production quotes, because 250 searches/month is only about 83 three-stop itineraries and the throughput is 50/hour.

### Gaps
- No official SerpApi nonprofit or charity program was found. Absence of evidence is not proof; ask contact@serpapi.com.
- The JoinSecret page's "save up to $780" claim does not match current list prices: 50% of Big Data for 12 months is $1,650, and 50% of Searcher is $4,350. Treat the claim as marketing copy and verify the actual discount at checkout.
- It is unclear whether the startup discount can be combined with a custom/enterprise plan or with any other promotion. Ask before relying on it.
- No public self-serve extra-credit price was found. The dashboard has an Extra Credits page, but the price is not documented.

---

## 7. Cached/stale price risk and how to choose cache TTL

### Takeaway
Hotel rates are dynamic and can move materially over days, and a Google Hotels search card is an indicative cross-OTA price, not a guaranteed bookable rate. Cache for discovery (1–6 hours), but revalidate before sending a priced quote and again before booking. Never present a cached price as guaranteed. The bigger accuracy risk is not cache age but rate-basis mismatch: search cards often lack the room type, board basis, tax treatment and cancellation terms of the rate the customer actually books.

### Cited Findings
- Hotel prices change because of seasonal demand, local events, location, room type, price matching between brands, lead time and day of week. Most hotels use revenue-management software that updates rates automatically, and "prices can go up and down from day to day" — [Skyscanner, "Why Hotel Prices Change so Frequently", 6 October 2026](https://www.skyscanner.com/hotels/advice/hotel-price-change).
- A KAYAK analysis of bookings made between January 2025 and March 2026 found hotel prices fluctuate by an average of 34% over a 30-day window before a stay, with direction unpredictable — [Rate Ranger](https://www.rateranger.io/blog/do-hotel-prices-go-down-closer-to-check-in/) (secondary source citing KAYAK; not independently verified).
- Google Hotels prices "come from Google's partners"; some hotel and vacation-rental results may be personalised based on browsing activity and recent searches — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- Google Hotels rate fields can be before or after tax depending on the search location: `display_price`, `lowest`, `before_taxes_fees` and `after_taxes_fees` are separate fields — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- SerpApi's terms do not warrant that results are accurate or reliable, and SerpApi is not responsible for inaccuracies; Legal Shield covers lawful collection and parsing, not how the data is used — [SerpApi Legal](https://serpapi.com/legal).
- SerpApi's cache expires after one hour; cached searches are free, and `no_cache=true` forces a fresh, billable search — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- Internal evidence: when search cards were matched to entity pages, the median price delta was 0%, but 4 of 7 package properties with a breakfast-included rate were more than 10% above the search total, including two above 100%. The maximum absolute delta was 106.2% (Hotel Suisse Kandy: SerpApi 324 vs entity 668) — `docs/hotel-search-implementation.md` (internal, 27 October 2026).
- Internal evidence: of 25 sampled properties, 10 (40%) exposed an explicit breakfast-included rate, 9 (36%) only room-only rates, and 6 (24%) only compact/unknown rates. A property-level "free breakfast" amenity is not proof that the cheapest rate includes breakfast — `docs/hotel-search-implementation.md` (internal).
- Internal code sets `availabilityStatus: "unknown"`, `verificationStatus: "supplier_reported"`, `taxesIncluded: null`, `roomType: "Room type to confirm"` and `expiresAt: null` on Google Hotels offers. `recheckPrice` returns `not_supported`; to refresh one offer the whole search must be rerun — `packages/provider-contracts/src/google-hotels.ts` (internal).
- Internal entity enrichment uses a 15-minute default cache — `docs/hotel-search-implementation.md` (internal).
- Entity pages were reliable (22/22) and fast (median 787 ms, p95 1,045 ms) but missed cheaper OTA rates and are a board-basis verifier, not a complete price feed — `docs/hotel-search-implementation.md` (internal).

### Inferences
- There are two separate risks: (a) time staleness — the cache is old; (b) rate-basis mismatch — the cached/searched price is for a different room, occupancy, board basis, tax treatment or cancellation policy than the quote. A short TTL fixes (a) but not (b). Rate-level entity checks or supplier confirmation are needed for (b).
- Recommended TTLs:
  - **Discovery / property list + indicative prices:** 1–6 hours for the same destination + dates + occupancy. Use 24 hours only for far-future dates (roughly 90+ days out) or low-season periods, and label the result "indicative".
  - **Quote generation:** fresh or cache age ≤60 minutes. Revalidate before sending a priced quote. At minimum, timestamp the quote and add "subject to availability".
  - **Booking/commit:** always revalidate. Do not rely on any cache.
  - **Entity/board-basis cache:** 15–60 minutes. Board basis changes less often than price, but rate plans can change; the existing 15-minute cache is reasonable.
  - **Non-price metadata:** 7–30 days for name, coordinates, amenities and star rating; these are stable and safe to cache.
- Cache key should include normalised destination, check-in, check-out, adults, children, children ages, rooms, currency, `gl`, `hl`, and any filters/sort. Include a cache-version string so a query-logic change does not serve stale-schema results.
- Because `recheckPrice` is unsupported, budget for a full three-call refresh when a quote is revalidated. A "recheck this hotel" button that triggers a full itinerary search is expensive; either batch rechecks or accept a short cache TTL.
- Set `expiresAt` from the TTL and display "price checked at …" in the UI. The current `expiresAt: null` gives the UI no basis for a freshness warning.
- For breakfast-inclusive quotes, do not rely on the search-card price. Use rate-level entity evidence for the shortlisted properties; where it is absent, mark the offer `unconfirmed` and exclude it from strict breakfast quotes, as the internal docs recommend.
- Normalise tax treatment before comparing or quoting. The internal code's preference for `total_rate.extracted_lowest` can produce a before-tax total depending on `gl`; use `after_taxes_fees` when available and label `taxesIncluded` explicitly.
- Availability is unknown regardless of cache TTL. Google Hotels does not confirm availability, so a fresh price is still not a booking guarantee. Quote "on request" or revalidate with the supplier.
- The business risk of a bad quote can exceed the API saving. At 10% conversion, API cost is roughly $0.28–$0.75 per booking; one failed or mispriced booking can wipe out months of cache savings. Optimise for accuracy on committed quotes, not for the cheapest possible cache.

### Gaps
- No authoritative public statistic on Google Hotels search-card volatility specifically. The 34% KAYAK figure is secondary and covers general hotel prices, not SerpApi/Google Hotels results.
- No measured cache-hit rate, staleness distribution or price-delta distribution for this platform. Instrument cache age and refresh deltas before fixing TTLs.
- SerpApi publishes only the one-hour built-in cache; it gives no recommended application-level TTL.
- The legal position on storing and redisplaying SerpApi/Google Hotels prices for days or weeks is unresolved. SerpApi's terms restrict reproduction/resale; get legal sign-off before building a long-lived price database.
- Search cards may show a cheapest OTA (for example Super.com or Reservation Day) that is unfamiliar or absent from the hotel's own entity page. Quote quality checks should include merchant legitimacy, not just price.

---

## 8. Optimization versus switching providers: effort and savings

### Takeaway
Optimization is lower effort and lower risk. For this platform the first wins are caching/deduplication, qualification gating and retry hygiene; they need days, not weeks, and do not change vendor. Switching to a cheaper provider can cut unit price by roughly 60–75% at 10k+ calls/month, but requires 2–6 weeks of schema migration, coverage/price-parity testing and legal review. At very low volume SerpApi is already cheaper than the cheapest SearchApi plan; on list prices the crossover is just above 1,000 calls/month, though the absolute saving is only $35/month until volume grows.

### Cited Findings
- SearchApi list pricing: Developer $40/month for 10,000 searches ($4 per 1,000); Production $100/month for 35,000 ($3 per 1,000); BigData $250/month for 100,000 ($2.50 per 1,000); Scale $500/month for 250,000 ($2 per 1,000); Octo 500K $900/month for 500,000 ($1.80 per 1,000); Octo 1M $1,500/month for 1,000,000 ($1.50 per 1,000). It offers 100 free requests, charges only for successful searches, has a 99.9% SLA, and includes legal protection up to $2 million on Production and above — [SearchApi Pricing](https://www.searchapi.io/pricing).
- SearchApi limits usage to 20% of a plan's credits per hour — [SearchApi Pricing](https://www.searchapi.io/pricing).
- SearchApi has a Google Hotels API and a Google Hotels Property API with fields such as property name, address, `price_per_night`, `total_price`, `price_insights`, `featured_offers` and `all_offers` — [SearchApi Google Hotels Property API](https://www.searchapi.io/docs/google-hotels-property-api).
- SerpApi's prices for the same volumes are $25/1k, $75/5k, $150/15k, $275/30k, $725/100k and $2,750/500k — [SerpApi Pricing](https://serpapi.com/pricing).
- Internal docs recommend keeping SerpApi as the production discovery and pricing provider and not replacing it with the custom keyless scraper: custom search coverage was 56–93%, it missed OTA sources, and scraping carries terms-of-service and legal risk — `docs/hotel-search-implementation.md` (internal, 27 October 2026).
- Internal docs describe entity pages as a board-basis verifier, not a complete price feed; they missed cheaper OTA rates (Super.com, Reservation Day) — `docs/hotel-search-implementation.md` (internal).
- SerpApi's Legal Shield covers Production and above; SearchApi's legal protection covers Production and above. Neither covers how the data is used — [SerpApi Pricing](https://serpapi.com/pricing); [SearchApi Pricing](https://www.searchapi.io/pricing).

**List-price comparison (my arithmetic; monthly, USD, no discounts):**

| Calls/month | SerpApi plan / cost | SearchApi plan / cost | Cheaper by |
|---:|---|---|---:|
| 1,000 | Starter $25 | Developer $40 | SerpApi $15 |
| 3,000 | Developer $75 | Developer $40 | SearchApi $35 |
| 10,000 | Production $150 | Developer $40 | SearchApi $110 |
| 30,000 | Big Data $275 | Production $100 | SearchApi $175 |
| 100,000 | Searcher $725 | BigData $250 | SearchApi $475 |
| 300,000 | Infrastructure $2,750 | Octo 500K $900 | SearchApi $1,850 |

If Legal Shield/legal protection is mandatory, compare the Production tiers: SerpApi Production is $150 for 15,000 searches, while SearchApi Production is $100 for 35,000. SearchApi is cheaper and includes more volume at that level, but its terms and enforceability need review.

**Illustrative switch payback (my arithmetic; one-off migration cost, no optimization, no startup discount):**

| One-off migration cost | Payback at 10k calls ($110/month saving) | Payback at 100k calls ($475/month saving) |
|---:|---:|---:|
| $2,000 | 18 months | 4.2 months |
| $5,000 | 45 months | 10.5 months |
| $10,000 | 91 months | 21 months |

At 10,000 calls, a switch only pays back within 12 months if migration costs less than about $1,320; at 100,000 calls, the 12-month threshold is about $5,700. This is why the recommendation is to optimize first and pilot a switch only when volume justifies it.

### Inferences
- **Effort:** caching/dedup is 1–3 days; qualification gating is 2–5 days; retry/checkpoint is 1–2 days; a provider switch is 2–6 weeks including schema mapping, regression tests, a coverage/price-parity pilot, legal review and monitoring. At a small team, the switch is a real project; the optimizations are chores.
- **Savings at 10,000 calls/month:** SerpApi $150. A 50% optimization cut reaches Developer $75 (saves $75/month, $900/year). The startup discount reaches $75 (saves $75/month, $900/year). Switching to SearchApi reaches $40 (saves $110/month, $1,320/year). The switch saves only $35/month more than the easier options, which rarely justifies 2–6 weeks of work.
- **Savings at 100,000 calls/month:** SerpApi $725. An 80% optimization cut reaches Big Data $275 (saves $450/month, $5,400/year). The startup discount reaches $362.50 (saves $362.50/month, $4,350/year). Switching reaches $250 (saves $475/month, $5,700/year). Optimization and switching are in the same range; optimization is lower risk.
- **Combining levers is more powerful than either alone.** At 10,000 calls: 50% cut + startup discount = 5,000 calls on Developer at 50% off = $37.50/month, versus $150 baseline (75% saving). At 100,000 calls: 80% cut + startup = 20,000 calls on Big Data at 50% off = $137.50/month, versus $725 (81% saving). Eligibility for the startup deal is the gating factor.
- **At 1,000 calls/month,** SerpApi Starter at $25 is cheaper than SearchApi's $40 entry plan. Switching is value-destructive at this volume.
- **At 3,000 calls/month,** SearchApi Developer at $40 is cheaper than SerpApi Developer at $75. But the absolute saving is $35/month ($420/year), which is unlikely to repay a migration project unless the platform is growing quickly.
- **Total cost of ownership matters more than headline price.** SearchApi's coverage, latency, empty-result rate, field parity (especially `prices[]`/OTA breakdown, taxes, cancellation and board basis) and support are unverified. A cheaper per-search rate can be offset by more retries, more manual checks or worse quotes.
- **The custom keyless scraper is not a free alternative.** Internal coverage was 56–93%, it missed OTA sources, and it carries Google terms-of-service and legal risk. The internal recommendation is to keep SerpApi for production; that is consistent with the cost analysis.
- **Other providers may be cheaper at high volume,** but a like-for-like Google Hotels endpoint with legal coverage was not evaluated here. Evaluate on field parity and total cost, not on the headline per-1,000 rate.

### Gaps
- SearchApi's Google Hotels coverage, success rate, latency and field parity with SerpApi were not independently benchmarked here. A paid pilot is required before switching.
- SearchApi's legal protection terms were not reviewed in detail; the pricing page claims up to $2 million on Production and above, but enforceability and exclusions are unknown.
- No SearchApi enterprise/custom quote was obtained; list prices only.
- No internal data on actual monthly call volume, growth rate or engineering cost, so the effort/savings comparison is qualitative.
- Other cheaper providers were not evaluated; SearchApi is used as a representative comparator because it has a Google Hotels-specific API.

---

## 9. Practical recommendation for a small travel platform

### Takeaway
Do not switch providers yet. At the likely scale of this platform, SerpApi costs cents per itinerary and the absolute savings from switching are small relative to the migration effort and quote-quality risk. Apply the startup discount if eligible, add a search cache/dedup layer, gate searches to qualified enquiries, fix retry/checkpoint behaviour, and keep first-page-only plus entity-page verification. Re-measure for 4–6 weeks; revisit switching only if volume remains above roughly 30,000 calls/month or a SearchApi pilot proves coverage and field parity.

### Cited Findings
- The current platform makes one SerpApi call per stop, with no search-level cache, no single-offer recheck and a workflow that retries the whole fetch stage — `packages/provider-contracts/src/google-hotels.ts` and `apps/api/src/services/optimisation.ts` (internal).
- The sample three-stop trip produced 59/59/58 offers and 16/18/15 Google Hotels offers per stop at 1.3–1.7 seconds per request — `docs/hotel-search-implementation.md` (internal, 27 October 2026).
- SerpApi's own cache covers only exact repeats within one hour — [Google Hotels API documentation](https://serpapi.com/google-hotels-api).
- SerpApi plan prices and search allowances — [SerpApi Pricing](https://serpapi.com/pricing).
- Startup discount terms: 50% off for 12 months, new/non-paying users only, JoinSecret Premium $149/year — [Superscout](https://superscout.co/perk/serpapi); [JoinSecret](https://joinsecret.com/serpapi).
- SearchApi list prices — [SearchApi Pricing](https://www.searchapi.io/pricing).
- Internal recommendation to keep SerpApi as production discovery/pricing and use entity pages only as a verifier — `docs/hotel-search-implementation.md` (internal).
- Hotel price volatility and dynamic pricing — [Skyscanner](https://www.skyscanner.com/hotels/advice/hotel-price-change); secondary KAYAK figure via [Rate Ranger](https://www.rateranger.io/blog/do-hotel-prices-go-down-closer-to-check-in/).

**Prioritised action plan:**

| Priority | Action | Effort | Expected effect | How to measure |
|---:|---|---|---|---|
| 1 | Instrument the baseline: calls per itinerary, ad-hoc share, retries, cache hits, cost per booking | 1–2 days | No direct saving; prevents blind optimization | Use the existing provider-call log; add cost estimates per organisation/trip |
| 2 | Apply the startup discount if eligible | 1 day | 50% off the plan for 12 months | Confirm eligibility and discount at checkout; do not create a duplicate account |
| 3 | Add a search-result cache keyed by destination + dates + occupancy + currency + `gl`/`hl` | 1–3 days | 20–40% fewer calls | Cache hit rate, age of cached results, price delta on refresh |
| 4 | Deduplicate overlapping trips through the same cache | 1 day | 10–20% fewer calls | Repeat-key rate across trips/agents |
| 5 | Gate SerpApi calls to qualified enquiries (quote/agent-review stage) | 2–5 days | 30–70% fewer calls | Enquiry-to-quote conversion, quote latency, abandoned enquiries |
| 6 | Checkpoint successful stops per job; do not re-query completed stops on retry | 1–2 days | 5–15% fewer calls | Duplicate calls per job, retry rate |
| 7 | Keep first-page-only and entity-page verification for the top five properties | Already implemented | Avoids +15 SerpApi calls per itinerary | Coverage per call, board-basis accuracy |
| 8 | Add an organisation-level ad-hoc budget on top of the existing per-user limits | 0.5–1 day | 0–15% fewer calls | Calls per org/user, empty-result rate |
| 9 | Use catalogue/OSM as a free feasibility pre-filter before live pricing | 1–2 weeks | 10–30% fewer calls | Feasibility accuracy vs live-priced packages |
| 10 | Run a paid SearchApi pilot on one destination and compare coverage/price parity | 2–6 weeks | Potential 60–75% unit-price cut at 10k+ calls | Property overlap, price delta, empty rate, latency, legal terms |

**What not to do:**
- Do not make one SerpApi call per property. One destination call already returns roughly 20 properties with multiple OTA prices.
- Do not paginate every stop by default. Page 2 doubles the calls per stop and may not be worth it outside high-value/qualified trips.
- Do not use SerpApi property-detail, reviews or photos calls for routine verification when the existing entity-page/catalogue path can answer the board-basis question.
- Do not set `no_cache=true` routinely; it forces a billable search even when an exact repeat is within the free one-hour cache.
- Do not cache prices for weeks and present them as live. Use 1–6 hours for discovery and ≤60 minutes for quote-grade, and revalidate before booking.
- Do not switch providers on headline price alone. Coverage, field parity, legal terms and support can erase the per-search saving.
- Do not buy enterprise at small volume; the $3,750/month base is not a discount.
- Do not enable Ludicrous Speed or Max by default; they multiply the plan price by 2× or 4×.
- Do not run CI or integration tests against the production key; use fixtures and the free tier.

**Decision rule by monthly volume (three calls per itinerary, no ad-hoc buffer):**
- **Up to 1,000 calls/month:** stay on Starter or Free; optimize only for hygiene and accuracy. Switching is more expensive than SerpApi.
- **1,001–3,000 calls/month:** optimize cache/qualification; do not switch. The absolute savings are too small to repay migration.
- **3,001–30,000 calls/month:** optimize, apply the startup discount if eligible, and pilot SearchApi only if volume is growing. Switching may save $35–$175/month, which is usually not a project.
- **30,001–100,000 calls/month:** optimize and negotiate. At 30,000 calls, an 80% cut or a SearchApi switch saves roughly $125–$175/month; at 100,000 calls it saves $450–$475/month. Both are worth evaluating, and optimization is reversible.
- **Above 100,000 calls/month:** savings scale into the hundreds to low thousands per month; run a formal pilot and request custom pricing.

**Expected outcomes at the three reference volumes (single-plan model, no startup discount):**
- 1,000 itinerary searches/month ($75 baseline): an 80% cut reaches $25/month; a 50% cut saves nothing. The realistic target is $25–$75/month.
- 10,000 itinerary searches/month ($275 baseline): a 50% cut reaches $150/month; an 80% cut also reaches $150/month because 6,000 calls exceeds Developer's 5,000-call allowance. The realistic target is $150–$275/month; with the startup discount, $75–$137.50/month.
- 100,000 itinerary searches/month ($2,750 baseline): an 80% cut reaches $725/month; a 50% cut reaches $1,475/month. The realistic target is $725–$1,475/month; with the startup discount, $362.50–$737.50/month.

### Inferences
- The best return on effort is not a vendor switch; it is the startup discount (if eligible) plus a search cache and a qualification gate. Those are days of work and can cut the bill by 50% or more.
- At the sample scale (three stops, small platform), the SerpApi bill is likely in the tens to low hundreds of dollars per month. A migration project is hard to justify on direct savings alone.
- The strongest reason to switch later is growth, not today's price: at 100,000+ calls/month the absolute savings become meaningful, and a pilot can be justified.
- The strongest reason not to switch is quote quality. The internal evidence shows search-card prices can underquote breakfast-included rates by more than 100% in isolated cases; a cheaper provider with worse rate-basis data would make that problem worse, not better.
- The platform should treat SerpApi as a live-price oracle, not a database. Cache the property list and non-price metadata; fetch live prices for the shortlist and revalidate at quote/booking.

### Gaps
- No actual monthly SerpApi invoice or usage export was available. The volume scenarios are assumptions, not measurements.
- No SearchApi trial was run. The coverage/price-parity claim is unverified.
- No legal review of caching, entity-page scraping or long-lived price storage was available.
- No customer/booking-margin data was available, so the cost-per-booking comparison is illustrative only.
- No negotiated enterprise/custom pricing was obtained; all comparisons are list prices.

### Source and date log
- SerpApi plans, free tier, billing rules, speed modes, Legal Shield, refund policy: [serpapi.com/pricing](https://serpapi.com/pricing), verified 27 October 2026.
- SerpApi enterprise base, on-demand/reserved pricing, pagination counting: [serpapi.com/enterprise](https://serpapi.com/enterprise), verified 27 October 2026.
- SerpApi Google Hotels parameters, response fields, pagination, property details, one-hour cache: [serpapi.com/google-hotels-api](https://serpapi.com/google-hotels-api), verified 27 October 2026.
- SerpApi legal terms, Legal Shield scope, no warranty of accuracy: [serpapi.com/legal](https://serpapi.com/legal), last updated 27 August 2026; verified 27 October 2026.
- SearchApi plans, free requests, legal protection, 20% hourly limit: [searchapi.io/pricing](https://www.searchapi.io/pricing), verified 27 October 2026.
- SearchApi Google Hotels Property API fields: [searchapi.io/docs/google-hotels-property-api](https://www.searchapi.io/docs/google-hotels-property-api), verified 27 October 2026.
- Startup discount: [superscout.co/perk/serpapi](https://superscout.co/perk/serpapi) (last checked 1 October 2026) and [joinsecret.com/serpapi](https://joinsecret.com/serpapi) (page modified 27 October 2026; accessed 27 October 2026).
- Hotel price volatility: [Skyscanner, 6 October 2026](https://www.skyscanner.com/hotels/advice/hotel-price-change); secondary KAYAK figure via [Rate Ranger](https://www.rateranger.io/blog/do-hotel-prices-go-down-closer-to-check-in/), accessed 27 October 2026.
- Internal platform evidence: `docs/hotel-search-implementation.md` (27 October 2026), `packages/provider-contracts/src/google-hotels.ts`, `apps/api/src/services/optimisation.ts`, `apps/api/src/workflows/optimisation.ts` (inspected 27 October 2026).
