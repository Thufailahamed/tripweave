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
