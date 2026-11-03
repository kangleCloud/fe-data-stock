import { request } from "@/utils/request";
import type { GeoObservation } from "@/types/geoObservation";
export async function getGeoObservation(): Promise<GeoObservation> {
  const data = await request<GeoObservation>({ url: "/risk/geo/status", method: "GET", silentError: true });
  if (!data || !data.providers?.DBIP || !data.providers?.MAXMIND || !data.cache || !data.quality || typeof data.cacheVersion !== "string") throw new Error("GEO_STATUS_UNSUPPORTED");
  const count = (value: unknown) => value === null || (typeof value === "string" && /^\d+$/.test(value));
  for (const value of [data.cache.hits, data.cache.misses, data.cache.stale, ...Object.values(data.cache.levelCounts ?? {}), ...[data.quality.total, data.quality.unknown, data.quality.untrusted, data.quality.nonPublic, data.quality.serviceUnavailable, data.quality.conflicts, data.quality.localDegraded, data.quality.versionStale]]) if (!count(value)) throw new Error("GEO_STATUS_INVALID_COUNT");
  return data;
}
