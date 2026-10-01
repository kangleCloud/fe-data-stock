import { describe, expect, it } from "vitest";

import { isHistoricalStock, parseStockMonitorDashboard, splitPriceSeries } from "@/utils/stockMonitor";

const stock = {
  symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", sortOrder: 1,
  profile: { industry: "银行", listingDate: "1999-11-10", marketCap: 123456789, updatedAt: "2026-09-28T15:30:00+08:00" },
  quote: {
    source: "XQ", sourceTime: "2026-09-28T09:32:00+08:00",
    collectedAt: "2026-09-28T09:32:03+08:00", tradeDate: "2026-09-28",
    price: 10.2, previousClose: 10.08, low: 10.01, high: 10.33, open: 10.05,
    limitUp: 11.22, limitDown: 9.18, averagePrice: 10.123,
    volume: 123456, changePercent: 1.23, amount: 1000000, status: "FRESH",
  },
  series: [
    { time: "2026-09-28T09:30:00+08:00", price: 10.1 },
    { time: "2026-09-28T09:32:00+08:00", price: 10.2 },
    { time: "2026-09-28T13:02:00+08:00", price: 10.3 },
  ],
};

describe("stock monitor V1", () => {
  it("keeps actual sampling times and labels prior trading days as historical", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28", stocks: [stock],
    });
    expect(dashboard.stocks[0]?.quote.amount).toBe(1000000);
    expect(dashboard.stocks[0]?.quote).toMatchObject({
      previousClose: 10.08, low: 10.01, high: 10.33, open: 10.05, limitUp: 11.22,
      limitDown: 9.18, averagePrice: 10.123, volume: 123456,
    });
    expect(splitPriceSeries(dashboard.stocks[0]!.series)).toHaveLength(2);
    expect(isHistoricalStock(dashboard.stocks[0]!, "2026-09-29")).toBe(true);
    expect(isHistoricalStock(dashboard.stocks[0]!, "2026-09-28")).toBe(false);
  });

  it("does not expose stale XQ values when collection is disabled", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: false, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { source: "XQ", price: "hidden" }, series: "hidden" }],
    });
    expect(dashboard.tradeDate).toBeNull();
    expect(dashboard.stocks[0]?.quote).toMatchObject({
      source: "XQ", price: null, previousClose: null, amount: null, low: null, high: null,
      open: null, limitUp: null, limitDown: null, averagePrice: null,
      volume: null, sourceTime: null, status: "DISABLED",
    });
    expect(dashboard.stocks[0]?.series).toEqual([]);
    expect(dashboard.stocks[0]?.profile).toEqual({
      industry: null, listingDate: null, marketCap: null, updatedAt: null,
    });
  });

  it.each(["ERROR", "DISABLED"] as const)("hides cached values when a quote is %s", (status) => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, status } }],
    });
    expect(dashboard.stocks[0]?.quote.price).toBeNull();
    expect(dashboard.stocks[0]?.quote.previousClose).toBeNull();
    expect(dashboard.stocks[0]?.quote.low).toBeNull();
    expect(dashboard.stocks[0]?.quote.volume).toBeNull();
    expect(dashboard.stocks[0]?.quote.sourceTime).toBeNull();
    expect(dashboard.stocks[0]?.series).toEqual([]);
  });

  it("preserves stale valid values and nullable extended quote fields", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: {
        ...stock.quote, status: "STALE", previousClose: null, low: null, high: null,
        open: null, limitUp: null, limitDown: null, averagePrice: null, volume: null,
      } }],
    });
    expect(dashboard.stocks[0]?.quote).toMatchObject({ status: "STALE", price: 10.2, previousClose: null, low: null, volume: null });
    expect(dashboard.stocks[0]?.series).toEqual(stock.series);
  });

  it("treats omitted V1 extended quote fields as unavailable during rollout", () => {
    const oldQuote: Record<string, unknown> = { ...stock.quote };
    for (const key of ["previousClose", "low", "high", "open", "limitUp", "limitDown", "averagePrice", "volume"]) {
      delete oldQuote[key];
    }
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: oldQuote }],
    });
    expect(dashboard.stocks[0]?.quote).toMatchObject({
      price: 10.2, previousClose: null, low: null, high: null, open: null, limitUp: null,
      limitDown: null, averagePrice: null, volume: null,
    });
  });

  it("rejects unsupported schema and malformed quote values", () => {
    expect(() => parseStockMonitorDashboard({ schemaVersion: 2, xqEnabled: true, stocks: [] })).toThrow();
    expect(() => parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, price: "10.2" } }],
    })).toThrow();
    expect(() => parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, averagePrice: "10.123" } }],
    })).toThrow();
    expect(() => parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, previousClose: "10.08" } }],
    })).toThrow();
  });
});
