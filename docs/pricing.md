# Pricing and rate rules

All authoritative money maths is deterministic code in `packages/pricing-engine` (never an LLM). Amounts are integer minor units; intermediate products use BigInt.

## Formulas
- Selling price (target margin `m`) = cost / (1 − m), rounded **up** so the achieved margin is never below target.
- Gross profit = selling price − cost (− payment fee). Gross margin = profit / selling price. Markup = profit / cost.
- Example: cost USD 800.00, 20% margin → selling USD 1,000.00 (that is a 25% markup; a 20% *markup* would be 960.00).
- Modes: `target_margin`, `percent_markup`, `fixed_markup`; then minimum profit, rounding up to unit/ten/hundred, minimum selling price.
- Payment fee is a cost of sale on the selling price (`selling = cost / (1 − m − f)` in margin mode). Selling-side tax is added on top and never changes margin.
- Supplier commission reduces net cost. Discounts reduce the selling price; exceeding the max discount, falling below the approval margin floor, or selling below cost sets **approval required** (a different manager must approve before sending).
- Zero cost: selling = 0 (or minimum rules); margin/markup report 0 and a warning is attached.
- Selling price is allocated across line items with the largest-remainder method so lines always sum exactly.

## Currency
Supplier currency/amount are preserved. Conversion uses an **FX snapshot** (pivot currency + rates, as-of, source). Each quotation version stores its own snapshot, so later FX changes never alter an issued quotation. Missing rates produce a clear error (or a `currency` rejection in the optimiser funnel), never a guess.

## Rate precedence (`selectRuleForDate`)
For each night the rule must cover the date, not list it as a blackout, and match the room's adult occupancy. Then: higher `priority` wins → narrower date span wins (a single-date rate beats a season) → more recently updated → greater id. Same-priority overlaps are surfaced in the UI as warnings.

Nightly price = base (per room or per person) + extra adults/children (children under `childFreeUnderAge` free; unknown ages are charged conservatively), then service charge on net, then tax on (net + service charge); tax-inclusive rates back-derive the embedded tax for reporting.

Budgets are compared at **selling price** (cost passed through the pricing config), so mark-up is accounted for before a hotel is shortlisted.
