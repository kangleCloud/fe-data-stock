import type { RiskDashboard } from "@/types/risk";
/** 合成离线数据；不进入生产包。最终共享响应另按Java冻结文件核对。 */
export function riskFixture(): RiskDashboard {
  const totals = { requestCount: "9007199254740993", successCount: "9007199254740991", failureCount: "1", otherCount: "1", failureRate: "0.000000" };
  return { metrics: { ...totals, sourceCount: "2", interfaceCount: "1" }, trend: [{ minuteAt: "2026-11-03T12:00:00.000+08:00", ...totals }], statuses: [{ httpStatus: 499, requestCount: "1" }, { httpStatus: 0, requestCount: "1" }], regions: [{ regionCode: "UNKNOWN", requestCount: "2" }, { regionCode: "INTERNAL", requestCount: "1" }], topInterfaces: [{ method: "GET", pathTemplate: "/api/<img src=x>", ...totals, sourceCount: "2" }], topSources: [{ sourceIp: "8.8.8.8", regionCode: "UNKNOWN", countryCode: null, provinceCode: null, provinceName: null, cityCode: null, cityName: null, ...totals }], metadata: { generatedAt: "2026-11-03T12:00:00.000+08:00", dataUpdatedAt: null, collectorHeartbeatAt: null, lastEventTime: null, lagSeconds: null, completeness: "PARTIAL", warnings: ["HEARTBEAT_MISSING"] } };
}
