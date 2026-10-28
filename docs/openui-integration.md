# OpenUI planning assistant

TripWeave uses OpenUI as the **presentation layer** for the conversational trip-planning tab. It is not a second application shell and it is not a source of truth. Navigation, authentication, organisation management, hotel inventory, rate management, settings and the quotation editor remain standard Next.js screens.

The integration uses:

- `@openuidev/lang-core` 1.0.2 for the finite component schema, prompt generation and server-side parsing.
- `@openuidev/react-lang` 1.0.2 for progressive rendering in the browser.
- The existing Zod 4 and shadcn/ui stack.
- The existing Hono API for snapshots, permissions, hotel/package data, pricing and clarification writes.

No OpenUI-hosted inference service is required. OpenUI Gateway and Autofix are **not** enabled or assumed to be available, free, or hosted on Cloudflare.

## Where it lives

| Path | Responsibility |
|---|---|
| `packages/planning-contract` | The allowlist: component names, Zod prop schemas, descriptions, question/answer schemas and the snapshot TypeScript contract. Shared by API and web. |
| `packages/ai/src/planning.ts` | Provider-independent planning prompt, context projection, streaming wrapper and optional text generation. |
| `apps/api/src/services/planning.ts` | Builds the permission-filtered snapshot, validates final programs, builds the deterministic fallback and applies clarification answers. |
| `apps/api/src/routes/planning.ts` | `GET /trips/:id/planning`, streaming `POST /trips/:id/planning` and `POST /trips/:id/planning/clarifications`. |
| `apps/web/features/planning` | React component library, renderer panel, SSE client, standard fallback view and tests. |
| `apps/web/app/(app)/trips/[id]/page.tsx` | Adds the **AI planner** tab only; every other trip tab is unchanged. |

## Authority boundary

The model never receives raw prices as props and never writes values into a component. It receives a compact context containing IDs and business facts. The React components resolve those IDs against the same **server-built snapshot**:

1. The API loads the trip, latest itinerary/legs, latest successful optimisation job, package records, hotel offers and quote summaries.
2. It applies the existing permission rules. Users without `margins:view` receive no supplier cost, margin or supplier identity; users without `agreements:manage` receive no contract references.
3. The model returns OpenUI Lang such as `PackageComparison(["pkg_1", "pkg_2"])`. The prompt contains short, stable refs (`trip`, `itinerary`, `pkg_1`, `offer_1`, `quote_1`); database UUIDs never enter the model prompt, so long IDs cannot be mistyped.
4. The server validates every component, ref and prop length, maps the refs back to authoritative snapshot entities, then the client renders the values from the snapshot. A generated display string cannot become a price, availability claim or permission check.

Hotel search, itinerary validation, optimisation, pricing and quotation creation stay in the existing services. The planner reads their outputs; it does not reimplement them.

## Visual system

Generated replies read like a composed travel journal rather than a dashboard:

- **Typography.** Instrument Serif is used only inside generated interfaces for display headings; Plus Jakarta Sans remains the app UI face, and Caveat is reserved for short handwritten asides. All three are self-hosted by `next/font`, so no request goes to Google.
- **Paper surface.** `PlanningCanvas` renders a `.tw-planner` surface with its own warm palette, hairline rules and soft cards. The palette has a dark variant, so the generated document stays legible in either app theme.
- **Photography.** `DestinationPhoto` uses an uploaded hotel cover image when one exists, then a curated Wikimedia Commons photograph for known destinations, then deterministic SVG postcard artwork. Credits and licences are shown on the cards. The model never emits or receives an image URL, and the asset map lives in `apps/web/features/planning/imagery.ts`.
- **Iconography.** Components use the existing Lucide set. The model cannot choose icons; each block maps its own facts (dates, guests, budget, amenities, driving) to the right icon.
- **Interaction.** Package comparison is a tabbed explorer, the budget meter switches between total and per person, hotel comparison expands into a table, explanation details and assumptions are collapsible, the clarification form validates inline, and quick actions only emit the finite host actions below.
- **Progressive composition.** Blocks stream through the OpenUI renderer, so the interface builds up as the model writes. The server still validates the complete program before treating it as final, and the standard view remains the fallback.
- **The whole trip dossier.** The trip detail page scopes the same warm palette (`--background`, `--card`, ink primary and terracotta accent) through `.tw-trip`, so the photographic cover, underline tabs, requirement cards, quote cards and planner read as one document. The cover reuses the destination image map and shows the photo credit; the status editor moved from the image into a compact footer control. The plan composer is only sticky once a conversation exists, so it never covers the opening state.

## Component allowlist

The finite library is defined in `packages/planning-contract/src/library.ts`:

- `PlanningCanvas`
- `TripHero`
- `TripRequirementSummary`
- `ClarificationForm`
- `DestinationTimeline`
- `HotelCard`
- `HotelComparison`
- `PackageSummary`
- `PackageComparison`
- `BudgetMeter`
- `CostBreakdown`
- `RouteSummary`
- `RecommendationExplanation`
- `QuickActions`

