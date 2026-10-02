import { AxiosHeaders, type AxiosAdapter } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStockMonitorStream } from "@/composables/useStockMonitorStream";
import { httpClient } from "@/utils/request";
import { applyStockMonitorPatch, parseStockMonitorDashboard } from "@/utils/stockMonitor";

const originalAdapter = httpClient.defaults.adapter;
const stock = {
  symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", sortOrder: 1,
  effectiveTradeDate: "2026-09-30", dataStatus: "CURRENT", closeConfirmed: false,
  profile: { industry: "银行", listingDate: null, marketCap: null, updatedAt: null },
  quote: { source: "XQ", sourceTime: "2026-09-30T14:56:00+08:00",
    collectedAt: "2026-09-30T14:56:02+08:00", tradeDate: "2026-09-30",
    price: 10.2, previousClose: null, low: null, high: null, open: null, limitUp: null,
    limitDown: null, averagePrice: null, volume: null, changePercent: 1.2,
    amount: 1_000_000, status: "FRESH" },
  series: [{ time: "2026-09-30T14:56:00+08:00", price: 10.2 }],
  fundSeries: [{ collectedAt: "2026-09-30T14:56:02+08:00", inflow: 2_000_000,
    outflow: 1_000_000, netAmount: 1_000_000 }],
};
const raw = { schemaVersion: 1, stateId: "q1", xqEnabled: true, tradeDate: "2026-09-30", stocks: [stock] };
const Probe = { setup: useStockMonitorStream,
  template: '<div>{{ snapshot?.stateId }} {{ snapshot?.stocks[0]?.quote.price }} {{ loadError }}</div>' };

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("stock monitor incremental state", () => {
  it("replaces only known stocks, preserves order, and resyncs on gaps or config changes", () => {
    const current = parseStockMonitorDashboard(raw);
    const patch = { baseStateId: "q1", stateId: "q2", stocks: [
      { ...stock, quote: { ...stock.quote, price: 10.4 } },
    ] };
    const next = applyStockMonitorPatch(current, patch);
    expect(next).not.toBe("duplicate");
    if (next === "duplicate") return;
    expect(next.stocks[0]?.quote.price).toBe(10.4);
    expect(current.stocks[0]?.quote.price).toBe(10.2);
    expect(next.stocks.map((item) => item.symbol)).toEqual(current.stocks.map((item) => item.symbol));
    expect(applyStockMonitorPatch(next, patch)).toBe("duplicate");
    expect(() => applyStockMonitorPatch(next, { ...patch, stateId: "q3" })).toThrow("版本不连续");
    expect(() => applyStockMonitorPatch(current, { ...patch, stocks: [{ ...stock,
      symbol: "SZ000001", code: "000001", market: "SZ" }] })).toThrow("配置变化");
    expect(() => applyStockMonitorPatch(current, { ...patch, stocks: [{ ...stock, sortOrder: 2 }] })).toThrow("配置变化");
    const legacy = parseStockMonitorDashboard({ ...raw, stateId: undefined });
    expect(legacy.stateId).toBeNull();
    expect(applyStockMonitorPatch(legacy, { ...patch, baseStateId: null })).not.toBe("duplicate");
  });

  it("GETs full state before ready, applies the stock patch, and re-GETs on visibility restore", async () => {
    vi.useFakeTimers();
    let gets = 0;
    httpClient.defaults.adapter = (async (config) => {
      gets += 1;
      return { data: { success: true, code: 200, content: raw }, status: 200,
        statusText: "OK", headers: new AxiosHeaders(), config };
    }) as AxiosAdapter;
    const fetchMock = vi.fn((_url: string, options: RequestInit) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start(controller) {
        const frames = `event: ready\ndata: {"stateId":"q1"}\n\nevent: patch\ndata: ${JSON.stringify({
          baseStateId: "q1", stateId: "q2", stocks: [{ ...stock,
            quote: { ...stock.quote, price: 10.4 } }],
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(frames));
        options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } },
    )));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(Probe);
    try {
      await flushPromises();
      expect(wrapper.text()).toContain("q2 10.4");
      expect(gets).toBe(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/openapi/api/stock-monitor/v1/stream");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBe(1);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      await flushPromises();
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      await flushPromises();
      expect(gets).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { wrapper.unmount(); }
  });
});
