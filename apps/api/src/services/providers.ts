import {
  AmadeusProvider,
  GoogleHotelsProvider,
  HotelbedsProvider,
  InternalInventoryProvider,
  MockProvider,
  OsmDiscoveryProvider,
  type HotelAvailabilityInput,
  type HotelProvider,
} from "@tripweave/provider-contracts";
import { ExternalLlmClient, WorkersAiClient, type LlmClient } from "@tripweave/ai";
import { inventory, type Db } from "@tripweave/database";
import type { Deps, Env } from "../env";
import { KvSearchCache } from "./search-cache";

/** Median catalogue rate for one room per night, in the currency most catalogue offers use. */
async function catalogueBenchmark(internal: InternalInventoryProvider, input: HotelAvailabilityInput) {
  const offers = await internal.getAvailability(input);
  const usable = offers.filter((o) => o.availabilityStatus !== "unavailable" && o.nights > 0 && o.roomsRequired > 0 && o.totalAmountMinor > 0);
  if (usable.length === 0) return null;
  const counts = new Map<string, number>();
  for (const o of usable) counts.set(o.currency, (counts.get(o.currency) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!currency) return null;
  const perRoomNight = usable
    .filter((o) => o.currency === currency)
    .map((o) => o.totalAmountMinor / o.nights / o.roomsRequired)
    .sort((a, b) => a - b);
  if (perRoomNight.length === 0) return null;
  return {
    nightlyMinor: Math.round(perRoomNight[Math.floor(perRoomNight.length / 2)]!),
    currency,
    basis: `${perRoomNight.length} catalogue rate${perRoomNight.length === 1 ? "" : "s"}`,
  };
}

/** Providers are constructed per request; credentials are read only from Worker secrets. */
export function defaultBuildProviders(env: Env, db: Db, _orgId: string, opts: { includeExternal: boolean; includeMock: boolean; externalProviders?: string[]; /** Pilot: entity-page verification of the cheapest Google Hotels results. */ googleHotelsDirect?: boolean }): HotelProvider[] {
  const internal = new InternalInventoryProvider({ load: (q) => inventory.loadInternalInventory(db, q.organizationId, q) });
  const providers: HotelProvider[] = [internal];
  const platformAllows = new Set((env.HOTEL_EXTERNAL_PROVIDER ?? "none").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean));
  const wanted = (key: string) => opts.includeExternal && platformAllows.has(key) && (!opts.externalProviders || opts.externalProviders.includes(key));
  if (wanted("hotelbeds") && env.HOTELBEDS_API_KEY && env.HOTELBEDS_SECRET) {
    providers.push(new HotelbedsProvider({ apiKey: env.HOTELBEDS_API_KEY, secret: env.HOTELBEDS_SECRET, baseUrl: env.HOTELBEDS_BASE_URL ?? "https://api.test.hotelbeds.com" }));
  }
  if (wanted("amadeus") && env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) {
    providers.push(new AmadeusProvider({ clientId: env.AMADEUS_CLIENT_ID, clientSecret: env.AMADEUS_CLIENT_SECRET, baseUrl: env.AMADEUS_BASE_URL ?? "https://test.api.amadeus.com" }));
  }
  if (wanted("google_hotels") && env.SERPAPI_API_KEY) {
    providers.push(
      new GoogleHotelsProvider({
        apiKey: env.SERPAPI_API_KEY,
        baseUrl: env.SERPAPI_BASE_URL ?? "https://serpapi.com/search.json",
        now: () => new Date(),
        direct: { enabled: opts.googleHotelsDirect === true },
        cache: env.CACHE ? new KvSearchCache(env.CACHE) : undefined,
        cacheTtlSeconds: 15 * 60,
      }),
    );
  }
  const discoveryAllowed = env.ENVIRONMENT !== "test" && env.HOTEL_DISCOVERY === "true";
  const organisationAllows = !opts.externalProviders || opts.externalProviders.includes("openstreetmap");
  if (opts.includeExternal && discoveryAllowed && organisationAllows) {
    providers.push(
      new OsmDiscoveryProvider({
        overpassUrl: env.OSM_OVERPASS_URL,
        nominatimUrl: env.OSM_NOMINATIM_URL,
        contactEmail: env.OSM_CONTACT_EMAIL,
        benchmark: (input) => catalogueBenchmark(internal, input),
      }),
    );
  }
  if (opts.includeMock && env.ENABLE_MOCK_PROVIDER === "true") providers.push(new MockProvider());
  return providers;
}

export function defaultBuildLlm(env: Env): LlmClient | null {
  if (env.AI) return new WorkersAiClient(env.AI, env.AI_MODEL);
  if (env.LLM_PROVIDER && env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL) return new ExternalLlmClient({ apiKey: env.LLM_API_KEY, baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL });
  return null;
}

export type { Deps };