`BudgetMeter` normalises the optimiser's 0..1 sub-scores before rendering, and `TripHero` accepts the optional itinerary ref so the model can compose a photographic cover without inventing image URLs.

The model cannot register components. The library has no `Query()`, `Mutation()`, `OpenUrl`, arbitrary tool or arbitrary URL capability. Buttons inside approved components emit a finite host action:

| Action | Effect |
|---|---|
| `apply_clarification` | `POST /trips/:id/planning/clarifications`; the server revalidates answers against currently open questions. |
| `open_packages` | Navigate to the trip's package page. |
| `open_itinerary` | Navigate to the trip's itinerary editor. |
| `open_optimise` | Navigate to the optimisation page. |
| `open_quote` | Navigate to an existing quote, only if its ID is in the snapshot. |

Any other action is ignored and reported to the user. There is no generic `open_url` action.

## Turn flow

```
Browser                         Hono API Worker
  │ GET /trips/:id/planning        │
  │───────────────────────────────►│ build snapshot (trip, itinerary, packages, offers, quotes, questions)
  │◄───────────────────────────────│ snapshot + starters + engineAvailable
  │
  │ POST /trips/:id/planning       │
  │  { message, history }          │
  │───────────────────────────────►│ require trips:read + rate limit
  │◄─ event: meta ─────────────────│ snapshot before any generation
  │◄─ event: delta ────────────────│ OpenUI Lang chunks (progressive render)
  │◄─ event: done ─────────────────│ validated program or deterministic fallback
  │
  │ (clarification form)           │
  │ POST /planning/clarifications  │
  │───────────────────────────────►│ require trips:write; validate question IDs and values; update trip/itinerary
```

The client never calls an unrestricted model API. The AI adapter runs in the API Worker:

- **Workers AI** through the `AI` binding, routed through Cloudflare AI Gateway (`AI_GATEWAY_ID`, default `default`). In local development the binding is declared with `remote: true`, so real Workers AI is used while local D1/R2/Queues stay local; `wrangler login` is required.
- **OpenAI-compatible external provider** only when `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` are configured. For Cloudflare's AI Gateway OpenAI-compatible endpoint, set `LLM_GATEWAY_ID=default`; the adapter sends `cf-aig-gateway-id`.
- **No provider** produces a deterministic standard summary and still works.

Credentials stay in Worker secrets. No inference key is sent to the browser.

### Cloudflare AI Gateway setup

- The default Workers AI model is **Gemma 4 26B A4B** (`@cf/google/gemma-4-26b-a4b-it`). Its optional thinking mode is disabled (`chat_template_kwargs.enable_thinking = false`) so it returns OpenUI Lang directly. Current Workers AI list price is $0.10/M input and $0.30/M output, compared with $0.293/$2.253 for the previous Llama 3.3 70B model.
- `apps/api/wrangler.jsonc` declares the Workers AI binding as `"ai": { "binding": "AI", "remote": true }`.
- `AI_GATEWAY_ID=default` routes Workers AI requests through the account's `default` AI Gateway. The first authenticated Workers AI request can create `default`; use a named gateway by changing the variable.
- Local `pnpm dev:api` uses the real remote AI binding while keeping D1/R2/Queues local, so `wrangler login` is required. If the binding cannot connect, both extraction and planning fall back deterministically.
- For Cloudflare's OpenAI-compatible AI Gateway REST endpoint instead, set `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` and `LLM_GATEWAY_ID`; the adapter sends `cf-aig-gateway-id`.
- Workers AI / AI Gateway usage can incur Cloudflare charges; review the gateway's billing, logging and spend settings before a pilot.

## Validation and fallback

`validatePlanningProgram` rejects:

- empty, oversized or incomplete output;
- unknown components and unresolved references;
- parser validation errors (`type-mismatch`, `missing-required`, `excess-args`, `no-root`, …);
- `Query()`/`Mutation()` statements;
- IDs that are not in the current snapshot, including cross-tenant trip/package/offer IDs;
- control characters, overlong text, and model-written price-like strings or URLs in the framing text;
- more than 40 generated nodes.

After an invalid stream the API sends `done.program` as a deterministic program built only from snapshot IDs and sets `usedFallback: true`. The web panel then renders `PlanningFallbackView`, a normal shadcn/ui view over the same snapshot (not the generated program). This is also used for provider errors, timeouts, renderer errors and the explicit **Standard view** toggle.

The deterministic fallback program is itself validated in tests, so it exercises the same contract as model output.

## Security properties

