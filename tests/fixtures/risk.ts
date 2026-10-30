import type { RiskDashboard } from "@/types/risk";
/** 仅离线回归夹具，运行页面不会导入。 */
export function riskFixture(): RiskDashboard {
  return {
    metrics: { requestCount: "9007199254740993", apiCount: "2", httpErrorCount: "1", httpErrorRate: "0.500000", restP95Micros: "2000", restP95Overflow: false, sseP95Micros: "1000000", sseP95Overflow: false, sseEndedCount: "1", clientAbortCount: "1", upstreamFailureCount: "3" },
    trend: [{ minuteAt: "2026-10-27T00:00:00.000+08:00", requestCount: "9007199254740993", apiCount: "2", httpErrorCount: "1" }],
    dailySources: [{ businessDate: "2026-10-27", sourceCount: "7", approximate: true }],
    regions: [{ regionCode: "UNKNOWN", requestCount: "2" }, { regionCode: "INTERNAL", requestCount: "1" }],
    requestTypes: [{ requestType: "API", requestCount: "2" }], statuses: [{ status: "UNKNOWN", requestCount: "1" }, { status: "499", requestCount: "1" }],
    topInterfaces: [{ pathTemplate: "/api/<img src=x onerror=alert(1)>", method: "GET", requestType: "API", requestCount: "2", httpErrorCount: "1", clientAbortCount: "0", restP95Micros: "2000", restP95Overflow: false, sseP95Micros: null, sseP95Overflow: false }], quality: [{ reasonCode: "GEO_UNAVAILABLE", count: "2" }],
    metadata: { generatedAt: "2026-10-27T00:00:00.000+08:00", dataUpdatedAt: null, collectorHeartbeatAt: null, lastEventTime: null, lagSeconds: null, completeness: "PARTIAL", warnings: ["HEARTBEAT_MISSING", "GEO_UNAVAILABLE"] },
  };
}
