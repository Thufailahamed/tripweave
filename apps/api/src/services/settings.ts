import { z } from "zod";
import { AppError, pricingConfigSchema, type FxSnapshot, type PricingConfig } from "@tripweave/shared";
import { ops, type Db } from "@tripweave/database";

export const integrationSchema = z.object({
  externalProviders: z
    .object({
      hotelbeds: z.boolean().default(false),
      amadeus: z.boolean().default(false),
      /** Aggregated Booking.com/Expedia/Agoda prices through Google Hotels (SerpApi). */
      google_hotels: z.boolean().default(false),
      /** Keyless OpenStreetMap hotel discovery with catalogue-benchmarked estimates. */
      openstreetmap: z.boolean().default(true),
    })
    .default({ hotelbeds: false, amadeus: false, google_hotels: false, openstreetmap: true }),
  /** Disabled-by-default pilot: verify the cheapest Google Hotels results against entity pages. */
  googleHotelsDirect: z.boolean().default(false),
  mockProvider: z.boolean().default(false),
  aiEngine: z.enum(["auto", "rules"]).default("auto"),
});
export type IntegrationSettings = z.infer<typeof integrationSchema>;
export const DEFAULT_INTEGRATIONS: IntegrationSettings = {
  externalProviders: { hotelbeds: false, amadeus: false, google_hotels: false, openstreetmap: true },
  googleHotelsDirect: false,
  mockProvider: false,
  aiEngine: "auto",
};

/** Keys of the external suppliers this organisation has switched on (tolerates settings saved before a supplier existed). */
export function enabledExternalProviders(integrations: Partial<Omit<IntegrationSettings, "externalProviders">> & { externalProviders?: Partial<IntegrationSettings["externalProviders"]> }): string[] {
  return Object.entries(integrations.externalProviders ?? {}).filter(([, on]) => on === true).map(([key]) => key);
}

export async function loadIntegrations(db: Db, organizationId: string): Promise<IntegrationSettings> {
  const stored = await ops.getSetting<Partial<IntegrationSettings>>(db, organizationId, "integrations", {});
  return {
    ...DEFAULT_INTEGRATIONS,
    ...stored,
    externalProviders: { ...DEFAULT_INTEGRATIONS.externalProviders, ...(stored.externalProviders ?? {}) },
  };
}

export async function loadPricing(db: Db, organizationId: string): Promise<PricingConfig> {
  return pricingConfigSchema.parse(await ops.getSetting<Partial<PricingConfig>>(db, organizationId, "pricing", {}));
}

/** FX is mandatory for multi-currency pricing; a missing snapshot is a clear, actionable error. */
export async function requireFx(db: Db, organizationId: string, needCurrencies: string[]): Promise<FxSnapshot> {
  const fx = await ops.latestFxSnapshot(db, organizationId);
  const distinct = [...new Set(needCurrencies)];
  if (!fx) {
    if (distinct.length <= 1) return { pivot: distinct[0] ?? "USD", rates: {}, asOf: new Date().toISOString(), source: "single-currency" };
    throw new AppError("unprocessable", "No exchange rates are configured. Add them under Settings → Pricing before pricing multi-currency items.");
  }
  const missing = distinct.filter((c) => c !== fx.pivot && !fx.rates[c]);
  if (missing.length) throw new AppError("unprocessable", `Exchange rates are missing for: ${missing.join(", ")}. Update them under Settings → Pricing.`, { missing });
  return fx;
}
