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

- Catalogue offers always win when the same hotel is found elsewhere (dedupe by normalised name).
- Discovery offers never claim confirmed availability or a live-checked price.
- A meal plan that the source does not publish is marked `mealPlanStatus: "unconfirmed"`. When the
  enquiry requires a meal plan, these offers are excluded by default rather than pretending the
  board basis is included. The agent can opt in with `allowUnconfirmedMealPlans` on an optimisation
  run (trip → Generate packages → “Include hotels with an unpublished meal plan”); those
  packages carry a warning that the meal plan must be confirmed before quoting.
- Discovered properties are persisted through `upsertProviderProperty`, so they appear in the hotel
  catalogue and can be reused by later searches.
- No scraping of Booking.com pages. Their partner API is not publicly self-serve; Booking.com
  prices arrive through the Google Hotels aggregation.

## Flow

`enquiry → itinerary (with coordinates) → stageFetch → providers in parallel → dedupe → persist →
optimiser → packages`

The ad-hoc `POST /hotel-search` endpoint uses the same provider stack, persists offers, and returns
the merged results.
