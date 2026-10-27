# Keyless Google Hotels scraper: productionization assessment

*Research cut-off: 27 October 2026. All vendor prices are list prices in USD checked on that date unless stated. Legal material is high-level research, not legal advice. Project facts are taken from the Tripweave repo and a small live measurement run on 27 October 2026.*

**Bottom line up front:** the scraper is a useful **internal entity-enrichment and QA tool**, but it is **not safe or economic to make it the primary production search source**. Google's own `robots.txt` disallows both endpoints the scraper calls; Google's Terms of Service prohibit automated access that violates those instructions and prohibit bypassing protective measures; Google is actively litigating against SerpApi over the same "fake browsers + rotating IPs + SearchGuard evasion" playbook; coverage is 56–93% by destination; and at 100k searches/month residential-proxy bandwidth plus 0.5 FTE already costs more than SerpApi's $725/month plan. **Recommendation: NO-GO for primary search; CONDITIONAL GO for shadow entity enrichment only, disabled by default.**

---

## 1. How does Google block or rate-limit automated hotel scraping, and what happens from Cloudflare Workers/data-centre IPs?

### Takeaway
Google uses a layered defence: contractual/robots prohibition, IP reputation and rate limiting (429 / "unusual traffic"), consent interstitials, CAPTCHA/JS challenges, and since January 2025 a purpose-built anti-scraping system ("SearchGuard"). Cloudflare Workers egress from **shared Cloudflare IPs that the developer does not control**, with no static outbound IP except an Enterprise Zero Trust add-on that is not designed for Worker subrequests. Successful local fetches from a residential/office IP are therefore **not evidence** that the same code will work from Workers at volume.

### Cited Findings

