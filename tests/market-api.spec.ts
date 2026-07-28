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
    const requests: Array<{ method: string; url: string }> = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        method: String(config.method).toUpperCase(),
        url: String(config.url),
      });
      return {
        data: {
          code: 200,
          success: true,
          msg: "ok",
          content: {},
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
      marketApi.getSectorHeatmap({ sectorType: "INDUSTRY" }),
      marketApi.getSectorTopStocks({
        sectorCode: "BK001",
        metric: "CHANGE_PERCENT",
      }),
      marketApi.getSectorRankings({ period: "TODAY" }),
      marketApi.getSectorMutations(),
      marketApi.getMarketFundTrend({ days: 20, indexCode: "000001" }),
      marketApi.getStockDictionaryPage({ pageNum: 1, pageSize: 10 }),
      marketApi.getStockMonitorPage({ pageNum: 1, pageSize: 4 }),
      marketApi.enableStock({ stockCode: "600000" }),
      marketApi.disableStock({ stockCode: "600000" }),
      marketApi.reorderStock({ stockCode: "600000", direction: "UP" }),
      marketApi.syncStockDictionary(),
    ]);

    expect(requests).toEqual([
      { method: "GET", url: "/market/dashboard/status" },
      { method: "GET", url: "/market/dashboard/indices" },
      { method: "GET", url: "/market/dashboard/summary" },
      { method: "POST", url: "/market/dashboard/refresh" },
      { method: "GET", url: "/market/sector/heatmap" },
      { method: "GET", url: "/market/sector/topStocks" },
      { method: "GET", url: "/market/sector/rankings" },
      { method: "GET", url: "/market/sector/mutations" },
      { method: "GET", url: "/market/fund/trend" },
      { method: "GET", url: "/market/stock/dictionary/page" },
      { method: "GET", url: "/market/stock/monitor/page" },
      { method: "POST", url: "/market/stock/enable" },
      { method: "POST", url: "/market/stock/disable" },
      { method: "POST", url: "/market/stock/reorder" },
      { method: "POST", url: "/market/stock/dictionary/sync" },
    ]);
    expect(new Set(requests.map((item) => item.method))).toEqual(
      new Set(["GET", "POST"]),
    );
  });
});
