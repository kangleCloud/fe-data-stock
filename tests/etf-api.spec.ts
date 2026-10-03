import { AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";

import * as etfApi from "@/api/etf";
import type { CommonResult } from "@/types/api";
import { httpClient } from "@/utils/request";

const originalAdapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe("ETF API contract", () => {
  it("uses public cache GET and authenticated management GET/POST paths", async () => {
    const calls: Array<{ method: string; url: string; baseURL?: string; params?: unknown; data?: unknown }> = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      calls.push({ method: String(config.method).toUpperCase(), url: String(config.url),
        baseURL: config.baseURL, params: config.params, data: config.data });
      const content = config.url === "/etf-monitor/v1/dashboard"
        ? { schemaVersion: 1, stateId: null, xqEnabled: false, tradeDate: null, etfs: [] }
        : config.url?.endsWith("/page") ? { list: [], total: 0 }
          : config.url === "/system/etfProfile/detail" ? { dictionary: {
            symbol: "SH510050", code: "510050", name: "50ETF", market: "SH",
            exchange: null, etfType: null, listingStatus: null, listingDate: null,
            trackingIndexCode: null, trackingIndexName: null, source: "SINA", syncedAt: null,
          }, profile: null, assetAllocation: null } : [];
      return { data: { code: 200, success: true, msg: "ok", content } satisfies CommonResult<unknown>,
        status: 200, statusText: "OK", headers: new AxiosHeaders(), config } as AxiosResponse<CommonResult<unknown>>;
    };
    httpClient.defaults.adapter = adapter;
    const results = await Promise.all([
      etfApi.getEtfMonitorDashboard(),
      etfApi.getEtfDictionaryPage({ pageNum: 2, pageSize: 20, keyword: "510050", market: "SH" }),
      etfApi.getEtfProfilePage({ pageNum: 1, pageSize: 10, trackingIndexCode: "000016" }),
      etfApi.getEtfProfileDetail("SH510050"),
      etfApi.getEtfMonitorConfig(), etfApi.setEtfEnabled("SH510050", true),
      etfApi.sortEtfMonitor(["SH510050"]), etfApi.getIndexConfig(),
      etfApi.updateIndexConfig("sh000001", true, 1),
    ]);
    expect(calls.map(({ method, url, baseURL }) => ({ method, url, baseURL }))).toEqual([
      { method: "GET", url: "/etf-monitor/v1/dashboard", baseURL: "/openapi/api" },
      { method: "GET", url: "/system/etfDictionary/page", baseURL: "/admin/api" },
      { method: "GET", url: "/system/etfProfile/page", baseURL: "/admin/api" },
      { method: "GET", url: "/system/etfProfile/detail", baseURL: "/admin/api" },
      { method: "GET", url: "/system/etfMonitor/list", baseURL: "/admin/api" },
      { method: "POST", url: "/system/etfMonitor/enable", baseURL: "/admin/api" },
      { method: "POST", url: "/system/etfMonitor/sort", baseURL: "/admin/api" },
      { method: "GET", url: "/system/indexConfig/list", baseURL: "/admin/api" },
      { method: "POST", url: "/system/indexConfig/update", baseURL: "/admin/api" },
    ]);
    expect(calls[1]?.params).toEqual({ pageNum: 2, pageSize: 20, keyword: "510050", market: "SH" });
    expect(calls[3]?.params).toEqual({ symbol: "SH510050" });
    expect(calls[5]?.data).toBe(JSON.stringify({ symbol: "SH510050", enabled: true }));
    expect(results[3]).toMatchObject({ symbol: "SH510050", name: "50ETF", assetAllocation: null });
  });
});
