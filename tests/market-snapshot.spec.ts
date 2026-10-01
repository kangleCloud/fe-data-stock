import { AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMarketDashboardSnapshot } from "@/api/market";
import { buildIntradayFundOption, buildSectorTreemapOption } from "@/charts/marketOptions";
import type { CommonResult } from "@/types/api";
import type { MarketDashboardSnapshot, SnapshotSectorData } from "@/types/market";
import { sectorRankings, snapshotDateLabel, snapshotDelayLevel, snapshotStatusLabel, splitFundSeries } from "@/utils/marketSnapshot";
import { httpClient } from "@/utils/request";
import MarketOverview from "@/views/market/overview/index.vue";
import { conceptData, fundData, industryData, moduleOf, sectorItem, snapshot } from "./fixtures/marketSnapshot";

const originalAdapter = httpClient.defaults.adapter;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
});

function useSnapshotAdapter(content: MarketDashboardSnapshot): void {
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => ({
    data: { code: 200, success: true, msg: "ok", content } satisfies CommonResult<MarketDashboardSnapshot>,
    status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
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

  it("labels calendar date, stale state, and 120/300-second collection delays", () => {
    const fresh = snapshot.modules.marketFundFlow;
    expect(snapshotDateLabel(fresh, "2026-09-24")).toBe("参考交易日 2026-09-23 · 历史数据");
    expect(snapshotStatusLabel(fresh)).toBe("本轮采集成功");
    expect(snapshotDelayLevel(fresh, Date.parse("2026-09-23T10:01:59+08:00"))).toBe("normal");
    expect(snapshotDelayLevel(fresh, Date.parse("2026-09-23T10:02:01+08:00"))).toBe("delayed");
    expect(snapshotDelayLevel(fresh, Date.parse("2026-09-23T10:05:01+08:00"))).toBe("severe");
    expect(snapshotStatusLabel(moduleOf(industryData, "STALE"))).toContain("上次成功数据");
  });

  it("derives directional Top5 and Top10 from complete items without filling missing values", () => {
    const rows = Array.from({ length: 12 }, (_, index) => sectorItem({
      name: `板块${index}`, changePct: index < 6 ? index + 1 : -(index - 5),
      netAmount: index < 11 ? (index + 1) * 10_000 : -10_000,
    }));
    rows.push(sectorItem({ name: "缺失", changePct: null, netAmount: null }));
    rows.push(sectorItem({ name: "零值", changePct: 0, netAmount: 0 }));
    const result = sectorRankings(rows);
    expect(result.topRise).toHaveLength(5);
    expect(result.topRise[0]?.name).toBe("板块5");
    expect(result.topFall.map((item) => item.name)).toEqual(["板块11", "板块10", "板块9", "板块8", "板块7"]);
    expect(result.topInflow).toHaveLength(10);
    expect(result.topInflow[0]?.name).toBe("板块10");
    expect(result.topOutflow.map((item) => item.name)).toEqual(["板块11"]);
  });

  it("maps treemap area to valid company count and breaks the fund line over lunch", () => {
    const treemap = buildSectorTreemapOption(industryData.items) as {
      series: Array<{ data: Array<{ name: string; value: number; itemStyle: { color: string } }> }>;
    };
    expect(treemap.series[0]?.data.map((item) => [item.name, item.value])).toEqual([["银行", 30], ["煤炭", 30]]);
    expect(treemap.series[0]?.data[0]?.itemStyle.color).not.toBe(treemap.series[0]?.data[1]?.itemStyle.color);
    expect(splitFundSeries(fundData.series)).toHaveLength(2);
    const chart = buildIntradayFundOption(fundData.series) as { series: Array<{ data: Array<[string, number]> }> };
    expect(chart.series.map((segment) => segment.data)).toEqual([
      [["2026-09-23T09:30:00+08:00", 20_000_000], ["2026-09-23T09:32:00+08:00", 25_000_000]],
      [["2026-09-23T13:02:00+08:00", 123_000_000]],
    ]);
  });

  it("shows collection and source details in the treemap tooltip with escaped names and missing values", () => {
    const item = sectorItem({ name: "银行<script>", leader: "领涨<&股", indexValue: null,
      inflow: null, leaderChangePct: null });
    const option = buildSectorTreemapOption([item], "2026-09-23T10:00:00+08:00") as {
      tooltip: { formatter: (params: { data: { sector: typeof item } }) => string };
      series: Array<{ data: Array<{ sector: typeof item; value: number }> }>;
    };
    const html = option.tooltip.formatter({ data: option.series[0]!.data[0]! });
    expect(html).toContain("银行&lt;script&gt;");
    expect(html).toContain("领涨&lt;&amp;股");
    expect(html).not.toContain("<script>");
    expect(html).toContain("板块指数：—");
    expect(html).toContain("流入：—");
    expect(html).toContain("领涨股涨幅：—");
    expect(html).toContain("涨跌幅：+2.50%");
    expect(html).toContain("净额：+1.23亿元");
    expect(html).toContain("来源：AKShare / 同花顺");
    expect(html).toContain("采集时间：09/23 10:00:00");
  });

  it("renders three sections with independent industry and concept switches", async () => {
    useSnapshotAdapter(snapshot);
    const wrapper = mount(MarketOverview, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.findAll(".snapshot-section")).toHaveLength(3);
    expect(wrapper.findAll(".market-panel")).toHaveLength(3);
    expect(wrapper.text()).toContain("板块行情");
    expect(wrapper.text()).toContain("板块资金流");
    expect(wrapper.text()).toContain("大盘资金流");
    expect(wrapper.text()).toContain("+1.23亿元");
    expect(wrapper.text()).toContain("资金流强度");
    expect(wrapper.text()).toContain("涨跌幅 +2.50%");
    expect(wrapper.find(".snapshot-flow-list small .tone-fall").text()).toContain("涨跌幅 -1.80%");
    expect(wrapper.text()).not.toContain("主力净流入");
    expect(wrapper.text()).not.toContain("20 日");
    const tabs = wrapper.findAll('[role="tablist"]');
    expect(tabs).toHaveLength(2);
    await tabs[0]!.findAll("button")[1]!.trigger("click");
    expect(tabs[0]!.findAll("button")[1]!.attributes("aria-selected")).toBe("true");
    expect(tabs[1]!.findAll("button")[0]!.attributes("aria-selected")).toBe("true");
    expect(wrapper.text()).toContain(conceptData.items[0]!.name);
    expect(wrapper.text()).toContain(industryData.items[0]!.name);
    wrapper.unmount();
  });

  it("keeps stale data, historical date, and an error module without inventing values", async () => {
    useSnapshotAdapter({ ...snapshot, modules: {
      industrySectors: moduleOf(industryData, "STALE"),
      conceptSectors: moduleOf<SnapshotSectorData>(null, "ERROR"),
      marketFundFlow: moduleOf(fundData),
    } });
    const wrapper = mount(MarketOverview, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("本轮采集失败，显示上次成功数据");
    expect(wrapper.text()).toContain("参考交易日 2026-09-23 · 历史数据");
    expect(wrapper.text()).toContain("采集失败，暂无可用数据");
    expect(wrapper.text()).toContain("银行");
    expect(wrapper.text()).not.toContain("源数据日期");
    wrapper.unmount();
  });

  it("shows a retry action without triggering source collection when snapshot is missing", async () => {
    const methods: string[] = [];
    httpClient.defaults.adapter = async (config) => {
      methods.push(String(config.method).toUpperCase());
      return {
        data: { code: 503, success: false, msg: "市场快照不存在", content: null } satisfies CommonResult<null>,
        status: 200, statusText: "OK", headers: new AxiosHeaders(), config,
      } as AxiosResponse<CommonResult<null>>;
    };
    const wrapper = mount(MarketOverview, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("暂无市场快照");
    expect(wrapper.findAll(".market-empty")).toHaveLength(3);
    expect(wrapper.get(".snapshot-intro__actions button").text()).toContain("重新读取快照");
    await wrapper.get(".snapshot-intro__actions button").trigger("click");
    await flushPromises();
    expect(methods).toEqual(["GET", "GET"]);
    wrapper.unmount();
  });
});
