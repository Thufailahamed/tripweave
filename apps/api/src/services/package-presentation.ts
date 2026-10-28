import type { PlanningHotelOffer, PlanningPackageView } from "@tripweave/planning-contract";
import { inventory, trips, type Db } from "@tripweave/database";
import { formatMoney } from "@tripweave/shared";
import type { AppContext } from "../lib/http";
import { getTenant } from "../middleware/auth";
import { presentPackage, priceStoredPackage, type StoredPackage } from "./pricing";
import { loadPricing, requireFx } from "./settings";

export interface RunBudget {
  amountMinor: number;
  currency: string;
}

/**
 * The budget each optimisation run compared its packages against, resolved the way the optimiser does:
 * the run's own budget when it set one, otherwise the trip budget for accommodation-only budgets. A
 * whole-trip budget is not compared, so its runs have no budget. Null means no comparison.
 */
async function runBudgets(db: Db, organizationId: string, jobIds: string[]): Promise<Map<string, RunBudget | null>> {
  const budgets = new Map<string, RunBudget | null>();
  for (const jobId of jobIds) {
    const job = await trips.getJobUnscoped(db, jobId);
    const trip = job ? await trips.getTrip(db, organizationId, job.tripRequestId) : null;
    if (!job || !trip) {
      budgets.set(jobId, null);
      continue;
    }
    const constraints = ((job.request as { constraints?: { budgetAmountMinor?: number | null; budgetCurrency?: string } } | null)?.constraints ?? {});
    let amountMinor = constraints.budgetAmountMinor ?? null;
    if (amountMinor === null && trip.budgetAmountMinor !== null && trip.budgetScope === "accommodation_only") amountMinor = trip.budgetAmountMinor;
    budgets.set(jobId, amountMinor === null ? null : { amountMinor, currency: constraints.budgetCurrency ?? trip.budgetCurrency });
  }
  return budgets;
}

const BUDGET_SENTENCE = /(?:under|over) the stated budget\.$/;

/**
 * The optimiser wrote the budget comparison at run time, but prices and budgets can change afterwards.
 * This re-derives the comparison from the selling price shown and the budget now set, and rewrites only
 * the budget sentence in the explanation. Costs, stays and any edits made since the run are left as they are.
 */
export function withCurrentBudget(rec: trips.PackageRecord, selling: { sellingPriceMinor: number; currency: string }, budget: RunBudget | null): trips.PackageRecord {
  const pkg = rec.package as unknown as Record<string, unknown> & { explanation?: string[]; budgetDifferenceMinor: number | null; withinBudget: boolean | null };
  const comparable = budget !== null && budget.currency === selling.currency;
  const budgetDifferenceMinor = comparable ? budget.amountMinor - selling.sellingPriceMinor : null;
  const withinBudget = comparable ? selling.sellingPriceMinor <= budget.amountMinor : null;
  const sentence = budgetDifferenceMinor === null ? null : `${formatMoney(Math.abs(budgetDifferenceMinor), selling.currency)} ${budgetDifferenceMinor >= 0 ? "under" : "over"} the stated budget.`;
  const explanation = [...(pkg.explanation ?? [])];
  const at = explanation.findIndex((line) => BUDGET_SENTENCE.test(line));
  if (at >= 0) {
    if (sentence) explanation[at] = sentence;
    else explanation.splice(at, 1);
  } else if (sentence) {
    explanation.splice(Math.min(1, explanation.length), 0, sentence);
  }
  return { ...rec, package: { ...pkg, budgetDifferenceMinor, withinBudget, explanation } };
}

/**
 * Shapes a set of stored packages for staff display (selling price always, internal costs only with
 * `margins:view`) and attaches cover images. Shared by the optimisation routes and the planning
 * snapshot so both surfaces apply identical permissions and redaction.
 */
export async function presentPackageList(c: AppContext, records: trips.PackageRecord[]) {
  const a = getTenant(c);
  const db = c.get("db");
  const pricing = await loadPricing(db, a.organizationId);
  const rights = { canSeeMargins: a.permissions.has("margins:view"), canSeeContracts: a.permissions.has("agreements:manage") };
  const propertyIds = records.flatMap((r) => {
    const pkg = r.package as unknown as StoredPackage;
    return pkg.selections.map((s) => s.offer.property.id);
  });
  const coverImages = await inventory.firstImagesFor(db, [...new Set(propertyIds)]);
  const budgets = await runBudgets(db, a.organizationId, [...new Set(records.map((r) => r.jobId))]);
  return Promise.all(
    records.map(async (r) => {
      let priced = null;
      try {
        const pkg = r.package as unknown as StoredPackage;
        const fx = await requireFx(db, a.organizationId, pkg.selections.map((s) => s.offer.currency).concat(pkg.currency));
        priced = priceStoredPackage(pkg, pkg.currency, fx, pricing);
      } catch {
        priced = null; // surfaced to the UI as "pricing unavailable"; the cost data is still shown
      }
      const current = priced ? withCurrentBudget(r, priced, budgets.get(r.jobId) ?? null) : r;
      const shown = presentPackage(current, rights, priced);
      return {
        ...shown,
        package: {
          ...shown.package,
          selections: shown.package.selections.map((s) => ({ ...s, coverImageId: coverImages.get(s.offer.property.id) ?? null })),
        },
      };
    }),
  );
}

/**
 * Presents stored packages with short refs (`pkg_1`, `offer_1`) for generated UI. Each hotel offer is
 * listed once, however many packages use it, so a reference always maps to one authoritative offer.
 */
export async function presentReferencedPackages(c: AppContext, records: trips.PackageRecord[]): Promise<{ packages: PlanningPackageView[]; offers: PlanningHotelOffer[] }> {
  const packages = ((await presentPackageList(c, records)) as unknown as PlanningPackageView[]).map((pkg, index) => ({ ...pkg, ref: `pkg_${index + 1}` }));
  const offersById = new Map<string, PlanningHotelOffer>();
  for (const pkg of packages) {
    for (const selection of pkg.package.selections) {
      const existing = offersById.get(selection.offer.offerId);
      if (existing) {
        if (!existing.packageIds.includes(pkg.id)) existing.packageIds.push(pkg.id);
      } else {
        offersById.set(selection.offer.offerId, {
          ref: `offer_${offersById.size + 1}`,
          offerId: selection.offer.offerId,
          packageIds: [pkg.id],
          stopId: selection.stopId,
          destination: selection.destination,
          offer: selection.offer,
          coverImageId: selection.coverImageId ?? null,
        });
      }
    }
  }
  return { packages, offers: [...offersById.values()].slice(0, 40) };
}
