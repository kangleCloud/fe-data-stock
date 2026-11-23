/** 当前API访问统计；整数始终以十进制字符串传输。 */
export type RiskCount = string;
export interface RiskQuery { startDate: string; endDate: string; sourceId?: string; regionCode?: string; method?: string; pathTemplate?: string; sourceIp?: string; httpStatus?: number }
export interface RiskPageQuery extends RiskQuery { pageNum: number; pageSize: number }
export interface RiskTotals { requestCount: string; successCount: string; failureCount: string; otherCount: string; failureRate: string | null }
export interface RiskInterface extends RiskTotals { method: string; pathTemplate: string; sourceCount: string }
export interface RiskSource extends RiskTotals { sourceIp: string | null; regionCode: string; countryCode: string | null; provinceCode: string | null; provinceName: string | null; cityCode: string | null; cityName: string | null }
export interface RiskException { minuteTime: string; method: string; pathTemplate: string; sourceIp: string | null; httpStatus: number; regionCode: string; requestCount: string }
interface RiskErrorCounts { http4xxCount: RiskCount; http5xxCount: RiskCount }
export interface RiskQpsSample { minuteTime: string; requestCount: RiskCount; value: string }
export interface RiskDashboard {
  metrics: RiskTotals & RiskErrorCounts & { sourceCount: RiskCount; interfaceCount: RiskCount; http4xxRate: string | null; http5xxRate: string | null };
  trendBucketMinutes: 15 | 360 | 1440;
  trend: (Omit<RiskTotals, "failureRate"> & RiskErrorCounts & { minuteTime: string; apiRequestCount: RiskCount; sourceCount: RiskCount })[];
  statuses: { httpStatus: number; requestCount: string }[];
  regions: { regionCode: string; requestCount: string }[];
  topInterfaces: RiskInterface[]; topSources: RiskSource[];
  geoCoverage?: import("@/types/geoDrilldown").DashboardGeoCoverage;
  targets?: import("@/types/riskMonitor").RiskDashboardTarget[];
  mapServers?: import("@/types/riskMonitor").RiskDashboardMapServer[];
  requestTypes?: { requestType: "API" | "PAGE" | "STATIC" | "OTHER"; requestCount: string }[];
  qps: { value: string | null; minuteTime: string | null; requestCount: RiskCount | null; coverageStatus: "PARTIAL" | "UNAVAILABLE"; samples: RiskQpsSample[] };
  coverage?: { status: string; coverageStartTime: string | null; incomplete: boolean };
  suspiciousAccesses?: { coverageStatus: string; windowStartTime: string | null; windowEndTime: string | null; totalCount: string; items: { sourceIp: string; failureCount: string }[] };
  metadata: { generatedTime: string | null; dataUpdatedTime: string | null; collectorHeartbeatTime: string | null; lastEventTime: string | null; lagSeconds: string | null; unknownRegionRequestCount: RiskCount; internalRegionRequestCount: RiskCount; completeness: "READY" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; warnings: string[] };
}
