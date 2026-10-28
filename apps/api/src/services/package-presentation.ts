import type { PlanningHotelOffer, PlanningPackageView } from "@tripweave/planning-contract";
import { inventory, type trips } from "@tripweave/database";
import type { AppContext } from "../lib/http";
import { getTenant } from "../middleware/auth";
import { presentPackage, priceStoredPackage, type StoredPackage } from "./pricing";
import { loadPricing, requireFx } from "./settings";

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
      const shown = presentPackage(r, rights, priced);
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
