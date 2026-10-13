import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MonitorView from "@/views/market/etfMonitor/index.vue";
import type { EtfMonitorDashboard } from "@/types/etf";
import { shanghaiToday } from "@/utils/stockMonitor";
import { applyEtfMonitorPatch, parseEtfMonitorDashboard } from "@/utils/etfMonitor";

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), push: vi.fn(), refresh: vi.fn(), init: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
const auth = reactive({ isAuthenticated: false, permissionCodes: [] as string[] });
const permissions = reactive({ initialized: false, initialize: mocks.initialize });
const snapshot = ref<EtfMonitorDashboard>({ schemaVersion: 1, stateId: null, tradeDate: null, xqEnabled: false, etfs: [] });
vi.mock("@/charts/echarts", () => ({ echarts: { init: mocks.init } }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => permissions }));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useEtfMonitorStream", () => ({ useEtfMonitorStream: () => ({
  snapshot, loading: ref(false), loadError: ref(""), manualRefresh: mocks.refresh,
}) }));

beforeEach(() => {
  vi.clearAllMocks(); auth.isAuthenticated = false; auth.permissionCodes = []; permissions.initialized = false;
  snapshot.value.etfs = [];
  mocks.init.mockImplementation(() => ({ setOption: mocks.render, resize: vi.fn(), dispose: mocks.dispose }));
  mocks.initialize.mockImplementation(async () => { permissions.initialized = true; });
});

