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
    }> = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        method: String(config.method).toUpperCase(),
        url: String(config.url),
        params: config.params,
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
      marketApi.getSectorHeatmap({ sectorType: "industry" }),
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
      marketApi.getStockDictionaryPage({ pageNum: 1, pageSize: 10 }),
      marketApi.getStockMonitorPage({ pageNum: 1, pageSize: 4 }),
      marketApi.enableStock({ stockCode: "600000" }),
      marketApi.disableStock({ stockCode: "600000" }),
      marketApi.reorderStock({ stockCode: "600000", direction: "UP" }),
      marketApi.syncStockDictionary(),
    ]);

    expect(requests).toEqual([
      { method: "GET", url: "/market/dashboard/status", params: undefined },
      { method: "GET", url: "/market/dashboard/indices", params: undefined },
      { method: "GET", url: "/market/dashboard/summary", params: undefined },
      { method: "POST", url: "/market/dashboard/refresh", params: undefined },
      {
        method: "GET",
        url: "/market/sector/heatmap",
        params: { sectorType: "industry" },
      },
      {
        method: "GET",
        url: "/market/sector/topStocks",
        params: {
          sectorType: "industry",
          sectorCode: "BK001",
          metric: "changepercent",
        },
      },
      {
        method: "GET",
        url: "/market/sector/rankings",
        params: { period: "today", sectorType: "industry" },
      },
      { method: "GET", url: "/market/sector/mutations", params: undefined },
      {
        method: "GET",
        url: "/market/fund/trend",
        params: { days: 20, indexCode: "000001" },
      },
      {
        method: "GET",
        url: "/market/stock/dictionary/page",
        params: { pageNum: 1, pageSize: 10 },
      },
      {
        method: "GET",
        url: "/market/stock/monitor/page",
        params: { pageNum: 1, pageSize: 4 },
      },
      { method: "POST", url: "/market/stock/enable", params: undefined },
      { method: "POST", url: "/market/stock/disable", params: undefined },
      { method: "POST", url: "/market/stock/reorder", params: undefined },
      {
        method: "POST",
        url: "/market/stock/dictionary/sync",
        params: undefined,
      },
    ]);
    expect(new Set(requests.map((item) => item.method))).toEqual(
      new Set(["GET", "POST"]),
    );
  });

  it("reads the heatmap list wrapper and groups ranking rows", async () => {
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      const content =
        config.url === "/market/sector/heatmap"
          ? {
              dataStatus: "FRESH",
              data: {
                availableAreaMetrics: ["turnover", "marketcap"],
                list: [
                  {
                    sectorType: "industry",
                    sectorCode: "BK001",
                    name: "传媒",
                    changePercent: 1.2,
                    turnover: 100,
                    marketCap: 200,
                    turnoverRate: 3,
                    upCount: 10,
                    downCount: 2,
                    leader: "测试股份",
                    mainNetInflow: 5,
                  },
                ],
              },
            }
          : {
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

    const heatmap = await marketApi.getSectorHeatmap({
      sectorType: "industry",
    });
    const rankings = await marketApi.getSectorRankings({
      period: "today",
      sectorType: "industry",
    });

    expect(heatmap.data.list).toEqual([
      expect.objectContaining({
        code: "BK001",
        type: "industry",
        riseCount: 10,
        leadingStockName: "测试股份",
      }),
    ]);
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
