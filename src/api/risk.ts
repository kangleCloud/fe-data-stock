import type { PageResponse } from "@/types/api";
import type { RiskDashboard, RiskException, RiskInterface, RiskSource, RiskPageQuery, RiskQps, RiskQuery } from "@/types/risk";
import { request } from "@/utils/request";

const count = (value: unknown): value is string => typeof value === "string" && /^\d+$/.test(value);

export async function getRiskDashboard(params: RiskQuery): Promise<RiskDashboard> {
  const data = await request<RiskDashboard>({ url: "/risk/dashboard", method: "GET", silentError: true, params });
  if (!data || !data.metrics || !data.metadata || ![15, 360, 1440].includes(data.trendBucketMinutes) || ![data.trend, data.statuses, data.regions, data.topInterfaces, data.topSources].every(Array.isArray)) throw new Error("RISK_DASHBOARD_INVALID");
  const total = data.metrics;
  if (![total.requestCount, total.successCount, total.failureCount, total.otherCount, total.sourceCount, total.interfaceCount, total.http4xxCount, total.http5xxCount, data.metadata.unknownRegionRequestCount, data.metadata.internalRegionRequestCount, ...data.regions.map(r => r.requestCount), ...data.statuses.map(r => r.requestCount), ...data.trend.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount, r.apiRequestCount, r.sourceCount, r.http4xxCount, r.http5xxCount]), ...data.topInterfaces.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount, r.sourceCount]), ...data.topSources.flatMap(r => [r.requestCount, r.successCount, r.failureCount, r.otherCount])].every(count)) throw new Error("RISK_COUNT_INVALID");
  if (BigInt(total.requestCount) !== BigInt(total.successCount) + BigInt(total.failureCount) + BigInt(total.otherCount)) throw new Error("RISK_TOTAL_INCONSISTENT");
  const denominator = BigInt(total.successCount) + BigInt(total.failureCount);
  if (denominator === 0n ? total.failureRate !== null : typeof total.failureRate !== "string" || !/^(?:0\.\d{6}|1\.0{6})$/.test(total.failureRate)) throw new Error("RISK_RATE_INVALID");
  if (![total.http4xxRate, total.http5xxRate].every(rate => total.requestCount === "0"
    ? rate === null : typeof rate === "string" && /^(?:0\.\d{6}|1\.0{6})$/.test(rate))) throw new Error("RISK_RATE_INVALID");
  if (data.targets && (!Array.isArray(data.targets) || data.targets.some(target => typeof target.targetId !== "string" || !Array.isArray(target.regions) || target.regions.some(row => typeof row.regionCode !== "string" || !count(row.requestCount))))) throw new Error("RISK_TARGETS_INVALID");
  if (data.requestTypes && (!Array.isArray(data.requestTypes) || data.requestTypes.some(row => !["API", "PAGE", "STATIC", "OTHER"].includes(row.requestType) || !count(row.requestCount)))) throw new Error("RISK_REQUEST_TYPES_INVALID");
  return data;
}

export async function getRiskQps(): Promise<RiskQps> {
  const qps = await request<RiskQps>({ url: "/risk/qps", method: "GET", silentError: true });
  if (!qps || !Array.isArray(qps.samples) || qps.samples.length > 3) throw new Error("RISK_QPS_INVALID");
  let previousTime = -Infinity;
  for (const sample of qps.samples) {
    if (!sample || typeof sample.minuteTime !== "string" || !count(sample.requestCount) || !count(sample.value)) throw new Error("RISK_QPS_INVALID");
    const time = Date.parse(sample.minuteTime);
    if (time % 60_000 !== 0 || time <= previousTime) throw new Error("RISK_QPS_INVALID");
    previousTime = time;
  }
  const latest = qps.samples.at(-1);
  const matchesSample = qps.coverageStatus === "PARTIAL" && latest && qps.minuteTime === latest.minuteTime
    && qps.requestCount === latest.requestCount && qps.value === latest.value;
  const unavailable = qps.coverageStatus === "UNAVAILABLE" && qps.minuteTime === null && qps.requestCount === null && qps.value === null;
  if (!matchesSample && !unavailable) throw new Error("RISK_QPS_INVALID");
  return qps;
}
export const getRiskInterfaces = (params: RiskPageQuery) => request<PageResponse<RiskInterface>>({ url: "/risk/interfaces/page", method: "GET", silentError: true, params });
export const getRiskSources = (params: RiskPageQuery) => request<PageResponse<RiskSource>>({ url: "/risk/sources/page", method: "GET", silentError: true, params });
export const getRiskExceptions = (params: RiskPageQuery) => request<PageResponse<RiskException>>({ url: "/risk/exceptions/page", method: "GET", silentError: true, params });
