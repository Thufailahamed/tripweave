# TripWeave for individual travellers

TripWeave's traveller surface is a personal trip planner at `/travel`. It reuses the same
trip, itinerary, routing, optimisation and OpenUI machinery as the operator product, but
keeps personal trips in a separate, restricted workspace and presents them as a travel
journal rather than an operations dashboard.

## Workspace model

A traveller registration creates:

- one `organizations` row with `account_kind = 'individual'`;
- one `users` row;
- one `staff` membership;
- one one-seat subscription;
- a `traveler` settings object (home city, country, currency, interests, pace, dietary
  notes) and the default `pricing` configuration.

`staff` deliberately has `trips:read/write`, `optimisation:run`, `packages:write` and
`hotels:read` but **not** `margins:view` or `agreements:manage`. The existing package
presentation therefore withholds supplier cost, margin and contract data automatically.
The operator customer and quotation routers additionally require a business workspace, so
a personal account cannot use TripWeave to email arbitrary customers or send quotations.

The session exposes `organization.accountKind`. The operator layout redirects an
individual workspace to `/travel/trips`, and the traveller layout refuses a business
workspace. `requireTraveler` protects every `/api/v1/traveler/*` route; a business account
receives 403.

## Routes

| Route | Purpose |
|---|---|
| `/travel` | Public traveller landing |
| `/travel/join` | Create a personal workspace |
| `/travel/signin` | Traveller sign-in (shared password/MFA form) |
| `/travel/trips` | Dashboard, next trip, trip cards, quick start |
| `/travel/trips/new` | Trip wizard (idea, dates, party, places, budget, pace, interests) |
| `/travel/trips/:id` | Trip overview, countdown, route, budget/packing notes, archive |
| `/travel/trips/:id/plan` | OpenUI planning conversation |
| `/travel/trips/:id/itinerary` | Editable stops, activities, notes, validation and map |
| `/travel/trips/:id/stays` | Optimisation results, stay comparison, budget handoff |
| `/travel/trips/:id/budget` | Budget items, paid state, trip budget comparison |
| `/travel/trips/:id/packing` | Deterministic generated checklist and checked state |
| `/travel/trips/:id/notes` | Private notes |
| `/travel/trips/:id/share` | Create/rotate/revoke share links, choose expiry and budget visibility |
| `/travel/discover` | Wikipedia place guides and one-click trip starts |
| `/travel/profile` | Traveller details, currency, interests, password, verification |
| `/t/:token` | Public read-only shared trip, printable |

The operator product is unchanged at `/dashboard`, `/trips`, `/quotes`, `/hotels` and the
platform admin portal.

## New data

Migration `0010_traveler.sql` adds:

- `organizations.account_kind` (`business`/`individual`).
- `trip_budget_items` — label, category, amount in minor units, currency, paid state.
- `trip_packing_items` — label, category, checked state.
- `trip_notes` — private note body.
- `trip_shares` — SHA-256 token hash, expiry, `include_budget`, revocation, view count.

