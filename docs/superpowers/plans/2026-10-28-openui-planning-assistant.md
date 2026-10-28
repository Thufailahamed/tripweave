# OpenUI Planning Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-authoritative, allowlisted OpenUI generative interface to the TripWeave trip-planning experience, with streaming, structured clarification, and deterministic fallback.

**Architecture:** A new `@tripweave/planning-contract` package defines the finite component allowlist, prop schemas, actions, and clarification question/answer schemas shared by the API and web app. The Hono API builds a permission-filtered snapshot from existing trip, itinerary, package, hotel-offer and pricing services, generates OpenUI Lang via a provider-independent server-side adapter, validates the final program against the contract and snapshot, and falls back to a deterministic program. The Next.js client renders the validated stream with `@openuidev/react-lang`, resolving all prices/hotels/routes from the trusted snapshot rather than model output.

**Tech Stack:** TypeScript, React 19, Next.js 16, Hono, Zod 4, `@openuidev/lang-core` 1.0.2, `@openuidev/react-lang` 1.0.2, shadcn/ui primitives already in `apps/web/components/ui`.

**Spec:** This plan implements the OpenUI integration requirements supplied by the user (OpenUI Generative Interface Integration). The architecture and security notes are recorded in `docs/openui-integration.md` (Task 7).

## Global Constraints

- OpenUI is a presentation layer only. Prices, availability, permissions, bookings and quotation creation remain server-authoritative.
- Generated components may only use the finite allowlist defined in `packages/planning-contract`.
- Generated output is untrusted. Validate component names, props, IDs, actions, lengths, and submitted values server-side.
- No `Query()`, `Mutation()`, `OpenUrl`, arbitrary URLs, arbitrary tools, SQL, or privileged operations in generated programs.
- Keep inference credentials server-side. Support Workers AI and an OpenAI-compatible external provider; neither is required.
- Do not use OpenUI Gateway or Autofix. They are optional third-party services and are not assumed free or Cloudflare-hosted.
- If generation fails, render a normal, readable shadcn/ui fallback with the same authoritative data.
- Keep navigation, auth, organisation, hotel inventory, rate management, settings and the quotation editor on standard Next.js pages.
- Preserve existing API response/error conventions and tenant/permission enforcement.
- All visible money uses integer minor units and `money()`; dates use `formatDate()`/`dateRange()`.
- Every input has a label, every async state has `role="status"`/`aria-live`, and controls are keyboard operable.

## Review Focus

- A malformed or partial model stream must never crash the page or show invented prices; it must degrade to the deterministic fallback.
- A generated program that references another tenant's trip/package/hotel ID must be rejected before render.
- A read-only user must not be able to submit clarification answers through the generated form; the API must enforce `trips:write`.
- A stream disconnect or provider timeout after the first chunk must leave a readable error/retry state, not a blank panel.
- Long or hostile model strings (HTML, control characters, 10k characters) must render as plain text and never become HTML, URLs, or actions.

---

### Task 1: Shared planning contract and allowlist

**Files:**
- Create: `packages/planning-contract/package.json`
- Create: `packages/planning-contract/tsconfig.json`
- Create: `packages/planning-contract/src/index.ts`
- Create: `packages/planning-contract/src/questions.ts`
- Create: `packages/planning-contract/src/snapshot.ts`
- Create: `packages/planning-contract/src/library.ts`
- Create: `packages/planning-contract/src/actions.ts`
- Test: `packages/planning-contract/src/contract.test.ts`

**Interfaces:**
- Consumes: `zod`, `@openuidev/lang-core`, `@tripweave/shared` domain types.
- Produces:
  - `PLANNING_COMPONENT_NAMES` readonly tuple.
  - `planningComponents` (lang-core `DefinedComponent[]` with noop renderers).
  - `getPlanningLibrary()`, `getPlanningLibrarySpec()`, `getPlanningJSONSchema()` (lazy getters; Cloudflare Workers must not construct a crypto-backed library at module scope).
  - `planningQuestionSchema`, `PlanningQuestion`, `PlanningAnswer`, `clarificationSubmissionSchema`.
  - `PlanningSnapshot` TypeScript type (trip, questions, itinerary, packages, offers, quotes, permissions, sources).
  - `PLANNING_ACTIONS` (`apply_clarification`, `open_packages`, `open_itinerary`, `open_optimise`) and `isPlanningAction`.
  - `languageName`-safe text schemas (trimmed, max lengths, no control characters).