describe("ETF public configuration navigation", () => {
  it.each([
    { price: 1.234, change: 0.001, expectedPrice: "1.234", expectedChange: "+0.001" },
    { price: 1.2, change: -0.02, expectedPrice: "1.200", expectedChange: "-0.020" },
    { price: 0, change: 0, expectedPrice: "0.000", expectedChange: "0.000" },
    { price: null, change: null, expectedPrice: "—", expectedChange: "—" },
    { price: 1.23456, change: 0.01256, expectedPrice: "1.235", expectedChange: "+0.013" },
  ])("shows price $price and change $change with three display decimals only", async ({ price, change, expectedPrice, expectedChange }) => {
    const collectedAt = "2026-10-09T10:00:00+08:00";
    const series = price === null ? [] : [{ collectedAt, price }];
    snapshot.value = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", tradeDate: "2026-10-09", xqEnabled: false,
      etfs: [{ symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
        profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null, manager: null, custodian: null,
          shareCount: null, shareDate: null, trackingIndexCode: null, trackingIndexName: null, updatedAt: null },
        quote: { source: "SINA_ETF", sourceTime: null, tradeDate: "2026-10-09", price, change, changePercent: 1.25,
          previousClose: 1.123456, open: 1.234567, high: 1.345678, low: 1.012345, buyPrice: 1.23456789, sellPrice: 1.23567891, volume: 123, amount: 10000, collectedAt, status: "FRESH" },
        series, fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: "2026-10-09",
        dataStatus: "HISTORICAL", closeConfirmed: false, assetAllocation: null }] });
    const wrapper = mount(MonitorView, { global: { stubs: { BaseChart: true } } });
    try {
      await flushPromises();
      const values = wrapper.findAll(".etf-metrics dd");
      expect(wrapper.findAll(".etf-metrics dt").map((cell) => cell.text())).toEqual([
        "交易价格 · 元", "昨收 · 元", "今开 · 元", "涨跌额 · 元", "最高 · 元", "最低 · 元", "买入价 · 元", "卖出价 · 元",
        "涨跌幅", "成交额 · 元", "成交量", "采集时间",
      ]);
      expect(values.map((cell) => cell.text())).toEqual([expectedPrice, "1.123", "1.235", expectedChange, "1.346", "1.012", "1.235", "1.236", "+1.25%", "+1万", "123.00", "10/09 10:00:00"]);
      expect(snapshot.value.etfs[0]!.quote!.buyPrice).toBe(1.23456789); expect(snapshot.value.etfs[0]!.quote!.sellPrice).toBe(1.23567891);
      expect(snapshot.value.etfs[0]!.quote!.price).toBe(price); expect(snapshot.value.etfs[0]!.quote!.change).toBe(change);
      if (price !== null) {
        expect(wrapper.get(".etf-table-scroll tbody td:nth-child(2)").text()).toBe(expectedPrice);
        const chart = wrapper.findComponent({ name: "BaseChart" });
        const option = chart.props("option") as { tooltip: { valueFormatter: (value: unknown) => string }; series: Array<{ data: Array<[string, number]> }> };
        expect(option.tooltip.valueFormatter([collectedAt, price])).toBe(`${expectedPrice} 元`);
        expect(option.series[0]!.data).toEqual([[collectedAt, price]]);
      } else expect(wrapper.findComponent({ name: "BaseChart" }).exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it("shows undated valid ETF quotes as delayed without claiming current or confirmed-close data", async () => {
    snapshot.value = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", tradeDate: null, xqEnabled: false,
      etfs: [{ symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
        profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null, manager: null, custodian: null,
          shareCount: null, shareDate: null, trackingIndexCode: null, trackingIndexName: null, updatedAt: null },
        quote: { source: "SINA_ETF", sourceTime: null, tradeDate: null, price: 2.5, change: null, changePercent: null,
          previousClose: null, open: null, high: null, low: null, volume: null, amount: null,
          collectedAt: "2026-10-10T10:00:00+08:00", status: "FRESH" }, series: [], fundSeries: [],
        fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: null, dataStatus: "DELAYED", closeConfirmed: false, assetAllocation: null }] });
    const wrapper = mount(MonitorView);
    try {
      await flushPromises(); expect(wrapper.text()).toContain("采样已延迟"); expect(wrapper.text()).toContain("有效交易日 —");
      expect(wrapper.text()).toContain("2.50"); expect(wrapper.text()).toContain("暂无实际价格采样点");
      expect(wrapper.text()).not.toContain("当日采样"); expect(wrapper.text()).not.toContain("收盘已确认");
    } finally { wrapper.unmount(); }
  });
  it("renders ETF names and asset categories as source text without executable markup", async () => {
    const text = '<svg onload="alert(1)">基金 & "股票" < 100%</svg>';
    snapshot.value = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", tradeDate: null, xqEnabled: true,
      etfs: [{ symbol: "SH510050", code: "510050", name: text, market: "SH", sortOrder: 1,
        profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null, manager: text,
          custodian: null, shareCount: null, shareDate: null, trackingIndexCode: null, trackingIndexName: null, updatedAt: null },
        quote: null, series: [], fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: null,
        dataStatus: "NO_DATA", closeConfirmed: false, assetAllocationStatus: "AVAILABLE",
        assetAllocation: { source: "XQ_DANJUAN", requestedReportPeriod: "2026-06-30", collectedAt: "2026-10-09T10:00:00+08:00",
          categories: [{ category: text, percent: 90 }] } }] });
    const wrapper = mount(MonitorView);
    try {
      await flushPromises(); expect(wrapper.get(".etf-table-scroll tbody td").text()).toBe(text);
      expect(wrapper.text()).toContain(text);
      expect(wrapper.findAll("script,svg[onload],img[onerror],[onload],[onerror]")).toHaveLength(0);
    } finally { wrapper.unmount(); }
  });
  it("shows THS type and manager with XQ off, without old share data", async () => {
    snapshot.value = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", tradeDate: null, xqEnabled: false,
      etfs: [{ symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
        profile: { source: "THS", fundType: "股票型基金", etfType: "字典分类", manager: "示例基金公司",
          exchange: null, listingStatus: null, listingDate: null, custodian: null, shareCount: 123,
          shareDate: null, trackingIndexCode: null, trackingIndexName: null, updatedAt: "2026-10-03T10:00:00+08:00" },
        quote: null, series: [], fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE",
        effectiveTradeDate: null, dataStatus: "NO_DATA", closeConfirmed: false, assetAllocation: null }] });
    const wrapper = mount(MonitorView); await flushPromises();
    expect(wrapper.text()).toContain("股票型基金"); expect(wrapper.text()).toContain("示例基金公司");
    expect(wrapper.findAll(".etf-metrics dd").map((cell) => cell.text())).toEqual(Array(12).fill("—"));
    expect(wrapper.get(".etf-profile-info").text()).toContain("示例基金公司");
    expect(wrapper.text()).toContain("同花顺同步"); expect(wrapper.text()).not.toContain("基金份额");
    expect(wrapper.text()).toContain("资金流暂未支持，暂无可靠非东财来源");
    expect(wrapper.text()).toContain("授权关闭");
    expect(wrapper.text()).not.toContain("字典分类"); wrapper.unmount();
  });
  it("updates metrics from successive quote patches without rebuilding the chart or resetting table scroll", async () => {
    const date = shanghaiToday();
    const item = { symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
      profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null, manager: "基金公司", custodian: null,
        shareCount: null, shareDate: null, trackingIndexCode: "000016", trackingIndexName: "上证50", updatedAt: null },
      quote: { source: "SINA_ETF", sourceTime: null, tradeDate: date, price: 2.123456, change: -0.00123, changePercent: -0.01,
        previousClose: 2.124686, open: 2.1, high: 2.2, low: 2.0, volume: 100, amount: 200, collectedAt: `${date}T10:00:00+08:00`, status: "FRESH" },
      series: [{ collectedAt: `${date}T10:00:00+08:00`, price: 2.123456 }], fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE",
      effectiveTradeDate: date, dataStatus: "CURRENT", closeConfirmed: false, assetAllocation: null };
    snapshot.value = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", tradeDate: date, xqEnabled: false, etfs: [item] });
    const wrapper = mount(MonitorView);
    try {
      await flushPromises(); const chart = wrapper.get(".base-chart").element;
      const details = wrapper.get(".etf-section details").element as HTMLDetailsElement; details.open = true;
      const table = wrapper.get(".etf-table-scroll").element; table.scrollTop = 60;
      expect(wrapper.findAll(".etf-metrics dd")[6]!.text()).toBe("—");
      for (let index = 0; index < 3; index++) {
        const current = snapshot.value; const old = current.etfs[0]!;
        const patchItem = { ...old, quote: { ...old.quote!, buyPrice: 2.123456 + index / 1000, sellPrice: 2.234567 + index / 1000, status: index === 2 ? "ERROR" : "STALE" },
          dataStatus: "DELAYED", series: [...old.series, { collectedAt: `${date}T10:0${index + 1}:00+08:00`, price: 2.2 + index / 1000 }] };
        const next = applyEtfMonitorPatch(current, { baseStateId: current.stateId, stateId: `patch-${index}`, etfs: [patchItem] });
        if (next === "duplicate") throw new Error("expected patch"); snapshot.value = next; await flushPromises();
        expect(wrapper.findAll(".etf-metrics dd")[6]!.text()).toBe((2.123456 + index / 1000).toFixed(3));
        expect(wrapper.findAll(".etf-metrics dd")[7]!.text()).toBe((2.234567 + index / 1000).toFixed(3));
        expect(wrapper.text()).toContain("采样已延迟");
        expect(wrapper.get(".base-chart").element).toBe(chart); expect(mocks.init).toHaveBeenCalledTimes(1); expect(mocks.dispose).not.toHaveBeenCalled();
        expect(table.scrollTop).toBe(60); expect(details.open).toBe(true);
      }
      expect(wrapper.get(".etf-quote-alert").text()).toContain("行情采集失败");
      expect(wrapper.get(".etf-profile-info").text()).toContain("上证50 · 000016");
      expect(mocks.refresh).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it("keeps anonymous cache access and hides config even with stale permission codes", async () => {
    auth.permissionCodes = ["system:etf-monitor:view"];
    const wrapper = mount(MonitorView);
    await flushPromises();
    expect(wrapper.text()).toContain("尚未启用 ETF 监控");
    expect(wrapper.text()).not.toContain("配置管理");
    expect(mocks.initialize).not.toHaveBeenCalled();
    await wrapper.findAll("button").find((button) => button.text().includes("重新读取快照"))!.trigger("click");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("initializes routes before offering the same config target in header and empty state", async () => {
    auth.isAuthenticated = true; auth.permissionCodes = ["system:etf-monitor:view"];
    const wrapper = mount(MonitorView);
    await flushPromises();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    const buttons = wrapper.findAll("button").filter((button) => button.text().includes("配置管理"));
    expect(buttons).toHaveLength(2);
    await buttons[1]!.trigger("click");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith("/system/etfMonitor");
    expect(mocks.initialize.mock.invocationCallOrder[1]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!);
    wrapper.unmount();
  });

  it("hides configuration from signed-in users without view permission", async () => {
    auth.isAuthenticated = true;
    const wrapper = mount(MonitorView);
    await flushPromises();
    expect(wrapper.text()).not.toContain("配置管理");
    wrapper.unmount();
  });
});
