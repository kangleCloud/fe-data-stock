import { describe, expect, it } from "vitest";

import { applyEtfMonitorPatch, parseEtfMonitorDashboard } from "@/utils/etfMonitor";

const quote = {
  source: "SINA_ETF", tradeDate: "2026-09-30", price: 2.5, change: 0.01,
  changePercent: 0.4, previousClose: 2.49, open: 2.49, high: 2.51, low: 2.48,
  volume: 1000000, amount: 2500000, sourceTime: null,
  collectedAt: "2026-09-30T10:00:00+08:00", status: "FRESH",
};

const item = {
  symbol: "SH510050", code: "510050", name: "50ETF", market: "SH", sortOrder: 1,
  profile: { exchange: null, etfType: null, listingStatus: null, listingDate: null,
    manager: null, custodian: null, shareCount: null, shareDate: null,
    trackingIndexCode: null, trackingIndexName: null, updatedAt: null },
  quote, series: [{ collectedAt: "2026-09-30T10:00:00+08:00", price: 2.5 }],
  fundSeries: [], fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate: "2026-09-30",
  dataStatus: "HISTORICAL", closeConfirmed: false, assetAllocation: null,
};

describe("ETF monitor public contract", () => {
  it("retains Sina quotes with XQ off and does not invent fund flow", () => {
    const dashboard = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: null,
      xqEnabled: false, tradeDate: "2026-09-30", etfs: [item] });
    expect(dashboard.etfs[0]?.quote?.price).toBe(2.5);
    expect(dashboard.etfs[0]?.series).toHaveLength(1);
    expect(dashboard.etfs[0]?.fundSeries).toEqual([]);
    expect(dashboard.etfs[0]?.closeConfirmed).toBe(false);
    expect(dashboard.etfs[0]?.assetAllocation).toBeNull();
    const unavailable = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: null,
      xqEnabled: false, tradeDate: null, etfs: [{ ...item, quote: null, series: [],
        effectiveTradeDate: null, dataStatus: "NO_DATA" }] });
    expect(unavailable.etfs[0]?.quote).toBeNull();
  });

  it("applies changed full items by symbol and rejects version gaps or configuration changes", () => {
    const current = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a",
      xqEnabled: false, tradeDate: "2026-09-30", etfs: [item] });
    const patch = { baseStateId: "a", stateId: "b", etfs: [{ ...item, quote: { ...quote, price: 2.51 } }] };
    const next = applyEtfMonitorPatch(current, patch);
    expect(next).not.toBe("duplicate");
    if (next === "duplicate") return;
    expect(next.etfs[0]?.quote?.price).toBe(2.51);
    expect(applyEtfMonitorPatch(next, patch)).toBe("duplicate");
    expect(() => applyEtfMonitorPatch(current, { ...patch, baseStateId: "old" })).toThrow("版本不连续");
    expect(() => applyEtfMonitorPatch(current, { ...patch,
      etfs: [{ ...item, sortOrder: 2 }] })).toThrow("配置变化");
  });

  it("preserves the static asset allocation when quote patches omit it", () => {
    const allocation = { source: "XQ_DANJUAN", requestedReportPeriod: "2026-06-30",
      collectedAt: "2026-09-30T10:00:00+08:00", categories: [{ category: "股票", percent: 90 }] };
    const current = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", xqEnabled: true,
      tradeDate: "2026-09-30", etfs: [{ ...item, assetAllocation: allocation }] });
    const { assetAllocation: _omitted, ...quotePatchItem } = item;
    expect(_omitted).toBeNull();
    const next = applyEtfMonitorPatch(current, { baseStateId: "a", stateId: "b",
      etfs: [{ ...quotePatchItem, quote: { ...quote, price: 2.52 } }] });
    expect(next).not.toBe("duplicate");
    if (next !== "duplicate") expect(next.etfs[0]?.assetAllocation).toEqual(allocation);
  });

  it("rejects fake asset holdings or points from a different trading day", () => {
    expect(() => parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", xqEnabled: false,
      tradeDate: "2026-09-30", etfs: [{ ...item, assetAllocation: { source: "XQ_DANJUAN",
        requestedReportPeriod: "2026-09-30", collectedAt: "2026-09-30T10:00:00+08:00",
        categories: [{ category: "股票", percent: 90 }] } }] })).toThrow("必须隐藏");
    expect(() => parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", xqEnabled: true,
      tradeDate: "2026-09-30", etfs: [{ ...item, series: [{ collectedAt: "2026-09-29T10:00:00+08:00", price: 2.5 }] }] })).toThrow("采样点无效");
  });
});