- [ ] **Step 1: Write the failing contract tests**

Assert the allowlist is exactly the eleven components, every schema is an object, no component prop is named `action`/`url`/`href`, the generated prompt contains no `Query`/`Mutation`/`OpenUrl` text, and `clarificationSubmissionSchema` rejects unknown question IDs, more than 20 answers, and control characters.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run packages/planning-contract/src/contract.test.ts`
Expected: FAIL because the package does not exist.

- [ ] **Step 3: Implement the schemas and library**

Components (all props are authoritative IDs or short display text):
`PlanningCanvas`, `TripRequirementSummary`, `ClarificationForm`, `DestinationTimeline`, `HotelCard`, `HotelComparison`, `PackageSummary`, `PackageComparison`, `CostBreakdown`, `RouteSummary`, `RecommendationExplanation`.

Use `createLibrary({ root: "PlanningCanvas", components, componentGroups })` from `@openuidev/lang-core` with a noop renderer for each definition. Define leaf schemas first, then `PlanningCanvas` with `z.array(z.union([...leaf.refs]))`. Component descriptions must tell the model to use IDs from the supplied context only. Wrap library construction in a lazy getter because `createLibrary` mints a runtime id and Workers module scope must not perform that work.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run packages/planning-contract/src/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/planning-contract
git commit -m "feat(planning): add allowlisted OpenUI contract"
```

### Task 2: Provider-independent streaming adapter and planning prompt

**Files:**
- Modify: `packages/ai/package.json`
- Modify: `packages/ai/src/clients.ts`
- Create: `packages/ai/src/planning.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/planning.test.ts`

**Interfaces:**
- Consumes: `@tripweave/planning-contract` spec and snapshot type, existing `LlmClient`.
- Produces:
  - `LlmClient.stream?(args: { system: string; user: string; signal: AbortSignal; maxTokens?: number }): AsyncIterable<string>`
  - `LlmClient.generate?(args: { system: string; user: string; signal: AbortSignal; maxTokens?: number }): Promise<string>`
  - `buildPlanningPrompt(snapshot: PlanningSnapshot): { system: string; user: string }` using `generateSystemPrompt({ library: getPlanningLibrarySpec(), promptOptions })`.
  - `streamPlanningProgram(client, snapshot, onChunk, signal): Promise<{ text, engine, model, warnings }>` with deterministic fallback signal.

- [ ] **Step 1: Write failing tests for streaming and prompt safety**

Test that the prompt includes the allowlist and snapshot IDs, excludes `Query`, `Mutation`, and `OpenUrl`, and that the fake stream concatenates chunks. Test that a stream error after a partial chunk throws a typed error so the route can fall back.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run packages/ai/src/planning.test.ts`
Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement streaming in both clients**

Workers AI: call `ai.run(model, { messages, stream: true, max_tokens, temperature: 0 })`, parse SSE `data: {...}` frames, yield `response` strings. External OpenAI-compatible: POST `stream: true`, parse `choices[0].delta.content`, stop at `[DONE]`. Both implement `generate` using non-streaming calls for the fallback path.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run packages/ai/src/planning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai
git commit -m "feat(ai): stream OpenUI planning programs"
```

### Task 3: API planning snapshot, validation and fallback service

**Files:**
- Create: `apps/api/src/services/planning.ts`
- Create: `apps/api/src/services/package-presentation.ts`
- Create: `apps/api/src/services/party.ts`
- Modify: `apps/api/src/routes/optimisation.ts` (use package presentation service)
- Modify: `apps/api/src/routes/trips.ts` (use party service)
- Test: `apps/api/src/services/planning.test.ts`

**Interfaces:**
- Consumes: `trips`, `quotes`, `inventory` repositories; `presentPackage`; `computeStopLegs`; `buildStops`; `apply`-style trip updates; planning contract.
- Produces:
  - `buildPlanningSnapshot(ctx, tripId): Promise<PlanningSnapshot>`.
  - `buildPlanningPromptContext(snapshot): Record<string, unknown>` (IDs and facts only).
  - `validatePlanningProgram(program, snapshot): { ok: true } | { ok: false; errors: string[] }` using `createParser(getPlanningJSONSchema(), "PlanningCanvas")`, then ID/action/meta checks.
  - `buildFallbackProgram(snapshot): string` using only IDs from the snapshot.
  - `applyClarificationAnswers(ctx, trip, submission): Promise<{ snapshot; applied: string[] }>`.
  - `planningStarters(snapshot): { label: string; prompt: string }[]`.

