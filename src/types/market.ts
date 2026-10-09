import type { PageQuery } from "@/types/api";
import type { MonitorRefreshResult } from "@/types/refresh";

export type SnapshotStatus = "FRESH" | "STALE" | "ERROR";
export type SnapshotDateBasis = "CALENDAR";
export type SectorType = "industry" | "concept";

export interface SnapshotModule<T> {
  status: SnapshotStatus;
  tradeDate: string | null;
  tradeDateBasis: SnapshotDateBasis;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  message: string | null;
  data: T | null;
}

export interface SnapshotSectorItem {
  code: string | null;
  name: string;
  type: SectorType;
  indexValue: number | null;
  changePct: number | null;
  inflow: number | null;
  outflow: number | null;
  netAmount: number | null;
  netFlowRate: number | null;
  companyCount: number | null;
  leader: string | null;
  leaderChangePct: number | null;
  leaderPrice: number | null;
}

export interface SnapshotSectorData {
  source: "THS";
  period: "INTRADAY";
  items: SnapshotSectorItem[];
}

export interface SnapshotFundPoint {
  collectedAt: string;
  inflow: number | null;
  outflow: number | null;
  netAmount: number | null;
}

export interface SnapshotFundLatest extends SnapshotFundPoint {
  riseCount: number | null;
  fallCount: number | null;
  flatCount: number | null;
  stockCount: number | null;
}

export interface SnapshotFundFlow {
  source: "THS_INDIVIDUAL_AGGREGATE";
  reconciledFromLegacy: boolean;
  latest: SnapshotFundLatest;
  series: SnapshotFundPoint[];
}

export interface SnapshotCoreIndexPoint {
  collectedAt: string;
  price: number;
}

export interface SnapshotCoreIndex {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  sourceTime: null;
  collectedAt: string | null;
  series: SnapshotCoreIndexPoint[];
}

export interface SnapshotCoreIndices {
  source: "SINA_INDEX";
  sourceTime: null;
  items: SnapshotCoreIndex[];
}

export interface MarketDashboardSnapshot {
  schemaVersion: 1;
  provider: "akshare";
  snapshotId: string | null;
  generatedAt: string;
  modules: {
    industrySectors: SnapshotModule<SnapshotSectorData>;
    conceptSectors: SnapshotModule<SnapshotSectorData>;
    marketFundFlow: SnapshotModule<SnapshotFundFlow>;
    coreIndices?: SnapshotModule<SnapshotCoreIndices>;
  };
}

export type StockMarket = "SH" | "SZ" | "BJ";
export type StockQuoteStatus = "DISABLED" | "FRESH" | "STALE" | "ERROR";
export type StockDataStatus = "CURRENT" | "DELAYED" | "HISTORICAL" | "NO_DATA" | "DISABLED";

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
  previousClose: number | null;
  low: number | null;
  high: number | null;
  open: number | null;
  limitUp: number | null;
  limitDown: number | null;
  averagePrice: number | null;
  volume: number | null;
  changePercent: number | null;
  amount: number | null;
  status: StockQuoteStatus;
}

export interface StockPricePoint {
  time: string;
  price: number;
}

export interface StockFundPoint {
  collectedAt: string;
  inflow: number | null;
  outflow: number | null;
  netAmount: number | null;
}

export type StockFundFlowStatus = "AVAILABLE" | "STALE" | "NO_DATA" | "DISABLED";

export interface StockMonitorStock extends StockSymbol {
  sortOrder: number;
  effectiveTradeDate: string | null;
  dataStatus: StockDataStatus;
  closeConfirmed: boolean;
  profile: StockProfile;
  quote: StockQuote;
  series: StockPricePoint[];
  fundSeries: StockFundPoint[];
  fundFlowStatus: StockFundFlowStatus | null;
  fundFlowMessage: string | null;
}

export interface StockMonitorDashboard {
  schemaVersion: 1;
  stateId: string | null;
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

export type StockMonitorRefreshResult = MonitorRefreshResult;
export type StockMonitorRefreshStatus = MonitorRefreshResult;