- Google's `robots.txt` (fetched 27 Oct 2026) explicitly disallows `/travel/search`, `/travel/entity`, `/travel/lodging/clk`, `/travel/lodging/imp`, `/hotelfinder/rpc`, `/hotels/rpc`, `/travel/hotels/stories` and `/travel/hotels/*/stories` — [Google robots.txt](https://www.google.com/robots.txt).
- The scraper calls exactly those disallowed paths: `https://www.google.com/travel/search` and `https://www.google.com/travel/hotels/entity/{token}` — [project file, `scripts/google-hotels-direct.mjs`](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs) (URL construction at lines 626 and 713; entity link parser at line 176).
- Google's Terms of Service (effective 30 July 2026) prohibit "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)", "bypassing our systems or protective measures", and "hiding or misrepresenting who you are in order to violate these terms" — [Google Terms of Service](https://policies.google.com/terms).
- Google says it deployed **SearchGuard in January 2025** to block automated access to Search results, and that SerpApi "immediately began working on a means to circumvent" it; Google alleges SerpApi masks "hundreds of millions of automated queries ... each day" by "creating fake browsers using a multitude of IP addresses that Google sees as normal users" — [Google blog, 19 Dec 2025](https://blog.google/technology/safety-security/serpapi-lawsuit/); [The Verge, 19 Dec 2025](https://www.theverge.com/news/848365/google-scraper-lawsuit-serpapi).
- Google's public help page describes the "Unusual traffic from your computer network" block and says Google may show it when it detects automated queries; it advises users to stop automated requests — [Google Search Help](https://support.google.com/websearch/answer/86640?hl=en).
- Practitioner guides consistently report 429s, 503s and "unusual traffic" pages when scraping Google from a single IP or poor-quality proxy pool; IP reputation and request fingerprint, not just rate, drive blocks — [Browserless, "How to scrape Google Search results"](https://www.browserless.io/blog/how-to-scrape-google-search); [SparkProxy](https://www.sparkproxy.io/blog/how-to-scrape-google-search-results); [ProxyNet](https://proxynet.io/blog/google-unusual-traffic-error).
- Google serves a consent interstitial (`consent.google.com`, "Before you continue to Google") to users in the EEA/UK/Switzerland; the scraper has an explicit `ConsentRequiredError` for exactly those markers — [project file, `scripts/google-hotels-direct.mjs`](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs). Google's EU user consent policy confirms consent requirements for EEA/UK/Swiss users — [Google EU user consent policy](https://www.google.com/about/company/user-consent-policy/).
- In the project's own nine live search runs (Sri Lanka/office IP, Oct 2026) there were "no consent walls, 429s or 5xx responses"; search latency was 1.3–1.7 s and entity fetches were 22/22 successful with median 787 ms and p95 1,045 ms — [project doc, `docs/hotel-search-implementation.md`](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Cloudflare Workers have **no developer-controlled static outbound IP**: Workers run across Cloudflare's edge and the outbound IP "isn't something you control and can shift from one invocation to the next"; Cloudflare's own docs confirm outbound connections are sourced from IPs outside its published ranges — [Fixie, Cloudflare Workers static IP documentation](https://usefixie.com/documentation/cloudflare-workers).
- Cloudflare's dedicated egress IPs are "only available as an add-on to Zero Trust Enterprise plans", are tied to Gateway-proxied traffic, and are not a general Workers `fetch()` feature — [Cloudflare One docs, dedicated egress IPs](https://developers.cloudflare.com/cloudflare-one/traffic-controls/egress-policies/dedicated-egress-ips/) (last updated 12 Oct 2026).
- Workers limits relevant to a scraper: 50 subrequests/request on Free, 10,000 on Paid (up to 10M); 6 simultaneous outgoing connections waiting for headers; 10 ms CPU Free / 5 min Paid (default 30 s); 128 MB memory; no hard wall-clock limit for HTTP-triggered Workers while the client stays connected; `waitUntil()` extends work up to 30 s after response; Cache API objects up to 512 MB and 1,000 calls/request on Paid — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (last updated 12 Oct 2026).

### Inferences

- **Technically possible, not sustainable.** A single Worker request can fetch and parse a Google Hotels page within the CPU/memory limits (the page is ~2.8 MB decoded; parsing is milliseconds). The binding constraints are IP reputation, Google's willingness to serve the page, and legal/contractual exposure — not Cloudflare's compute limits.
- **Workers egress is likely treated as datacenter/hostile traffic.** Shared Cloudflare egress IPs are used by many customers; a single abusive tenant can poison the IP's reputation. Google already blocks datacenter ranges aggressively for Search. Expect materially higher 429/CAPTCHA/consent rates from Workers than from the residential/office IP used in the successful local spike. This is an inference, not a measured result.
- **A proxy layer is mandatory for any serious volume.** At 1k/month, a low-concurrency Worker might survive on direct egress with retries. At 10k/month and above, expect the need for residential/mobile proxies or a managed unblocker. At 100k/month, you need multiple IP pools, per-IP concurrency limits, session/cookie management, and probably headless-browser fallback for JS/CAPTCHA variants.
- **CAPTCHA/JS challenges are an arms race, not a one-off integration.** If Google starts serving a challenge to hotel pages, a plain `fetch()` cannot solve it. Headless browsers from Cloudflare's own IP ranges are unlikely to fare better than plain `fetch()`; the IP is the main signal.
- **Consent is a jurisdictional trap.** From EEA/UK egress you will hit a consent wall; using a pre-consented cookie jar at scale is itself a form of bypass and weakens any "we are just a normal user" argument.

### Gaps

- I found **no public measurement of Google Hotels success rates specifically from Cloudflare Workers egress**. The only way to know is a controlled canary from a deployed Worker across several colos, destinations and volumes. Treat any claim of "Workers work fine" as untested until then.
- Google does not publish rate limits, block thresholds or CAPTCHA policy for Google Hotels. All thresholds in this note are operational estimates.
- I did not find a public Google statement quantifying when the consent interstitial appears for non-browser clients versus browsers; the scraper's own `ConsentRequiredError` is the best evidence that it occurs.
- No public data on how often Google Hotels serves a JS-only variant versus the server-rendered HTML the scraper depends on.

---

## 2. What proxy/browser infrastructure is needed at 1k, 10k and 100k searches/month, and what does it cost?

### Takeaway
The page is **large**: a single Kandy search page was **2.79 MB decoded / ~310 KB brotli-compressed**, and an entity page was **2.37 MB decoded / ~260 KB compressed (estimated)**. Residential bandwidth is billed per GB, so proxy cost is not trivial. At 1k and 10k/month, **plan minimums and engineering dominate**; at 100k/month, a single-run residential-proxy strategy costs roughly **$186–372/month** in bandwidth, but a 3-run strategy needed to approach SerpApi's coverage costs **$558–1,116/month** — already at or above SerpApi's $725/month. Managed unblockers are cheaper per request but shift, rather than remove, the legal risk.

### Cited Findings

- **Measured page weight (researcher, 27 Oct 2026):** one live Google Hotels search for Kandy, 5–9 Mar 2027, 2 adults, USD: **2,787,014 decoded bytes**, **405,045 gzip bytes**, **310,292 brotli-q5 bytes**. One entity page: **2,368,941 decoded bytes** (compressed size not captured; at the same ~9× ratio, ~260 KB). Method: the repo's own `searchGoogleHotels()` / `fetchGoogleHotelsEntity()` with a counting `fetchImpl` — [project file, `scripts/google-hotels-direct.mjs`](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs).
- Bright Data residential proxies: **$8/GB pay-as-you-go**, **$7/GB** at 141 GB/$499/mo, **$6/GB** at 332 GB/$999/mo, **$5/GB** at 798 GB/$1,999/mo; a 50% promo at the time of checking displayed $4/$3.50/$3/$2.50 per GB — [Bright Data residential pricing](https://brightdata.com/pricing/proxy-network/residential-proxies) (page modified 31 Aug 2026; checked 27 Oct 2026).
- Oxylabs residential: **$6/GB** up to 0.8 GB, **$6/GB** up to 5 GB, **$5/GB** up to 20 GB, **$4/GB** up to 125 GB, **$2.50/GB** at 1 TB+; plans Starter $30/mo, Basic $100/mo, Flexible $500/mo — [Oxylabs residential pricing](https://oxylabs.io/pricing/residential-proxy-pool) (checked 27 Oct 2026).
- Oxylabs explicitly restricts **"some Google domains"** on its residential network to avoid abuse — [Oxylabs residential pricing FAQ](https://oxylabs.io/pricing/residential-proxy-pool). This is a concrete operational blocker: not every residential vendor will sell you Google access.
- Bright Data requires **KYC** (video call and company/personal verification) before residential or mobile network use — [Bright Data residential pricing FAQ](https://brightdata.com/pricing/proxy-network/residential-proxies).
- Mobile/4G proxies are commonly quoted around **$20/GB** pay-as-you-go (volume tiers down to ~$7/GB) — [Apify, Bright Data pricing guide 2026](https://use-apify.com/blog/bright-data-pricing-guide-2026). Treat this as a secondary source, not a vendor quote.
- Bright Data **Web Unlocker**: **$1.50/1,000 requests** pay-as-you-go; **$499/month for 383k requests**, then **$1.30/1,000**; includes proxy management, browser rendering, CAPTCHA solving, retries, fingerprint emulation — [Bright Data Web Unlocker pricing](https://brightdata.com/pricing/web-unlocker) (page modified 25 Aug 2026; checked 27 Oct 2026).
- ScraperAPI: Hobby **$49/mo for 100,000 credits**, Startup **$149/mo for 1,000,000**, Business **$299/mo for 3,000,000**; **Google and Bing cost 25 credits per request** (standard pages cost 1), and bot-protected sites add 10 credits — [ScraperAPI pricing](https://www.scraperapi.com/pricing/) (checked 27 Oct 2026).
- Cloudflare Browser Rendering: 10 hours/month included on Workers Paid, then **$0.09/browser-hour**; 10 concurrent browsers included, then **$2.00/additional browser** (monthly average) — [Cloudflare Browser Rendering pricing](https://developers.cloudflare.com/browser-run/pricing/) (last updated 21 Apr 2026). At 3 s/page, 100k pages ≈ 83 browser-hours ≈ **$7.50** in browser time; the cost is trivial, but the browser still runs from Cloudflare IPs.
- Cloudflare Workers can make 10,000 subrequests/request on Paid, with 6 simultaneous connections waiting for headers — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (last updated 12 Oct 2026).

### Inferences — cost model

Assumptions: 310 KB per search page on the wire (measured brotli-q5); 1.5× request overhead for retries/blocks; entity enrichment excluded (it is per shortlisted property, not per search); residential bandwidth $4–8/GB; 3-run union is the strategy needed to approach SerpApi coverage, based on the project's own 56–93% single-run coverage.

| Volume (logical searches/mo) | SerpApi plan needed | Residential, 1 run ($4–8/GB) | Residential, 3 runs ($4–8/GB) | Mobile, 3 runs (~$20/GB) | Web Unlocker, 1 run / 3 runs | ScraperAPI, 1 run / 3 runs |
|---|---:|---:|---:|---:|---:|---:|
| 1,000 | $25 (Starter 1k) | $1.86–3.72 (but $30 Oxylabs minimum) | $5.58–11.16 ($30 minimum) | ~$27.90 | $1.50 / $4.50 | $49 / $49 (Hobby minimum) |
| 10,000 | $150 (Production 15k) | $18.60–37.20 | $55.80–111.60 | ~$279 | $15 / $45 | $149 / $149 (Startup 1M credits) |
| 100,000 | $725 (Searcher 100k) | $186–372 | $558–1,116 | ~$2,790 | $150 / $450 | $299 / $975 (Business 3M / Professional 10.5M) |

Notes:
- At 1k, **plan minimums dominate**: Oxylabs Starter is $30/mo; Bright Data's smallest residential commitment is $499/mo (141 GB), which is wildly oversized. At 10k, Bright Data's $499 minimum still dominates unless you negotiate.
- Entity enrichment adds roughly 260 KB per shortlisted property. If you enrich 10% of results, add ~10% to bandwidth; if you enrich every property, add ~80–100%.
- A 3-run union triples search bandwidth. The project's own data shows why: single-run priced coverage was 88% (Kandy), 56% (Ella), 93% (Galle); union of three runs improved card counts from 19→33, 19→34, 20→34, but still did not cover every SerpApi property — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- If you use a managed unblocker, the per-request price is lower than residential bandwidth, but you are buying the same "evade Google's blocks" service that Google is suing SerpApi over. It does not reduce legal exposure; it may add a vendor whose terms prohibit the use.
- Headless browsers do not solve the IP problem. Cloudflare Browser Rendering is cheap ($0.09/hour) but runs from Cloudflare's network; Google's block is primarily IP/reputation/fingerprint, not "can you execute JS". A browser is useful for JS challenges after you already have a credible IP.

### Gaps

- The **compressed wire size** of the entity page was not captured (only decoded size). The 260 KB figure is an estimate from the search page's compression ratio.
- Proxy vendors bill bandwidth differently (compressed vs decompressed, request+response headers included). Bright Data says bandwidth is "request headers + request data + response headers + response data" — [Bright Data FAQ](https://brightdata.com/pricing/proxy-network/residential-proxies) — but it is not explicit whether that is on-the-wire compressed bytes. If a vendor bills decompressed bytes, costs rise ~9×, which would make residential proxies clearly uneconomic.
- No public benchmark of Google Hotels success rate by proxy type (residential vs mobile vs datacenter) in 2026. Vendor "99.9% success" claims are not target-specific.
- Enterprise/committed pricing for 100k+ searches is negotiated and not public.
- I did not test a live Google Hotels fetch through a proxy or from a Worker; the cost model is a planning estimate, not a measured production run.

---

## 3. What reliability engineering is required: parser versioning, golden fixtures, canaries, schema-drift alerts, fallback sources, caching, circuit breakers, observability, incident response?

### Takeaway
Treat the Google Hotels HTML and `ds:1` payload as an **untrusted, undocumented, versionless external dependency**. The minimum viable production system is: versioned parser + archived raw HTML + golden fixtures + continuous canary + drift alarms + per-IP circuit breakers + multi-layer cache + a fallback provider + a kill switch. That is roughly **0.5–1 FTE of ongoing work**, plus on-call for price incidents. Without those, a parser break silently becomes a bad-price incident.

### Cited Findings

- Google's `ds:1` payload is an internal, obfuscated data structure, not a published API; Google can change class names, field numbers or markup without notice. The project itself warns: "Google can still change its HTML or rate limit/consent-wall the request, so callers must treat failures as expected" — [project file, `scripts/google-hotels-direct.mjs`](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs).
- The project's parser already distinguishes full rates from "compact" cards that have a source and price but **no room, occupancy or board basis**; `chooseEntityRate` can require an explicit breakfast-included rate — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Google's own price-accuracy policy requires prices to be updated "several times a day" and says stale cache data causes inaccuracies; Google validates prices with automated and manual checks and can suspend partners for persistent mismatches — [Google Hotel Center Price Accuracy Policy](https://support.google.com/hotelprices/answer/6064419?hl=en); [Taxes and Fees Policy](https://support.google.com/hotelprices/answer/6064432?hl=en). This is a partner policy, not a consumer guarantee, but it confirms that Google's displayed prices can be stale.
- SerpApi's own public roadmap still has open requests (as of 7 Oct 2026) to parse room-level data for Google Hotels search results, and to scrape all room rates/amenities — evidence that even a paid vendor does not fully solve rate-level completeness — [SerpApi roadmap issue #4434](https://github.com/serpapi/public-roadmap/issues/4434); [issue #3689](https://github.com/serpapi/public-roadmap/issues/3689).
- Cloudflare provides the primitives needed: Workers, Queues, Workflows, Durable Objects, Cache API, R2, Tail Workers/Logpush, Analytics Engine — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/); [Cloudflare Browser Rendering pricing](https://developers.cloudflare.com/browser-run/pricing/).
- The project's live sample: **22/22 entity fetches succeeded**, median **787 ms**, p95 **1,045 ms**, max **1,616 ms**; search latency **1.3–1.7 s**. Good reliability on a small sample from one IP, but not evidence of production reliability under load or from Workers — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).

### Inferences — required engineering

**Parser and data contract**
- Version the parser with semver plus a `fixtureHash`; attach `parserVersion` to every result and stored quote.
- Persist raw HTML for every fetch to R2 (or a sampled subset, e.g. 1–5%) so a break can be replayed offline.
- Maintain **golden fixtures**: at least 30–50 HTML snapshots covering 8–10 destinations, 2–3 locales (`en-US`, `en-GB`, `de-DE`), 2–3 occupancies, 1–2 room counts, different stay lengths, and at least one property per board-basis state (`included`, `not_included`, `paid`, `unknown`).
- Contract tests assert: card count, required fields (name, price, currency, rating, stars, token), `ds:1` presence, full-rate vs compact classification, board-basis enum, occupancy, tax-inclusive flag, and total-stay arithmetic.
- Never let an unknown field silently become `undefined`; fail closed on required fields and emit a `parse_quality` score.

**Canary and drift detection**
- Run a canary every 5–15 minutes from at least 3 egress locations/ASNs, with fixed queries and known property tokens. Compare against a 7-day baseline.
- Alert on: parse success rate <99%; card count <80% of baseline; `ds:1` missing/length change >20%; consent-wall rate >0; 429/5xx rate >2%; p95 latency >3 s; price distribution shift >5%; new/changed field names; HTML byte-size change >30%.
- Keep a **shadow comparison** against SerpApi on a stratified sample (destination × star rating × price band × stay length). Track coverage, price delta, board-basis agreement, occupancy agreement, tax-inclusive agreement.
- Require 4–8 weeks of shadow data before any traffic shift, and keep the shadow running after launch as a permanent control.

**Fallback and circuit breakers**
- Primary/fallback chain: SerpApi (licensed, structured) → direct licensed OTA APIs (Booking/Expedia/Hotelbeds/Amadeus) → cached last-known-good (marked stale) → explicit "price unavailable" rather than a guessed price.
- Circuit breaker per provider, per IP pool and per parser version: open after N consecutive failures or >X% failures in a 60 s window; half-open probe; never retry a hard block indefinitely.
- Exponential backoff with jitter; honor `Retry-After`; cap retries (2–3); treat 403/429/consent/CAPTCHA as "stop this IP", not "retry same IP".
- Per-IP concurrency of 1–2 and randomized inter-request delay; rotate sessions/IPs only after a failure, not on every request (session churn is itself a signal).

**Caching**
- Cache key: destination/property token + check-in + check-out + adults + children ages + rooms + currency + locale + rate filters. Do not share cache entries across occupancies or currencies.
- TTL: search 15 min; entity/rate 5–15 min; negative cache 1–2 min. Google itself caches and can serve stale prices; a longer TTL increases staleness risk.
- Use Cloudflare Cache API for hot responses, KV for small metadata, R2 for raw HTML/fixtures; coalesce concurrent identical requests (single-flight) to avoid stampedes.
- Store `fetchedAt`, `priceAsOf`, `cacheAge`, `parserVersion`, `source`, `confidence` with every quote. At checkout, revalidate if `cacheAge` exceeds the quote TTL.

**Observability**
- Structured logs per attempt: URL class (search/entity), status, bytes, latency, IP pool/ASN/country, parser version, retry count, block reason (429/403/consent/CAPTCHA/parse).
- Metrics/dashboards: success rate, 429/5xx rate, consent rate, CAPTCHA rate, parse yield, field coverage, coverage vs SerpApi, price delta distribution, stale rate, cost per 1k searches, proxy spend, bytes/search.
- Alerting: page on-call for price-integrity SLO breaches (not just uptime). A parser that returns 200 but wrong prices is worse than a 500.
- Tail Workers/Logpush to a SIEM or log store; sample raw HTML only with PII scrubbing.

**Incident response**
- Runbook with severity levels: S1 = bad prices shown/booked; S2 = search unavailable; S3 = degraded coverage; S4 = canary warning.
- One-flag kill switch (`googleHotelsDirect=false`) that immediately routes to SerpApi/cached results.
- Rollback to previous parser version and previous proxy pool; replay the failing fixture; publish a postmortem within 48 h.
- Legal/incident escalation: if Google sends a cease-and-desist, blocks the account, or a proxy vendor terminates service, freeze scraping and switch to licensed sources; do not attempt to "work around" a legal notice.

**SLOs to gate production**
- ≥99.5% successful search responses over 7 days at target volume.
- ≥99.9% of displayed quotes pass the validation gates in section 5.
- p95 search latency <2.5 s (excluding queueing).
- <0.5% stale quotes at checkout.
- 100% of quoted offers have explicit occupancy, board-basis evidence, tax-inclusive total and timestamp.
- Coverage ≥98% of SerpApi's priced properties on the stratified sample; price delta median ≤2%, p95 ≤5%.

### Gaps

- No public data on how often Google changes the Google Hotels HTML/`ds:1` schema. The project's 15/15 and 22/22 successes are too small a sample to estimate break frequency.
- No public benchmark for Google Hotels parser drift or block rates; the 2–6 breaks/year figure used in the roadmap is an industry-rule-of-thumb inference, not a measured fact.
- The team's on-call capacity, incident history and tolerance for bad-price incidents are unknown; the staffing estimate may be too low for a 24/7 consumer product.

---

## 4. What are the legal/terms-of-service risks of scraping Google Hotels and displaying OTA prices?

### Takeaway
This is **not a "public data is fair game" case**. Google's `robots.txt` disallows the exact endpoints, Google's Terms of Service prohibit automated access in violation of those instructions and prohibit bypassing protective measures, and Google is **actively litigating** against SerpApi over a strikingly similar "fake browsers + rotating IPs + SearchGuard evasion" architecture. CFAA and copyright claims against pure price-fact scraping are relatively weak post-*Van Buren*/*hiQ*, but **breach of contract and DMCA §1201 circumvention** are the live risks, and self-hosting removes the indemnity that a paid provider may offer. This is research, not legal advice; counsel should review before any production use.

### Cited Findings

- Google's Terms of Service (effective 30 July 2026) prohibit automated access "in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)", "bypassing our systems or protective measures", and "hiding or misrepresenting who you are in order to violate these terms" — [Google Terms of Service](https://policies.google.com/terms).
- Google's `robots.txt` disallows `/travel/search` and `/travel/entity` — the two endpoints the scraper calls — [Google robots.txt](https://www.google.com/robots.txt); [project file, `scripts/google-hotels-direct.mjs`](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs).
- Google sued SerpApi in the Northern District of California on **19 December 2025** (Case No. 4:25-cv-10826), alleging copyright infringement and **DMCA §1201** circumvention of SearchGuard; Google's blog accuses SerpApi of "shady back doors", "fake and constantly changing names", and "circumventing our security measures" — [Google blog, 19 Dec 2025](https://blog.google/technology/safety-security/serpapi-lawsuit/); [The Verge, 19 Dec 2025](https://www.theverge.com/news/848365/google-scraper-lawsuit-serpapi); [CourtListener docket](https://www.courtlistener.com/docket/72059948/google-llc-v-serpapi-llc/).
- The first motion to dismiss was **granted with leave to amend on 20 July 2026**; Google filed an amended complaint; SerpApi filed a second motion to dismiss on **24 August 2026**; the hearing was vacated on **5 October 2026** and the motion was pending as of the docket's last update on **24 October 2026** — [CourtListener docket](https://www.courtlistener.com/docket/72059948/google-llc-v-serpapi-llc/). This is not a final dismissal of the case.
- Reporting on the amended complaint says Google dropped the Google Shopping and Google Maps claims and now relies mainly on licensed images in Knowledge Panels; SerpApi argues Google is not the copyright holder of search results and that reading a public page any browser can load is not "circumvention" — [Search Engine Watch, 28 Aug 2026](https://searchenginewatch.com/serpapi-files-to-dismiss-googles-amended-lawsuit-again/). This is SerpApi-friendly reporting; treat its legal conclusions as advocacy, not a court ruling.
- **CFAA:** *Van Buren v. United States* (2021) narrowed "exceeds authorized access" to accessing areas of a computer one is not entitled to access, not misusing access one has — [U.S. Supreme Court, 3 Jun 2021](https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf). The Ninth Circuit in *hiQ Labs v. LinkedIn* (18 Apr 2022) affirmed that scraping publicly available data is likely not "without authorization" under the CFAA — [Ninth Circuit opinion](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf).
- **CFAA damages are hard to prove:** in *Ryanair v. Booking.com*, a Delaware jury returned a $5,000 CFAA verdict, but the court granted judgment as a matter of law on **22 January 2025** because Ryanair proved only **$2,457.72** in qualifying loss, below the $5,000 threshold — [Eric Goldman / Kieran McCarthy, 2 Mar 2025](https://blog.ericgoldman.org/archives/2025/03/court-overturns-a-bad-jury-verdict-against-scraping-ryanair-v-booking-guest-blog-post.htm).
- **Contract claims can still bite, but terms must be construed carefully:** in *Meta v. Bright Data* (N.D. Cal., 23 Jan 2024), the court granted Bright Data summary judgment on Meta's breach-of-contract claim because Meta's terms, as written, did not prohibit logged-off scraping of public data; a CAPTCHA did not make public data "private" — [Quinn Emanuel client alert, 30 Jan 2024](https://www.quinnemanuel.com/the-firm/news-events/client-alert-what-does-the-meta-v-bright-data-summary-judgment-ruling-mean-for-web-scraping/); [court order](https://www.govinfo.gov/app/details/USCOURTS-cand-3_23-cv-00077/USCOURTS-cand-3_23-cv-00077-7). The court left open claims for quasi-contract and tortious interference.
- **EU:** the DSM Directive's commercial text-and-data-mining exception (Art. 4) applies only to works the miner has **lawful access** to, and rightsholders can opt out by machine-readable means such as `robots.txt` — [Directive (EU) 2019/790, Art. 4](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0790). A robots-disallowed endpoint is unlikely to satisfy "lawful access", and the TDM exception is aimed at mining, not at operating a price-comparison service.
- **UK:** the UK did not implement the EU's broad commercial TDM exception; its copyright exception is limited to non-commercial research (CDPA s.29A) — [legislation.gov.uk, CDPA 1988 s.29A](https://www.legislation.gov.uk/ukpga/1988/48/section/29A). Computer misuse is governed by the Computer Misuse Act 1990 — [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1990/18/contents). Contract/CMA and consumer-law exposure remain.
- **Consumer price display:** the EU Price Indication Directive requires the selling price to include VAT and other taxes — [EUR-Lex summary, Directive 98/6/EC](https://eur-lex.europa.eu/EN/legal-content/summary/price-indications-on-consumer-products.html). The UK's Digital Markets, Competition and Consumers Act drip-pricing rules took effect **6 April 2025** and require the total price upfront — [Taylor Wessing, Apr 2025](https://www.taylorwessing.com/en/insights-and-events/insights/2025/04/dmcca-drip-pricing); [CMA guidance CMA209, 2026](https://assets.publishing.service.gov.uk/media/6a3a92e333bc5beefd3c47b0/CMA209_Unfair_commercial_practices__price_transparency_13.2.26__2_.pdf).
- **No official read API:** Google's Hotel APIs are for **sending** hotel prices/content to Google and for Hotel Ads/free booking links partners; there is no public Google Hotels read API for a travel agency to consume aggregated OTA prices — [Google Hotel APIs](https://developers.google.com/hotels). The compliant path is a licensed OTA/aggregator API (Booking.com Demand, Expedia Rapid, Hotelbeds, Amadeus) or a licensed SERP provider.
- **SerpApi's legal shield:** Production plans and above include a **U.S. Legal Shield of up to $2 million** for scraping/parsing search-engine data, provided the use is not illegal — [SerpApi pricing](https://serpapi.com/pricing). Self-hosting has no equivalent indemnity.

### Inferences

- **The robots.txt finding is the most important legal fact in this memo.** The scraper does not accidentally hit a disallowed path; it targets two explicitly disallowed paths. That makes the "we're just reading public HTML" defence much weaker and brings the ToS's automated-access clause directly into play.
- **The §1201 theory is contested but alive.** Google's first complaint was dismissed with leave to amend, and the remaining claim is narrow (licensed Knowledge Panel images). A court may ultimately reject §1201 for search-result facts. But the **cost and disruption of being in that fight** are real, and Google's public posture is to litigate against intermediaries. A small agency is more likely to receive a cease-and-desist, an IP/account block, or a vendor termination than a lawsuit — but those are still business-ending if the scraper is the primary price source.
- **CFAA is the weakest claim for Google; contract and circumvention are the strongest.** *Van Buren* and *hiQ* make pure public-data scraping hard to criminalize; *Ryanair* shows CFAA damages are hard to prove. But *Meta v. Bright Data* turned on Meta's specific terms; Google's terms are broader and its robots.txt is explicit. A breach-of-contract or §1201 claim does not require proving $5,000 of computer loss.
- **Copyright in prices is thin; copyright in the page is not.** Hotel prices and star ratings are facts (not copyrightable), but Google's page compilation, descriptions, reviews and photos are. The scraper mostly extracts facts, which lowers copyright risk; it should **not** copy reviews, photos or long descriptions into the product.
- **Displaying OTA prices adds a second layer of risk.** OTA terms may prohibit scraping/display without an affiliate agreement; consumer law requires all-in pricing and no drip fees; and a price you cannot honor can be a misleading commercial practice. Even a technically perfect scrape does not make the *display* compliant.
- **Self-hosting converts a vendor risk into a company risk.** SerpApi's $2M legal shield is not insurance for intentional circumvention, but it is a contractual buffer. Building the same capability in-house means the company bears the defence costs, injunction risk and vendor-termination risk directly.
- **The practical legal conclusion is binary:** either (a) use a licensed provider and accept its terms/indemnity, or (b) build a scraper that knowingly violates robots.txt/ToS and accept that the business depends on not being noticed. There is no stable middle ground at 100k searches/month.

### Gaps

- No case law specifically on scraping **Google Hotels** (as opposed to Google Search, LinkedIn, Meta or Ryanair).
- No public data on how Google enforces against small scrapers (cease-and-desist vs blocking vs referral to counsel); enforcement is opaque.
- The enforceability of Google's browsewrap/clickwrap terms against a non-logged-in API client is fact-specific and not settled in every jurisdiction.
- OTA terms (Booking.com, Expedia, Agoda) and their price-display/affiliate restrictions were not reviewed in this pass; they are a separate legal workstream.
- US state fee-transparency laws (e.g. California's SB 478) were not verified in this pass; EU/UK rules are covered above.
- This is not legal advice; no privileged opinion was obtained.

---

## 5. How should board basis, occupancy, taxes and stale prices be validated so we do not quote bad data?

### Takeaway
Only quote a rate when you have **rate-level evidence** for board basis, **occupancy ≥ the party**, an **all-in total for the stay**, and a **fresh timestamp**. Treat compact cards and property-level "free breakfast" amenities as **not evidence** of a bookable breakfast rate. The project's own data shows why: only 40% of sampled properties exposed an explicit breakfast-included rate, 24% exposed only compact/unknown rates, and entity prices missed cheaper OTAs by up to 106%.

### Cited Findings

- In the 25-property entity sample: **10/25 (40%)** exposed an explicit breakfast-included rate; **9/25 (36%)** exposed only room-only rates; **6/25 (24%)** exposed only compact/unknown rates — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Of the 10 package properties, **7/10** had a breakfast-included rate and **3/10** did not. Among the 7 with a breakfast rate, **4/7 were more than 10% above the search total** (median delta 10.9%, mean absolute 38.9%); one was **+129.6%** — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Entity pages missed cheaper OTA rates that SerpApi found: Hotel Suisse Kandy showed Booking.com **668** on the entity page versus SerpApi's **324** from Super.com; Le Grand Galle showed Expedia **1,121** versus SerpApi's **898** from Reservation Day — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Search-card prices matched SerpApi well when matched: median delta **0%**; mean absolute delta **10.9%** (Kandy), **0.1%** (Ella), **4.9%** (Galle); max **106.2%**; ratings/stars matched exactly (12/12, 7/7, 13/13), breakfast agreement 14/14, 8/10, 14/14 — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Property-level "Free breakfast" is not proof of a breakfast-included rate: Heaven Seven Hotel Kandy and Villa Surf Beach both advertised free breakfast amenities, but the cheapest entity rates were room-only — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Google Hotels has **no room-count parameter**; the current provider prices the largest requested room and scales the total by the number of rooms, which is an approximation, not a booking-grade occupancy quote — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md); [SerpApi Google Hotels API parameters](https://serpapi.com/google-hotels-api) (no `rooms` parameter).
- Google's Hotel Center Taxes and Fees Policy requires the price to include "the base room rate and all taxes and fees required to book a stay", including occupancy/city/VAT/tourism/resort/registration/service/transfer/cleaning fees; optional fees must not be included by default. In the US/Canada Google displays the total prominently; in other countries the total including taxes/fees is more prominently shown — [Google Hotel Center Taxes and Fees Policy](https://support.google.com/hotelprices/answer/6064432?hl=en).
- Google's Price Accuracy Policy requires the displayed price to match the occupancy selected, to be for the selected dates, to support multiple rooms with the pre-selected combination, and to be updated several times a day; stale cache data causes inaccuracies — [Google Hotel Center Price Accuracy Policy](https://support.google.com/hotelprices/answer/6064419?hl=en).
- The scraper's entity parser exposes board basis as `included`, `not_included`, `paid` or `unknown`, plus room name, occupancy, cancellation and nightly/stay totals where Google publishes them; compact provider cards have no room/occupancy/board basis — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).

### Inferences — validation rules

**Board basis**
- `included`: only when the rate text explicitly includes breakfast (or the relevant meal plan) **and** the rate's occupancy covers the party. This is the only state that can satisfy a strict breakfast requirement.
- `paid`: breakfast is available for an extra charge; quote the room-only price and show breakfast as an optional add-on, or reprice to the breakfast-included total if the user requires it.
- `not_included`: room-only; do not infer breakfast from a property amenity.
- `unknown` / compact: treat as **unconfirmed / not quotable for board-basis-sensitive searches**. Do not promote a property-level "Free breakfast" amenity to a rate-level `included`.
- Store `boardBasisEvidence` (`rate_explicit`, `property_amenity`, `unknown`) alongside `boardBasis`; only `rate_explicit` can satisfy a strict requirement.

**Occupancy**
- Require `rateOccupancyAdults + rateOccupancyChildren >= partyAdults + partyChildren`; if not, reprice to a larger room or exclude.
- Do not linearly scale a 2-guest rate to a 4-guest party. The current "largest room × rooms" workaround is acceptable only as an estimate, clearly labelled; it is not a booking-grade quote.
- For multi-room parties, price each room combination explicitly; Google's lack of a room-count parameter means you must verify the room capacity on the entity page or with the OTA.
- Children's ages matter: a "2 adults" rate may not accept a child; require an explicit child-occupancy rate or exclude.

**Taxes and fees**
- Require `totalStay` (not just nightly) and `taxIncluded=true` for any price shown as a final comparison. If only a base/nightly price is available, label it "before taxes and fees" and do not compare it to all-in totals.
- Recompute: `nightly × nights + taxes + mandatory fees` within ±1% or ±$2 of the source total; reject if it does not reconcile.
- Include mandatory resort/transfer/cleaning fees; exclude optional fees. If the source does not disclose a mandatory fee, mark the quote `tax_confidence=low` and do not use it as the cheapest option.
- Currency: request the display currency in the `ts` protobuf; do not convert after the fact. Record the FX date if conversion is unavoidable.
- For EU/UK consumers, show the total including VAT/taxes upfront; drip pricing is prohibited (see section 4).

**Stale prices**
- Store `fetchedAt`, `priceAsOf`, `cacheAge`, `parserVersion`, `source`, `rateId`.
- TTL: search 15 min, entity/rate 5–15 min, negative cache 1–2 min. Revalidate at checkout if `cacheAge` > TTL; if the re-fetched price differs by >2%, re-quote and notify the user.
- Show "indicative price, subject to availability" until a booking-grade revalidation; never imply a guaranteed price from a cached scrape.
- Sample 1% of displayed quotes and re-fetch them; alert if the stale/mismatch rate exceeds 0.5%.

**Cross-source reconciliation**
- Compare search card vs entity rate vs SerpApi for the same property/date/occupancy. If the delta is >5%, flag it and prefer the source with rate-level evidence (usually the entity page or SerpApi property details).
- Do not claim "cheapest" if the entity page is missing OTA sources. The project found cheaper OTAs absent from entity pages; a missing source is not evidence of a higher price.
- Deduplicate compact cards against full rates; never let a compact card's lower price win a comparison against a full rate with unknown occupancy/board basis.

**Data model fields (minimum)**
`propertyId`, `source`, `rateId`, `roomName`, `occupancyAdults`, `occupancyChildren`, `boardBasis`, `boardBasisEvidence`, `cancellationPolicy`, `nightly`, `totalStay`, `taxAmount`, `feeAmount`, `taxIncluded`, `currency`, `priceAsOf`, `fetchedAt`, `cacheAge`, `parserVersion`, `confidence`, `quoteExpiresAt`.

**Acceptance gates before any consumer display**
- 100% of quoted offers have explicit occupancy ≥ party.
- 100% have an explicit board-basis state; `unknown` is displayed as "board basis not confirmed", not as breakfast.
- 100% have an all-in total or are labelled "before taxes".
- 100% have a timestamp and a quote expiry.
- 0 quotes sourced solely from compact cards.
- Breakfast precision ≥99% on a manually audited sample (target: 100%).
- Price delta vs SerpApi median ≤2%, p95 ≤5% on matched properties.
- Stale/mismatch rate <0.5%.

### Gaps

- Google's exact tax-display logic varies by country, currency and property; I did not find a single document that enumerates every case. The Hotel Center policy describes partner obligations, not the consumer-facing Google Hotels display in every jurisdiction.
- No ground-truth dataset of bookable OTA prices for the sample properties; the project's SerpApi comparison is the best available proxy, and SerpApi itself can miss sources.
- OTA rate rules (child occupancy, extra-bed fees, resort fees paid at property) are not fully exposed by Google Hotels; a booking-grade quote ultimately requires the OTA's own availability API.
- The project's 25-property sample is small and Sri Lanka-specific; board-basis and tax behaviour may differ in other markets.

---

## 6. What would a realistic 3–6 month productionization roadmap and ongoing maintenance burden look like?

### Takeaway
A credible build is **3 months to a defensible shadow system, 6 months to a conditional production candidate, and 6–9 months before you could responsibly shift primary traffic** — assuming one experienced engineer at 0.5–1 FTE, legal review, and a paid proxy/unblocker budget. Ongoing maintenance is **0.5–1 FTE** plus on-call, with parser fixes 1–3 days/month and 2–6 emergency breaks/year. That is a large fixed cost against a $725/month SerpApi bill at 100k searches.

### Cited Findings

- The current scraper is a standalone Node spike (`scripts/google-hotels-direct.mjs`) with unit tests (`scripts/google-hotels-direct.test.mjs`); it has no proxy layer, no persistent raw-HTML archive, no canary, no drift alerts, no queue, no circuit breaker and no production observability — [project file](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.mjs); [project tests](file:///Users/thufailahamed/Downloads/tripweave/scripts/google-hotels-direct.test.mjs).
- The existing production integration is SerpApi, gated by `SERPAPI_API_KEY`, with the custom scraper intended as a disabled-by-default `googleHotelsDirect` flag for entity enrichment — [project file, `apps/api/src/services/providers.ts`](file:///Users/thufailahamed/Downloads/tripweave/apps/api/src/services/providers.ts); [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- The project's own recommendation already says: "Keep SerpApi as the production discovery and pricing provider. Do not replace it with the custom scraper." — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Cloudflare provides the building blocks (Workers, Queues, Workflows, Durable Objects, Cache API, R2, Tail Workers/Logpush, Analytics Engine, Browser Rendering) but not a static Worker egress IP — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/); [Cloudflare One dedicated egress IPs](https://developers.cloudflare.com/cloudflare-one/traffic-controls/egress-policies/dedicated-egress-ips/); [Fixie Workers documentation](https://usefixie.com/documentation/cloudflare-workers).
- SerpApi's cached searches are free and not counted toward the monthly quota when the query and parameters match exactly and the cache is under 1 hour old — [SerpApi Google Hotels API docs](https://serpapi.com/google-hotels-api). This is a direct, legal cost lever that does not require scraping.

### Inferences — roadmap

**Phase 0 — decision and legal gate (weeks 1–2)**
- Quantify actual search volume, repeat-query rate, destination mix, and current SerpApi spend.
- Obtain a written legal risk memo on robots.txt/ToS/§1201/EU-UK exposure and on OTA price-display terms.
- Decide whether the goal is (a) reduce SerpApi spend, (b) add redundancy, or (c) replace SerpApi. Only (b) has a credible compliant path via a second licensed provider; (c) is the high-risk path.
- Output: go/no-go for any further build; if no-go, stop here and implement caching/dedupe (2–4 weeks, low risk).

**Phase 1 — resilient fetch layer (weeks 3–6)**
- Proxy abstraction: direct Worker egress, residential pool, managed unblocker, with per-pool health and cost tracking.
- Per-IP concurrency 1–2, jittered backoff, `Retry-After`, circuit breaker, block-reason classification.
- Cloudflare Queues/Workflows for retries and long-running enrichment; Durable Objects for global rate limits.
- Cache layer (Cache API/KV/R2) with key design and single-flight.
- Structured logging and cost metrics.

**Phase 2 — parser productization (weeks 7–10)**
- Parser versioning, raw-HTML archive, golden fixtures, contract tests.
- Canary every 5–15 min across 3 egress locations; drift alerts.
- Shadow mode at 1% of traffic, comparing to SerpApi on coverage, price, board basis, occupancy and taxes.
- Kill switch and fallback to SerpApi.

**Phase 3 — data-quality hardening (weeks 11–14)**
- Implement the validation gates in section 5: board basis, occupancy, all-in taxes, quote TTL, cross-source reconciliation.
- Multi-run union strategy for coverage; measure the marginal coverage and cost of each additional run.
- Manual audit of 100–200 quotes against OTA booking pages; calculate precision/recall for breakfast, occupancy and total price.
- Tune block avoidance within the legal boundary; stop if it requires CAPTCHA solving, fake identities or consent-cookie reuse.

**Phase 4 — scale and failover (weeks 15–18)**
- Load tests at 10k and 100k/month; measure 429/5xx/consent rates by pool and colo.
- Failover drills: disable primary pool, disable parser version, force consent wall, force schema change.
- Cost controls: per-day proxy budget, per-destination caps, automatic degrade to SerpApi.
- Shadow at 5–10% of traffic; still no consumer display of scraped-only prices.

**Phase 5 — conditional production (weeks 19–24)**
- If and only if gates pass: 25% → 50% traffic with a 4-week parallel run; legal sign-off; insurance review; incident runbook and on-call.
- Final go/no-go: coverage ≥98%, price delta median ≤2%/p95 ≤5%, board-basis precision ≥99%, 99.5% search success, <0.5% stale, TCO below SerpApi.
- If gates fail: keep the scraper as internal entity enrichment only, or retire it.

**Ongoing maintenance**
- 0.5–1 FTE: parser maintenance (1–3 days/month), canary review (weekly), proxy/vendor management (monthly), legal monitoring (quarterly), on-call for price incidents.
- 2–6 emergency parser breaks/year is a planning assumption; each can take 1–5 days to diagnose and fix.
- Continuous costs at 100k/month: ~$558–1,116 residential proxy (3-run) or ~$450 Web Unlocker; plus Workers/Queues/R2/observability (~$20–100); plus 0.5 FTE (~$6k/month loaded). Add one-off legal review ($15k–50k) and incident costs.

### Gaps

- The team's actual engineering capacity, on-call maturity and legal budget are unknown; the 0.5–1 FTE estimate assumes one senior engineer familiar with the parser.
- The number of parser breaks per year is an industry rule-of-thumb, not measured for Google Hotels.
- The roadmap assumes Google does not change its anti-scraping posture mid-build; if SearchGuard expands to Hotels or Google sends a cease-and-desist, the timeline collapses.
- No estimate of the opportunity cost of diverting 0.5–1 FTE from revenue work.

---

## 7. Compare the all-in cost of self-hosting versus paying SerpApi or a cheaper SERP API. What is the go/no-go recommendation?

### Takeaway
At every volume from **1k to 100k searches/month**, SerpApi is cheaper on a fully loaded basis than self-hosting, and at 100k it is cheaper than **residential proxy bandwidth alone** once you account for the 3 runs needed to approach SerpApi's coverage. Managed unblockers and ScraperAPI are cheaper per request than SerpApi, but they are still scraping Google, carry no meaningful legal shield, and do not eliminate the legal/continuity risk. **Recommendation: NO-GO for primary production search; CONDITIONAL GO for shadow entity enrichment only.**

### Cited Findings

- SerpApi list prices (checked 27 Oct 2026): Starter **$25/mo for 1,000**; Developer **$75/mo for 5,000**; Production **$150/mo for 15,000**; Big Data **$275/mo for 30,000**; Searcher **$725/mo for 100,000**; Volume **$1,475/mo for 250,000**; Cloud 1M **$3,750/mo for 1,000,000** — [SerpApi pricing](https://serpapi.com/pricing).
- SerpApi's Production plan and above include a **U.S. Legal Shield of up to $2 million** for scraping/parsing search-engine data, provided the use is not illegal; cached searches are free and not counted — [SerpApi pricing](https://serpapi.com/pricing); [SerpApi Google Hotels API docs](https://serpapi.com/google-hotels-api).
- Google Hotels API returns structured JSON with `property_token`, `prices`, `rate_per_night`, `total_rate`, `free_cancellation`, ratings and pagination; it is a purpose-built Google Hotels interface, not raw HTML — [SerpApi Google Hotels API](https://serpapi.com/google-hotels-api).
- Bright Data residential: **$5–8/GB** (list, before 50% promo); Oxylabs **$4–6/GB** at the volumes in scope; mobile ~**$20/GB** — [Bright Data](https://brightdata.com/pricing/proxy-network/residential-proxies); [Oxylabs](https://oxylabs.io/pricing/residential-proxy-pool); [Apify guide](https://use-apify.com/blog/bright-data-pricing-guide-2026).
- Bright Data Web Unlocker: **$1.50/1k** PAYG, **$1.30/1k** at 383k; ScraperAPI: **$49/100k credits**, **$149/1M**, **$299/3M**, with **Google at 25 credits/request** — [Bright Data Web Unlocker](https://brightdata.com/pricing/web-unlocker); [ScraperAPI](https://www.scraperapi.com/pricing/).
- Measured page weight: **310 KB brotli** per search page; **1.5×** retry overhead assumption; **3 runs** needed to approach SerpApi coverage based on 56–93% single-run coverage — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md); researcher measurement 27 Oct 2026.
- Project data: search coverage 88% (Kandy), 56% (Ella), 93% (Galle); entity pages missed cheaper OTAs; only 40% of properties exposed an explicit breakfast rate — [project doc](file:///Users/thufailahamed/Downloads/tripweave/docs/hotel-search-implementation.md).
- Google's first SerpApi complaint was dismissed with leave to amend in July 2026; the case continues on a narrower DMCA theory as of October 2026 — [CourtListener docket](https://www.courtlistener.com/docket/72059948/google-llc-v-serpapi-llc/); [Search Engine Watch, 28 Aug 2026](https://searchenginewatch.com/serpapi-files-to-dismiss-googles-amended-lawsuit-again/).

### Inferences — TCO model

Assumptions: 0.5 FTE loaded at **$6,000/month** (a conservative $144k/year fully loaded); 1.5× request overhead; 3 runs for coverage; search-only bandwidth (entity enrichment adds ~10–100% depending on shortlist size); residential at $4–8/GB; no legal settlement costs; no revenue loss from outages.

| Volume/mo | SerpApi plan | Self-host proxy (3 runs) | Self-host + 0.5 FTE | Cheaper SERP API (ScraperAPI, 3 runs) | Self-host + 0.5 FTE vs SerpApi |
|---|---:|---:|---:|---:|---:|
| 1,000 | $25 | $5.58–11.16 (min $30) | ~$6,030 | $49 | +$6,005 |
| 10,000 | $150 | $55.80–111.60 | ~$6,070 | $149 | +$5,920 |
| 100,000 | $725 | $558–1,116 | ~$6,560–7,120 | $975 | +$5,835–6,395 |
| 1,000,000 | $3,750 | $3,488–6,975 (at $2.50–5/GB) | ~$9,490–12,980 | ~$9,750 (est.) | +$5,740–9,230 |

Key economics:
- **SerpApi's per-search price falls faster than residential bandwidth.** At 100k, SerpApi is **$7.25/1k**; 3-run residential bandwidth is **$5.58–11.16/1k** before engineering. At 1M, SerpApi is **$3.75/1k**; 3-run residential is **$3.49–6.98/1k** before engineering. The scraper is only cheaper on bandwidth if you use the cheapest committed rate and ignore engineering — and even then, only marginally.
- **Single-run scraping is cheaper but not a replacement.** At 100k, single-run bandwidth is **$186–372** vs SerpApi **$725**, but coverage is 56–93% and entity pages miss cheaper OTAs. A price comparison product cannot ship with 56% coverage.
- **Managed unblockers invert the comparison only if you ignore legal risk.** Web Unlocker at $1.50/1k is **$150** for 100k single-run, **$450** for 3-run — dramatically cheaper than SerpApi. But it is still Google scraping, with no legal shield and a vendor that may be blocked or enjoined; the "savings" are compensation for taking the legal risk.
- **Engineering is the dominant cost.** At 100k, 0.5 FTE is ~**$6k/month**, 8× the SerpApi bill. Even if proxies were free, self-hosting would be more expensive unless the engineer is already on payroll with spare capacity and the alternative is idle time.
- **Legal costs are asymmetric.** A single cease-and-desist or injunction can cost more in legal fees than years of SerpApi. SerpApi's $2M shield is not perfect, but it is a contractual allocation of risk that self-hosting lacks.

**Cheaper SERP API comparison**
- **ScraperAPI:** Google at 25 credits/request; $299/3M credits ≈ **$2.99/1k** at 100k single-run, **$975** at 100k 3-run. No legal shield; the vendor is still scraping Google. For 1k/10k, plan minimums make it **$49/$149**, more than SerpApi.
- **Bright Data Web Unlocker:** **$1.30–1.50/1k**; cheapest per request, but it is a generic unblocker, not a Google Hotels parser. You still own the parser, schema drift and data-quality work, and you add a vendor whose service is explicitly designed to evade anti-bot controls.
- **SerpApi:** **$7.25/1k** at 100k, but includes structured Google Hotels JSON, pagination, property tokens, localization, free cached searches, and a **$2M legal shield** on Production+. The premium is roughly the cost of one engineer-day per month at 100k; it buys reliability and risk transfer.

### Go/no-go recommendation

**NO-GO for using the keyless scraper as the primary production search or price source.** Reasons, in order:
1. **Explicit prohibition:** `robots.txt` disallows `/travel/search` and `/travel/entity`; the ToS prohibits automated access in violation of those instructions and prohibits bypassing protections. This is not a gray area.
2. **Active litigation against the same playbook:** Google is suing SerpApi over SearchGuard circumvention, fake browsers and IP rotation. Self-hosting makes the company the defendant/intermediary, not a customer.
3. **Insufficient coverage and completeness:** 56–93% single-run coverage, missing OTA sources, only 40% explicit breakfast rates, entity prices up to +129.6% vs search. It cannot replace SerpApi as a price-discovery source today.
4. **Workers egress risk:** shared Cloudflare IPs, no static outbound IP without Enterprise Zero Trust, no evidence that Google Hotels tolerates Worker traffic at volume.
5. **Economics:** at 1k–100k/month, SerpApi is cheaper than proxies + 0.5 FTE; at 100k, it is cheaper than residential bandwidth alone once 3-run coverage is included. The "free" scraper is not free.
6. **No indemnity:** self-hosting removes SerpApi's $2M legal shield and replaces it with direct exposure.

**CONDITIONAL GO for shadow entity enrichment only.** Keep the existing `googleHotelsDirect` flag disabled by default and use it only for properties SerpApi already returned, with:
- one entity fetch per shortlisted property, cached ≥24 h;
- no display of scraped-only prices to consumers (internal board-basis evidence/QA only);
- strict `included`/`paid`/`not_included`/`unknown` semantics; never promote property amenities;
- a hard kill switch and a 90-day review;
- legal sign-off and a documented decision that the residual risk is acceptable for internal, low-volume enrichment.

**Better path to reduce SerpApi spend without scraping:**
1. **Exploit SerpApi's free cache:** cached searches under 1 hour are free; dedupe identical destination/date/occupancy/currency queries across users and within a session.
2. **Cache locally** for 15–60 min and coalesce concurrent requests; travel-agency traffic is likely to have repeat queries.
3. **Search once per destination/date, not per hotel;** use `property_token` details only for shortlisted properties.
4. **Negotiate volume/enterprise pricing** at 100k+; list price is not always the final price.
5. **Add a second licensed source** (Booking.com Demand, Expedia Rapid, Hotelbeds, Amadeus) for bookable inventory and redundancy; do not replace one scraper dependency with another.
6. **Use SerpApi's legal shield tier** (Production+) if displaying Google-derived prices; the $2M coverage is part of the product's value.

**If the company still wants to pursue self-hosting:** treat it as a 6–9 month, 0.5–1 FTE program with a hard legal gate at week 2 and week 24. Do not start with 100k traffic; start with a 1% shadow canary. If the legal memo says the robots.txt/ToS/§1201 risk is unacceptable, stop — the engineering work cannot fix that.

### Gaps

- Actual SerpApi spend, query mix and repeat-query rate are unknown; the cache/dedupe savings could be 10–50%, which changes the comparison materially.
- Loaded engineering cost is an assumption ($144k/year); a lower-cost team or idle capacity changes the break-even but not the legal conclusion.
- Negotiated SerpApi/enterprise pricing and any multi-year discount are unknown.
- No quote for legal defence costs, insurance or a potential settlement; these are the largest unquantified risk.
- The TCO model excludes the cost of bad-price incidents (refunds, chargebacks, regulatory complaints, brand damage), which is the main reason to prefer a licensed provider.

---

*Prepared as research notes for a report writer. The author is not a lawyer; legal statements are high-level and should be reviewed by counsel. Vendor prices and legal dockets change; re-check before making a decision.*
