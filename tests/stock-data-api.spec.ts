import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";

import {
  addStockDictionary,
  getStockDictionaryAdminPage,
  getStockMonitorAdminPage,
  getStockProfileAdminPage,
} from "@/api/stockData";
import type { CommonResult } from "@/types/api";
import { httpClient } from "@/utils/request";

const originalAdapter = httpClient.defaults.adapter;

afterEach(() => { httpClient.defaults.adapter = originalAdapter; });

describe("stock data page API", () => {
  it("uses three independent admin GET endpoints and preserves page filters", async () => {
    const requests: Array<{ url: string; method: string; baseURL?: string; params: unknown; publicAccess?: boolean }> = [];
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({
        url: String(config.url), method: String(config.method).toUpperCase(),
        baseURL: config.baseURL, params: config.params, publicAccess: config.publicAccess,
      });
      return {
        data: { code: 200, success: true, msg: "ok", content: { list: [], total: 0 } } satisfies CommonResult<unknown>,
        status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
      } as AxiosResponse<CommonResult<unknown>>;
    };
    httpClient.defaults.adapter = adapter;

    const pages = await Promise.all([
      getStockMonitorAdminPage({ pageNum: 2, pageSize: 20, keyword: "600000", enabled: false }),
      getStockDictionaryAdminPage({ pageNum: 3, pageSize: 50, keyword: "浦发", market: "SH" }),
      getStockProfileAdminPage({ pageNum: 1, pageSize: 10, keyword: "银行", industry: "金融" }),
    ]);

    expect(pages).toEqual([{ list: [], total: 0 }, { list: [], total: 0 }, { list: [], total: 0 }]);
    expect(requests).toEqual([
      { url: "/system/stockMonitor/page", method: "GET", baseURL: "/admin/api", publicAccess: undefined,
        params: { pageNum: 2, pageSize: 20, keyword: "600000", enabled: false } },
      { url: "/system/stockDictionary/page", method: "GET", baseURL: "/admin/api", publicAccess: undefined,
        params: { pageNum: 3, pageSize: 50, keyword: "浦发", market: "SH" } },
      { url: "/system/stockProfile/page", method: "GET", baseURL: "/admin/api", publicAccess: undefined,
        params: { pageNum: 1, pageSize: 10, keyword: "银行", industry: "金融" } },
    ]);
  });

  it("posts a single manually entered stock through the authenticated admin client", async () => {
    const requests: Array<{ url: string; method: string; data: string | undefined }> = [];
    httpClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push({ url: String(config.url), method: String(config.method).toUpperCase(), data: config.data as string | undefined });
      return {
        data: { code: 200, success: true, msg: "ok", content: {
          symbol: "SH600000", market: "SH", code: "600000", name: "浦发银行",
        } } satisfies CommonResult<unknown>,
        status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
      } as AxiosResponse<CommonResult<unknown>>;
    };

    const created = await addStockDictionary({ market: "SH", code: "600000", name: "浦发银行" });

    expect(created.symbol).toBe("SH600000");
    expect(requests).toEqual([{ url: "/system/stockDictionary/add", method: "POST",
      data: JSON.stringify({ market: "SH", code: "600000", name: "浦发银行" }) }]);
  });
});
