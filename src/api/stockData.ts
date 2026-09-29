import type { PageResponse } from "@/types/api";
import type {
  StockDictionaryPageQuery,
  StockDictionaryCreateRequest,
  StockMonitorAdminRow,
  StockMonitorPageQuery,
  StockProfilePageQuery,
  StockProfileRow,
  StockSymbol,
} from "@/types/market";
import { request } from "@/utils/request";

export function getStockMonitorAdminPage(params: StockMonitorPageQuery): Promise<PageResponse<StockMonitorAdminRow>> {
  return request({ url: "/system/stockMonitor/page", method: "GET", params });
}

export function getStockDictionaryAdminPage(params: StockDictionaryPageQuery): Promise<PageResponse<StockSymbol>> {
  return request({ url: "/system/stockDictionary/page", method: "GET", params });
}

export function addStockDictionary(data: StockDictionaryCreateRequest): Promise<StockSymbol> {
  return request({ url: "/system/stockDictionary/add", method: "POST", data });
}

export function getStockProfileAdminPage(params: StockProfilePageQuery): Promise<PageResponse<StockProfileRow>> {
  return request({ url: "/system/stockProfile/page", method: "GET", params });
}
