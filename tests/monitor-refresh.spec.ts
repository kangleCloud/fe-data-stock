import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";

import { getEtfMonitorConfig, refreshEtfMonitor } from "@/api/etf";
import { refreshStockMonitor } from "@/api/market";
import { httpClient } from "@/utils/request";
import { refreshFailure, refreshFeedback } from "@/utils/monitorRefresh";
import { ApiError } from "@/utils/request";

const adapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = adapter; });

describe("synchronous monitor refresh", () => {
  it("extends only the two overall refresh requests to five minutes", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    httpClient.defaults.adapter = async (config) => {
      calls.push(config);
      return { data: { success: true, content: { status: "SUCCESS" } }, status: 200,
        statusText: "OK", headers: new AxiosHeaders(), config };
    };
    await refreshStockMonitor();
    await refreshEtfMonitor();
    await getEtfMonitorConfig();
    expect(calls.map((call) => [call.url, call.method, call.timeout])).toEqual([
      ["/system/stockMonitor/refresh", "post", 300000],
      ["/system/etfMonitor/refresh", "post", 300000],
      ["/system/etfMonitor/list", "get", 15000],
    ]);
  });

  it.each([refreshStockMonitor, refreshEtfMonitor])("reports timeout as unconfirmed without retry", async (refresh) => {
    let calls = 0;
    httpClient.defaults.adapter = async (config) => {
      calls++;
      throw new AxiosError("timeout", "ECONNABORTED", config);
    };
    await expect(refresh()).rejects.toThrow("结果未确认");
    expect(calls).toBe(1);
  });

  it.each([["SUCCESS", "success"], ["PARTIAL", "warning"], ["ERROR", "error"],
    ["LOCKED", "warning"], ["SKIPPED", "warning"]])("maps %s by final status", (status, type) => {
    expect(refreshFeedback({ status: status!, startedAt: null, finishedAt: null, message: null }).type).toBe(type);
  });

  it("does not turn an old rejected SUCCESS into success", () => {
    const result = { accepted: false, status: "SUCCESS", startedAt: null, finishedAt: null, message: "刷新任务正在执行" };
    expect(refreshFeedback(result).type).toBe("warning");
    expect(refreshFeedback(result).message).toContain("刷新未执行");
    const locked = refreshFailure(new ApiError("ETF 同步正在执行", 423));
    expect(locked.status).toBe("LOCKED");
    expect(refreshFeedback(locked).type).toBe("warning");
    expect(refreshFeedback(locked).message).toContain("本次未执行");
    expect(refreshFailure(new ApiError("业务失败", 500)).status).toBe("ERROR");
    expect(refreshFailure(new ApiError("结果未确认")).status).toBe("UNCONFIRMED");
  });
});
