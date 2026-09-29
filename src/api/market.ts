import type {
  MarketDashboardSnapshot,
  MarketFundPoint,
  MarketIndex,
  MarketModuleResponse,
  MarketRefreshResult,
  MarketSummary,
  RankingPeriod,
  RefreshStatus,
  SectorMutation,
  SectorRankings,
  SectorTopMetric,
  SectorTopStock,
  SectorType,
  StockMonitorConfig,
  StockMonitorDashboard,
  StockMonitorRefreshResult,
  StockMonitorRefreshStatus,
  StockSymbol,
} from "@/types/market";
import { PUBLIC_API_BASE_URL, request } from "@/utils/request";
import { parseStockMonitorDashboard } from "@/utils/stockMonitor";

const silent = { silentError: true } as const;

export function getMarketDashboardSnapshot(): Promise<MarketDashboardSnapshot> {
  return request<MarketDashboardSnapshot>({
    url: "/market/dashboard/snapshot",
    method: "GET",
    baseURL: PUBLIC_API_BASE_URL,
    publicAccess: true,
    withCredentials: false,
    ...silent,
  });
}

interface SectorTopStockSource extends Omit<SectorTopStock, "turnover"> {
  turnoverAmount: number | null;
}

interface SectorRankingSource {
  period: RankingPeriod;
  sectorType: SectorType;
  sectorCode: string;
  sectorName: string;
  changePercent: number | null;
  mainNetInflow: number | null;
}

function groupRankings(items: SectorRankingSource[]): SectorRankings {
  const byChange = items.filter((item) => item.changePercent != null);
  const byFund = items.filter((item) => item.mainNetInflow != null);
  const mapValue = (
    item: SectorRankingSource,
    value: number | null,
  ) => ({ ...item, value });
  return {
    topRise: [...byChange]
      .sort((left, right) => right.changePercent! - left.changePercent!)
      .slice(0, 5)
      .map((item) => mapValue(item, item.changePercent)),
    topFall: [...byChange]
      .sort((left, right) => left.changePercent! - right.changePercent!)
      .slice(0, 5)
      .map((item) => mapValue(item, item.changePercent)),
    topInflow: [...byFund]
      .sort((left, right) => right.mainNetInflow! - left.mainNetInflow!)
      .slice(0, 5)
      .map((item) => mapValue(item, item.mainNetInflow)),
    topOutflow: [...byFund]
      .sort((left, right) => left.mainNetInflow! - right.mainNetInflow!)
      .slice(0, 5)
      .map((item) => mapValue(item, item.mainNetInflow)),
  };
}

export function getDashboardStatus(): Promise<RefreshStatus> {
  return request({ url: "/market/dashboard/status", method: "GET", ...silent });
}

export function getIndices(): Promise<MarketModuleResponse<MarketIndex[]>> {
  return request({ url: "/market/dashboard/indices", method: "GET", ...silent });
}

export function getMarketSummary(): Promise<MarketModuleResponse<MarketSummary>> {
  return request({ url: "/market/dashboard/summary", method: "GET", ...silent });
}

export function refreshDashboard(): Promise<MarketRefreshResult> {
  return request({ url: "/market/dashboard/refresh", method: "POST", ...silent });
}

export async function getSectorTopStocks(params: {
  sectorType: SectorType;
  sectorCode: string;
  metric: SectorTopMetric;
}): Promise<MarketModuleResponse<SectorTopStock[]>> {
  const response = await request<
    MarketModuleResponse<SectorTopStockSource[]>
  >({
    url: "/market/sector/topStocks",
    method: "GET",
    params,
    ...silent,
  });
  return {
    ...response,
    data: (response.data || []).map(({ turnoverAmount, ...item }) => ({
      ...item,
      turnover: turnoverAmount,
    })),
  };
}

export async function getSectorRankings(params: {
  period: RankingPeriod;
  sectorType: SectorType;
}): Promise<MarketModuleResponse<SectorRankings>> {
  const response = await request<MarketModuleResponse<SectorRankingSource[]>>({
    url: "/market/sector/rankings",
    method: "GET",
    params,
    ...silent,
  });
  return {
    ...response,
    data: groupRankings(Array.isArray(response.data) ? response.data : []),
  };
}

export function getSectorMutations(): Promise<
  MarketModuleResponse<SectorMutation[]>
> {
  return request({ url: "/market/sector/mutations", method: "GET", ...silent });
}

export function getMarketFundTrend(params: {
  days: 5 | 10 | 20;
  indexCode: string;
}): Promise<MarketModuleResponse<MarketFundPoint[]>> {
  return request({
    url: "/market/fund/trend",
    method: "GET",
    params,
    ...silent,
  });
}

export async function getStockMonitorDashboard(): Promise<StockMonitorDashboard> {
  const content = await request<unknown>({
    url: "/stock-monitor/v1/dashboard",
    method: "GET",
    baseURL: PUBLIC_API_BASE_URL,
    publicAccess: true,
    withCredentials: false,
    ...silent,
  });
  return parseStockMonitorDashboard(content);
}

export function searchStockDictionary(keyword: string, limit = 20): Promise<StockSymbol[]> {
  return request({
    url: "/system/stockMonitor/dictionary",
    method: "GET",
    params: { keyword, limit },
    ...silent,
  });
}

export function getStockMonitorConfig(): Promise<StockMonitorConfig[]> {
  return request({ url: "/system/stockMonitor/list", method: "GET", ...silent });
}

export function setStockEnabled(symbol: string, enabled: boolean): Promise<boolean> {
  return request({ url: "/system/stockMonitor/enable", method: "POST", data: { symbol, enabled } });
}

export function sortStockMonitor(symbols: string[]): Promise<boolean> {
  return request({ url: "/system/stockMonitor/sort", method: "POST", data: { symbols } });
}

export function refreshStockMonitor(): Promise<StockMonitorRefreshResult> {
  return request({ url: "/system/stockMonitor/refresh", method: "POST", data: {} });
}

export function getStockMonitorRefreshStatus(): Promise<StockMonitorRefreshStatus> {
  return request({ url: "/system/stockMonitor/refresh/status", method: "GET", ...silent });
}
