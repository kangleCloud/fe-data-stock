import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";

import * as marketApi from "@/api/market";
import type { CommonResult } from "@/types/api";
import { httpClient } from "@/utils/request";

const originalAdapter = httpClient.defaults.adapter;

describe("stock monitor API contracts", () => {
  afterEach(() => {
    httpClient.defaults.adapter = originalAdapter;
  });

  it("uses only the active stock monitor GET and POST endpoints", async () => {
    const requests: Array<{
      method: string;
      url: string;
      params?: unknown;
      baseURL?: string;
      publicAccess?: boolean;
    }> = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        method: String(config.method).toUpperCase(),
        url: String(config.url),
        params: config.params,
        baseURL: config.baseURL,
        publicAccess: config.publicAccess,
      });
      return {
        data: {
          code: 200,
          success: true,
          msg: "ok",
          content: config.url === "/stock-monitor/v1/dashboard"
            ? { schemaVersion: 1, xqEnabled: false, tradeDate: null, stocks: [] }
            : {},
        } satisfies CommonResult<unknown>,
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      } as AxiosResponse<CommonResult<unknown>>;
    };
    httpClient.defaults.adapter = adapter;

    await Promise.all([
      marketApi.getStockMonitorDashboard(),
      marketApi.searchStockDictionary("浦发", 20),
      marketApi.getStockMonitorConfig(),
      marketApi.setStockEnabled("SH600000", true),
      marketApi.sortStockMonitor(["SH600000"]),
      marketApi.refreshStockMonitor(),
      marketApi.getStockMonitorRefreshStatus(),
    ]);

    expect(requests).toEqual([
      { method: "GET", url: "/stock-monitor/v1/dashboard", params: undefined, baseURL: "/openapi/api", publicAccess: true },
      { method: "GET", url: "/system/stockMonitor/dictionary", params: { keyword: "浦发", limit: 20 }, baseURL: "/admin/api", publicAccess: undefined },
      { method: "GET", url: "/system/stockMonitor/list", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "POST", url: "/system/stockMonitor/enable", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "POST", url: "/system/stockMonitor/sort", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "POST", url: "/system/stockMonitor/refresh", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "GET", url: "/system/stockMonitor/refresh/status", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
    ]);
    expect(new Set(requests.map((item) => item.method))).toEqual(
      new Set(["GET", "POST"]),
    );
  });

});
