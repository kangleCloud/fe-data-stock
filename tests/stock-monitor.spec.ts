import { describe, expect, it } from "vitest";

import { isHistoricalStock, parseStockMonitorDashboard, splitPriceSeries } from "@/utils/stockMonitor";

const stock = {
  symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", sortOrder: 1,
  profile: { industry: "银行", listingDate: "1999-11-10", marketCap: 123456789, updatedAt: "2026-09-28T15:30:00+08:00" },
  quote: {
    source: "XQ", sourceTime: "2026-09-28T09:32:00+08:00",
    collectedAt: "2026-09-28T09:32:03+08:00", tradeDate: "2026-09-28",
    price: 10.2, changePercent: 1.23, amount: 1000000, status: "FRESH",
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
      source: "XQ", price: null, amount: null, sourceTime: null, status: "DISABLED",
    });
    expect(dashboard.stocks[0]?.series).toEqual([]);
    expect(dashboard.stocks[0]?.profile).toEqual({
      industry: null, listingDate: null, marketCap: null, updatedAt: null,
    });
  });

  it("hides cached values when a quote is unavailable", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, status: "ERROR" } }],
    });
    expect(dashboard.stocks[0]?.quote.price).toBeNull();
    expect(dashboard.stocks[0]?.quote.sourceTime).toBeNull();
    expect(dashboard.stocks[0]?.series).toEqual([]);
  });

  it("rejects unsupported schema and malformed quote values", () => {
    expect(() => parseStockMonitorDashboard({ schemaVersion: 2, xqEnabled: true, stocks: [] })).toThrow();
    expect(() => parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, quote: { ...stock.quote, price: "10.2" } }],
    })).toThrow();
  });
});
