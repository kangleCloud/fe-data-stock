import type { PageResponse } from "@/types/api";
import type { MonitorRefreshResult } from "@/types/refresh";
import type {
  EtfAssetAllocation, EtfDictionaryQuery, EtfDictionaryRow, EtfMonitorConfig, EtfMonitorDashboard,
  EtfProfileDetail, EtfProfileQuery, EtfProfileRow, IndexConfig,
} from "@/types/etf";
import { PUBLIC_API_BASE_URL, request } from "@/utils/request";
import { parseEtfMonitorDashboard } from "@/utils/etfMonitor";

const silent = { silentError: true } as const;

export function refreshEtfAllocation(symbol: string, reportPeriod: string): Promise<MonitorRefreshResult> {
  return request({ url: "/system/etfMonitor/allocation/refresh", method: "POST",
    params: { symbol, reportPeriod }, timeout: 120000,
    timeoutMessage: "资产配置同步请求超时，结果未确认，请核实服务端结果；未自动重试", ...silent });
}

export function refreshEtfMonitor(): Promise<MonitorRefreshResult> {
  return request({ url: "/system/etfMonitor/refresh", method: "POST", data: {}, timeout: 300000,
    timeoutMessage: "整体刷新请求超时，结果未确认，请核实服务端结果；未自动重试", ...silent });
}

export async function getEtfMonitorDashboard(): Promise<EtfMonitorDashboard> {
  const content = await request<unknown>({ url: "/etf-monitor/v1/dashboard", method: "GET",
    baseURL: PUBLIC_API_BASE_URL, publicAccess: true, withCredentials: false, ...silent });
  return parseEtfMonitorDashboard(content);
}

function shanghaiOffset(value: string | null | undefined): string | null {
  if (!value) return null;
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+08:00`;
}

export async function getEtfDictionaryPage(params: EtfDictionaryQuery): Promise<PageResponse<EtfDictionaryRow>> {
  const page = await request<PageResponse<EtfDictionaryRow>>({
    url: "/system/etfDictionary/page", method: "GET", params, ...silent,
  });
  return { ...page, list: page.list.map((item) => ({ ...item, syncedAt: shanghaiOffset(item.syncedAt) })) };
}

export async function getEtfProfilePage(params: EtfProfileQuery): Promise<PageResponse<EtfProfileRow>> {
  const result = await request<PageResponse<EtfProfileRow>>({ url: "/system/etfProfile/page", method: "GET", params, ...silent });
  return { ...result, list: result.list.map((row) => ({ ...row, ...coreProfileFields(row), updatedAt: shanghaiOffset(row.updatedAt) })) };
}

function coreProfileFields(profile: Partial<EtfProfileRow> | null) {
  return { fullName: profile?.fullName ?? null, fundType: profile?.fundType ?? null,
    investmentType: profile?.investmentType ?? null, fundManager: profile?.fundManager ?? null,
    establishedDate: profile?.establishedDate ?? null, performanceBenchmark: profile?.performanceBenchmark ?? null,
    source: profile?.source ?? null };
}

interface EtfProfileDetailResponse {
  dictionary: EtfDictionaryRow;
  profile: (Partial<EtfProfileRow> & { profileUpdatedAt?: string | null }) | null;
  assetAllocation: EtfAssetAllocation | null;
}

export async function getEtfProfileDetail(symbol: string): Promise<EtfProfileDetail> {
  const result = await request<EtfProfileDetailResponse>({
    url: "/system/etfProfile/detail", method: "GET", params: { symbol }, ...silent,
  });
  const profile = result.profile;
  return { ...result.dictionary, ...coreProfileFields(profile),
    exchange: profile?.exchange ?? result.dictionary.exchange,
    etfType: profile?.etfType ?? result.dictionary.etfType,
    listingStatus: profile?.source === "THS" ? null : profile?.listingStatus ?? null,
    listingDate: profile?.source === "THS" ? null : profile?.listingDate ?? null,
    manager: profile?.manager ?? null, custodian: profile?.custodian ?? null,
    shareCount: profile?.source === "THS" ? null : profile?.shareCount ?? null,
    shareDate: profile?.source === "THS" ? null : profile?.shareDate ?? null,
    trackingIndexCode: profile?.trackingIndexCode ?? null,
    trackingIndexName: profile?.trackingIndexName ?? null,
    updatedAt: shanghaiOffset(profile?.updatedAt ?? profile?.profileUpdatedAt),
    assetAllocation: result.assetAllocation,
  };
}

export function getEtfMonitorConfig(): Promise<EtfMonitorConfig[]> {
  return request({ url: "/system/etfMonitor/list", method: "GET", ...silent });
}

export function setEtfEnabled(symbol: string, enabled: boolean): Promise<boolean> {
  return request({ url: "/system/etfMonitor/enable", method: "POST", data: { symbol, enabled } });
}

export function sortEtfMonitor(symbols: string[]): Promise<boolean> {
  return request({ url: "/system/etfMonitor/sort", method: "POST", data: { symbols } });
}

export function getIndexConfig(): Promise<IndexConfig[]> {
  return request({ url: "/system/indexConfig/list", method: "GET", ...silent });
}

export function updateIndexConfig(code: string, enabled: boolean, sortOrder: number): Promise<IndexConfig> {
  return request({ url: "/system/indexConfig/update", method: "POST", data: { code, enabled, sortOrder } });
}
