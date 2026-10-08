import type {
  MarketDashboardSnapshot,
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
  return request({ url: "/system/stockMonitor/refresh", method: "POST", data: {}, timeout: 300000,
    timeoutMessage: "整体刷新请求超时，结果未确认，请核实服务端结果；未自动重试", silentError: true });
}

export function getStockMonitorRefreshStatus(): Promise<StockMonitorRefreshStatus> {
  return request({ url: "/system/stockMonitor/refresh/status", method: "GET", ...silent });
}
