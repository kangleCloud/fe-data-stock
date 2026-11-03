type Count = string | null;
export interface GeoStatusProjection { resultStatus: string; locationLevel: string; source: "DBIP" | "MAXMIND" | null; countryCode: string | null; geoGroup: string; provinceCode: string | null; provinceName: string | null; cityCode: string | null; cityName: string | null; cityGeoNameId: string | null; errorCode: string | null; cacheVersion: string | null; databaseVersion: string | null; databaseVersions: Record<string, string>; fieldSources: { country: string | null; province: string | null; city: string | null }; conflictFields: string[]; resolvedAt: string | null }
export interface GeoProvider { enabled: boolean; health: string; databaseVersion: string | null; digest: string | null; loadedAt: string | null; expiresAt: string | null; updateStatus: string; updateFailureCode: string | null }
interface Observed { available: boolean; scope: string; reportedAt: string | null }
export interface GeoObservation {
  cacheVersion: string; redisAvailable: boolean; strategy: string;
  providers: { DBIP: GeoProvider; MAXMIND: GeoProvider };
  cache: Observed & { hits: Count; misses: Count; stale: Count; hitRate: Count; levelCounts: Record<string, Count> };
  quality: Observed & { total: Count; unknown: Count; untrusted: Count; nonPublic: Count; serviceUnavailable: Count; conflicts: Count; localDegraded: Count; versionStale: Count };
}
