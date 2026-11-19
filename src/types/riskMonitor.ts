/** 资源缺失原因分组与原因码以工作区 risk-monitor-v1-contract.md 为准。 */
export type RiskResourceGroup = "cpu" | "memory" | "disk" | "networkRate" | "load" | "uptime";
export type RiskResourceReason = "NO_SAMPLE" | "SAMPLE_TIMEOUT" | "SAMPLE_FAILED" | "FIRST_SAMPLE" | "COUNTER_RESET" | "HOST_RESTART" | "NOT_SUPPORTED" | "READ_FAILED" | "UNKNOWN";
/** 大屏公开目标仅包含地图所需信息，不包含连接配置。 */
export interface RiskDashboardTarget {
  targetId: string;
  alias: string | null;
  type?: "LOCAL" | "REMOTE";
  enabled?: boolean;
  resourceSummary?: RiskResourceSummary | null;
  regionCode: string | null;
  longitude: string | null;
  latitude: string | null;
  locationStatus: "LOCATED" | "UNRESOLVED" | "UNCONFIGURED";
  regions: { regionCode: string; requestCount: string }[];
}
export interface RiskResourceSummary {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  freshness: "FRESH" | "STALE" | "UNAVAILABLE";
  sampledAt: string | null;
  cpuPercent: string | null;
  memoryUsedBytes: string | null;
  memoryTotalBytes: string | null;
  diskUsedBytes: string | null;
  diskTotalBytes: string | null;
}
export interface RiskConnection { host: string; port: number; username: string; credentialAlias: string }
export interface RiskTargetInput {
  targetId: string | null; version: string | null; alias: string; type: "LOCAL" | "REMOTE";
  enabled: boolean; intervalSeconds: number; collectorId: string; logSourceId: string | null;
  connection: RiskConnection | null; publicIp: string | null;
  manualLocation: { regionCode: string; longitude: string; latitude: string } | null;
}
export interface RiskManagedTarget extends RiskTargetInput { targetId: string; version: string }
export interface RiskConfigSync { configVersion: string | null; redisConfigVersion: string | null; status: "SYNCED" | "PENDING" | "FAILED"; stale: boolean; retryable: boolean; failureCode: string | null; lastSuccessAt: string | null }
export interface RiskResourceCurrent {
  targetId: string;
  collectorId: string;
  sampledAt: string | null;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  freshness: "FRESH" | "STALE" | "UNAVAILABLE";
  cpuPercent: string | null;
  memoryUsedBytes: string | null;
  memoryTotalBytes: string | null;
  diskUsedBytes: string | null;
  diskTotalBytes: string | null;
  networkReceiveBytesPerSecond: string | null;
  networkTransmitBytesPerSecond: string | null;
  load1: string | null;
  uptimeSeconds: string | null;
  unavailableReasons: Partial<Record<RiskResourceGroup, RiskResourceReason>>;
}
