import { AxiosHeaders } from "axios";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMarketSnapshotStream } from "@/composables/useMarketSnapshotStream";
import { useStockMonitorStream } from "@/composables/useStockMonitorStream";
import { useEtfMonitorStream } from "@/composables/useEtfMonitorStream";
import { httpClient } from "@/utils/request";
import { parseMarketSnapshot } from "@/utils/marketStream";
import { parseStockMonitorDashboard } from "@/utils/stockMonitor";
import { parseEtfMonitorDashboard } from "@/utils/etfMonitor";
import { conceptData, industryData, moduleOf, snapshot } from "./fixtures/marketSnapshot";

const at = "2026-09-30T14:56:00+08:00";
const later = "2026-09-30T14:56:05+08:00";
const stock = { symbol: "SH600000", code: "600000", name: "示例股票", market: "SH", sortOrder: 1,
  effectiveTradeDate: "2026-09-30", dataStatus: "CURRENT", closeConfirmed: false,
  profile: { industry: null, listingDate: null, marketCap: null, updatedAt: null },
  quote: { source: "XQ", sourceTime: at, collectedAt: at, tradeDate: "2026-09-30", price: 10,
    volume: null, changePercent: null, amount: null, status: "FRESH" },
  series: [{ time: at, price: 10 }], fundSeries: [] };
const stock2 = { ...stock, symbol: "SZ000001", code: "000001", name: "第二只股票", market: "SZ", sortOrder: 2 };
const stocks = parseStockMonitorDashboard({ schemaVersion: 1, stateId: "q1", xqEnabled: true,
  tradeDate: "2026-09-30", stocks: [stock, stock2] });
const stockChanges = [stock2, stock].map((item, index) => ({ baseStateId: `q${index + 1}`, stateId: `q${index + 2}`,
  stocks: [{ ...item, quote: { ...item.quote, price: 11, collectedAt: later, sourceTime: later },
    series: [...item.series, { time: later, price: 11 }] }] }));
const etf = { symbol: "SH510050", code: "510050", name: "示例ETF", market: "SH", sortOrder: 1,
  profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null, manager: null,
    custodian: null, shareCount: null, shareDate: null, trackingIndexCode: null, trackingIndexName: null, updatedAt: null },
  quote: { source: "SINA_ETF", sourceTime: null, collectedAt: at, tradeDate: "2026-09-30", status: "FRESH",
    price: 2, change: null, changePercent: null, previousClose: null, open: null, high: null, low: null, volume: null, amount: null },
  series: [{ collectedAt: at, price: 2 }], fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE",
  effectiveTradeDate: "2026-09-30", dataStatus: "CURRENT", closeConfirmed: false, assetAllocation: null };
const etfs = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "e1", tradeDate: "2026-09-30", xqEnabled: false, etfs: [etf] });
const etfChanges = [1, 2].map((index) => ({ baseStateId: `e${index}`, stateId: `e${index + 1}`, etfs: [{ ...etf,
  quote: { ...etf.quote, price: 2 + index / 10 }, series: [...etf.series, { collectedAt: later, price: 2 + index / 10 }] }] }));
const marketChanges = [
  { industrySectors: { ...moduleOf(industryData), lastSuccessAt: "2026-09-23T13:02:06+08:00" } },
  { conceptSectors: { ...moduleOf(conceptData), lastSuccessAt: "2026-09-23T13:02:07+08:00" } },
].map((modules, index) => ({ baseSnapshotId: `s${index + 1}`, snapshotId: `s${index + 2}`,
  generatedAt: "2026-09-23T13:02:08+08:00", modules }));

