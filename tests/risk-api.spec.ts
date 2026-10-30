import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { getRiskArchives, getRiskDashboard, getRiskExceptions, getRiskInterfaces } from "@/api/risk";
import { httpClient } from "@/utils/request";
import { riskFixture } from "./fixtures/risk";
const originalAdapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = originalAdapter; });
describe("risk r1 HTTP contract", () => {
  it("uses authenticated GET paths, content unwrap and exact long strings", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    httpClient.defaults.adapter = async (config) => {
      captured.push(config);
      return { data: { code: 200, success: true, msg: "ok", content: config.url === "/risk/dashboard" ? riskFixture() : { list: [], total: 0 } }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    };
    const query = { startDate: "2026-10-26", endDate: "2026-10-27", regionCode: "UNKNOWN", requestType: "SSE" as const, pageNum: 2, pageSize: 10 };
    expect((await getRiskDashboard(query)).metrics.requestCount).toBe("9007199254740993");
    expect(await getRiskInterfaces(query)).toEqual({ list: [], total: 0 });
    await getRiskExceptions(query); await getRiskArchives(query);
    expect(captured.map((config) => config.url)).toEqual(["/risk/dashboard", "/risk/interfaces/page", "/risk/exceptions/page", "/risk/archives/page"]);
    expect(captured.every((config) => config.method === "get" && !config.publicAccess && !config.data)).toBe(true);
    expect(captured[0]?.params).toEqual(query);
    expect(captured[3]?.params).toEqual({ startDate: query.startDate, endDate: query.endDate, pageNum: 2, pageSize: 10 });
  });
  it("rejects failed CommonResult rather than treating content as successful empty data", async () => {
    httpClient.defaults.adapter = async (config) => ({ data: { code: 500, success: false, msg: "服务不可用", content: null }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config });
    await expect(getRiskDashboard({ startDate: "2026-10-27", endDate: "2026-10-27" })).rejects.toThrow("服务不可用");
  });
});