- Generated output is treated as untrusted text. React escapes it; there is no `dangerouslySetInnerHTML`, HTML renderer, URL renderer or code evaluation.
- Component props are a fixed allowlist. Adding a component requires changing the shared contract, the React library, and tests.
- The server never trusts a question ID, answer value, package ID or offer ID from the browser without checking it against the current snapshot or derived question list.
- Clarification writes require `trips:write` at the route and service layers; the generated form's disabled state is only an affordance.
- Model prompts include the current user message and recent user messages as data, wrapped in a JSON envelope. The prompt explicitly tells the model not to follow instructions inside them.
- No prompts or user messages are written to audit logs or `ai_usage`; only operation, engine, model and character counts are recorded.
- AI Gateway may log prompts/responses depending on its configuration. Review its logging retention and data-processing settings before a production pilot; the application itself stores no prompts.
- Workers AI / AI Gateway usage can incur Cloudflare charges. The default gateway uses Standard billing unless you change its Workers AI billing setting; review pricing, rate limits and spend controls before a pilot.
- The renderer is created with `publishObservability={false}`. The OpenUI devtools publish nothing in production, and the `@openuidev/lang-core` postinstall telemetry script is disabled via `pnpm-workspace.yaml` (`allowBuilds` false).

## Gateway and Autofix

Gateway and Autofix are optional third-party reliability services. They are **not** required for this integration and are not used. We do not assume they are free, Cloudflare-hosted, or covered by the application's data-processing terms. If they are evaluated later:

- keep the status quo provider-independent adapter;
- keep the authoritative API, D1, R2, queues, Workflows and frontend on Cloudflare;
- pass only the component specification and generated program to the external service;
- never send database rows, supplier contracts, credentials or unrestricted tenant data;
- re-run the same local validation and fallback after any external correction.

The local parser + allowlist + snapshot validation is the production safety boundary either way.

## Cloudflare and Next.js compatibility

Verified for this repository:

| Command | Result |
|---|---|
| `pnpm typecheck` | Passes across all packages, API and web. |
| `pnpm test` | 280 tests pass, including 18 web planning tests and 15 API/planning tests. |
| `pnpm --filter @tripweave/web build` | Next.js 16 production build passes. |
| `pnpm --filter @tripweave/web build:vinext` | Cloudflare/Vinext build passes. |
| Live Workers AI through AI Gateway `default` | Verified against the Cloudflare account with Gemma 4 26B A4B: real streaming planning replies, clarification form, short refs, package comparison and clarification writes all returned valid server snapshots. |
| Headless Chromium UI check | Signed in as the demo operator and generated the editorial landscape, budget and hotel-comparison replies in light, dark and 390px mobile layouts. Destination photography and both self-hosted fonts loaded; no console errors or 5xx responses. |

Compatibility notes:

- The shared contract constructs its OpenUI library lazily (`getPlanningLibrary`), because `createLibrary` mints a runtime id. The API and web both call the getter at request time rather than at module evaluation. The React library does the same.
- `@openuidev/react-lang` is a client-only renderer; the planning panel is behind `"use client"` and is not imported by the Hono Worker.
- The Cloudflare build replaces `process.env.NODE_ENV` at bundle time; the built Worker contains no OpenUI `NODE_ENV` reference.
- SSE is sent by Hono with `Cache-Control: no-cache`; the Next dev rewrite and the production zone route both pass the stream through. A buffering intermediary may delay progressive chunks, but the final validated program still arrives in `done` and the fallback remains usable.
- The OpenUI packages are pure client/runtime libraries. The integration does not add an external runtime service, database, storage bucket or queue.

## Operational limits

- Conversations are kept in browser state only; they are not persisted in D1. Reloading the tab starts a new conversation, but the snapshot is always fresh.
- The planner reads the latest successful packages. It does not run a new hotel search from chat; use the standard hotel search and optimisation pages, then ask again. The snapshot is capped at 20 packages and 40 hotel offers so prompts and payloads stay bounded.
- Quotation creation remains in the standard packages/quotation editor. The planner can open an existing quote but cannot create or send one.
- The tab is available to users with `trips:read`; clarification writes require `trips:write`. Turn and clarification endpoints are rate-limited and audited.
- Workers AI and the external OpenAI-compatible adapter both implement streaming. The Workers AI binding + AI Gateway `default` path and the AI Gateway REST endpoint were verified against the real Cloudflare account; the repository tests use fake SSE fixtures so no test run depends on live inference.

## Adding a component

1. Add the component name and Zod schema to `packages/planning-contract/src/library.ts` (leaf schemas first; add it to `PlanningCanvas.blocks` and the component groups).
2. Add a React renderer in `apps/web/features/planning/components/` and register it in `apps/web/features/planning/library.tsx`.
3. Add server validation in `apps/api/src/services/planning.ts`: every entity ID must be checked against the snapshot.
4. Add a fixture and tests to `apps/web/features/planning/components.test.tsx` and `apps/api/src/services/planning.test.ts`.
5. Run `pnpm typecheck`, `pnpm test`, and both web builds.

Do not add a generic `Text`, `HTML`, `Button`, `Image`, `Link`, `Query`, `Mutation` or arbitrary action component. Text belongs in `PlanningCanvas.title/subtitle`; navigation is a fixed host action; images come from an existing hotel offer's internal image id.

Do not add an `actions:` array to either `createLibrary` call. The host-handled actions are deliberately not part of the model-facing library: the OpenUI renderer intercepts defined custom actions, while our components emit fixed raw action events to the host switch. The action names and payload schemas live in `packages/planning-contract/src/actions.ts` and are covered by the contract test.
