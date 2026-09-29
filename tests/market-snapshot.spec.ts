import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMarketDashboardSnapshot } from "@/api/market";
import type { CommonResult } from "@/types/api";
import type {
  MarketDashboardSnapshot,
  SnapshotFundFlow,
  SnapshotFundPoint,
  SnapshotModule,
  SnapshotTop5,
} from "@/types/market";
import { snapshotDateLabel, snapshotStatusLabel } from "@/utils/marketSnapshot";
import { httpClient } from "@/utils/request";
import MarketOverview from "@/views/market/overview/index.vue";

const originalAdapter = httpClient.defaults.adapter;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
});

const latest: SnapshotFundPoint = {
  date: "2026-09-22",
  mainNetInflow: 123_000_000,
  mainNetInflowRatio: 2.5,
  superLargeNetInflow: 20_000_000,
  superLargeNetInflowRatio: 0.8,
  largeNetInflow: 103_000_000,
  largeNetInflowRatio: 1.7,
  mediumNetInflow: -20_000_000,
  mediumNetInflowRatio: -0.4,
  smallNetInflow: -103_000_000,
  smallNetInflowRatio: -2.1,
  shanghaiClose: 3000,
  shanghaiChangePercent: 0.5,
  shenzhenClose: 9000,
  shenzhenChangePercent: -0.2,
};

function moduleOf<T>(
  data: T | null,
  status: "FRESH" | "STALE" | "ERROR" = "FRESH",
  date = "2026-09-22",
  basis: "CALENDAR" | "SOURCE" = "CALENDAR",
): SnapshotModule<T> {
  return {
    status,
    tradeDate: data == null ? null : date,
    tradeDateBasis: basis,
    lastSuccessAt: data == null ? null : "2026-09-23T10:00:00+08:00",
    lastAttemptAt: "2026-09-23T10:00:00+08:00",
    message: status === "ERROR" ? "暂无可用数据" : null,
    data,
  };
}

const rankings: SnapshotTop5 = {
  source: "THS",
  period: "INTRADAY",
  topRise: [{
    sectorName: "测试行业",
    sectorType: "industry",
    changePercent: 2.5,
    netFlowAmount: 123_000_000,
  }],
  topFall: [],
  topInflow: [{
    sectorName: "测试行业",
    sectorType: "industry",
    changePercent: 2.5,
    netFlowAmount: 123_000_000,
  }],
  topOutflow: [],
};

const snapshot: MarketDashboardSnapshot = {
  schemaVersion: 1,
  provider: "akshare",
  generatedAt: "2026-09-23T10:00:00+08:00",
  modules: {
    industryTop5: moduleOf(rankings, "STALE"),
    conceptTop5: moduleOf<SnapshotTop5>(null, "ERROR"),
    marketFundFlow: moduleOf<SnapshotFundFlow>({
      latest,
      series: [latest],
    }, "FRESH", "2026-09-22", "SOURCE"),
  },
};

function useSnapshotAdapter(content: MarketDashboardSnapshot): void {
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => ({
    data: {
      code: 200,
      success: true,
      msg: "ok",
      content,
    } satisfies CommonResult<MarketDashboardSnapshot>,
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  } as AxiosResponse<CommonResult<MarketDashboardSnapshot>>);
  httpClient.defaults.adapter = adapter;
}

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("market snapshot V1", () => {
  it("GETs the public snapshot endpoint and unwraps CommonResult", async () => {
    const requests: Array<{ method: string; url: string; baseURL: string; publicAccess?: boolean }> = [];
    useSnapshotAdapter(snapshot);
    const adapter = httpClient.defaults.adapter as AxiosAdapter;
    httpClient.defaults.adapter = async (config) => {
      requests.push({ method: String(config.method).toUpperCase(), url: String(config.url),
        baseURL: String(config.baseURL), publicAccess: config.publicAccess });
      return adapter(config);
    };

    expect(await getMarketDashboardSnapshot()).toEqual(snapshot);
    expect(requests).toEqual([{ method: "GET", url: "/market/dashboard/snapshot",
      baseURL: "/openapi/api", publicAccess: true }]);
  });

  it("labels collection status separately from the actual source date", () => {
    expect(snapshotStatusLabel(snapshot.modules.marketFundFlow)).toBe("本轮采集成功");
    expect(snapshotDateLabel(snapshot.modules.marketFundFlow, "2026-09-23"))
      .toBe("源数据日期 2026-09-22 · 历史数据");
    expect(snapshotDateLabel(snapshot.modules.industryTop5, "2026-09-23"))
      .toBe("参考交易日 2026-09-22 · 历史数据");
    expect(snapshotStatusLabel(snapshot.modules.industryTop5))
      .toContain("上次成功数据");
  });

  it("shows the three V1 modules with separate THS and market fund-flow semantics", async () => {
    useSnapshotAdapter(snapshot);
    const wrapper = mount(MarketOverview, {
      global: { stubs: { BaseChart: true } },
    });
    await flushPromises();

    expect(wrapper.findAll(".snapshot-section")).toHaveLength(2);
    expect(wrapper.findAll(".market-panel")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("板块热力图");
    expect(wrapper.text()).toContain("板块 Top 5");
    expect(wrapper.text()).toContain("MARKET SNAPSHOT V1");
    expect(wrapper.text()).toContain("同花顺资金净额流入 Top 5");
    expect(wrapper.text()).toContain("+1.23亿元");
    expect(wrapper.text()).toContain("同花顺 · 盘中榜单");
    expect(wrapper.text()).toContain("最新可得交易日 · 主力净流入");
    expect(wrapper.text()).not.toContain("无法唯一匹配板块");
    expect(wrapper.text()).toContain("大盘资金流向");
    expect(wrapper.text()).toContain("源数据日期 2026-09-22 · 历史数据");
    expect(wrapper.text()).toContain("本轮采集失败，显示上次成功数据");
    expect(wrapper.text()).toContain("测试行业");
    expect(wrapper.text()).toContain("暂无可用数据");
    expect(wrapper.text()).not.toContain("个股资金监控");
    expect(wrapper.text()).not.toContain("异动板块");

    wrapper.unmount();
  });

  it("shows an empty state and a retry action when no snapshot is available", async () => {
    httpClient.defaults.adapter = async (config) => ({
      data: {
        code: 503,
        success: false,
        msg: "市场快照不存在",
        content: null,
      } satisfies CommonResult<null>,
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    } as AxiosResponse<CommonResult<null>>);

    const wrapper = mount(MarketOverview, {
      global: { stubs: { BaseChart: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("暂无市场快照");
    expect(wrapper.text()).toContain("市场快照不存在");
    expect(wrapper.findAll(".market-empty").length).toBe(3);
    expect(wrapper.get(".snapshot-intro__actions button").text()).toContain("重新读取快照");
    wrapper.unmount();
  });
});
