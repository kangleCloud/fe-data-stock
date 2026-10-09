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
  effectiveTradeDate: "2026-09-27", dataStatus: "HISTORICAL", closeConfirmed: false,
  profile: { industry: "历史行业资料", listingDate: null, marketCap: null, updatedAt: null },
  quote: {
    source: "XQ", sourceTime: "2026-09-27T14:30:00+08:00",
    collectedAt: "2026-09-27T14:30:03+08:00", tradeDate: "2026-09-27",
    price: 10.2, previousClose: 10.08, low: 10.01, high: 10.33, open: 10.05,
    limitUp: 11.22, limitDown: 9.18, averagePrice: 10.123,
    volume: 123456, changePercent: 1.2, amount: 1000000, status: "FRESH",
  },
  series: [{ time: "2026-09-27T14:30:00+08:00", price: 10.2 }],
  fundSeries: [{ collectedAt: "2026-09-27T14:30:03+08:00", inflow: 2_000_000, outflow: 1_000_000, netAmount: 1_000_000 }],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
  mocks.auth.isAuthenticated = false;
  mocks.auth.permissionCodes = [];
  mocks.permission.initialize.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("public stock monitor view", () => {
  it.each(["全市场资金采集失败：分页重复", "资源不足，正在冷却", "有效日期暂无资金采样"])("shows the absent-fund cause without removing prices: %s", async (message) => {
    mocks.getStockMonitorDashboard.mockResolvedValue({ schemaVersion: 1, stateId: "a", xqEnabled: true,
      tradeDate: "2026-09-27", stocks: [{ ...stock, fundFlowStatus: "NO_DATA", fundFlowMessage: message, fundSeries: [] }] });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    try {
      await flushPromises(); expect(wrapper.text()).toContain(message);
      expect(wrapper.text()).toContain("价格 · 元10.20"); expect(wrapper.text()).toContain("2026-09-27");
      expect(wrapper.findAllComponents({ name: "BaseChart" })).toHaveLength(1);
      expect(wrapper.text()).not.toContain("资金采样可用");
    } finally { wrapper.unmount(); }
  });
  it("keeps page two and configuration order during per-stock completion bursts", async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ ...stock,
      symbol: `SH60000${index}`, code: `60000${index}`, name: `股票${index + 1}`, sortOrder: index + 1 }));
    mocks.getStockMonitorDashboard.mockResolvedValue({ schemaVersion: 1, stateId: "q1", xqEnabled: true,
      tradeDate: "2026-09-27", stocks: items });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start(controller) {
        stream = controller;
        controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"stateId":"q1"}\n\n'));
        options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } },
    ))));
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    try {
      await flushPromises();
      await wrapper.get(".monitor-tools input").setValue("600004");
      await wrapper.get(".monitor-tools input").trigger("keyup.enter"); await flushPromises();
      expect(wrapper.text()).toContain("第 2 / 2 页");
      const changed = { ...items[4]!, quote: { ...stock.quote, price: 14.2 },
        series: [...stock.series, { time: "2026-09-27T14:30:05+08:00", price: 14.2 }] };
      const patches = [{ baseStateId: "q1", stateId: "q2", stocks: [changed] },
        { baseStateId: "q2", stateId: "q3", stocks: [{ ...items[0]!, quote: { ...stock.quote, price: 11 } }] }];
      const frames = [...patches, patches[1]].map((patch) => `event: patch\ndata: ${JSON.stringify(patch)}\n\n`).join("");
      stream.enqueue(new TextEncoder().encode(frames)); await flushPromises();
      expect(wrapper.text()).toContain("第 2 / 2 页");
      expect(wrapper.findAll(".stock-card")).toHaveLength(1);
      expect(wrapper.text()).toContain("股票5"); expect(wrapper.text()).not.toContain("股票1");
      expect(wrapper.text()).toContain("14.20");
    } finally { wrapper.unmount(); }
  });
  it("shows disabled collection without quotes or management actions to visitors", async () => {
    mocks.getStockMonitorDashboard.mockResolvedValue({
      schemaVersion: 1, xqEnabled: false, tradeDate: null,
      stocks: [{ ...stock, dataStatus: "DISABLED", quote: { ...stock.quote, price: null, changePercent: null, amount: null, sourceTime: null, collectedAt: null, tradeDate: null, status: "DISABLED" }, series: [], fundSeries: [] }],
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
    expect(wrapper.text()).toContain("资金净额采样");
    expect(wrapper.text()).toContain("实际采集时间");
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
      stocks: [{ ...stock, dataStatus: "HISTORICAL", quote: {
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

  it("keeps the price card when the independent fund curve has no points", async () => {
    mocks.getStockMonitorDashboard.mockResolvedValue({ schemaVersion: 1, stateId: "q1",
      xqEnabled: true, tradeDate: "2026-09-27", stocks: [{ ...stock, fundSeries: [] }] });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("价格 · 元10.20");
    expect(wrapper.text()).toContain("暂无有效资金采样点；价格信息仍可查看");
    expect(wrapper.findAll("base-chart-stub")).toHaveLength(1);
    wrapper.unmount();
  });

  it("does not call a 14:56 quote confirmed close and labels missing source time as collection time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T14:56:30+08:00"));
    mocks.getStockMonitorDashboard.mockResolvedValue({ schemaVersion: 1, stateId: "q1",
      xqEnabled: true, tradeDate: "2026-09-30", stocks: [{ ...stock,
        effectiveTradeDate: "2026-09-30", dataStatus: "CURRENT", closeConfirmed: false,
        quote: { ...stock.quote, tradeDate: "2026-09-30", sourceTime: null,
          collectedAt: "2026-09-30T14:56:03+08:00" },
        series: [], fundSeries: [],
      }] });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("当日采样数据");
    expect(wrapper.text()).not.toContain("已确认收盘");
    expect(wrapper.text()).toContain("采集时间 09/30 14:56");
    expect(wrapper.text()).not.toContain("源时间 —");
    wrapper.unmount();
  });

  it("replaces one card from SSE while keeping search input and layout state", async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"stateId":"q1"}\n\n'));
        options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } },
    ))));
    mocks.getStockMonitorDashboard.mockResolvedValue({ schemaVersion: 1, stateId: "q1",
      xqEnabled: true, tradeDate: "2026-09-27", stocks: [stock] });
    const wrapper = mount(StockMonitorView, { global: { stubs: { BaseChart: true } } });
    try {
      await flushPromises();
      await wrapper.get(".quick-search input").setValue("浦发");
      streamController.enqueue(new TextEncoder().encode(`event: patch\ndata: ${JSON.stringify({
        baseStateId: "q1", stateId: "q2", stocks: [{ ...stock,
          quote: { ...stock.quote, price: 10.4 } }],
      })}\n\n`));
      await flushPromises();
      expect(wrapper.text()).toContain("价格 · 元10.40");
      expect((wrapper.get(".quick-search input").element as HTMLInputElement).value).toBe("浦发");
      expect(wrapper.text()).toContain("第 1 / 1 页");
    } finally { wrapper.unmount(); }
  });

  it("does not poll GET and uses manual refresh without overlapping an in-flight GET", async () => {
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
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(1);
      await wrapper.get(".monitor-tools .outline-button").trigger("click");
      await flushPromises();
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(2);
      await wrapper.get(".monitor-tools .outline-button").trigger("click");
      await flushPromises();
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(2);
      finishSlow(data);
      await flushPromises();
      wrapper.unmount();
      unmounted = true;
      expect(mocks.getStockMonitorDashboard).toHaveBeenCalledTimes(2);
    } finally {
      if (!unmounted) wrapper.unmount();
      vi.useRealTimers();
    }
  });
});
