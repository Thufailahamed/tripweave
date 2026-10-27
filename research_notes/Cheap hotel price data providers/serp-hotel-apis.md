# Cheaper Google Hotels price-data providers than SerpApi (2026)

> Verified **27 October 2026**. All prices are USD list prices, excluding tax/VAT, engineering, parsing and currency conversion. “Search” means one destination + check-in/check-out + occupancy query returning roughly 20 hotels. “Full OTA” means the response includes named booking sources and a total-stay price; where a provider needs one detail call per hotel to get that, the cost model includes 1 + 20 calls.

## Which providers actually offer Google Hotels data, and which return property tokens, total stay prices, OTA source names and board basis?

### Takeaway

Only five non-SerpApi providers have a confirmed, dedicated, **structured** Google Hotels product: **SearchApi.io, DataForSEO, Bright Data, Oxylabs and Scrape.do**, plus **Apify community actors**. Serper.dev, SearchCans, Zyte and ScraperAPI have **no documented Google Hotels endpoint**. Only SerpApi, SearchApi, DataForSEO and Apify’s `jy-labs` actor document OTA source names; Scrape.do and Bright Data do not clearly document them. **No provider exposes a normalized board-basis field** (room-only / B&B / half-board / full-board / all-inclusive). Breakfast sometimes appears as an amenity or a free-text feature, which is not the same thing.

### Cited Findings

