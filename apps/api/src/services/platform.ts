import { admin, type Db } from "@tripweave/database";

/**
 * Platform settings are read on most API requests (maintenance/signup gates), so keep a very short
 * per-isolate cache. Writes call `clearPlatformSettingsCache` immediately.
 */
const cache = new WeakMap<object, { at: number; value: admin.PlatformSettings }>();
const TTL_MS = 15_000;

export async function platformSettings(db: Db, nowMs = Date.now()): Promise<admin.PlatformSettings> {
  const key = db as unknown as object;
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < TTL_MS) return hit.value;
  const value = await admin.getPlatformSettings(db);
  cache.set(key, { at: nowMs, value });
  return value;
}

export function clearPlatformSettingsCache(db: Db): void {
  cache.delete(db as unknown as object);
}
