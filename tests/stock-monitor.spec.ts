import { describe, expect, it } from "vitest";

import { isHistoricalStock, parseStockMonitorDashboard, splitPriceSeries, splitStockFundSeries } from "@/utils/stockMonitor";

const stock = {
  symbol: "SH600000", code: "600000", name: "浦发银行", market: "SH", sortOrder: 1,
  effectiveTradeDate: "2026-09-28", dataStatus: "CURRENT", closeConfirmed: false,
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
  fundSeries: [
    { collectedAt: "2026-09-28T09:30:00+08:00", inflow: 2_000_000, outflow: 1_000_000, netAmount: 1_000_000 },
    { collectedAt: "2026-09-28T13:02:00+08:00", inflow: 1_000_000, outflow: 2_000_000, netAmount: -1_000_000 },
  ],
};

describe("stock monitor V1", () => {
  it("keeps actual sampling times and labels prior trading days as historical", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28", stocks: [stock],
    });
    expect(dashboard.stocks[0]?.quote.amount).toBe(1000000);
    expect(dashboard.stocks[0]?.effectiveTradeDate).toBe("2026-09-28");
    expect(dashboard.stocks[0]?.closeConfirmed).toBe(false);
    expect(dashboard.stocks[0]?.quote).toMatchObject({
      previousClose: 10.08, low: 10.01, high: 10.33, open: 10.05, limitUp: 11.22,
      limitDown: 9.18, averagePrice: 10.123, volume: 123456,
    });
    expect(splitPriceSeries(dashboard.stocks[0]!.series)).toHaveLength(2);
    expect(splitStockFundSeries(dashboard.stocks[0]!.fundSeries)).toHaveLength(2);
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
    expect(dashboard.stocks[0]?.fundSeries).toEqual([]);
    expect(dashboard.stocks[0]?.profile).toEqual({
      industry: null, listingDate: null, marketCap: null, updatedAt: null,
    });
  });

  it.each(["NO_DATA", "DISABLED"] as const)("hides cached values when data status is %s", (dataStatus) => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, dataStatus }],
    });
    expect(dashboard.stocks[0]?.quote.price).toBeNull();
    expect(dashboard.stocks[0]?.quote.previousClose).toBeNull();
    expect(dashboard.stocks[0]?.quote.low).toBeNull();
    expect(dashboard.stocks[0]?.quote.volume).toBeNull();
    expect(dashboard.stocks[0]?.quote.sourceTime).toBeNull();
    expect(dashboard.stocks[0]?.series).toEqual([]);
    expect(dashboard.stocks[0]?.fundSeries).toEqual([]);
  });

  it("preserves stale valid values and nullable extended quote fields", () => {
    const dashboard = parseStockMonitorDashboard({
      schemaVersion: 1, xqEnabled: true, tradeDate: "2026-09-28",
      stocks: [{ ...stock, dataStatus: "HISTORICAL", quote: {
        ...stock.quote, status: "STALE", previousClose: null, low: null, high: null,
        open: null, limitUp: null, limitDown: null, averagePrice: null, volume: null,
      } }],
    });
    expect(dashboard.stocks[0]?.quote).toMatchObject({ status: "STALE", price: 10.2, previousClose: null, low: null, volume: null });
    expect(dashboard.stocks[0]?.series).toEqual(stock.series);
    expect(dashboard.stocks[0]?.fundSeries).toEqual(stock.fundSeries);
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

  it("uses each stock's effective day and keeps valid historical quote and curves over the holiday", () => {
    const second = { ...stock, symbol: "SZ000001", code: "000001", market: "SZ", sortOrder: 2,
      effectiveTradeDate: "2026-09-27", dataStatus: "HISTORICAL", closeConfirmed: false,
      quote: { ...stock.quote, sourceTime: "2026-09-27T14:56:00+08:00",
        collectedAt: "2026-09-27T14:56:03+08:00", tradeDate: "2026-09-27", status: "STALE" },
      series: [{ time: "2026-09-27T14:56:00+08:00", price: 10.2 }],
      fundSeries: [{ collectedAt: "2026-09-27T14:56:03+08:00", inflow: 2_000_000,
        outflow: 1_000_000, netAmount: 1_000_000 }] };
    const dashboard = parseStockMonitorDashboard({ schemaVersion: 1, xqEnabled: true,
      tradeDate: "2026-09-28", stocks: [stock, second] });
    expect(dashboard.stocks.map((item) => item.effectiveTradeDate)).toEqual(["2026-09-28", "2026-09-27"]);
    expect(isHistoricalStock(dashboard.stocks[1]!, "2026-10-01")).toBe(true);
    expect(dashboard.stocks[1]?.closeConfirmed).toBe(false);
    expect(dashboard.stocks[1]?.quote.price).toBe(10.2);
    expect(dashboard.stocks[1]?.fundSeries).toHaveLength(1);
  });

  it("keeps price points when fund samples are absent and rejects cross-day fund points", () => {
    const withoutFund = parseStockMonitorDashboard({ schemaVersion: 1, xqEnabled: true,
      tradeDate: "2026-09-28", stocks: [{ ...stock, fundSeries: [] }] });
    expect(withoutFund.stocks[0]?.series).toHaveLength(3);
    expect(withoutFund.stocks[0]?.fundSeries).toEqual([]);
    expect(() => parseStockMonitorDashboard({ schemaVersion: 1, xqEnabled: true,
      tradeDate: "2026-09-28", stocks: [{ ...stock, fundSeries: [
        { ...stock.fundSeries[0], collectedAt: "2026-09-27T09:30:00+08:00" },
      ] }] })).toThrow();
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
