import administrative from "@/data/geoAdministrativeCities.json";
import { request } from "@/utils/request";
import type { RiskQuery } from "@/types/risk";
import type { GeoBreakdown } from "@/types/geoDrilldown";
async function query(url: string, params: RiskQuery & { provinceCode?: string; countryCode?: string }): Promise<GeoBreakdown> {
  const data = await request<GeoBreakdown>({ url, method: "GET", params, silentError: true });
  const count = (value: unknown): value is string => typeof value === "string" && /^\d+$/.test(value);
  if (!data || !data.coverage || !["NOT_COLLECTED", "PARTIAL", "COLLECTED"].includes(data.coverage.status) || !Array.isArray(data.items)) throw new Error("GEO_BREAKDOWN_INVALID");
  if (![data.coverage.collectedRequestCount, data.coverage.totalRequestCount, data.coverage.uncollectedRequestCount, data.collectedRequestCount, data.identifiedRequestCount, data.unknownRequestCount, ...data.items.map((row) => row.requestCount)].every(count)) throw new Error("GEO_BREAKDOWN_INVALID_COUNT");
  if (BigInt(data.coverage.collectedRequestCount) > BigInt(data.coverage.totalRequestCount) || BigInt(data.coverage.collectedRequestCount) + BigInt(data.coverage.uncollectedRequestCount) !== BigInt(data.coverage.totalRequestCount) || BigInt(data.identifiedRequestCount) + BigInt(data.unknownRequestCount) !== BigInt(data.collectedRequestCount)) throw new Error("GEO_BREAKDOWN_INCONSISTENT");
  if (data.coverageRate !== null && !/^(?:0\.\d{6}|1\.0{6})$/.test(data.coverageRate)) throw new Error("GEO_BREAKDOWN_INVALID_RATE");
  if (params.provinceCode) {
    const cities = administrative.cities as Record<string, { provinceCode: string }>;
    const provinces = administrative.provinces as Record<string, { regionCode: string }>;
    for (const row of data.items) if (!row.cityCode || !Object.hasOwn(cities, row.cityCode) || provinces[cities[row.cityCode]!.provinceCode]?.regionCode !== params.provinceCode) throw new Error("GEO_CITY_CODE_UNVERIFIED");
  }
  return data;
}
export const getGeoCities = (params: RiskQuery & { provinceCode: string }) => query("/risk/geo/cities", params);
export const getGeoSubdivisions = (params: RiskQuery & { countryCode: string }) => query("/risk/geo/subdivisions", params);