- [ ] **Step 1: Write failing unit/integration tests**

Cover: snapshot excludes internal costs without `margins:view`; fallback program parses and validates; unknown component / unknown package ID / `Query()` / malicious 10k string are rejected; clarification answers update dates/party/budget and ignore unknown question IDs; read-only user cannot submit.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm vitest run apps/api/src/services/planning.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service**

Refactor `presentList` into `package-presentation.ts` without changing response shapes. Move room allocation into `party.ts`. Snapshot includes only the latest successful job's packages, deduplicates hotel offers, includes itinerary legs and quote summaries, and strips internal costs unless permitted. Question derivation uses current trip fields and the saved parse result, with stable IDs (`arrival_date`, `departure_date`, `adults`, `children`, `child_ages`, `budget_amount`, `budget_currency`, `budget_scope`, `confirm_suggested_plan`). Clarification application validates against the current question list and writes via `trips.updateTrip` and, for a confirmed plan, `trips.saveItinerary`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run apps/api/src/services/planning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services apps/api/src/services/planning.test.ts apps/api/src/routes
git commit -m "feat(api): build authoritative planning snapshots"
```

### Task 4: Hono planning routes and SSE turn

**Files:**
- Create: `apps/api/src/routes/planning.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/planning.test.ts`

**Interfaces:**
- Consumes: Task 3 service, Task 2 `streamPlanningProgram`, auth middleware, `streamSSE` from `hono/streaming`.
- Produces:
  - `GET /api/v1/trips/:id/planning` → `{ snapshot, starters, allowlist, engineAvailable }`.
  - `POST /api/v1/trips/:id/planning` → SSE events `meta`, `delta`, `done`, `error`; request body `{ message, history? }`.
  - `POST /api/v1/trips/:id/planning/clarifications` → `{ applied, snapshot, warnings }`.

- [ ] **Step 1: Write failing API tests**

Using `Harness`, seed a trip and hotel/optimisation data. Assert tenant scoping, 403 for missing permissions, no-LLM SSE fallback with a valid program, valid fake stream used, malformed/unknown-component stream rejected with fallback, and clarification POST rejects cross-tenant/unknown answers. Assert no `Query`/`Mutation` statements reach the client.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run apps/api/test/planning.test.ts`
Expected: FAIL because the routes are not mounted.

- [ ] **Step 3: Implement the routes**

Mount in `createApp` after `tripRoutes`. Use `requirePermission("trips:read")` for GET/turn, `"trips:write"` for clarifications, and `rateLimit` for turns. Set `Cache-Control: no-store`. Use `streamSSE`; send snapshot metadata before generation. On any validation failure, emit the deterministic fallback and a `usedFallback: true` flag. Record `ai_usage` with operation `planning_turn` and never log prompts or user text.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run apps/api/test/planning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/planning.ts apps/api/src/app.ts apps/api/test/planning.test.ts
git commit -m "feat(api): add streaming planning assistant routes"
```

### Task 5: Web OpenUI component library

**Files:**
- Create: `apps/web/features/planning/types.ts`
- Create: `apps/web/features/planning/library.tsx`
- Create: `apps/web/features/planning/context.tsx`
- Create: `apps/web/features/planning/components/canvas.tsx`
- Create: `apps/web/features/planning/components/requirements.tsx`
- Create: `apps/web/features/planning/components/clarification.tsx`
- Create: `apps/web/features/planning/components/timeline.tsx`
- Create: `apps/web/features/planning/components/hotels.tsx`
- Create: `apps/web/features/planning/components/packages.tsx`
- Create: `apps/web/features/planning/components/costs.tsx`
- Create: `apps/web/features/planning/components/routes.tsx`
- Test: `apps/web/features/planning/components.test.tsx`

**Interfaces:**
- Consumes: Task 1 schemas/definitions, `@openuidev/react-lang`, shadcn components, `useCan`, `money`, `formatDate`, `formatDateTime`.
- Produces:
  - `planningLibrary` (React library matching `planningLibrarySpec` exactly).
  - `PlanningProvider` / `usePlanningSnapshot`.
  - `PlanningFallbackView` (standard shadcn render without OpenUI).
  - Components resolve IDs from the snapshot and show a recoverable empty state when an ID is missing.

- [ ] **Step 1: Write failing component tests**

Render a valid program through `Renderer` with a fixture snapshot and assert the hotel name, price and route text appear. Render an unknown ID and assert a readable "no longer available" message. Render a malformed program and assert the fallback renders. Submit the clarification form and assert the allowlisted action payload. Check every input has an accessible label and status messages use `role="status"`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run apps/web/features/planning/components.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the React library**

Build with existing `Card`, `Badge`, `Alert`, `Button`, `Field`, `Input`, `Select`, `Checkbox`, `CoverImage`, `money`, `formatDate`, `formatDateTime`, `mealLabel`, `minutesLabel`, `titleCase`. Never compute prices, availability or permissions. Use `aria-labelledby` on cards/tables, `<caption className="sr-only">` on comparison tables, and `role="status"` for empty/loading/feedback text. `ClarificationForm` uses `useTriggerAction()` with `{ type: "apply_clarification", params: { answers } }` and disables submit when `canWriteTrips` is false.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run apps/web/features/planning/components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/planning
git commit -m "feat(web): add allowlisted OpenUI planning components"
```

