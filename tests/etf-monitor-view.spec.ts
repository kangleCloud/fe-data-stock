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