const cases = [
  { name: "market", use: useMarketSnapshotStream, key: "snapshotId", base: "baseSnapshotId", initial: parseMarketSnapshot(snapshot),
    changes: marketChanges, final: parseMarketSnapshot({ ...snapshot, snapshotId: "s3", generatedAt: "2026-09-23T13:02:08+08:00",
      modules: { ...snapshot.modules, ...marketChanges[0]!.modules, ...marketChanges[1]!.modules } }) },
  { name: "stock", use: useStockMonitorStream, key: "stateId", base: "baseStateId", initial: stocks,
    changes: stockChanges, final: parseStockMonitorDashboard({ ...stocks, stateId: "q3", stocks: stocks.stocks.map((item) => ({ ...item,
      quote: { ...item.quote, price: 11, collectedAt: later, sourceTime: later }, series: [...item.series, { time: later, price: 11 }] })) }) },
  { name: "ETF", use: useEtfMonitorStream, key: "stateId", base: "baseStateId", initial: etfs,
    changes: etfChanges, final: parseEtfMonitorDashboard({ ...etfs, stateId: "e3", etfs: [{ ...etf,
      quote: { ...etf.quote, price: 2.2 }, series: [...etf.series, { collectedAt: later, price: 2.2 }] }] }) },
];
const originalAdapter = httpClient.defaults.adapter;
afterEach(() => {
  httpClient.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe.each(cases)("$name incremental consumer", (spec) => {
  const Probe = { setup: () => spec.use(), template: "<pre>{{ JSON.stringify(snapshot) }}</pre>" };
  const id = (value: unknown) => (value as Record<string, unknown>)[spec.key];
  function install(frames: (connection: number) => string, values: unknown[], closeFirst = false) {
    let gets = 0;
    httpClient.defaults.adapter = async (config) => ({ data: { success: true, content: values[Math.min(gets++, values.length - 1)] },
      status: 200, statusText: "OK", headers: new AxiosHeaders(), config });
    let connections = 0;
    const fetch = vi.fn((_url: string, options: RequestInit) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(frames(++connections)));
      if (closeFirst && connections === 1) controller.close();
      else options.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
    } }), { headers: { "Content-Type": "text/event-stream" } })));
    vi.stubGlobal("fetch", fetch);
    return { gets: () => gets, fetch };
  }

  it("merges burst patches and duplicates without losing modules, order or historical points", async () => {
    vi.useFakeTimers();
    const setup = install(() => frame("ready", { [spec.key]: id(spec.initial) }) +
      spec.changes.map((patch) => frame("patch", patch) + frame("patch", patch)).join(""), [spec.initial]);
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(JSON.parse(wrapper.text())).toEqual(spec.final);
      await vi.advanceTimersByTimeAsync(10000); expect(setup.gets()).toBe(1);
      await (wrapper.vm as unknown as { manualRefresh: () => Promise<void> }).manualRefresh();
      await flushPromises(); expect(setup.gets()).toBe(2); expect(JSON.parse(wrapper.text())).toEqual(spec.final);
    } finally { wrapper.unmount(); }
  });

  it.each(["gap", "out-of-order", "redis-newer", "disconnect"])("re-GETs on %s then ignores superseded frames", async (fault) => {
    vi.useFakeTimers();
    const setup = install((connection) => {
      if (connection > 1) return frame("ready", { [spec.key]: id(spec.final) });
      if (fault === "redis-newer") return frame("ready", { [spec.key]: id(spec.final) });
      const ready = frame("ready", { [spec.key]: id(spec.initial) });
      if (fault === "disconnect") return ready;
      const invalid = fault === "gap" ? { ...spec.changes[0], [spec.base]: "missing" } : spec.changes[1];
      return ready + frame("patch", invalid) + frame("patch", spec.changes[0]);
    }, [spec.initial, spec.final], fault === "disconnect");
    const wrapper = mount(Probe);
    try {
      await flushPromises(); expect(JSON.parse(wrapper.text())).toEqual(spec.initial);
      await vi.advanceTimersByTimeAsync(1000);
      await flushPromises(); expect(setup.gets()).toBe(2); expect(JSON.parse(wrapper.text())).toEqual(spec.final);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange")); await flushPromises();
      await vi.advanceTimersByTimeAsync(60000); expect(setup.gets()).toBe(2);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange")); await flushPromises();
      expect(setup.gets()).toBe(3); expect(JSON.parse(wrapper.text())).toEqual(spec.final);
    } finally { wrapper.unmount(); }
  });
});
