import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MonitorView from "@/views/market/etfMonitor/index.vue";
import type { EtfMonitorDashboard } from "@/types/etf";
import { parseEtfMonitorDashboard } from "@/utils/etfMonitor";

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const auth = reactive({ isAuthenticated: false, permissionCodes: [] as string[] });
const permissions = reactive({ initialized: false, initialize: mocks.initialize });
const snapshot = ref<EtfMonitorDashboard>({ schemaVersion: 1, stateId: null, tradeDate: null, xqEnabled: false, etfs: [] });
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => permissions }));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useEtfMonitorStream", () => ({ useEtfMonitorStream: () => ({
  snapshot, loading: ref(false), loadError: ref(""), manualRefresh: mocks.refresh,
}) }));

beforeEach(() => {
  vi.clearAllMocks(); auth.isAuthenticated = false; auth.permissionCodes = []; permissions.initialized = false;
  snapshot.value.etfs = [];
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
          previousClose: null, open: null, high: null, low: null, volume: 123, amount: 10000, collectedAt, status: "FRESH" },
        series, fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: "2026-10-09",
        dataStatus: "HISTORICAL", closeConfirmed: false, assetAllocation: null }] });
    const wrapper = mount(MonitorView, { global: { stubs: { BaseChart: true } } });
    try {
      await flushPromises();
      const values = wrapper.findAll(".etf-metrics dd");
      expect(values[0]!.text()).toBe(expectedPrice); expect(values[1]!.text()).toBe(expectedChange);
      expect(values[2]!.text()).toBe("+1.25%"); expect(values[3]!.text()).toBe("+1万"); expect(values[4]!.text()).toBe("123.00");
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
    expect(wrapper.text()).toContain("同花顺同步"); expect(wrapper.text()).not.toContain("基金份额");
    expect(wrapper.text()).toContain("资金流暂未支持，暂无可靠非东财来源");
    expect(wrapper.text()).toContain("授权关闭");
    expect(wrapper.text()).not.toContain("字典分类"); wrapper.unmount();
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
