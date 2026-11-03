import { AxiosHeaders } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { httpClient } from "@/utils/request";
import { getGeoCities, getGeoSubdivisions } from "@/api/geoDrilldown";
const adapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = adapter; });
const coverage = { status: "PARTIAL", startedAt: null, collectedRequestCount: "80", totalRequestCount: "100", uncollectedRequestCount: "20" };
function respond(content: unknown, url: string) { httpClient.defaults.adapter = async (config) => { expect(config.url).toBe(url); expect(config.method).toBe("get"); expect(config.params.startDate).toBe("2026-10-30"); return { data: { code: 200, success: true, content }, config, headers: new AxiosHeaders(), status: 200, statusText: "OK" }; }; }
const query = { startDate: "2026-10-30", endDate: "2026-10-30" };
describe("V1.2 geographic query wire", () => {
  it("uses global coverage and a separate selected province denominator", async () => { const data = { provinceCode: "CN-44", coverage, collectedRequestCount: "40", identifiedRequestCount: "30", unknownRequestCount: "10", coverageRate: "0.750000", items: [{ cityCode: "440100", cityName: "广州", requestCount: "30" }] }; respond(data, "/risk/geo/cities"); expect(await getGeoCities({ ...query, provinceCode: "CN-44" })).toEqual(data); });
  it("does not pretend GeoNames IDs or a city from another province are verified city codes", async () => { for (const cityCode of ["1796236", "110000"]) { respond({ coverage, collectedRequestCount: "1", identifiedRequestCount: "1", unknownRequestCount: "0", coverageRate: "1.000000", items: [{ cityCode, cityName: "unverified", requestCount: "1" }] }, "/risk/geo/cities"); await expect(getGeoCities({ ...query, provinceCode: "CN-44" })).rejects.toThrow("GEO_CITY_CODE_UNVERIFIED"); } });
  it("retains code-null validated foreign first subdivision names", async () => { const data = { coverage, countryCode: "US", collectedRequestCount: "5", identifiedRequestCount: "3", unknownRequestCount: "2", coverageRate: "0.600000", items: [{ provinceCode: null, provinceName: "Validated first name", requestCount: "3" }] }; respond(data, "/risk/geo/subdivisions"); expect((await getGeoSubdivisions({ ...query, countryCode: "US" })).items[0]?.provinceName).toBe("Validated first name"); });
  it("fails inconsistent geo>counter instead of clipping it into a valid success", async () => { respond({ coverage: { ...coverage, collectedRequestCount: "101" }, collectedRequestCount: "0", identifiedRequestCount: "0", unknownRequestCount: "0", coverageRate: null, items: [] }, "/risk/geo/subdivisions"); await expect(getGeoSubdivisions({ ...query, countryCode: "US" })).rejects.toThrow("GEO_BREAKDOWN_INCONSISTENT"); });
});
