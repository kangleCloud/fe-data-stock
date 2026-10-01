import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StockMonitorView from "@/views/market/stockMonitor/index.vue";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: false, permissionCodes: [] as string[] },
  permission: { initialized: true, initialize: vi.fn() },
  getStockMonitorDashboard: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => mocks.permission }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("@/api/market", () => ({
  getStockMonitorDashboard: mocks.getStockMonitorDashboard,
}));

const stock = {
  symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", sortOrder: 1,
  profile: { industry: "历史行业资料", listingDate: null, marketCap: null, updatedAt: null },
  quote: {
    source: "XQ", sourceTime: "2026-09-27T14:30:00+08:00",
    collectedAt: "2026-09-27T14:30:03+08:00", tradeDate: "2026-09-27",
    price: 10.2, previousClose: 10.08, low: 10.01, high: 10.33, open: 10.05,
    limitUp: 11.22, limitDown: 9.18, averagePrice: 10.123,
    volume: 123456, changePercent: 1.2, amount: 1000000, status: "FRESH",
  },
  series: [{ time: "2026-09-27T14:30:00+08:00", price: 10.2 }],
};

beforeEach(() => {
  mocks.auth.isAuthenticated = false;
  mocks.auth.permissionCodes = [];
  mocks.permission.initialize.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe("public stock monitor view", () => {
  it("shows disabled collection without quotes or management actions to visitors", async () => {
    mocks.getStockMonitorDashboard.mockResolvedValue({
      schemaVersion: 1, xqEnabled: false, tradeDate: null,
      stocks: [{ ...stock, quote: { ...stock.quote, price: null, changePercent: null, amount: null, sourceTime: null, collectedAt: null, tradeDate: null, status: "DISABLED" }, series: [] }],
    });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("雪球采集开关未开启，仅展示监控清单");
    expect(wrapper.text()).toContain("采集未开启");
    expect(wrapper.text()).not.toContain("10.20");
    expect(wrapper.text()).not.toContain("昨收 · 元");
    expect(wrapper.text()).not.toContain("历史行业资料");
    expect(wrapper.text()).not.toContain("配置管理");
    wrapper.unmount();
  });

  it("labels historical quotes and only offers management to permitted users", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.permissionCodes = ["system:stock-monitor:view"];
    mocks.getStockMonitorDashboard.mockResolvedValue({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-27", stocks: [stock],
    });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("历史数据 · 2026-09-27");
    expect(wrapper.text()).toContain("昨收 · 元10.08");
    expect(wrapper.text()).toContain("最低 · 元10.01");
    expect(wrapper.text()).toContain("最高 · 元10.33");
    expect(wrapper.text()).toContain("今开 · 元10.05");
    expect(wrapper.text()).toContain("涨停 · 元11.22");
    expect(wrapper.text()).toContain("跌停 · 元9.18");
    expect(wrapper.text()).toContain("均价 · 元10.123");
    expect(wrapper.text()).toContain("成交量 · 股123,456");
    const manage = wrapper.findAll("button").find((button) => button.text().includes("配置管理"));
    expect(manage).toBeDefined();
    await manage!.trigger("click");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith("/system/stockMonitor");
    wrapper.unmount();
  });

  it("marks stale history and shows missing extended values as dashes", async () => {
    mocks.getStockMonitorDashboard.mockResolvedValue({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-27",
      stocks: [{ ...stock, quote: {
        ...stock.quote, status: "STALE", previousClose: null, low: null, high: null, open: null,
        limitUp: null, limitDown: null, averagePrice: null, volume: null,
      } }],
    });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("历史数据 · 2026-09-27 · 已过期");
    expect(wrapper.text()).toContain("保留最近一次有效报价");
    const metrics = wrapper.findAll(".stock-card__metrics > div");
    expect(metrics.find((metric) => metric.text().includes("昨收"))?.text()).toContain("—");
    expect(metrics.find((metric) => metric.text().includes("均价"))?.text()).toContain("—");
    expect(metrics.find((metric) => metric.text().includes("成交量"))?.text()).toContain("—");
    wrapper.unmount();
  });

  it("keeps a single dashboard GET in flight on the 120-second timer", async () => {
    vi.useFakeTimers();
    const data = { schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-27", stocks: [stock] };
    let finishSlow!: (value: typeof data) => void;
    mocks.getStockMonitorDashboard
      .mockResolvedValueOnce(data)
      .mockImplementationOnce(() => new Promise((resolve) => { finishSlow = resolve; }))
      .mockResolvedValue(data);
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    let unmounted = false;
    try {
      await flushPromises();
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(2);
      finishSlow(data);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(3);
      wrapper.unmount();
      unmounted = true;
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(3);
    } finally {
      if (!unmounted) wrapper.unmount();
      vi.useRealTimers();
    }
  });
});
