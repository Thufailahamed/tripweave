# Frontend conventions (apps/web)

Next.js App Router, React 19, Tailwind v4, Radix-based primitives, TanStack Query/Table, React Hook Form + Zod.

## Rules that are NOT negotiable
1. **No fake data.** Every number shown comes from the API. Empty states are real empty states. Illustrative/mock supplier data is always labelled (`offer.isMock`).
2. **No client-side business logic.** Never compute prices, margins, totals, permissions or availability in the browser. Display what the API returns. Formatting only (`money()`, `formatDate()` in `lib/utils.ts`).
3. **Every visible control works.** No decorative buttons. Every form validates (use the Zod schemas from `@tripweave/shared` where they exist) and shows field errors (`ApiError.fieldErrors`) plus a top-level `Alert` for the message. Every filter changes the data. Every save persists.
4. **Handle all four states** for each query: loading (`LoadingBlock`/`Skeleton`), error (`ErrorState` with retry), empty (`EmptyState` with a next action), data.
5. **Permissions**: gate *affordances* with `useCan()` (`lib/session.tsx`). The API enforces everything independently; handle 403/404 gracefully. Internal margins/costs are only returned by the API when the user has `margins:view` — render them only when present (`!== undefined`).
6. **Accessibility**: semantic HTML, labels on every input (`Field`), keyboard-operable rows/buttons, visible focus (already styled), `aria-live`/`role="status"` for async progress, colour never the only signal (badges carry text).
7. **Mobile**: layouts must work at 360px (no horizontal page scroll; tables scroll inside their card). The public client quote page (`/q/[token]`) is mobile-first.
8. **Money** is integer minor units everywhere. Use `MoneyInput` for entry and `money(minor, currency)` for display.
9. After mutations call `queryClient.invalidateQueries` for affected keys and `toast.success/error` (sonner). Destructive actions use `ConfirmDialog`.
10. Do not add dependencies. Allowed already: leaflet (client-only, `dynamic(() => import(...), { ssr: false })`, import `leaflet/dist/leaflet.css` inside the client map component), recharts.

## Building blocks (read these files first)
- `lib/api.ts` — `apiGet/apiPost/apiPut/apiPatch/apiDelete/apiList/apiBlob/openBlob`, `ApiError`, `errorMessage`. All paths are relative to `/api/v1`.
- `lib/session.tsx` — `useSession()`, `useCan()`. `lib/utils.ts` — `cn, money, formatDate, dateRange, percentFromBp, titleCase, mealLabel, nightsLabel, minutesLabel, toMinor, fromMinor`.
- `components/ui/*` — `Button` (variants default/accent/outline/secondary/ghost/destructive/link, `loading`), `Input/Textarea/Select/Checkbox/Switch/Field/MoneyInput` (form.tsx), `Card*, Badge, StatusBadge, Alert, Skeleton, LoadingBlock, EmptyState, ErrorState, Stat, PageHeader, Separator` (card.tsx), `Dialog*, ConfirmDialog, Tabs*, DropdownMenu*` (overlay.tsx), `DataTable, Pagination` (data-table.tsx).
- `components/app-shell.tsx` — sidebar/nav (already lists all routes; do not edit unless a route is missing).
- Shared domain types/constants/schemas: `@tripweave/shared` (e.g. `MEAL_PLAN_LABELS`, `OBJECTIVE_LABELS`, `HOTEL_CATEGORIES`, `QUOTE_TRANSITIONS`, `tripRequestSchema`, `propertySchema`, `ratePlanSchema`, `rateRuleSchema` …).
- API contract: read `apps/api/src/routes/*.ts` and `packages/shared/src/schemas.ts`. Responses are `{ data }` or `{ data: [...], meta }` (use `apiList`). Errors are `{ error: { code, message, details, requestId } }`.

## Style
Editorial-travel + precise business software: forest green `primary`, warm paper `background`, restrained gold `accent`. Headings use `font-display` (already applied to h1–h3). Use `PageHeader` at the top of each page, `Card` for panels, `tw-num` class for tabular numbers. No gradients/blobs/glass; no giant hero sections inside the app.

## File ownership
Each feature owns its folders (`app/(app)/<route>/…`, `features/<name>/…`). Do not edit files you do not own; if you need a new shared helper, add a NEW file under `features/<name>/` or `lib/<name>.ts` with a unique name.

## Verification
`cd apps/web && npx tsc -p tsconfig.json --noEmit` (ignore errors in files you do not own — other agents are editing concurrently). Do not start Next dev/build servers. A local API is running at http://localhost:8787 (wrangler dev with a local D1); you can register a throw-away org with `curl` or by adapting `scripts/smoke.mjs` to inspect real response shapes. Do not stop that process.
