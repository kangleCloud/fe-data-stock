import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { AxiosHeaders } from "axios";
import { httpClient } from "@/utils/request";
import { getGeoObservation } from "@/api/geoObservation";
import { geoObservationSections } from "@/utils/geoObservation";
import GeoServerStatus from "@/components/risk/GeoServerStatus.vue";
import type { GeoObservation } from "@/types/geoObservation";
import fixture from "./fixtures/geo-status-example.json";
const adapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = adapter; });
describe("frozen geo observation integration", () => {
  it("uses authenticated status GET and unwraps content without IP filters", async () => {
    httpClient.defaults.adapter = async (config) => { expect(config.url).toBe("/risk/geo/status"); expect(config.method).toBe("get"); expect(config.publicAccess).not.toBe(true); expect(config.params).toBeUndefined(); return { data: { success: true, code: 200, content: fixture }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config }; };
    expect(await getGeoObservation()).toEqual(fixture);
  });
  it("rejects incomplete current status and non-string exact counts", async () => {
    for (const content of [{ cacheVersion: "current" }, { ...fixture, cache: { ...fixture.cache, hits: 9007199254740992 } }]) {
      httpClient.defaults.adapter = async config => ({ data: { success: true, code: 200, content }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config });
      await expect(getGeoObservation()).rejects.toThrow(/^GEO_STATUS_(?:UNSUPPORTED|INVALID_COUNT)$/);
    }
  });
  it("adapts exact shared fields and distinguishes zero from unknown without calling duration P95", () => {
    const data: GeoObservation = structuredClone(fixture); data.cache.hits = "9007199254740993";
    const sections = geoObservationSections(data); expect(sections[3]?.metrics.find((row) => row.label === "命中")?.value).toBe("9007199254740993"); expect(sections[1]?.metrics.find((row) => row.label === "数据库版本")?.value).toBeNull(); expect(sections.some((section) => section.title.includes("AMAP"))).toBe(false); expect(sections.flatMap(section => section.metrics).some(row => row.label === "策略版本")).toBe(false); expect(sections[0]?.metrics.find(row => row.label === "缓存版本")?.value).toBe(data.cacheVersion);
  });
  it("shows a usable V1.2 offline province without enrichment, district or IP", () => {
    const wrapper = mount(GeoServerStatus, { props: { status: { resultStatus: "SUCCESS", locationLevel: "PROVINCE", source: "DBIP", countryCode: "CN", geoGroup: "CN_MAINLAND", provinceCode: "CN-31", provinceName: "上海", cityCode: null, cityName: null, errorCode: null, cacheVersion: "c", databaseVersion: "b", databaseVersions: { DBIP: "b" }, fieldSources: { country: "DBIP", province: "DBIP", city: null }, conflictFields: [], cityGeoNameId: null, resolvedAt: null } } });
    expect(wrapper.text()).toContain("离线地域结果可用"); expect(wrapper.text()).toContain("上海"); expect(wrapper.text()).toContain("DB-IP离线"); expect(wrapper.text()).not.toContain("策略"); expect(wrapper.text()).toContain("缓存 c"); wrapper.unmount();
  });
  it("keeps manual targets separate from offline provider results", () => {
    const wrapper = mount(GeoServerStatus, { props: { manual: true } }); expect(wrapper.text()).toContain("人工位置优先"); expect(wrapper.text()).not.toContain("AMAP增强缓存"); wrapper.unmount();
  });
});
