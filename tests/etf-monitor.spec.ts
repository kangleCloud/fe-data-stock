import { describe, expect, it } from "vitest";

import { applyEtfMonitorPatch, parseEtfMonitorDashboard } from "@/utils/etfMonitor";
import { etfProfileSource, etfProfileStatus } from "@/utils/etfProfile";

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
  it("labels legacy sources without exposing internal enum names or claiming THS success", () => {
    expect(etfProfileSource("LEGACY_EXCHANGE")).toBe("历史交易所资料");
    expect(etfProfileSource("UNKNOWN_OLD_SOURCE")).toBe("历史资料");
    expect(etfProfileSource(null)).toBe("—");
    expect(etfProfileSource("THS")).toBe("同花顺");
    for (const source of ["LEGACY_EXCHANGE", "UNKNOWN_OLD_SOURCE", null]) {
      expect(etfProfileStatus({ source, updatedAt: "2026-10-03T10:00:00+08:00" })).toContain("历史同步");
    }
  });
  it("accepts old profiles with null new fields and labels their source as historical", () => {
    const parsed = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", xqEnabled: false,
      tradeDate: "2026-09-30", etfs: [{ ...item, profile: { ...item.profile, updatedAt: "2026-09-30T10:00:00+08:00" } }] });
    const profile = parsed.etfs[0]!.profile;
    expect(profile.fullName).toBeNull(); expect(profile.fundType).toBeNull();
    expect(profile.source).toBeNull(); expect(profile.establishedDate).toBeNull();
    expect(etfProfileStatus(profile)).toContain("历史同步");
    expect(etfProfileStatus({ source: "THS", updatedAt: null })).toBe("资料缺失");
    expect(etfProfileStatus({ source: "THS", updatedAt: "invalid" })).toBe("资料缺失");
  });

  it("keeps THS fields distinct and merges full profile patches with XQ off", () => {
    const profile = { ...item.profile, source: "THS", fullName: "示例基金全称", fundType: "股票型",
      investmentType: "被动指数型", fundManager: "基金经理", manager: "基金公司",
      establishedDate: "2020-01-02", performanceBenchmark: "沪深300收益率",
      updatedAt: "2026-09-30T10:00:00+08:00", listingDate: "2020-02-03", shareCount: 100 };
    const current = parseEtfMonitorDashboard({ schemaVersion: 1, stateId: "a", xqEnabled: false,
      tradeDate: "2026-09-30", etfs: [{ ...item, profile }] });
    expect(current.etfs[0]!.profile).toMatchObject({ source: "THS", establishedDate: "2020-01-02",
      listingDate: null, shareCount: null, fundType: "股票型", etfType: null, trackingIndexCode: null });
    expect(etfProfileStatus(current.etfs[0]!.profile)).toContain("同花顺同步");
    const next = applyEtfMonitorPatch(current, { baseStateId: "a", stateId: "b", etfs: [{ ...item, profile }] });
    if (next === "duplicate") throw new Error("expected new state");
    expect(next.etfs[0]!.profile.fundManager).toBe("基金经理");
    expect(next.etfs[0]!.profile.manager).toBe("基金公司");
    expect(next.etfs[0]!.quote?.source).toBe("SINA_ETF");
  });
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
