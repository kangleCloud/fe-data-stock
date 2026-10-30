/** risk-v1-20261027-r1：所有累计指标及微秒保持十进制字符串。 */
export type RiskCount = string;
export type RiskRequestType = "API" | "STATIC" | "PAGE" | "SSE" | "RISK_INTERNAL" | "OTHER";
export interface RiskQuery { startDate: string; endDate: string; regionCode?: string; requestType?: RiskRequestType }
export interface RiskPageQuery extends RiskQuery { pageNum: number; pageSize: number }
export interface RiskLatency { restP95Micros: RiskCount | null; restP95Overflow: boolean; sseP95Micros: RiskCount | null; sseP95Overflow: boolean }
export interface RiskInterface extends RiskLatency { pathTemplate: string; method: string; requestType: RiskRequestType; requestCount: RiskCount; httpErrorCount: RiskCount; clientAbortCount: RiskCount }
export interface RiskException { id: string; minuteAt: string; regionCode: string; requestType: RiskRequestType; pathTemplate: string; status: string; reasonCode: string; count: RiskCount; firstAt: string; lastAt: string }
export interface RiskArchive { id: string; batchId: string; businessDate: string; state: "PENDING" | "COMMITTED" | "CLEANED" | "FAILED"; recordCount: RiskCount; checksum: string; committedAt: string | null; cleanedAt: string | null; failureCode: string | null }
export interface RiskDashboard {
  metrics: RiskLatency & { requestCount: RiskCount; apiCount: RiskCount; httpErrorCount: RiskCount; httpErrorRate: string | null; sseEndedCount: RiskCount; clientAbortCount: RiskCount; upstreamFailureCount: RiskCount };
  trend: { minuteAt: string; requestCount: RiskCount; apiCount: RiskCount; httpErrorCount: RiskCount }[];
  dailySources: { businessDate: string; sourceCount: RiskCount; approximate: true }[];
  regions: { regionCode: string; requestCount: RiskCount }[];
  requestTypes: { requestType: RiskRequestType; requestCount: RiskCount }[];
  statuses: { status: string; requestCount: RiskCount }[];
  topInterfaces: RiskInterface[];
  quality: { reasonCode: string; count: RiskCount }[];
  metadata: { generatedAt: string | null; dataUpdatedAt: string | null; collectorHeartbeatAt: string | null; lastEventTime: string | null; lagSeconds: RiskCount | null; completeness: "READY" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; warnings: string[] };
}
