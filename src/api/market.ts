import type {
  MarketFundPoint,
  MarketIndex,
  MarketModuleResponse,
  MarketPageResponse,
  MarketRefreshResult,
  MarketSummary,
  RankingPeriod,
  RefreshStatus,
  SectorMutation,
  SectorRankings,
  SectorSnapshot,
  SectorTopMetric,
  SectorTopStock,
  SectorType,
  StockDictionaryItem,
  StockDictionaryQuery,
  StockMonitorItem,
  StockMonitorQuery,
  StockReorderRequest,
  StockToggleRequest,
} from "@/types/market";
import { request } from "@/utils/request";

const silent = { silentError: true } as const;

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

export function getSectorHeatmap(params: {
  sectorType: SectorType;
}): Promise<MarketModuleResponse<SectorSnapshot[]>> {
  return request({
    url: "/market/sector/heatmap",
    method: "GET",
    params,
    ...silent,
  });
}

export function getSectorTopStocks(params: {
  sectorCode: string;
  metric: SectorTopMetric;
}): Promise<MarketModuleResponse<SectorTopStock[]>> {
  return request({
    url: "/market/sector/topStocks",
    method: "GET",
    params,
    ...silent,
  });
}

export function getSectorRankings(params: {
  period: RankingPeriod;
}): Promise<MarketModuleResponse<SectorRankings>> {
  return request({
    url: "/market/sector/rankings",
    method: "GET",
    params,
    ...silent,
  });
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

export function getStockDictionaryPage(
  params: StockDictionaryQuery,
): Promise<MarketPageResponse<StockDictionaryItem>> {
  return request({
    url: "/market/stock/dictionary/page",
    method: "GET",
    params,
    ...silent,
  });
}

export function getStockMonitorPage(
  params: StockMonitorQuery,
): Promise<MarketModuleResponse<MarketPageResponse<StockMonitorItem>>> {
  return request({
    url: "/market/stock/monitor/page",
    method: "GET",
    params,
    ...silent,
  });
}

export function enableStock(data: StockToggleRequest): Promise<boolean> {
  return request({ url: "/market/stock/enable", method: "POST", data });
}

export function disableStock(data: StockToggleRequest): Promise<boolean> {
  return request({ url: "/market/stock/disable", method: "POST", data });
}

export function reorderStock(data: StockReorderRequest): Promise<boolean> {
  return request({ url: "/market/stock/reorder", method: "POST", data });
}

export function syncStockDictionary(): Promise<boolean> {
  return request({ url: "/market/stock/dictionary/sync", method: "POST" });
}
