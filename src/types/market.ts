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

export interface SnapshotRankingItem {
  sectorName: string;
  sectorType: SectorType;
  changePercent: number;
  netFlowAmount: number;
}

export interface SnapshotTop5 {
  source: "THS";
  period: "INTRADAY";
  topRise: SnapshotRankingItem[];
  topFall: SnapshotRankingItem[];
  topInflow: SnapshotRankingItem[];
  topOutflow: SnapshotRankingItem[];
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
export type SectorDirection = "all" | "up" | "down";
export type SectorTopMetric =
  | "changepercent"
  | "mainnetinflow"
  | "turnover";
export type RankingPeriod = "today" | "5d" | "10d";

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

export type StockMarket = "SH" | "SZ" | "BJ";
export type StockQuoteStatus = "DISABLED" | "FRESH" | "STALE" | "ERROR";

export interface StockSymbol {
  symbol: string;
  code: string;
  name: string;
  market: StockMarket;
}

export interface StockProfile {
  industry: string | null;
  listingDate: string | null;
  marketCap: number | null;
  updatedAt: string | null;
}

export interface StockQuote {
  source: "XQ";
  sourceTime: string | null;
  collectedAt: string | null;
  tradeDate: string | null;
  price: number | null;
  changePercent: number | null;
  amount: number | null;
  status: StockQuoteStatus;
}

export interface StockPricePoint {
  time: string;
  price: number;
}

export interface StockMonitorStock extends StockSymbol {
  sortOrder: number;
  profile: StockProfile;
  quote: StockQuote;
  series: StockPricePoint[];
}

export interface StockMonitorDashboard {
  schemaVersion: 1;
  xqEnabled: boolean;
  tradeDate: string | null;
  stocks: StockMonitorStock[];
}

export interface StockMonitorConfig extends StockSymbol {
  enabled: true;
  sortOrder: number;
  profile: StockProfile;
}

export interface StockMonitorAdminRow extends StockSymbol {
  enabled: boolean;
  sortOrder: number;
  profile: StockProfile;
}

export interface StockProfileRow extends StockSymbol, StockProfile {}

export interface StockMonitorPageQuery extends PageQuery {
  keyword?: string;
  enabled?: boolean;
}

export interface StockDictionaryPageQuery extends PageQuery {
  keyword?: string;
  market?: StockMarket;
}

export interface StockDictionaryCreateRequest {
  market: StockMarket;
  code: string;
  name: string;
}

export interface StockProfilePageQuery extends PageQuery {
  keyword?: string;
  industry?: string;
}

export interface StockMonitorRefreshResult {
  accepted: boolean;
  jobId: string | null;
  status: string;
}

export interface StockMonitorRefreshStatus {
  jobId: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
}
