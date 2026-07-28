import type { EntityId, PageQuery } from "@/types/api";

export type TradeStatus =
  | "PRE_OPEN"
  | "TRADING"
  | "LUNCH_BREAK"
  | "CLOSED"
  | "NON_TRADING_DAY"
  | "UNKNOWN";

export type MarketDataStatus = "FRESH" | "STALE" | "NO_DATA" | "ERROR";

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

export type SectorType = "INDUSTRY" | "CONCEPT";
export type SectorAreaMetric = "TURNOVER" | "MARKET_CAP";
export type SectorDirection = "ALL" | "RISE" | "FALL";
export type SectorTopMetric = "CHANGE_PERCENT" | "MAIN_NET_INFLOW" | "TURNOVER";
export type RankingPeriod = "TODAY" | "5D" | "10D";

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
