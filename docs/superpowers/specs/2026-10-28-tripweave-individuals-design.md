# TripWeave for Individuals — Design

**Date:** 2026-10-28
**Status:** Approved by the product owner's instruction to plan and implement ("yes" to proceeding without further questions).

## Intent

TripWeave already turns a tour operator's enquiry into optimised, priced accommodation
packages. This work adds the other side of the same product: a personal trip planner for
one traveller and the people they travel with. The individual product must feel like a
travel journal, not a smaller operator dashboard, while reusing the proven trip,
itinerary, routing, optimisation and OpenUI machinery underneath.

The promise: **describe the trip you want; get a day-by-day plan you can shape, cost,
pack for, and share.**

## Goals

1. A public consumer entry point at `/travel` and a personal workspace at `/travel/trips`.
2. Traveller self-registration and sign-in, separate from organisation registration.
3. Create a trip from a natural-language idea plus structured basics (dates, party,
   budget, destinations, interests).
4. A trip workspace with:
   - editorial overview and countdown;
   - AI planning conversation rendered through OpenUI;
   - an editable day-by-day itinerary with map and validation;
   - stay options produced by the existing optimisation engine and package pricing;
   - a budget tracker with paid/unpaid items and progress against the trip budget;
   - an AI-free, deterministic packing checklist with activity-aware additions;
   - private notes;
   - a read-only public share link with print/save-as-PDF.
5. A traveller profile (display name, home, currency, interests, pace, dietary notes) and
   password change.
6. Destination discovery with free Wikipedia place photography and extracts, and a
   one-click "plan this trip" handoff.
7. Preserve the existing operator product. Consumer pages live in their own shell and
   personal workspaces cannot reach the operator UI.

## Non-goals

- Real booking, payment, cancellation or supplier reservation. Stay prices remain
  indicative or live-checked according to the existing supplier rules; nothing is ever
  presented as a confirmed booking.
- Social features (following travellers, comments, public profiles).
- Native mobile apps.
- Multi-user collaboration on a personal trip (trip sharing is read-only).
- Storing AI prompts or chat transcripts server-side. The planner conversation is kept in
  the browser (localStorage for the traveller surface), consistent with the existing
  operator planner.
- Replacing the operator quotation workflow.

## Decisions

### One identity, two workspace kinds

A traveller registration creates a **personal workspace**: an `organizations` row with
`account_kind = 'individual'`, a `users` row, a `staff` membership and a one-seat
subscription. Using a tenant keeps every existing `organization_id NOT NULL` constraint,
tenant-scoped repository and permission check intact.

`staff` is used deliberately: it has `trips:read/write`, `optimisation:run`,
`packages:write`, `hotels:read`, but **not** `margins:view` or `agreements:manage`. The
existing package presentation therefore redacts supplier cost, margin and contract data
from personal workspaces without a second pricing path.

The session exposes `accountKind`. The operator layout redirects individual workspaces to
`/travel/trips`; the traveller layout refuses business workspaces. The API adds
`requireTraveler`, which is `requireTenant` plus an `account_kind = 'individual'` check.

### Reuse the trip engine, not a parallel data model

Personal trips are `trip_requests`; days are `itinerary_stops`; plans come from the
existing itinerary engine; stay options come from the existing optimisation job and
package tables. The consumer UI calls the same endpoints for trips, itinerary,
optimisation and packages. This keeps one source of truth for dates, pricing and
permissions.

Only the consumer-specific data is new:

- `trip_budget_items` — traveller-entered costs.
- `trip_packing_items` — checklist items and checked state.
- `trip_notes` — private notes.
- `trip_shares` — hashed public share tokens with expiry and a budget-visibility flag.

### AI output is always OpenUI

The only model-authored traveller output is the planning conversation. It uses the
existing `/api/v1/trips/:id/planning` SSE endpoint and the shared OpenUI allowlist. The
consumer panel filters the operator-only quote action and remaps navigation to the
traveller workspace. A deterministic fallback view is preserved.

Structured extraction (turning the traveller's idea into dates, party and stops) is an
input parser, not a generated interface. Packing suggestions are deterministic and make no
claims about weather or availability.

### Public sharing

A share is a random 32-byte token. Only its SHA-256 hash is stored. The public view is an
allow-list: title, dates, party, itinerary and, only when the traveller opts in, a budget
summary. Notes, packing, costs, supplier identities and account details are never
included. Expired and revoked links return the same not-found response.

### Visual language

The traveller surface uses a warm paper palette scoped under `.tw-travel`, with Instrument
Serif display type, Caveat asides and the existing photography/place lookup. It is
light-first even when the operator app is dark. The public landing, auth pages, trip
dossier and planner read as one travel journal.

## User flows

### Sign up and plan

`/travel` → `Start planning` → `/travel/join` → personal workspace created → wizard at
`/travel/trips/new` → trip created → optional AI extraction of the idea → deterministic
overnight-plan suggestion → trip overview → AI planner or itinerary editor.

### Trip workspace

`/travel/trips/:id` is a dossier with a cover and tabs: Overview, Plan, Itinerary, Stays,
Budget, Packing, Notes, Share. The tab layout stays mounted while the content changes.

### Stays

The traveller confirms the itinerary, then asks the existing optimisation engine for
`best_value` and `budget_explorer` packages. Results show hotel names, destinations,
ratings, selling prices and verification state. "Add stay estimate" writes the package
selling price into the budget as a stay item. No booking action is offered.

### Share and print

The traveller creates a link with an expiry and an "include budget" choice. `/t/:token`
renders the shared dossier read-only. The print stylesheet strips navigation and buttons,
so the browser's print-to-PDF produces a clean document.

## Constraints

- Node 22+, pnpm, Next.js 16 App Router, Hono on Cloudflare Workers, D1, strict TypeScript.
- No new runtime service or inference provider.
- Monetary values are integer minor units; calendar dates are `YYYY-MM-DD`.
- Every new API route validates its body and is rate-limited where writes are possible.
- Every new private query is scoped by `organization_id` from the session.
- Generated UI text never carries prices, ratings or URLs; those come from snapshots.
- Existing operator tests and routes must remain green.

## Success criteria

- A new traveller can register, create a trip from an idea, edit the itinerary, see stay
  options (when a provider is configured), track a budget, generate and check a packing
  list, write notes, share the trip, and print it.
- A business account cannot open traveller data APIs; a traveller cannot read another
  traveller's trip data or share token.
- `pnpm test`, `pnpm typecheck` and the web production build pass.
- The operator app still works and is still reachable at `/dashboard` and `/operators`
  (the existing marketing landing remains available).
