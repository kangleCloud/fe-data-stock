import type { PageResponse } from "@/types/api";
import type {
  EtfAssetAllocation, EtfDictionaryQuery, EtfDictionaryRow, EtfMonitorConfig, EtfMonitorDashboard,
  EtfProfileDetail, EtfProfileQuery, EtfProfileRow, IndexConfig,
} from "@/types/etf";
import { PUBLIC_API_BASE_URL, request } from "@/utils/request";
import { parseEtfMonitorDashboard } from "@/utils/etfMonitor";

const silent = { silentError: true } as const;

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

export function getEtfProfilePage(params: EtfProfileQuery): Promise<PageResponse<EtfProfileRow>> {
  return request({ url: "/system/etfProfile/page", method: "GET", params, ...silent });
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
  return { ...result.dictionary,
    exchange: profile?.exchange ?? result.dictionary.exchange,
    etfType: profile?.etfType ?? result.dictionary.etfType,
    listingStatus: profile?.listingStatus ?? result.dictionary.listingStatus,
    listingDate: profile?.listingDate ?? result.dictionary.listingDate,
    manager: profile?.manager ?? null, custodian: profile?.custodian ?? null,
    shareCount: profile?.shareCount ?? null, shareDate: profile?.shareDate ?? null,
    trackingIndexCode: profile?.trackingIndexCode ?? result.dictionary.trackingIndexCode,
    trackingIndexName: profile?.trackingIndexName ?? result.dictionary.trackingIndexName,
    updatedAt: shanghaiOffset(profile?.updatedAt ?? profile?.profileUpdatedAt ?? result.dictionary.syncedAt),
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
