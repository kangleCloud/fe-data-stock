import type { EntityId, PageQuery } from "@/types/api";

export type TradeStatus =
  | "PRE_OPEN"
  | "TRADING"
  | "LUNCH_BREAK"
  | "CLOSED"
  | "NON_TRADING_DAY"
  | "UNKNOWN";

export type MarketDataStatus = "FRESH" | "STALE" | "NO_DATA" | "ERROR";

export type SnapshotStatus = "FRESH" | "STALE" | "ERROR";
export type SnapshotDateBasis = "CALENDAR" | "SOURCE";

export interface SnapshotModule<T> {
  status: SnapshotStatus;
  tradeDate: string | null;
  tradeDateBasis: SnapshotDateBasis;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  message: string | null;
  data: T | null;
}

export interface SnapshotSector {
  sectorCode: string;
  sectorName: string;
  sectorType: SectorType;
  marketCap: number | null;
  changePercent: number | null;
  turnoverRate: number | null;
  riseCount: number | null;
  fallCount: number | null;
  leadingStockName: string | null;
}

export interface SnapshotRankingItem {
  sectorCode: string;
  sectorName: string;
  sectorType: SectorType;
  changePercent: number | null;
  mainNetInflow?: number | null;
  mainNetInflowRatio?: number | null;
}

export interface SnapshotTop5 {
  topRise: SnapshotRankingItem[];
  topFall: SnapshotRankingItem[];
  topInflow: SnapshotRankingItem[];
  topOutflow: SnapshotRankingItem[];
  unmatchedFundRows: number;
}

export interface SnapshotFundPoint {
  date: string;
  mainNetInflow: number | null;
  mainNetInflowRatio: number | null;
  superLargeNetInflow: number | null;
  superLargeNetInflowRatio: number | null;
  largeNetInflow: number | null;
  largeNetInflowRatio: number | null;
  mediumNetInflow: number | null;
  mediumNetInflowRatio: number | null;
  smallNetInflow: number | null;
  smallNetInflowRatio: number | null;
  shanghaiClose: number | null;
  shanghaiChangePercent: number | null;
  shenzhenClose: number | null;
  shenzhenChangePercent: number | null;
}

export interface SnapshotFundFlow {
  latest: SnapshotFundPoint;
  series: SnapshotFundPoint[];
}

export interface MarketDashboardSnapshot {
  schemaVersion: 1;
  provider: "akshare";
  generatedAt: string;
  modules: {
    industryHeatmap: SnapshotModule<SnapshotSector[]>;
    conceptHeatmap: SnapshotModule<SnapshotSector[]>;
    industryTop5: SnapshotModule<SnapshotTop5>;
    conceptTop5: SnapshotModule<SnapshotTop5>;
    marketFundFlow: SnapshotModule<SnapshotFundFlow>;
  };
}

export interface MarketModuleResponse<T> {
  data: T;
  dataStatus: MarketDataStatus;
  message?: string;
  tradeStatus?: TradeStatus;
  tradeDate?: string;
  sourceDataTime?: string;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  nextRefreshAt?: string;
}

export interface RefreshStatus {
  tradeStatus: TradeStatus;
  tradeDate: string | null;
  refreshBatchId: string | null;
  lastRefreshAt: string | null;
  lastValidDataTime: string | null;
  nextRefreshAt: string | null;
  message?: string;
}

export interface MarketRefreshResult {
  refreshBatchId?: string | null;
  accepted: boolean;
  message?: string;
}

export interface IntradayPoint {
  time: string;
  value: number | null;
}

export interface MarketIndex {
  code: string;
  name: string;
  currentPoint: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  turnover: number | null;
  updateTime: string | null;
  points: IntradayPoint[];
}

export interface MarketSummary {
  totalTurnover: number | null;
  turnoverChangePercent: number | null;
  riseCount: number | null;
  fallCount: number | null;
  flatCount: number | null;
  limitUpCount: number | null;
  limitDownCount: number | null;
  mainNetInflow: number | null;
  updateTime: string | null;
}

