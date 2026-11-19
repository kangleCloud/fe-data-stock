/** 当前API访问统计；整数始终以十进制字符串传输。 */
export type RiskCount = string;
export interface RiskQuery { startDate: string; endDate: string; targetId?: string; regionCode?: string; method?: string; pathTemplate?: string; sourceIp?: string; httpStatus?: number }
export interface RiskPageQuery extends RiskQuery { pageNum: number; pageSize: number }
export interface RiskTotals { requestCount: string; successCount: string; failureCount: string; otherCount: string; failureRate: string | null }
export interface RiskInterface extends RiskTotals { method: string; pathTemplate: string; sourceCount: string }
export interface RiskSource extends RiskTotals { sourceIp: string | null; regionCode: string; countryCode: string | null; provinceCode: string | null; provinceName: string | null; cityCode: string | null; cityName: string | null }
export interface RiskException { minuteAt: string; method: string; pathTemplate: string; sourceIp: string | null; httpStatus: number; regionCode: string; requestCount: string }
export interface RiskDashboard {
  metrics: RiskTotals & { sourceCount: string; interfaceCount: string };
  trend: (Omit<RiskTotals, "failureRate"> & { minuteAt: string })[];
  statuses: { httpStatus: number; requestCount: string }[];
  regions: { regionCode: string; requestCount: string }[];
  topInterfaces: RiskInterface[]; topSources: RiskSource[];
  geoCoverage?: import("@/types/geoDrilldown").DashboardGeoCoverage;
  targets?: import("@/types/riskMonitor").RiskDashboardTarget[];
  requestTypes?: { requestType: "API" | "PAGE" | "STATIC" | "OTHER"; requestCount: string }[];
  qps?: { value: string | null; minuteAt: string | null; coverageStatus: string };
  coverage?: { status: string; coverageStartAt: string | null; incomplete: boolean };
  suspiciousAccesses?: { coverageStatus: string; windowStartAt: string | null; windowEndAt: string | null; totalCount: string; items: { sourceIp: string; failureCount: string }[] };
  metadata: { generatedAt: string | null; dataUpdatedAt: string | null; collectorHeartbeatAt: string | null; lastEventTime: string | null; lagSeconds: string | null; completeness: "READY" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; warnings: string[] };
}