Trips themselves remain `trip_requests`; days remain `itinerary_stops`; stay packages
remain `candidate_combinations`. There is no second trip model.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register-traveler` | Create the personal workspace + session |
| `GET/PATCH` | `/api/v1/traveler/profile` | Traveller details |
| `GET/POST` | `/api/v1/traveler/trips/:id/budget` | List/create budget items |
| `PATCH/DELETE` | `/api/v1/traveler/trips/:id/budget/:itemId` | Update/delete a budget item |
| `GET/POST` | `/api/v1/traveler/trips/:id/packing` | List/create packing items |
| `PATCH/DELETE` | `/api/v1/traveler/trips/:id/packing/:itemId` | Check/update/delete |
| `POST` | `/api/v1/traveler/trips/:id/packing/generate` | Add missing activity-aware items |
| `POST` | `/api/v1/trips/:id/itinerary/activities` | Merge a planner day's activities into a chosen stop |
| `GET/POST` | `/api/v1/traveler/trips/:id/notes` | List/create notes |
| `PATCH/DELETE` | `/api/v1/traveler/trips/:id/notes/:noteId` | Update/delete a note |
| `GET/POST` | `/api/v1/traveler/trips/:id/shares` | List active shares / rotate a link |
| `DELETE` | `/api/v1/traveler/trips/:id/shares/:shareId` | Revoke a link |
| `GET` | `/api/v1/public/trips/:token` | Allow-listed public trip view |

All private routes are scoped by the session organisation. Write routes are rate-limited;
read routes rely on the session scope and the trip ownership check. A share token is 32
random bytes; only its SHA-256 hash is stored, and the URL is shown once. Expired, revoked
and unknown tokens return the same 404.

## Trip creation flow

1. `POST /trips` with the trip-request contract (whole-trip budget, party, optional
   dates). Dates may be left blank; the parser can fill them from the idea.
2. If the idea is at least ten characters, `POST /trips/:id/parse` with `apply: true`.
   The parser is the existing Workers AI/OpenAI-compatible/rule fallback path.
3. If no itinerary exists, both dates are known and places were given,
   `POST /trips/:id/itinerary/suggest`, then `PUT /trips/:id/itinerary` with the
   deterministic suggestion. With missing dates the trip is still created and the
   traveller is told what to add.
4. Once the trip exists, a parser or route-draft failure is a warning, not a lost trip.

The wizard never treats a suggested route as confirmed. The itinerary editor and the
Stays page both expose an explicit confirm action.

## OpenUI planner

The planner uses the existing `/api/v1/trips/:id/planning` SSE endpoint and the shared
OpenUI allowlist. Traveller mode:

- filters the `open_quote` action and sets `canCreateQuotes` false before rendering;
- routes `open_packages` and `open_optimise` to `/travel/trips/:id/stays`;
- routes `open_itinerary` to `/travel/trips/:id/itinerary`;
- uses the same deterministic fallback program when generation is unavailable or invalid;
- stores the last 20 conversation turns in browser `localStorage` per trip. The server
  still does not persist prompts or transcripts.

Structured parsing (free text → dates/party/stops) is an input parser, not a generated
interface. Packing suggestions are deterministic. Every model-authored user-visible reply
goes through OpenUI.

### Applying a generated day

`DayPlan` cards and `DayBoard` rows show **Add to itinerary** on a traveller plan. The
button opens a stop picker; the reader chooses where the day belongs. The API endpoint
`POST /trips/:id/itinerary/activities` validates that the stop is in that trip, merges
the activities case-insensitively, ignores duplicates, saves a new itinerary version and
preserves the route's `draft`/`suggested`/`confirmed` status. Dates, hotels and the rest
of the route are untouched. The model cannot decide the stop or mutate the itinerary
directly.

## Stays and money

The Stays page runs the existing optimisation pipeline with the `best_value` and
`budget_explorer` objectives. Prices come from the existing package presentation, so
personal workspaces never see supplier cost or margin. A package with no selling price
cannot create a budget item. Mock/illustrative offers are labelled and cannot be mistaken
for a live booking. Nothing in the traveller product books a room.

## Packing

`apps/api/src/services/traveler-packing.ts` builds the list deterministically. It reacts
to trip length and words in the itinerary (hike, beach/swim, temple, safari) and always
includes documents, medication, chargers and a reusable bottle. Regenerating adds only
missing labels, preserving checked state. No weather or availability claims are made.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm --filter @tripweave/web build
API_BASE_URL=http://localhost:8787 node scripts/traveler-smoke.mjs
node scripts/traveler-ui-smoke.mjs http://localhost:3000
```

`traveler-smoke.mjs` registers a disposable traveller, creates a trip and itinerary, adds
budget/packing/notes, shares it, reads it anonymously and revokes the link. The UI smoke
drives the same flow in headless Chromium, including the planner, stays, itinerary,
discover and profile pages, then signs out and back in.

## Limitations

- Chat history is browser-local and capped at the last 20 turns; it does not sync devices.
- No booking, payment or supplier reservation exists.
- Stay results need an enabled provider (Google Hotels/SerpApi, internal inventory, or the
  labelled mock provider). With no provider the job fails or returns infeasible honestly.
- One personal workspace per account. Business users who want a personal space should use
  a separate traveller account.
- Trips can be archived but not permanently deleted from the traveller UI.
- Budget items are stored in the trip currency. If currencies diverge, totals are not
  converted and the UI warns instead of silently adding unlike amounts.
- The country selector is a practical shortlist; the API accepts any ISO-3166 alpha-2 code.
- Wikipedia place extracts/photographs are public reference data and may be missing for
  small places; the UI falls back to deterministic postcard art.