export type SectorType = "industry" | "concept";
export type SectorAreaMetric = "turnover" | "marketcap";
export type SectorDirection = "all" | "up" | "down";
export type SectorTopMetric =
  | "changepercent"
  | "mainnetinflow"
  | "turnover";
export type RankingPeriod = "today" | "5d" | "10d";

export interface SectorSnapshot {
  code: string;
  name: string;
  type: SectorType;
  changePercent: number | null;
  turnover: number | null;
  marketCap: number | null;
  turnoverRate: number | null;
  riseCount: number | null;
  fallCount: number | null;
  leadingStockName: string | null;
  mainNetInflow: number | null;
  updateTime?: string | null;
}

export interface SectorHeatmapData {
  availableAreaMetrics: SectorAreaMetric[];
  list: SectorSnapshot[];
}

export interface SectorTopStock {
  stockCode: string;
  stockName: string;
  latestPrice: number | null;
  changePercent: number | null;
  turnover: number | null;
  turnoverRate: number | null;
  mainNetInflow: number | null;
  mainNetInflowRatio: number | null;
  rank: number | null;
  monitorEnabled: boolean;
}

export interface SectorRankingItem {
  sectorCode: string;
  sectorName: string;
  sectorType: SectorType;
  value: number | null;
  changePercent: number | null;
  mainNetInflow: number | null;
}

export interface SectorRankings {
  topRise: SectorRankingItem[];
  topFall: SectorRankingItem[];
  topInflow: SectorRankingItem[];
  topOutflow: SectorRankingItem[];
}

export type FundType = "MAIN" | "SUPER_LARGE" | "LARGE" | "MEDIUM" | "SMALL";

export interface MarketFundPoint {
  date: string;
  mainNetInflow: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  indexPoint: number | null;
  indexChangePercent: number | null;
}

export interface SectorMutation {
  id: EntityId;
  sectorCode: string;
  sectorName: string;
  sectorType: SectorType;
  direction: "UP" | "DOWN" | "MIXED";
  mutationCount: number | null;
  changePercent: number | null;
  mainNetInflow: number | null;
  frequentStockName: string | null;
  mutationTime: string | null;
}

export type ListingStatus =
  | "LISTED"
  | "SUSPENDED"
  | "DELISTED"
  | "TERMINATED"
  | "UNKNOWN";

export interface StockDictionaryItem {
  id: EntityId;
  stockCode: string;
  stockName: string;
  market: "SH" | "SZ" | "BJ" | string;
  listingStatus: ListingStatus;
  enabled: boolean;
  enabledAt: string | null;
  displayOrder: number | null;
  updatedAt: string | null;
}

export interface StockFundPoint {
  time: string;
  inflow: number | null;
  outflow: number | null;
  netAmount: number | null;
  latestPrice: number | null;
  changePercent: number | null;
}

export interface StockMonitorItem {
  stockCode: string;
  stockName: string;
  latestPrice: number | null;
  changePercent: number | null;
  turnover: number | null;
  turnoverRate: number | null;
  inflow: number | null;
  outflow: number | null;
  netAmount: number | null;
  updateTime: string | null;
  dataStatus: MarketDataStatus;
  message?: string;
  points: StockFundPoint[];
}

export interface MarketPageResponse<T> {
  list: T[];
  total: number;
  pageNum: number;
  pageSize: number;
  enabledTotal: number;
  locatedPageNum?: number;
}

export interface StockDictionaryQuery extends PageQuery {
  keyword?: string;
  enabled?: boolean;
  listingStatus?: ListingStatus;
}

export interface StockMonitorQuery extends PageQuery {
  keyword?: string;
  locateStockCode?: string;
}

export interface StockToggleRequest {
  stockCode: string;
}

export interface StockReorderRequest {
  stockCode: string;
  direction: "UP" | "DOWN";
}
