import type { PageQuery } from "@/types/api";
import type { StockDataStatus, StockFundPoint, StockMarket } from "@/types/market";

export interface EtfSymbol {
  symbol: string;
  code: string;
  name: string;
  market: Extract<StockMarket, "SH" | "SZ">;
}

export interface EtfProfile {
  fullName: string | null;
  fundType: string | null;
  investmentType: string | null;
  fundManager: string | null;
  establishedDate: string | null;
  performanceBenchmark: string | null;
  source: string | null;
  exchange: string | null;
  etfType: string | null;
  listingStatus: string | null;
  listingDate: string | null;
  manager: string | null;
  custodian: string | null;
  shareCount: number | null;
  shareDate: string | null;
  trackingIndexCode: string | null;
  trackingIndexName: string | null;
  updatedAt: string | null;
}

export interface EtfQuote {
  source: "SINA_ETF";
  tradeDate: string | null;
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
  status: "FRESH" | "STALE" | "ERROR";
}

export interface EtfPricePoint {
  collectedAt: string;
  price: number;
}

export interface EtfAssetAllocation {
  requestedReportPeriod: string;
  source: "XQ_DANJUAN";
  collectedAt: string;
  categories: Array<{ category: string; percent: number }>;
}

export interface EtfMonitorItem extends EtfSymbol {
  sortOrder: number;
  profile: EtfProfile;
  quote: EtfQuote | null;
  series: EtfPricePoint[];
  fundSeries: StockFundPoint[];
  fundFlowStatus: "NO_RELIABLE_SOURCE";
  effectiveTradeDate: string | null;
  dataStatus: Exclude<StockDataStatus, "DISABLED">;
  closeConfirmed: boolean;
  assetAllocation: EtfAssetAllocation | null;
}

export interface EtfMonitorDashboard {
  schemaVersion: 1;
  stateId: string | null;
  xqEnabled: boolean;
  tradeDate: string | null;
  etfs: EtfMonitorItem[];
}

export interface EtfDictionaryRow extends EtfSymbol {
  exchange: string | null;
  etfType: string | null;
  listingStatus: string | null;
  listingDate: string | null;
  trackingIndexCode: string | null;
  trackingIndexName: string | null;
  source: string | null;
  syncedAt: string | null;
}

export type EtfProfileRow = EtfSymbol & EtfProfile;

export interface EtfProfileDetail extends EtfProfileRow {
  assetAllocation: EtfAssetAllocation | null;
}

export interface EtfMonitorConfig extends EtfSymbol {
  sortOrder: number;
  enabled: boolean;
}

export interface IndexConfig {
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
}

export interface EtfDictionaryQuery extends PageQuery {
  keyword?: string;
  market?: "SH" | "SZ";
  etfType?: string;
}

export interface EtfProfileQuery extends PageQuery {
  keyword?: string;
  fundType?: string;
  trackingIndexCode?: string;
}
