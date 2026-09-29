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

describe("market API contracts", () => {
  afterEach(() => {
    httpClient.defaults.adapter = originalAdapter;
  });

  it("uses only the planned GET and POST endpoints", async () => {
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
      marketApi.getDashboardStatus(),
      marketApi.getIndices(),
      marketApi.getMarketSummary(),
      marketApi.refreshDashboard(),
      marketApi.getSectorTopStocks({
        sectorType: "industry",
        sectorCode: "BK001",
        metric: "changepercent",
      }),
      marketApi.getSectorRankings({
        period: "today",
        sectorType: "industry",
      }),
      marketApi.getSectorMutations(),
      marketApi.getMarketFundTrend({ days: 20, indexCode: "000001" }),
      marketApi.getStockMonitorDashboard(),
      marketApi.searchStockDictionary("浦发", 20),
      marketApi.getStockMonitorConfig(),
      marketApi.setStockEnabled("SH600000", true),
      marketApi.sortStockMonitor(["SH600000"]),
      marketApi.refreshStockMonitor(),
      marketApi.getStockMonitorRefreshStatus(),
    ]);

    expect(requests).toEqual([
      { method: "GET", url: "/market/dashboard/status", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "GET", url: "/market/dashboard/indices", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "GET", url: "/market/dashboard/summary", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      { method: "POST", url: "/market/dashboard/refresh", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      {
        method: "GET",
        url: "/market/sector/topStocks",
        params: {
          sectorType: "industry",
          sectorCode: "BK001",
          metric: "changepercent",
        },
        baseURL: "/admin/api", publicAccess: undefined,
      },
      {
        method: "GET",
        url: "/market/sector/rankings",
        params: { period: "today", sectorType: "industry" }, baseURL: "/admin/api", publicAccess: undefined,
      },
      { method: "GET", url: "/market/sector/mutations", params: undefined, baseURL: "/admin/api", publicAccess: undefined },
      {
        method: "GET",
        url: "/market/fund/trend",
        params: { days: 20, indexCode: "000001" }, baseURL: "/admin/api", publicAccess: undefined,
      },
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

  it("groups the legacy ranking rows still used by other market views", async () => {
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      const content = {
              dataStatus: "FRESH",
              data: [
                {
                  period: "today",
                  sectorType: "industry",
                  sectorCode: "BK001",
                  sectorName: "传媒",
                  changePercent: 1.2,
                  mainNetInflow: 5,
                },
                {
                  period: "today",
                  sectorType: "industry",
                  sectorCode: "BK002",
                  sectorName: "银行",
                  changePercent: -0.5,
                  mainNetInflow: -2,
                },
              ],
            };
      return {
        data: {
          code: 200,
          success: true,
          msg: "ok",
          content,
        } satisfies CommonResult<unknown>,
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      } as AxiosResponse<CommonResult<unknown>>;
    };
    httpClient.defaults.adapter = adapter;

    const rankings = await marketApi.getSectorRankings({
      period: "today",
      sectorType: "industry",
    });

    expect(rankings.data.topRise[0]).toMatchObject({
      sectorCode: "BK001",
      value: 1.2,
    });
    expect(rankings.data.topFall[0]).toMatchObject({
      sectorCode: "BK002",
      value: -0.5,
    });
  });
});
