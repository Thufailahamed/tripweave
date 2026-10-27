import type { HotelSearchCache, HotelSearchCacheEntry } from "@tripweave/provider-contracts";

/** KV-backed discovery cache. Live quote checks bypass this class entirely. */
export class KvSearchCache implements HotelSearchCache {
  constructor(private readonly kv: KVNamespace) {}

  async get(key: string): Promise<HotelSearchCacheEntry | null> {
    try {
      return await this.kv.get<HotelSearchCacheEntry>(`hotel-search:${key}`, "json");
    } catch {
      return null;
    }
  }

  async set(key: string, value: HotelSearchCacheEntry, ttlSeconds: number): Promise<void> {
    try {
      await this.kv.put(`hotel-search:${key}`, JSON.stringify(value), { expirationTtl: Math.max(60, Math.round(ttlSeconds)) });
    } catch {
      // A cache outage must never fail a live search.
    }
  }
}
