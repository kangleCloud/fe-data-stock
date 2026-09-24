import type {
  MarketDashboardSnapshot,
  MarketFundPoint,
  MarketIndex,
  MarketModuleResponse,
  MarketPageResponse,
  MarketRefreshResult,
  MarketSummary,
  RankingPeriod,
  RefreshStatus,
  SectorHeatmapData,
  SectorMutation,
  SectorRankings,
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

export function getMarketDashboardSnapshot(): Promise<MarketDashboardSnapshot> {
  return request<MarketDashboardSnapshot>({
    url: "/market/dashboard/snapshot",
    method: "GET",
    ...silent,
  });
}

interface SectorHeatmapSource {
  availableAreaMetrics?: string[];
  list?: Array<{
    sectorType: SectorType;
    sectorCode: string | null;
    name: string;
    changePercent: number | null;
    turnover: number | null;
    marketCap: number | null;
    turnoverRate: number | null;
    upCount: number | null;
    downCount: number | null;
    leader: string | null;
    mainNetInflow: number | null;
  }>;
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

function normalizeAreaMetrics(values?: string[]): SectorHeatmapData["availableAreaMetrics"] {
  return (values || []).flatMap((value) => {
    const normalized = value.toLowerCase();
    if (normalized === "turnover" || normalized === "marketcap") {
      return [normalized];
    }
    return [];
  });
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

export async function getSectorHeatmap(params: {
  sectorType: SectorType;
}): Promise<MarketModuleResponse<SectorHeatmapData>> {
  const response = await request<MarketModuleResponse<SectorHeatmapSource>>({
    url: "/market/sector/heatmap",
    method: "GET",
    params,
    ...silent,
  });
  const source = response.data;
  return {
    ...response,
    data: {
      availableAreaMetrics: normalizeAreaMetrics(source?.availableAreaMetrics),
      list: (source?.list || []).map((item) => ({
        code: item.sectorCode || item.name,
        name: item.name,
        type: item.sectorType,
        changePercent: item.changePercent,
        turnover: item.turnover,
        marketCap: item.marketCap,
        turnoverRate: item.turnoverRate,
        riseCount: item.upCount,
        fallCount: item.downCount,
        leadingStockName: item.leader,
        mainNetInflow: item.mainNetInflow,
      })),
    },
  };
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
