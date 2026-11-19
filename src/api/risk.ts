import type { PageResponse } from "@/types/api";
import type { RiskDashboard, RiskException, RiskInterface, RiskSource, RiskPageQuery, RiskQuery } from "@/types/risk";
import { request } from "@/utils/request";
export async function getRiskDashboard(params: RiskQuery): Promise<RiskDashboard> {
  const data = await request<RiskDashboard>({ url: "/risk/dashboard", method: "GET", silentError: true, params });
  if (!data || !data.metrics || !data.metadata || ![data.trend, data.statuses, data.regions, data.topInterfaces, data.topSources].every(Array.isArray)) throw new Error("RISK_DASHBOARD_INVALID");
  const count = (value: unknown): value is string => typeof value === "string" && /^\d+$/.test(value);
  const total = data.metrics;
  if (![total.requestCount, total.successCount, total.failureCount, total.otherCount, total.sourceCount, total.interfaceCount, ...data.regions.map(r => r.requestCount), ...data.statuses.map(r => r.requestCount), ...data.trend.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount]), ...data.topInterfaces.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount, r.sourceCount]), ...data.topSources.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount])].every(count)) throw new Error("RISK_COUNT_INVALID");
  if (BigInt(total.requestCount) !== BigInt(total.successCount) + BigInt(total.failureCount) + BigInt(total.otherCount)) throw new Error("RISK_TOTAL_INCONSISTENT");
  const denominator = BigInt(total.successCount) + BigInt(total.failureCount);
  if (denominator === 0n ? total.failureRate !== null : typeof total.failureRate !== "string" || !/^(?:0\.\d{6}|1\.0{6})$/.test(total.failureRate)) throw new Error("RISK_RATE_INVALID");
  if (data.targets && (!Array.isArray(data.targets) || data.targets.some(target => typeof target.targetId !== "string" || !Array.isArray(target.regions) || target.regions.some(row => typeof row.regionCode !== "string" || !count(row.requestCount))))) throw new Error("RISK_TARGETS_INVALID");
  if (data.requestTypes && (!Array.isArray(data.requestTypes) || data.requestTypes.some(row => !["API", "PAGE", "STATIC", "OTHER"].includes(row.requestType) || !count(row.requestCount)))) throw new Error("RISK_REQUEST_TYPES_INVALID");
  if (data.qps && (data.qps.value !== null && (!/^\d+\.\d{6}$/.test(data.qps.value) || data.qps.coverageStatus !== "COMPLETE"))) throw new Error("RISK_QPS_INVALID");
  return data;
}
export const getRiskInterfaces = (params: RiskPageQuery) => request<PageResponse<RiskInterface>>({ url: "/risk/interfaces/page", method: "GET", silentError: true, params });
export const getRiskSources = (params: RiskPageQuery) => request<PageResponse<RiskSource>>({ url: "/risk/sources/page", method: "GET", silentError: true, params });
export const getRiskExceptions = (params: RiskPageQuery) => request<PageResponse<RiskException>>({ url: "/risk/exceptions/page", method: "GET", silentError: true, params });
