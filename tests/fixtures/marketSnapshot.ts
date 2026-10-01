import type {
  MarketDashboardSnapshot,
  SnapshotFundFlow,
  SnapshotModule,
  SnapshotSectorData,
  SnapshotSectorItem,
} from "@/types/market";

export function sectorItem(overrides: Partial<SnapshotSectorItem> = {}): SnapshotSectorItem {
  return {
    code: null, name: "测试板块", type: "industry", indexValue: 1050,
    changePct: 2.5, inflow: 200_000_000, outflow: 77_000_000,
    netAmount: 123_000_000, netFlowRate: 44.4, companyCount: 30,
    leader: "示例股票", leaderChangePct: 3.2, leaderPrice: 11.62,
    ...overrides,
  };
}

export function moduleOf<T>(data: T | null, status: "FRESH" | "STALE" | "ERROR" = "FRESH"): SnapshotModule<T> {
  return {
    status, tradeDate: data ? "2026-09-23" : null, tradeDateBasis: "CALENDAR",
    lastSuccessAt: data ? "2026-09-23T10:00:00+08:00" : null,
    lastAttemptAt: "2026-09-23T10:00:00+08:00",
    message: status === "ERROR" ? "暂无可用数据" : null, data,
  };
}

export const industryData: SnapshotSectorData = {
  source: "THS", period: "INTRADAY",
  items: [
    sectorItem({ name: "银行", changePct: 2.5, netAmount: 123_000_000 }),
    sectorItem({ name: "煤炭", changePct: -1.8, netAmount: -80_000_000, netFlowRate: -30 }),
    sectorItem({ name: "未知企业数", companyCount: null, changePct: null, netAmount: null, netFlowRate: null }),
  ],
};

export const conceptData: SnapshotSectorData = {
  source: "THS", period: "INTRADAY",
  items: [sectorItem({ name: "人工智能", type: "concept", changePct: 4.1, netAmount: 220_000_000 })],
};

export const fundData: SnapshotFundFlow = {
  source: "THS_INDIVIDUAL_AGGREGATE",
  latest: { collectedAt: "2026-09-23T13:02:00+08:00", inflow: 300_000_000,
    outflow: 177_000_000, netAmount: 123_000_000,
    riseCount: 2600, fallCount: 1800, flatCount: 120, stockCount: 4520 },
  series: [
    { collectedAt: "2026-09-23T09:30:00+08:00", inflow: 100_000_000, outflow: 80_000_000, netAmount: 20_000_000 },
    { collectedAt: "2026-09-23T09:32:00+08:00", inflow: 110_000_000, outflow: 85_000_000, netAmount: 25_000_000 },
    { collectedAt: "2026-09-23T13:02:00+08:00", inflow: 300_000_000, outflow: 177_000_000, netAmount: 123_000_000 },
  ],
};

export const snapshot: MarketDashboardSnapshot = {
  schemaVersion: 1, provider: "akshare", generatedAt: "2026-09-23T13:02:05+08:00",
  modules: {
    industrySectors: moduleOf(industryData),
    conceptSectors: moduleOf(conceptData),
    marketFundFlow: moduleOf(fundData),
  },
};