### Task 6: Web planning panel, streaming and trip tab

**Files:**
- Create: `apps/web/features/planning/use-planning-stream.ts`
- Create: `apps/web/features/planning/planning-panel.tsx`
- Modify: `apps/web/app/(app)/trips/[id]/page.tsx` (add `AI planner` tab)
- Modify: `apps/web/lib/api.ts` only if a shared stream helper is needed
- Test: `apps/web/features/planning/planning-panel.test.tsx`

**Interfaces:**
- Consumes: Task 4 routes, Task 5 library/provider/fallback, `apiGet`, `useCan`, `toast`.
- Produces:
  - `PlanningPanel` client component.
  - `usePlanningStream` returns `{ snapshot, program, isStreaming, error, usedFallback, send, retry, stop }`.
  - SSE parser for POST responses with chunk buffering and `AbortController`.

- [ ] **Step 1: Write failing panel tests**

Mock `fetch` with SSE chunks and assert progressive program text, meta snapshot hydration, done state, error/retry, action routing (`open_packages` pushes only the trip packages route; unknown action is ignored), and fallback rendering when the stream fails.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run apps/web/features/planning/planning-panel.test.tsx`
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the panel**

Start with GET snapshot + starters. Composer validates 1–4000 chars and `Enter`/`Shift+Enter` behaviour. Render each assistant turn with `<Renderer>` wrapped in `PlanningProvider`, `publishObservability={false}`, `onError` collection and a "Standard view" toggle. Show `aria-live` streaming status and an `AbortController` stop button. Handle built-in `continue_conversation` and custom actions through a finite switch. On fallback, show `Alert` and `PlanningFallbackView`. Add the tab to the existing trip page without changing other tabs.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run apps/web/features/planning/planning-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/planning apps/web/app/\(app\)/trips/\[id\]/page.tsx
git commit -m "feat(web): add streaming OpenUI planning tab"
```

### Task 7: Documentation, compatibility verification and full checks

**Files:**
- Create: `docs/openui-integration.md`
- Modify: `README.md` (documentation table entry)
- Modify: `vitest.config.ts` (include web tests and jsdom environment)
- Modify: `apps/web/package.json` (test dependencies if needed)
- Modify: `pnpm-workspace.yaml` (`allowBuilds` false for `@openuidev/lang-core`)

- [ ] **Step 1: Document the integration**

Cover the allowlist, snapshot/authority boundary, SSE flow, validation and fallback, action handling, AI provider configuration, prompt-injection handling, Gateway/Autofix evaluation (not used, not required, external and not assumed free/Cloudflare-hosted), Cloudflare placement, and how to add a component (contract → React renderer → tests).

- [ ] **Step 2: Configure test environment**

Add `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, and `jsdom` as web dev dependencies. Update root Vitest include to `apps/web/**/*.test.{ts,tsx}` and set `environmentMatchGlobs: [["apps/web/**", "jsdom"]]`. Add a setup file for jest-dom. Add `"test": "vitest run"` to the web package.

- [ ] **Step 3: Run full verification**

Run:
```bash
pnpm typecheck
pnpm test
pnpm --filter @tripweave/web build
pnpm --filter @tripweave/web build:vinext
```
Expected: all commands exit 0. If the Cloudflare/Vinext build fails on a Node-only OpenUI import, add a targeted client boundary or alias rather than weakening server validation. Record the exact commands and results in `docs/openui-integration.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/openui-integration.md README.md vitest.config.ts apps/web/package.json pnpm-workspace.yaml
git commit -m "docs: document OpenUI planning integration"
```
