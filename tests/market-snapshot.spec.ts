import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMarketDashboardSnapshot } from "@/api/market";
import type { CommonResult } from "@/types/api";
import type {
  MarketDashboardSnapshot,
  SnapshotFundFlow,
  SnapshotFundPoint,
  SnapshotModule,
  SnapshotSector,
  SnapshotTop5,
} from "@/types/market";
import { snapshotDateLabel, snapshotStatusLabel } from "@/utils/marketSnapshot";
import { httpClient } from "@/utils/request";
import MarketOverview from "@/views/market/overview/index.vue";

const originalAdapter = httpClient.defaults.adapter;

const sector: SnapshotSector = {
  sectorCode: "BK001",
  sectorName: "测试行业",
  sectorType: "industry",
  marketCap: 1_000_000_000,
  changePercent: 2.5,
  turnoverRate: 1.2,
  riseCount: 10,
  fallCount: 2,
  leadingStockName: "测试股份",
};

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
  topRise: [{
    sectorCode: "BK001",
    sectorName: "测试行业",
    sectorType: "industry",
    changePercent: 2.5,
  }],
  topFall: [],
  topInflow: [{
    sectorCode: "BK001",
    sectorName: "测试行业",
    sectorType: "industry",
    changePercent: 2.5,
    mainNetInflow: 123_000_000,
    mainNetInflowRatio: 2.5,
  }],
  topOutflow: [],
  unmatchedFundRows: 1,
};

const snapshot: MarketDashboardSnapshot = {
  schemaVersion: 1,
  provider: "akshare",
  generatedAt: "2026-09-23T10:00:00+08:00",
  modules: {
    industryHeatmap: moduleOf([sector]),
    conceptHeatmap: moduleOf<SnapshotSector[]>(null, "ERROR"),
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
  vi.restoreAllMocks();
});

describe("market snapshot V1", () => {
  it("GETs the single backend snapshot endpoint and unwraps CommonResult", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    useSnapshotAdapter(snapshot);
    const adapter = httpClient.defaults.adapter as AxiosAdapter;
    httpClient.defaults.adapter = async (config) => {
      requests.push({ method: String(config.method).toUpperCase(), url: String(config.url) });
      return adapter(config);
    };

    expect(await getMarketDashboardSnapshot()).toEqual(snapshot);
    expect(requests).toEqual([{ method: "GET", url: "/market/dashboard/snapshot" }]);
  });

  it("labels collection status separately from the actual source date", () => {
    expect(snapshotStatusLabel(snapshot.modules.marketFundFlow)).toBe("本轮采集成功");
    expect(snapshotDateLabel(snapshot.modules.marketFundFlow, "2026-09-23"))
      .toBe("源数据日期 2026-09-22 · 历史数据");
    expect(snapshotDateLabel(snapshot.modules.industryHeatmap, "2026-09-23"))
      .toBe("参考交易日 2026-09-22 · 历史数据");
    expect(snapshotStatusLabel(snapshot.modules.industryTop5))
      .toContain("上次成功数据");
  });

  it("shows only the V1 sections, preserved stale data, and module errors", async () => {
    useSnapshotAdapter(snapshot);
    const wrapper = mount(MarketOverview, {
      global: { stubs: { BaseChart: true } },
    });
    await flushPromises();

    expect(wrapper.findAll(".snapshot-section")).toHaveLength(3);
    expect(wrapper.text()).toContain("板块热力图");
    expect(wrapper.text()).toContain("板块 Top 5");
    expect(wrapper.text()).toContain("大盘资金流向");
    expect(wrapper.text()).toContain("源数据日期 2026-09-22 · 历史数据");
    expect(wrapper.text()).toContain("本轮采集失败，显示上次成功数据");
    expect(wrapper.text()).toContain("测试行业");
    expect(wrapper.text()).toContain("暂无可用数据");
    expect(wrapper.text()).not.toContain("个股资金监控");
    expect(wrapper.text()).not.toContain("异动板块");

    await wrapper.findAll(".snapshot-section")[0]!.findAll("button")[1]!.trigger("click");
    expect(wrapper.find(".snapshot-table").exists()).toBe(true);
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
    expect(wrapper.findAll(".market-empty").length).toBe(5);
    expect(wrapper.get(".snapshot-intro__actions button").text()).toContain("重新读取快照");
    wrapper.unmount();
  });
});