| Provider | Dedicated Google Hotels product? | Structured output? | Property token | Total stay price | OTA source names | Board basis | Source |
|---|---|---|---|---|---|---|---|
| **SerpApi** (baseline) | Yes, `engine=google_hotels` | Yes, JSON | `property_token` | `total_rate` per property | `prices[].source` in the listing | No board field; only `free_cancellation` | [SerpApi Google Hotels docs](https://serpapi.com/google-hotels-api) |
| **SearchApi.io** | Yes, `engine=google_hotels` and `engine=google_hotels_property` | Yes, JSON | `property_token` | `total_price`; `all_offers[].total_price` on property endpoint | `all_offers[].source` on the **property** endpoint, not the listing | No board field | [SearchApi Hotels docs](https://www.searchapi.io/docs/google-hotels-api); [SearchApi Hotels Property docs](https://www.searchapi.io/docs/google-hotels-property-api) |
| **DataForSEO** | Yes, `hotel_searches` and `hotel_info` | Yes, JSON | `hotel_identifier` (Google entity ID, not `property_token`) | No; prices are per night only | `hotel_info.prices.items[].title` (site name), not in `hotel_searches` | No board field; `free_cancellation_until` only | [DataForSEO hotel_searches docs](https://docs.dataforseo.com/v3/business_data/google/hotel_searches/live/); [DataForSEO hotel_info docs](https://docs.dataforseo.com/v3/business_data/google/hotel_info/live/advanced/) |
| **Bright Data** | Yes, Google Hotels Scraper dataset `gd_mg3gjfmg12tc2n5d4d` | Yes, dataset records | `hotel_id` (Google entity ID) | Unverified | Unverified | Unverified | [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels) |
| **Oxylabs** | Yes, `source: google_travel_hotels` | Raw HTML by default; optional `parse: true` | Only inside HTML | Only inside HTML | Only inside HTML | Only inside HTML | [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels) |
| **Scrape.do** | Yes, `/plugin/google/hotels` listing + `/detail` | Yes, JSON | `property_token` | `total_rate` on detail | **Not documented** | No board field | [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/) |
| **Apify `jy-labs`** | Yes, community actor | Yes, dataset | `hotelId` (derived from Google entity ID) | No; nightly prices only | `prices[].provider` | `features[]` may say “Breakfast included”; no formal board field | [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper) |
| **Apify `solidcode`** | Yes, community actor | Yes, dataset | `propertyToken` | `totalRate` | **No OTA source list** | No board field | [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper) |
| **ScrapingBee** | Dedicated Google Hotels use case, but no fixed endpoint/schema: generic HTML API + `render_js` + `extract_rules`/AI | Only via your CSS/XPath or AI extraction rules; no fixed hotel schema | Only inside HTML/your extraction | Only inside HTML/your extraction | Only inside HTML/your extraction | Only inside HTML/your extraction | [ScrapingBee Google Hotels scraper](https://www.scrapingbee.com/scrapers/google-hotel-scraper/) |
| **Crawlbase** | No dedicated endpoint; generic Crawling API | No; HTML | Only inside HTML | Only inside HTML | Only inside HTML | Only inside HTML | [Crawlbase Google Hotels tutorial](https://crawlbase.com/blog/how-to-scrape-google-hotels-with-python/) |
| **Serper.dev** | No | N/A | N/A | N/A | N/A | N/A | [Serper homepage](https://serper.dev/) |
| **SearchCans** | No | N/A | N/A | N/A | N/A | N/A | [SearchCans homepage](https://searchcans.com/) |
| **Zyte** | No | N/A | N/A | N/A | N/A | N/A | [Zyte homepage](https://www.zyte.com/) |
| **ScraperAPI** | No | N/A | N/A | N/A | N/A | N/A | [ScraperAPI docs](https://docs.scraperapi.com/) |

- **SearchApi.io** has two Google Hotels engines. The listing engine returns `properties[]` with `property_token`, `name`, `price_per_night`, `total_price`, `rating`, `reviews`, `amenities` and `hotel_class`. The property engine returns `featured_offers[]` and `all_offers[]`, each with `source`, `tracking_link`, `price_per_night`, `total_price`, `has_free_cancellation`, `free_cancellation_until`, and nested `rooms[].rates[]`. The documented listing response does not include a `prices[]` array; OTA offers appear on the property endpoint. There is no board-basis field in either schema. [SearchApi Hotels docs](https://www.searchapi.io/docs/google-hotels-api); [SearchApi Hotels Property docs](https://www.searchapi.io/docs/google-hotels-property-api)
- **SerpApi** is the only provider found whose **listing** response includes a `prices[]` array with `source` and `rate_per_night` per property, plus `total_rate` for the property. It also returns `property_token`, `free_cancellation`, `amenities` and `hotel_class`; there is no board-basis field. [SerpApi Google Hotels docs](https://serpapi.com/google-hotels-api)
- **DataForSEO** splits the job. `hotel_searches` returns `hotel_identifier`, `title`, `stars`, `reviews`, and a `prices` object whose `price` is explicitly “price per night”; its `items` array is always `null`. `hotel_info` adds `prices.items[]` of type `hotel_info_price` with `title` (the third-party site name), `price` (per night), `url`, `domain`, `official_site`, `is_paid` and `free_cancellation_until`, plus `offers[]` with room names. Neither endpoint returns a total-stay price or a board-basis field. [DataForSEO hotel_searches docs](https://docs.dataforseo.com/v3/business_data/google/hotel_searches/live/); [DataForSEO hotel_info docs](https://docs.dataforseo.com/v3/business_data/google/hotel_info/live/advanced/)
- **Bright Data** sells a Google Hotels dataset rather than a search endpoint. Its public example record contains `timestamp`, `url`, `hotel_id`, `hotel_name`, `rating`, `review_count`, `star_classification` and `address`. The product page claims it can collect “room options, pricing, and availability”, but the public sample does not show OTA source names, total-stay prices or board basis. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Oxylabs** has a dedicated `google_travel_hotels` target, but the documented request requires `"render": "html"` and returns the Google Travel page HTML; `"parse": true` is optional. There is no documented JSON field schema for OTA offers, totals or board basis, so any structured output is either Oxylabs’ parser or your own parser. [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels)
- **Scrape.do** has a dedicated Google Hotels listing endpoint that returns property metadata, `property_token` and a ready-to-call `property_details_link`, but **no per-night price**. The detail endpoint returns `rate_per_night`, `total_rate`, price breakdowns, check-in/check-out times and review breakdowns. The listing endpoint does not support adults/children and always reflects 2 adults, 0 children; occupancy-specific pricing requires the detail endpoint. No OTA source list is documented. [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/)
- **Apify `jy-labs/google-hotels-multi-query-scraper`** returns `hotelId`, `hotelName`, `lowestPrice` (nightly), `currency`, and `prices[]` where each offer has `provider`, `price` (nightly), `bookingUrl`, `cancellation` and `features` such as “Breakfast included”. It claims 30+ OTA providers and supports up to 5 queries per run and 100 hotels per query. It does not return a total-stay price or a formal board-basis field. [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **Apify `solidcode/google-hotels-scraper`** returns `propertyToken`, `googlePlaceId`, `ratePerNight`, `totalRate`, star class, ratings, amenities, images and GPS. It supports 43 countries and 21 currencies but does **not** return OTA source names or board basis. [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper)
- **ScrapingBee** markets a Google Hotels scraper, but there is no fixed hotel endpoint or response schema. You send any Google Hotels URL to the generic HTML API with `render_js`, then supply `extract_rules`/`ai_extract_rules` (or parse the HTML yourself); the result is HTML or your extracted JSON. [ScrapingBee Google Hotels scraper](https://www.scrapingbee.com/scrapers/google-hotel-scraper/); [ScrapingBee Google Hotels tutorial](https://www.scrapingbee.com/blog/how-to-scrape-google-hotels/)
- **Crawlbase** likewise has only a generic Crawling API and a tutorial for Google Hotels; no dedicated hotel schema. [Crawlbase Google Hotels tutorial](https://crawlbase.com/blog/how-to-scrape-google-hotels-with-python/)
- **Serper.dev** exposes Search, Images, News, Maps, Places, Videos, Shopping, Scholar, Patents, Autocomplete, Reviews and Lens — 12 engines, **no Hotels engine**. [Serper homepage](https://serper.dev/)
- **SearchCans** exposes Google Search, Google Shopping, Google Images, Google News, Google Videos, Google Short Videos, Bing Search, YouTube Search, Reader, File Extraction and Web Screenshot — **no Hotels API**. [SearchCans homepage](https://searchcans.com/)
- **Zyte** sells a generic web-scraping API, managed data delivery and Scrapy Cloud; no Google Hotels endpoint is listed. [Zyte homepage](https://www.zyte.com/)
- **ScraperAPI** is a generic scraping API; its documentation has no Google Hotels endpoint. [ScraperAPI docs](https://docs.scraperapi.com/)

### Inferences

- A provider calling itself a “Google Hotels API” is not proof of a fixed structured hotel schema. ScrapingBee and Crawlbase market Google Hotels scraping but return HTML, or JSON produced by your own CSS/AI extraction rules, rather than a documented hotel response model.
- The field set is fragmented. **SerpApi is the only one-call structured source found that gives OTA names and a total-stay price together.** SearchApi can match it only with a second per-hotel call; DataForSEO can give OTA names but not totals; Scrape.do can give totals but not OTA names; Apify’s `jy-labs` gives OTA names but not totals, while `solidcode` gives totals but not OTA names.
- Board basis is the hardest requirement. No documented Google Hotels SERP schema exposes a normalized board-basis enum. “Breakfast” in an amenities list is a property amenity, not proof that a specific rate includes breakfast.
- If the product requirement is “show the cheapest OTA and total stay price”, SerpApi’s response shape is materially better than the cheaper headline APIs. If the requirement is “show a single cheapest price”, Scrape.do, DataForSEO or Apify `solidcode` can be enough.

### Gaps

- Bright Data’s full dataset schema is not public; the product page claims pricing/availability but the sample record does not prove OTA names or total-stay prices.
- Scrape.do may return OTA-level offers on the detail endpoint, but its public documentation only names `rate_per_night`, `total_rate` and “price breakdowns”; OTA source names are unconfirmed.
- Oxylabs’ optional parser output schema for Google Hotels was not retrieved; it may expose more fields than raw HTML.
- No provider documents a board-basis field. Whether “Breakfast included” can be reliably parsed from `features`/HTML was not tested.
- No hands-on API calls were made, so field presence is based on official documentation and public examples, not live responses.

## What does a Google Hotels search really cost at 1,000, 10,000 and 100,000 searches per month?

### Takeaway

Headline “per search” prices are misleading for this use case. SearchApi, DataForSEO and Scrape.do do **not** return OTA source names in their listing responses, so full OTA data needs **one detail call per hotel** (about 21 calls per 20-hotel search). On that basis, **SerpApi is $25 / $150 / $725 per month at 1k / 10k / 100k searches**, while SearchApi is $100 / $500 / about $2,940–$5,000 and Scrape.do is $29 / $249 / about $1,260–$1,470. The only material savings come from **raw-HTML scraping**, but the gap is provider- and volume-dependent: ScrapingBee at roughly $19 / $19–49 / $99–249 per month and Crawlbase at roughly $9 / $40 / $199–228 are cheaper, while Oxylabs at $30 / $100 / about $2,500+ is cheaper only at 10k. You own the parser and the blocking/legal risk.

### Cited Findings

**Assumptions used for the model (these are modelling assumptions, not provider claims):**

- One search returns about 20 hotels.
- “Full OTA” means one listing call plus one detail call per hotel, unless the provider returns OTA prices in the listing (SerpApi) or returns a raw HTML page containing all offers (Oxylabs, ScrapingBee, Crawlbase).
- SearchApi and Scrape.do are modelled as 21 billable calls per search (1 listing + 20 detail). Scrape.do documents 10 credits per Google Hotels call; SearchApi prices per “search” without distinguishing engines, so the model assumes each listing or property call consumes one search credit. [SearchApi pricing](https://www.searchapi.io/pricing); [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/)
- DataForSEO bills `hotel_searches` per SERP of up to 18 hotels and `hotel_info` per hotel entity. For 20 hotels that is 2 SERPs + 20 hotel-info units = 22 units. [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api)
- Bright Data and Apify bill per hotel record/event, so 20 units per search. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels); [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- Monthly cost is the cheapest published plan that covers the usage. Where the plan capacity is exceeded, the next plan or overage is noted. No negotiated/enterprise discounts, taxes, VAT, engineering or parsing costs are included.

| Provider and billing basis | Coverage of the requirement | Cost per 1k searches | 1k/month | 10k/month | 100k/month | Source |
|---|---|---:|---:|---:|---:|---|
| **SerpApi** — 1 call, OTA names + `total_rate` in listing | OTA names + total stay; no board | $25 / $15 / $7.25 | $25 | $150 | $725 | [SerpApi pricing](https://serpapi.com/pricing) |
| **SearchApi** — 21 calls, full OTA + totals via property endpoint | OTA names + total stay; no board | $100 / $50 / ~$29–$50 | $100 | $500 | ~$2,940–$5,000† | [SearchApi pricing](https://www.searchapi.io/pricing); [SearchApi Hotels Property docs](https://www.searchapi.io/docs/google-hotels-property-api) |
| **SearchApi** — 1 call, listing only | No OTA names; total price only | $40 / $4 / $2.50 | $40 | $40 | $250 | [SearchApi pricing](https://www.searchapi.io/pricing) |
| **DataForSEO standard queue** — 22 units | OTA names via `hotel_info`; no totals | $17.60 | $17.60* | $176 | $1,760 | [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api) |
| **DataForSEO priority queue** — 22 units | OTA names via `hotel_info`; no totals | $35.20 | $35.20* | $352 | $3,520 | [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api) |
| **DataForSEO live mode** — 22 units | OTA names via `hotel_info`; no totals | $88 | $88* | $880 | $8,800 | [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api) |
| **Bright Data** — 20 records | OTA/total unverified | $30 / $30 / $26 | $30 | $300 | $2,600 | [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels) |
| **Oxylabs** — 1 raw HTML page | All offers in HTML; DIY parsing | $30 / $10 / ~$25+ | $30 | $100 | ~$2,500+ | [Oxylabs pricing](https://oxylabs.io/pricing) |
| **Scrape.do** — 21 calls, detail per hotel | Totals; **no OTA names** | $29 / $24.90 / ~$12.60–$14.70 | $29 | $249 | ~$1,260–$1,470‡ | [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/); [Scrape.do pricing](https://scrape.do/pricing/) |
| **Scrape.do** — 1 listing call | No prices at all | $29 / $2.90 / $0.99 | $29 | $29 | $99 | [Scrape.do pricing](https://scrape.do/pricing/) |
| **Apify `jy-labs`** — 20 hotel events | OTA names; no totals | ~$580 | ~$580 | ~$5,800 | ~$58,000 | [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper); [Apify pricing](https://apify.com/pricing) |
| **Apify `solidcode`** — 20 result rows | Totals; no OTA names | $20 | $20 | $200 | $2,000 | [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper) |
| **ScrapingBee** — 1 rendered page, 5–25 credits | All offers in HTML; DIY parsing | $19 / $1.90–4.90 / $0.99–2.49 | $19 | $19–49 | $99–249§ | [ScrapingBee pricing](https://www.scrapingbee.com/pricing/) |
| **Crawlbase** — 1 rendered page, ~4 credits | All offers in HTML; DIY parsing | ~$9 / ~$4.04 / ~$2–2.30 | ~$9 | ~$40 | ~$199–228¶ | [Crawlbase pricing](https://crawlbase.com/pricing) |
| **Serper.dev** | No Google Hotels support | N/A | N/A | N/A | N/A | [Serper homepage](https://serper.dev/) |
| **SearchCans** | No Google Hotels support | N/A | N/A | N/A | N/A | [SearchCans homepage](https://searchcans.com/) |
| **Zyte** | No Google Hotels support | N/A | N/A | N/A | N/A | [Zyte homepage](https://www.zyte.com/) |
| **ScraperAPI** | No Google Hotels support | N/A | N/A | N/A | N/A | [ScraperAPI docs](https://docs.scraperapi.com/) |

\* DataForSEO is pay-as-you-go; the first invoice may be higher if a minimum deposit applies. The minimum deposit was not verified on the official pricing page. [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api)

† SearchApi’s 100k-search case needs 2.1M calls. The Octo 2M plan ($2,800) covers 2M; the 100k shortfall has no published overage rate. At the plan’s effective $1.40/1k it would be ~$2,940; otherwise the documented option is the $5,000 Octo 5M plan. [SearchApi pricing](https://www.searchapi.io/pricing)

‡ Scrape.do’s 100k case needs 21M credits, above the 10M Advanced plan; extra-credit pricing is not published. The range extrapolates the Advanced rate (~$0.06–0.07 per 1k credits) to 21M credits. [Scrape.do pricing](https://scrape.do/pricing/)

§ ScrapingBee charges 5 credits for JS rendering with standard proxies, 25 for premium proxy + JS, and 75 for stealth proxy. The table spans 5–25. At 5 credits, 10k searches fit the $19 Hobby plan and 100k fit the $99 Startup plan; at 25 credits they need the $49 Freelance and $249 Business plans. [ScrapingBee pricing](https://www.scrapingbee.com/pricing/); [ScrapingBee Google Hotels scraper](https://www.scrapingbee.com/scrapers/google-hotel-scraper/)

¶ Crawlbase assumes complex difficulty ×2 plus JS ×2 = 4 credits per request; the Google-specific tier is not published. The 1k figure is pay-as-you-go; a new account’s 5,000 signup credits may cover the first month. [Crawlbase pricing](https://crawlbase.com/pricing)

**Provider-by-provider commercial detail (checked 27 October 2026):**

- **SerpApi:** Free 250 searches/month; Starter $25/1,000; Developer $75/5,000; Production $150/15,000; Big Data $275/30,000; Searcher $725/100,000; Volume $1,475/250,000. Only successful searches are billed; plan throughput is 200/1,000/3,000/6,000/20,000/50,000 searches per hour respectively. No overage is documented; you upgrade. [SerpApi pricing](https://serpapi.com/pricing)
- **SearchApi:** Developer $40/10,000 ($4/1k); Production $100/35,000 ($3/1k); BigData $250/100,000 ($2.50/1k); Scale $500/250,000 ($2/1k); Octo 500K $900; Octo 1M $1,500; Octo 2M $2,800; Octo 5M $5,000. Free 100 requests, no card, cancel anytime. Failed requests are not billed. Hourly cap: “you can utilize only up to 20% of your plan’s credits each hour.” No overage rate is documented; the next plan is the practical path. [SearchApi pricing](https://www.searchapi.io/pricing)
- **DataForSEO:** Standard queue $0.0008 per hotel entity/SERP (up to 45 minutes); priority $0.0016 (about 1 minute); live $0.004 (about 11 seconds). `hotel_searches` is billed per SERP of up to 18 organic hotels; default depth is 18, maximum 140, and depth above 18 is billed accordingly. `load_prices_by_dates` doubles the `hotel_info` task price, but only for the optional daily `prices_by_dates` calendar; the standard third-party `items` prices do not require it. No subscription; pay-as-you-go. [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api); [DataForSEO hotel_info docs](https://docs.dataforseo.com/v3/business_data/google/hotel_info/live/advanced/)
- **Bright Data:** Free 5,000 records/month; pay-as-you-go $1.50/1,000 records; Scale $499/month includes 384,000 records, then $1.30/1,000 additional; unlimited concurrency; pay only for successful delivery; no upfront commitment. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Oxylabs:** Starter $30/month (up to 3.7K Google JS results), Basic $100 (22K), Flexible $500 (76K), Enterprise from $2,500 (434K at $1.15/1k). Google JS rendering is $1.35/1,000 results on the first three plans; Google non-JS is $1.00/1,000. Google Hotels requires `render: html`, so the JS rate is the relevant one. The 100k-search case therefore needs the $2,500 Enterprise floor, not the $500 Flexible plan. [Oxylabs pricing](https://oxylabs.io/pricing); [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels)
- **Scrape.do:** Free 1,000 credits = 100 Google Hotels calls. Hobby $29/month for 250,000 credits (25,000 calls); Pro $99 for 1,250,000 (125,000 calls); Business $249 for 3,500,000 (350,000 calls); Advanced $699 for 10,000,000 (1,000,000 calls). Every Google Hotels call costs 10 credits. Concurrency is 10/50/100/200 by plan. [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/); [Scrape.do pricing](https://scrape.do/pricing/)
- **Apify:** Free plan $0 + $5 usage; Starter $19/month + $19 usage; Scale $199/month; Business $999/month. `jy-labs` charges $0.025 per validated hotel ($0.0225 on paid Apify plans), plus platform compute/proxy usage; an example run of 5 hotels cost 5 events and about $0.02 of platform usage. [Apify pricing](https://apify.com/pricing); [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **Apify `solidcode`:** $1.00 per 1,000 result rows, plus Apify platform usage. A 20-hotel search is 20 rows, so about $0.02 per search. [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper)
- **ScrapingBee:** Free 1,000 credits; Hobby $19/month for 75,000 credits (25 concurrent); Freelance $49/250,000 (50 concurrent); Startup $99/1,000,000 (100 concurrent); Business $249/3,000,000 (200 concurrent). JavaScript rendering costs 5 credits; premium proxies cost 10 credits without JS and 25 with JS; stealth proxy with JS is 75. ScrapingBee’s Google Hotels tutorial estimates 5–10 credits, so the model spans 5–25 credits: 5 for JS with standard proxies, 25 for JS with premium proxies. At 25 credits the 100k case needs 2.5M credits and costs $249, not $99. [ScrapingBee pricing](https://www.scrapingbee.com/pricing/); [ScrapingBee Google Hotels scraper](https://www.scrapingbee.com/scrapers/google-hotel-scraper/)
- **Crawlbase:** Pay-as-you-go $0/month, with a graduated ladder: $3.00/1k for the first 1k requests, $2.00/1k for the next 10k, $0.60/1k for the next 100k, and $0.50/1k for the next 1M. Subscriptions: Starter $99/200K credits, Scale 500K $199, Scale 1M $349, Growth 2M $599; overage continues on the same ladder. New accounts get 1,000 free credits, growing to up to 5,000 via setup steps; the page does not describe a monthly reset. JavaScript is ×2, and site difficulty ranges from ×1 standard to ×20 for the most defended sites. At an assumed complex ×2 plus JS ×2 = 4 credits per Google Hotels request, 1k/10k/100k searches need 4k/40k/400k credits: about $9/$40/$199–228. The Google-specific difficulty tier is not published. [Crawlbase pricing](https://crawlbase.com/pricing)
- **Serper.dev:** 2,500 free queries; paid pricing starts at $0.30 per 1,000 queries, but there is no Hotels engine, so the price is not usable for this requirement. [Serper homepage](https://serper.dev/)
- **SearchCans:** 100 free credits; from $0.56 per 1,000 requests; prepaid credits, parallel lanes, no recurring subscription. It has no Hotels API. [SearchCans homepage](https://searchcans.com/)
- **Zyte and ScraperAPI:** Generic scraping pricing only; no Google Hotels endpoint, so no comparable per-search cost. [Zyte homepage](https://www.zyte.com/); [ScraperAPI docs](https://docs.scraperapi.com/)

**Rate limits and concurrency:**

- **SearchApi:** 20% of monthly plan credits per hour. No separate concurrency number was found. [SearchApi pricing](https://www.searchapi.io/pricing)
- **SerpApi:** plan throughput of 200 / 1,000 / 3,000 / 6,000 / 20,000 / 50,000 searches per hour for Starter / Developer / Production / Big Data / Searcher / Volume. [SerpApi pricing](https://serpapi.com/pricing)
- **DataForSEO:** 10,000 API calls per minute; live endpoints are limited to 30 simultaneous requests; standard queue accepts batches of up to 100 tasks per POST. [DataForSEO rate limits](https://dataforseo.com/help-center/rate-limits-and-request-limits)
- **Bright Data:** “Unlimited concurrency” on the Google Hotels product page. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Scrape.do:** 10 / 50 / 100 / 200 concurrent requests on Hobby / Pro / Business / Advanced. [Scrape.do pricing](https://scrape.do/pricing/)
- **ScrapingBee:** 25 / 50 / 100 / 200 concurrent requests on Hobby / Freelance / Startup / Business. [ScrapingBee pricing](https://www.scrapingbee.com/pricing/)
- **Apify:** Concurrency depends on the Apify plan and actor; actor runs are asynchronous. `jy-labs` accepts at most 5 queries per run and 100 hotels per query. [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **Oxylabs and Crawlbase:** No explicit concurrency number was found on the public pricing pages; capacity is expressed as included results/credits. [Oxylabs pricing](https://oxylabs.io/pricing); [Crawlbase pricing](https://crawlbase.com/pricing)

### Inferences

- **SerpApi is the cheapest structured option that meets the full requirement at every volume modelled.** Its one-call `prices[].source` + `total_rate` design avoids the 20× per-hotel multiplier that makes SearchApi and Scrape.do expensive. At 100k searches it is $725 versus $2,800+ for SearchApi, $1,468+ for Scrape.do and $1,760 for DataForSEO standard queue.
- **DataForSEO standard queue is the cheapest structured OTA-name source**, but 45-minute latency makes it unsuitable for live user searches. It is a good nightly/prefetch enrichment layer for a finite set of destinations, not a live search API. DataForSEO live mode ($88/1k) is more expensive than SerpApi ($25–$7.25/1k).
- **Scrape.do’s headline is deceptive for this requirement.** The listing looks extremely cheap ($29/month for 25k calls), but it returns no prices at all; pricing every hotel requires 10 credits per detail call. At 21 calls per search, it is $29/$249/~$1,468, and it still does not document OTA source names.
- **SearchApi’s listing-only price is cheap but not useful for OTA comparison.** At $40/month for 10k searches it looks like a SerpApi killer, but the listing has only a `total_price` and no `prices[].source`; adding the property endpoint turns a 20-hotel search into 21 billable searches.
- **Raw HTML is the only order-of-magnitude saving.** ScrapingBee at ~$19/$49/$99 and Oxylabs at $30/$100/$500+ are 7–50× cheaper than SerpApi at scale, because one rendered page contains all OTA offers. The trade-off is a brittle parser, Google blocking, and the legal issues in the next section.
- **Apify `jy-labs` is not a low-cost option.** At $0.025/hotel and 20 hotels/search, the event cost alone is $500 per 1,000 searches; platform/proxy usage pushes it to roughly $580. It is also limited to 22 countries and does not return total-stay prices.
- **Apify `solidcode` is cheap but fails the OTA requirement.** At $1/1k result rows, a 20-hotel search is about $20/1k searches, but it returns only the property’s nightly/total rate, not the OTA source list.
- **Bright Data is mid-priced and unproven for this schema.** At $30/1k searches it is close to SerpApi at 1k and more expensive at 100k ($2,600 vs $725), and its public schema does not prove OTA names or total-stay prices.

### Gaps

- SearchApi’s overage rate for the 2.1M-call (100k-search) case is not documented; the $2,800–$5,000 range assumes either an overage at the 2M plan rate or buying the 5M plan.
- DataForSEO’s minimum deposit/first-payment amount was not verified; the table’s 1k/month figure may be below the minimum invoice.
- Oxylabs’ 100k-search case exceeds the published 76K-result Flexible cap; the actual overage or Enterprise price was not obtained.
- Crawlbase’s exact Google “complex” multiplier and overage rate were not verified; the 100k figure is a range.
- Bright Data’s billing unit may be more than one record per hotel if room options or multiple offers are returned; the $30/1k figure assumes one record per hotel.
- No provider’s negotiated/enterprise discount was researched; at 100k searches, a quote could change the ranking.
- The model excludes VAT/tax, engineering/parser maintenance, proxy overage, retries, failed calls and currency conversion.

## Do the providers’ terms permit caching, storage and displaying prices to end users?

### Takeaway

**No provider gives explicit permission to cache, store and display Google Hotels prices to end users.** Most terms either prohibit reproduction/resale, are silent, or push responsibility onto the customer. More importantly, **Google’s own robots.txt disallows `/travel/search` and `/travel/entity`**, and Google’s Terms of Service prohibit “using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages.” A provider’s terms cannot cure that underlying restriction. If the platform needs a clean legal footing for displaying prices, a direct Google partner/OTA affiliate agreement is the safer route, not a scraping API.

### Cited Findings

| Provider | Explicit caching/storage/end-user display permission? | Key clause / finding | Source |
|---|---|---|---|
| **SearchApi** | No | “You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Services, use of the Services, or access to the Services without the express written permission by the Company.” Its legal guarantee excludes claims from “your use, storage, redistribution, or commercialization of data.” | [SearchApi terms](https://www.searchapi.io/legal/terms) |
| **SerpApi** | No | “You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use of the Service, or access to the Service or any contact on the website through which the service is provided, without express written permission by us.” Search data is retained for 31 days, then deleted; ZeroTrace prevents storage. | [SerpApi legal](https://serpapi.com/legal) |
| **DataForSEO** | Not addressed | The public terms cover billing, privacy and acceptable use; no caching, storage, redistribution or end-user display clause was found. | [DataForSEO terms](https://dataforseo.com/terms-of-service) |
| **Bright Data** | No | The Master Service Agreement prohibits “reselling of the Service in whole or in part, without Bright Data’s prior written authorization” and creating derivative works of the Service. No clause authorises caching or public display of scraped Google content. | [Bright Data MSA](https://brightdata.com/license); [Bright Data AUP](https://brightdata.com/acceptable-use-policy) |
| **Oxylabs** | Not verified | The terms-of-service page could not be retrieved at the attempted URLs; no caching/display clause was confirmed. | [Oxylabs pricing](https://oxylabs.io/pricing) (terms URL not found) |
| **Scrape.do** | Not explicit | The Terms of Use require lawful use and prohibit infringement; no caching, storage or end-user display permission was found. | [Scrape.do Terms of Use](https://scrape.do/terms-of-use/) |
| **Apify** | Partial | The Actor Terms say you retain “all intellectual property rights that subsist in your Actor Input and Actor Output,” but this does not grant rights to the underlying Google content, and the AUP still prohibits activity that contravenes third-party rights. | [Apify Actor Terms](https://docs.apify.com/legal/actor-terms-and-conditions); [Apify AUP](https://docs.apify.com/legal/acceptable-use-policy) |
| **ScrapingBee** | Not explicit | The terms focus on the licence the customer grants to ScrapingBee for “User Data”; no clause permits the customer to display scraped Google content. | [ScrapingBee terms](https://www.scrapingbee.com/terms-and-conditions/) |
| **Crawlbase** | Not verified | The attempted terms-of-service URL returned 404; no caching/display clause was confirmed. | [Crawlbase pricing](https://crawlbase.com/pricing) (terms URL not found) |
| **SearchCans** | Not explicit | The terms say the customer is responsible for use of scraped SERP data; no caching/display permission was found. | [SearchCans terms](https://www.searchcans.com/terms) |
| **Serper.dev** | N/A | No Google Hotels product, so the question does not arise. | [Serper homepage](https://serper.dev/) |
| **Zyte / ScraperAPI** | N/A | No Google Hotels product, so the question does not arise. | [Zyte homepage](https://www.zyte.com/); [ScraperAPI docs](https://docs.scraperapi.com/) |

- **Google’s robots.txt disallows `/travel/search`**, which is the search-results path every Google Hotels scraper uses, and also disallows `/travel/entity`. Note that Google Hotels property pages live under `/travel/hotels/entity/...`, which is **not** matched by the `/travel/entity` prefix; the search page is the clearly disallowed path. [Google robots.txt](https://www.google.com/robots.txt)
- **Google’s Terms of Service** prohibit “using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities).” [Google Terms of Service](https://policies.google.com/terms)
- **Google says hotel prices come from its partners**: “Hotel prices come from Google partners like hotel owners, online travel agencies, metasearch engines, and other travel providers.” Partners must follow Google’s Price Accuracy Policy, which requires prices to include taxes and fees and match the total price on the booking page. [Google Hotels help](https://support.google.com/travel/answer/6276008?hl=en)
- **SearchApi’s Data Licensing section** adds that some public-domain content may be subject to intellectual-property rights and that the customer may use it only with the appropriate licence or as permitted by law; it prohibits misrepresenting ownership/source and altering copyright notices. [SearchApi terms](https://www.searchapi.io/legal/terms)
- **SerpApi’s 31-day retention** means the provider itself does not keep results indefinitely, but that does not grant the customer a display licence. [SerpApi legal](https://serpapi.com/legal)
- **Bright Data’s MSA** also says Bright Data “may retain data Client has collected and may use it for its own purposes in its sole discretion.” [Bright Data MSA](https://brightdata.com/license)
- **Scrape.do’s Terms of Use** prohibit unlawful use and infringement of third-party rights, but do not grant a data-display licence. [Scrape.do Terms of Use](https://scrape.do/terms-of-use/)
- **Apify’s Actor Terms §3.2** say: “As between you and Creator, and to the extent permitted by applicable law, you retain all intellectual property rights that subsist in your Actor Input and Actor Output.” That is a useful output-ownership clause, but it does not grant rights to the underlying Google content, and the AUP still prohibits activity that contravenes third-party rights. [Apify Actor Terms](https://docs.apify.com/legal/actor-terms-and-conditions); [Apify AUP](https://docs.apify.com/legal/acceptable-use-policy)
- **ScrapingBee’s terms** grant ScrapingBee rights to use, store, transmit, distribute, modify, copy, display, sublicense and create derivative works of anonymised aggregated data; the customer’s rights to scraped Google content are not addressed. [ScrapingBee terms](https://www.scrapingbee.com/terms-and-conditions/)
- **SearchCans’ terms** state that the customer is responsible for the use of scraped SERP data and that SearchCans does not retain the payload. [SearchCans terms](https://www.searchcans.com/terms)

### Inferences

- **The legal risk is structural, not a vendor-selection detail.** Even if a provider’s contract permitted caching (none clearly does), Google’s robots.txt and ToS restrict automated access to `/travel/search` and `/travel/entity`. A provider cannot grant rights it does not have.
- **A public price-comparison UI is more exposed than internal prefetching.** Caching prices for internal ranking or monitoring is a lower-profile use than republishing them to consumers, but it is still not licensed by the terms reviewed.
- **“Legal shield”/indemnity products do not solve this.** SearchApi’s guarantee expressly excludes “your use, storage, redistribution, or commercialization of data”; SerpApi’s shield is conditioned on the use not being illegal. [SearchApi terms](https://www.searchapi.io/legal/terms); [SerpApi pricing](https://serpapi.com/pricing)
- **Displaying cached Google prices also creates an accuracy problem.** Google’s own partner policy shows the standard it applies to hotel prices: they must include taxes and fees and match the total price on the booking page. A stale cache would not meet that standard, even if the scraping itself were licensed. [Google Hotels help](https://support.google.com/travel/answer/6276008?hl=en)
- **The cleanest route is a direct partner/affiliate relationship** with Google Hotel Ads/Travel Partners or with OTAs (Booking.com, Agoda, Expedia, etc.), which comes with contractual price-display and attribution rules. That is outside the scope of this vendor comparison, but it is the inference the evidence points to.

### Gaps

- Oxylabs’ terms of service were not retrieved; the actual caching/display clause is unknown.
- Crawlbase’s terms of service returned 404 at the attempted URL; its caching/display clause is unknown.
- Apify’s Actor Terms were reviewed and do contain an output-ownership clause, but they do not resolve the underlying Google rights; no enterprise/creator-specific contract was reviewed.
- No provider’s data-processing addendum or enterprise contract was reviewed; enterprise terms may differ.
- This is not legal advice. A lawyer should review the chosen provider’s terms, Google’s terms/robots.txt, and the target jurisdiction’s database/IP rules before public display.

## How reliable is coverage for Sri Lanka and Indian Ocean hotels, and what geo limitations apply?

### Takeaway

**No provider publishes Sri Lanka- or Indian Ocean-specific success rates, price depth or OTA coverage.** The only hard geographic limitation found is Apify’s `jy-labs` actor, which supports **22 countries and excludes Sri Lanka and the Maldives**. The other providers accept country/locale parameters (or arbitrary Google Hotels URLs), so they can *attempt* Sri Lankan and Indian Ocean searches, but you need a paid pilot to verify whether prices, OTA names and total-stay data actually appear for those properties.

### Cited Findings

- **Apify `jy-labs` supports only 22 countries:** US, UK, Singapore, Japan, South Korea, Germany, France, Australia, Canada, India, Thailand, Brazil, Italy, Spain, Netherlands, UAE, Hong Kong, Taiwan, Malaysia, Indonesia, Philippines and Vietnam. Sri Lanka, Maldives, Seychelles, Mauritius and Reunion are not in the list. [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **Apify `solidcode` claims 43 countries**, 19 languages and 21 currencies, but does not publish the country list on the public page; Sri Lankan coverage is therefore unverified. [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper)
- **SearchApi** exposes `gl`, `hl` and `currency` parameters for Google Hotels; the docs point to Google Travel’s supported country/language/currency lists, but do not publish a Sri Lanka-specific reliability figure. [SearchApi Hotels docs](https://www.searchapi.io/docs/google-hotels-api)
- **DataForSEO** accepts `location_name` or `location_code` and says the location is appended to the keyword; it supports adults/children up to 6 persons, check-in/check-out up to 30 days, and currency. It does not publish Sri Lanka-specific coverage. [DataForSEO hotel_searches docs](https://docs.dataforseo.com/v3/business_data/google/hotel_searches/live/)
- **Scrape.do** says it supports geo-targeting in 160+ countries, but its Google Hotels listing endpoint does **not** support adults/children and always reflects 2 adults, 0 children; occupancy-specific pricing requires the detail endpoint. No Sri Lanka-specific coverage data is published. [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/)
- **Bright Data** takes a Google Hotels URL (the sample uses `google.com/travel/hotels/entity/...`) and does not publish a country coverage list or Sri Lanka-specific success rate. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Oxylabs** takes a `query` (e.g. “hotels in Paris”), dates, adults and hotel-class filters; its public example is Paris, and no Sri Lanka-specific coverage data is published. [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels)
- **ScrapingBee and Crawlbase** are generic scrapers: they can request any Google Hotels URL with a chosen `gl`/`country_code`, but they publish no hotel-specific coverage or success rate. [ScrapingBee Google Hotels tutorial](https://www.scrapingbee.com/blog/how-to-scrape-google-hotels/); [Crawlbase Google Hotels tutorial](https://crawlbase.com/blog/how-to-scrape-google-hotels-with-python/)
- **SerpApi** supports `gl`, `hl` and `currency` for Google Hotels, but no Sri Lanka-specific success rate is published. [SerpApi Google Hotels docs](https://serpapi.com/google-hotels-api)
- **Site-wide reliability claims are not country-specific:** SearchApi advertises a 99.9% SLA on paid plans; DataForSEO advertises 99.95% uptime; Scrape.do advertises a 99.98% success rate; Bright Data says every scraper lists a live success rate. None of these is a Sri Lanka/Indian Ocean Google Hotels measure. [SearchApi pricing](https://www.searchapi.io/pricing); [DataForSEO blog](https://dataforseo.com/blog/seo-api-reliability-and-uptime); [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/); [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)

### Inferences

- **`jy-labs` is disqualified for a Sri Lanka-focused product.** Its 22-country list excludes Sri Lanka and the Maldives, which are likely core markets for a Sri Lankan travel platform.
- **Country/locale parameters are necessary but not sufficient.** A provider can accept `gl=lk` or “Colombo, Sri Lanka” and still return sparse prices, few OTAs or no total-stay rates. The only way to know is a pilot against a fixed set of 20–30 Sri Lankan and Maldives properties.
- **Smaller markets probably have thinner OTA coverage.** Google Hotels’ prices come from partners; Sri Lankan boutique/hotel inventory may have fewer Booking/Agoda/Expedia rates than a Paris or Dubai search. This is an inference from Google’s partner model, not a measured coverage claim. [Google Hotels help](https://support.google.com/travel/answer/6276008?hl=en)
- **Currency/localisation matters.** Use `gl=lk`, `hl=en`, `currency=LKR` (or USD if the platform quotes USD) and compare the returned total against the booking page. A provider that silently defaults to USD or 2 adults can produce misleading totals.
- **Test the long tail, not just Colombo.** Include Colombo, Galle, Kandy, Ella, Negombo, Maldives resorts and a southern-coast beach property; coverage may vary sharply by property type.

### Gaps

- No provider publishes Sri Lanka, Maldives, Seychelles, Mauritius or Reunion success rates, price-presence rates or OTA-count distributions.
- No live test was run; all coverage statements are documentary.
- Apify `solidcode`’s 43-country list was not published, so its Sri Lanka support is unknown.
- Google Hotels itself may have limited price coverage for small Sri Lankan properties; no source quantifies this.
- No provider documents how it handles Sri Lankan locale/currency edge cases (LKR rounding, taxes, service charges).

## Are the APIs usable from TypeScript on Cloudflare Workers, including egress/IP and timeout constraints?

### Takeaway

**Yes, all of them are HTTPS REST APIs callable with native `fetch`; none require Node.js.** Cloudflare Workers Paid allows **10,000 subrequests and 6 simultaneous outgoing connections per request** (Free: 50 subrequests), with 10 ms CPU on Free and 5 minutes CPU on Paid (default 30 seconds). A 21-call SearchApi/Scrape.do search is technically possible in one Worker invocation, but production traffic should be queued rather than fanned out inline. Apify and Bright Data runs are asynchronous and can take minutes, so use webhooks/queues, not a single blocking request.

### Cited Findings

- **Cloudflare Workers limits:** Free plan 50 subrequests per request, 10 ms CPU per HTTP request, 128 MB memory; Paid plan 10,000 subrequests per request, 5 minutes CPU per HTTP request (default 30 seconds), 128 MB memory; 6 simultaneous outgoing connections per request on both plans. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- **Cloudflare `fetch`** is the runtime API for subrequests and supports request/response bodies, headers, redirects and compression; no Node `http`/`https` module is required. [Cloudflare Workers fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
- **SearchApi** is a synchronous REST GET API (`https://www.searchapi.io/api/v1/search?engine=google_hotels...`), returning JSON. [SearchApi Hotels docs](https://www.searchapi.io/docs/google-hotels-api)
- **SerpApi** is a synchronous REST GET API (`https://serpapi.com/search.json?engine=google_hotels...`), returning JSON. [SerpApi Google Hotels docs](https://serpapi.com/google-hotels-api)
- **DataForSEO** offers live mode (single POST, about 11 seconds average) and standard/priority queues (`task_post` then `task_get`), authenticated with HTTP Basic. [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api)
- **Bright Data** dataset collection is asynchronous: you trigger a collection and retrieve records/datasets later; the public API is REST/JSON. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Oxylabs** uses `POST https://data.oxylabs.io/v1/queries` and then retrieves the result; the Google Hotels request requires `render: html`. [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels)
- **Scrape.do** is a synchronous REST GET API for both listing and detail (`/plugin/google/hotels` and `/plugin/google/hotels/detail`). [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/)
- **Apify** is asynchronous: start an actor run, poll the run status or receive a webhook, then read the dataset via the Apify API. [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **ScrapingBee** is a synchronous REST GET API (`https://app.scrapingbee.com/api/v1/`) with `render_js` and `extract_rules`; it returns HTML or extracted JSON. [ScrapingBee Google Hotels tutorial](https://www.scrapingbee.com/blog/how-to-scrape-google-hotels/)
- **Crawlbase** is a synchronous REST Crawling API that returns HTML/JSON. [Crawlbase Google Hotels tutorial](https://crawlbase.com/blog/how-to-scrape-google-hotels-with-python/)
- **Cloudflare Workers egress** uses Cloudflare’s network IPs, not residential IPs. Hosted scraping APIs supply their own proxies; scraping Google directly from Workers would expose Cloudflare IPs and is likely to be blocked. This is why the provider-proxy model matters. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

### Inferences

- **Use the REST APIs directly, not provider SDKs.** Several provider SDKs are Node-oriented and may pull in `http`, `https`, `stream` or filesystem assumptions; native `fetch` avoids `nodejs_compat` and bundle-size problems. The REST endpoints above are sufficient.
- **A 21-call search fits the Paid subrequest limit but not the 6-connection concurrency limit.** With 6 simultaneous connections, 21 calls take about 4 waves. That is fine for a single search, but at 100k searches/month the fan-out should run in Cloudflare Queues/Workflows, not in the request path.
- **DataForSEO standard/priority queue is the most Worker-friendly async pattern.** `task_post` returns quickly; a Queue consumer or Cron Trigger calls `task_get` later. Live mode is simpler but 11 seconds average is long for a user-facing request and costs 5× the standard rate.
- **Apify and Bright Data need a webhook/polling design.** A Worker should start the run, return a job ID, and let a webhook or scheduled poll fetch the dataset. Do not hold a Worker open for a multi-minute actor run.
- **Set explicit timeouts and retries.** Use `AbortSignal.timeout()` per provider call; retry only idempotent GETs or task-status calls; use a dead-letter queue for failed runs. Cloudflare’s 30-second default CPU limit is not the main constraint (fetch wait does not count as CPU), but client disconnects and provider latency are.
- **Cache in KV/D1/R2 only with a short TTL and a legal review.** A 15–60 minute cache dramatically reduces calls for repeat destination/date queries, but the terms and Google restrictions in the previous section still apply.
- **Egress/IP is a provider-selection issue, not a Worker-configuration issue.** For SearchApi/SerpApi/DataForSEO/Scrape.do/Apify, the provider handles proxying and geo. For Oxylabs/ScrapingBee/Crawlbase, the provider also handles proxying. Only a direct Google scrape from Workers would depend on Cloudflare egress, and that is the option to avoid.

### Gaps

- No latency benchmark was run from Cloudflare Workers to each provider; “11 seconds” for DataForSEO live is the provider’s average, not a Worker-measured p95.
- Oxylabs’ async polling interval, Bright Data’s dataset readiness time and Apify’s actor run time were not measured.
- Provider-specific timeout/retry guidance was not fully retrieved for every API.
- Cloudflare plan limits may change; the cited page is dated 12 October 2026.
- No TypeScript SDK compatibility test was run; the recommendation is to use REST + `fetch`, which avoids the question.

## What is the practical shortlist and recommended architecture?

### Takeaway

For a small travel platform that needs **OTA source names + total-stay prices** and wants minimal engineering, **SerpApi remains the cost-effective structured choice** at $25 / $150 / $725 per month for 1k / 10k / 100k searches. If you can own a parser and accept the legal/blocking risk, **ScrapingBee or Oxylabs** can cut the data cost by roughly 7–50×. **Scrape.do** is the best cheap structured listing, but it has no OTA names; **DataForSEO standard queue** is a good prefetch/enrichment layer, not a live user API. **Apify `jy-labs` is too expensive and excludes Sri Lanka.**

### Cited Findings

- **SerpApi:** one Google Hotels listing call returns `prices[].source` and `total_rate` per property, at $25/1k, $150/10k and $725/100k. [SerpApi Google Hotels docs](https://serpapi.com/google-hotels-api); [SerpApi pricing](https://serpapi.com/pricing)
- **SearchApi:** full OTA data needs a listing call plus a property call per hotel; the property call returns `all_offers[].source` and `total_price`. At 21 calls per search, the cost is $100/1k, $500/10k and $2,800–$5,000/100k. [SearchApi Hotels Property docs](https://www.searchapi.io/docs/google-hotels-property-api); [SearchApi pricing](https://www.searchapi.io/pricing)
- **DataForSEO:** `hotel_info` returns OTA `title` and per-night `price`; `hotel_searches` returns per-night prices only. Standard queue is $17.60/1k searches for 22 units, but takes up to 45 minutes; live mode is $88/1k. [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-hotels-api); [DataForSEO hotel_info docs](https://docs.dataforseo.com/v3/business_data/google/hotel_info/live/advanced/)
- **Scrape.do:** listing returns `property_token` but no price; detail returns `total_rate` but no documented OTA source list. Full detail costs $29/1k, $249/10k and about $1,468–$2,097/100k. [Scrape.do Google Hotels Scraper](https://scrape.do/products/ready-api/google-hotels-scraper/)
- **ScrapingBee:** one rendered Google Hotels page with JS + premium proxy is about 10 credits; Hobby/Freelance/Startup give $19/1k, $49/10k and $99/100k, with DIY parsing. [ScrapingBee pricing](https://www.scrapingbee.com/pricing/)
- **Oxylabs:** one `google_travel_hotels` request with `render: html` is $1.35/1k results at the margin, but plan minimums make it $30/1k, $100/10k and $500+/100k; output is raw HTML unless you use a parser. [Oxylabs pricing](https://oxylabs.io/pricing); [Oxylabs Google Travel Hotels docs](https://developers.oxylabs.io/api-targets/search-engines/google/travel-hotels)
- **Bright Data:** $30/1k searches at PAYG, $300/10k, about $2,600/100k; public schema does not prove OTA/total. [Bright Data Google Hotels](https://brightdata.com/products/web-scraper/google-hotels)
- **Apify `jy-labs`:** about $580/1k searches at 20 hotels, 22 countries, no Sri Lanka, no total-stay price. [Apify jy-labs actor](https://apify.com/jy-labs/google-hotels-multi-query-scraper)
- **Apify `solidcode`:** about $20/1k searches at 20 rows, with `totalRate` but no OTA source list. [Apify solidcode actor](https://apify.com/solidcode/google-hotels-scraper)
- **Serper, SearchCans, Zyte and ScraperAPI** have no dedicated Google Hotels endpoint, so they are not substitutes for this requirement. [Serper homepage](https://serper.dev/); [SearchCans homepage](https://searchcans.com/); [Zyte homepage](https://www.zyte.com/); [ScraperAPI docs](https://docs.scraperapi.com/)

### Inferences

**Shortlist, ranked by fit for a small Sri Lanka-focused platform:**

1. **Stay on SerpApi for the live user path.** It is the only structured one-call source with OTA names + total stay, and it is cheaper than the “cheap” alternatives once their per-hotel detail calls are counted. Negotiate the Searcher/Volume tier if volume grows; at 100k searches, $725 is hard to beat without a parser.
2. **Pilot ScrapingBee (or Oxylabs) for a cost-reduction track.** One rendered page per search, about $19–$99/month at ScrapingBee or $30–$500+/month at Oxylabs for 1k–100k searches. Build a parser for the fields you need, run it against 20–30 Sri Lankan/Maldives properties, and measure block rate, price presence and parse accuracy before switching any traffic.
3. **Use DataForSEO standard queue as a prefetch/enrichment layer, not a live search API.** At $17.60/1k searches for OTA names (no totals) and up to 45 minutes latency, it is well suited to nightly refreshes of top destinations, price history and internal monitoring. Keep SerpApi (or raw HTML) for the live query.
4. **Use Scrape.do only if you need a cheap structured total price and can live without OTA names.** Its listing is cheap but price-less; its detail call adds total price, but at 21 calls/search it is no longer a bargain, and the OTA source list is undocumented.
5. **Do not use Apify `jy-labs` for Sri Lanka.** The 22-country limit excludes Sri Lanka and the Maldives, and the per-hotel cost is the highest in the comparison. `solidcode` is cheaper but lacks OTA names.
6. **Do not use Serper, SearchCans, Zyte or ScraperAPI for Google Hotels.** They have no dedicated hotel endpoint; using them would mean generic scraping plus your own parser, with no structured-field advantage.

**Recommended architecture (Cloudflare-native):**

- **Front door:** a Worker validates the search, checks a KV/D1 cache with a short TTL (15–60 minutes), and returns cached prices if fresh.
- **Queue:** on a miss, enqueue a job in Cloudflare Queues; a consumer Worker performs the provider calls with at most 6 concurrent `fetch` subrequests per invocation.
- **Provider adapter:** a TypeScript interface with `search()` and `property()` methods; one adapter for SerpApi (one call), one for SearchApi/DataForSEO/Scrape.do (1 + N), one for raw HTML (fetch + parse). Keep the provider behind the interface so you can switch without touching the UI.
- **Storage:** D1 for normalized hotel/offer rows, R2 for raw HTML snapshots, KV for hot price cache. Store `provider`, `fetched_at`, `currency`, `check_in`, `check_out`, `adults`, `children`, `total_price`, `ota_source`, `board_basis` (nullable) and a confidence/coverage flag.
- **Async providers:** for Apify/Bright Data, start the run, store the run ID, and let a webhook or scheduled poll write the dataset; never hold the user request open.
- **Observability:** log per-provider latency, HTTP status, price-presence rate, OTA count, parse failures and cache hit rate. Alert when a provider’s Sri Lanka price-presence rate drops.
- **Legal gate:** before public display, get a legal review of the chosen provider’s terms, Google’s robots.txt/ToS and the target jurisdiction. Prefer a direct Google/OTA partner agreement for the public price comparison; use scraping APIs for internal research or a clearly labelled, short-TTL cache only if counsel approves.

**Suggested 30-day bake-off:**

- Pick 30 properties: 10 Colombo, 5 Galle/south coast, 5 Kandy/Ella, 5 Negombo, 5 Maldives.
- For each provider, run the same 7-night stay for 2 adults, `gl=lk`, `en`, `LKR` and `USD`.
- Measure: price present (%), OTA count, total-price present (%), board-basis text present (%), p50/p95 latency, block/error rate, and cost per 1,000 searches.
- Compare the returned total against the OTA booking page for 10 randomly selected offers.
- Only then commit to a 100k-search plan.

### Gaps

- No hands-on bake-off was run; the recommendation is based on documented pricing/schema and should be validated with live calls.
- No negotiated/enterprise pricing was obtained; at 100k searches, a quote could change the ranking.
- No legal opinion was obtained; the terms review is a documentary summary, not legal advice.
- Direct OTA/Google partner API pricing and terms were outside scope; they may be a better fit for a public price-comparison product.
- The cost model assumes 20 hotels per search and one detail call per hotel; actual hotel counts, retries and failed calls will change the numbers.
