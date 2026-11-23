import { describe, expect, it, vi } from "vitest";
import { getRiskDashboard } from "@/api/risk";
import type { RiskDashboard } from "@/types/risk";
import type { RiskDashboardMapServer } from "@/types/riskMonitor";
import { riskAccessTargetFlows, type RiskAccessHeatPoint } from "@/utils/riskAccessMap";
import { riskMinuteRequests, riskNetworkMbps, riskSparkline } from "@/utils/riskDashboardVisual";
import { riskMapRanking, type RiskGeo } from "@/utils/riskMap";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ request }));

const minuteTime = "2026-11-06T19:30:00+08:00";
const query = { startDate: "2026-11-01", endDate: "2026-11-06" };
const sample = { minuteTime, requestCount: "600", value: "10.000000" };
const dashboard: RiskDashboard = {
  metrics: { requestCount: "10", successCount: "4", failureCount: "3", otherCount: "3", failureRate: "0.428571",
    sourceCount: "3", interfaceCount: "1", http4xxCount: "2", http5xxCount: "1", http4xxRate: "0.200000", http5xxRate: "0.100000" },
  trendBucketMinutes: 360,
  trend: [{ minuteTime, requestCount: "10", apiRequestCount: "4", sourceCount: "3", successCount: "4", failureCount: "3", otherCount: "3", http4xxCount: "2", http5xxCount: "1" }],
  statuses: [], regions: [], topInterfaces: [], topSources: [],
  qps: { ...sample, value: null, coverageStatus: "PARTIAL", samples: [sample] },
  metadata: { generatedTime: minuteTime, dataUpdatedTime: minuteTime, collectorHeartbeatTime: minuteTime, lastEventTime: minuteTime,
    lagSeconds: "0", unknownRegionRequestCount: "1", internalRegionRequestCount: "2", completeness: "PARTIAL", warnings: [] },
};

describe("大屏统计契约", () => {
  it("展示入库分钟请求数、采样时间和覆盖提示，并保留缺失分钟", () => {
    const latest = { minuteTime: "2026-11-06T19:32:00+08:00", requestCount: "128", value: "2.133333" };
    const earlier = { ...sample, requestCount: "64", value: latest.value };
    expect(riskMinuteRequests({ ...latest, value: null, coverageStatus: "PARTIAL", samples: [earlier, latest] })).toEqual({
      value: "128 次/分钟",
      description: "19:32 · 部分覆盖",
      path: "M1.0,21.0 h-0.01 M63.0,3.0 h-0.01",
    });
    expect(riskMinuteRequests({ minuteTime: null, requestCount: null, value: null, coverageStatus: "UNAVAILABLE", samples: [] }))
      .toEqual({ value: "—", path: "" });
  });

  it("接收历史日期范围与当前部分覆盖的分钟 QPS", async () => {
    request.mockResolvedValueOnce(dashboard);
    const result = await getRiskDashboard(query);
    expect(result.metrics.http4xxRate).toBe("0.200000");
    expect(result.qps).toEqual({ ...sample, value: null, coverageStatus: "PARTIAL", samples: [sample] });
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ params: query }));
  });

  it("保留缺失 QPS，并拒绝与采样不一致的值", async () => {
    const empty = { minuteTime: null, requestCount: null, value: null, coverageStatus: "UNAVAILABLE", samples: [] };
    request.mockResolvedValueOnce({ ...dashboard, qps: empty });
    await expect(getRiskDashboard(query)).resolves.toMatchObject({ qps: empty });
    request.mockResolvedValueOnce({ ...dashboard, qps: { ...dashboard.qps, value: "0.000000" } });
    await expect(getRiskDashboard(query)).rejects.toThrow("RISK_QPS_INVALID");
  });
});

describe("地域排行、飞线与资源展示", () => {
  it("省级独立排序，切换世界后中国省份合并，降级时遵循实际边界", () => {
    const rows = [
      { regionCode: "CN-32", requestCount: "10" }, { regionCode: "CN-ZJ", requestCount: "20" },
      { regionCode: "CN", requestCount: "7" }, { regionCode: "US", requestCount: "25" },
      { regionCode: "HK", requestCount: "4" }, { regionCode: "UNKNOWN", requestCount: "100" },
    ];
    expect(riskMapRanking("china", rows, new Set(["CN-32", "CN-33"]))).toEqual([
      { name: "CN-33", count: "20" }, { name: "CN-32", count: "10" },
    ]);
    expect(riskMapRanking("world", rows, new Set(["CN", "US"]))).toEqual([
      { name: "CN", count: "37" }, { name: "US", count: "25" },
    ]);
  });

  it("取最大的十二条正值并汇聚至唯一有效入口", () => {
    const entrance: RiskDashboardMapServer = { id: "1", version: "1", name: "入口", enabled: true, longitude: "120", latitude: "30", coordinateSystem: "WGS84", locationSource: "MANUAL", locationStatus: "LOCATED" };
    const geo: RiskGeo = { type: "FeatureCollection", features: [] };
    const sources: RiskAccessHeatPoint[] = Array.from({ length: 15 }, (_, index) => ({ lng: index, lat: 30 + index, count: String(index), value: index / 14, code: `place${index}`, label: String(index) }));
    const result = riskAccessTargetFlows("world", geo, [entrance], sources);
    expect(result.lines).toHaveLength(12);
    expect(result.lines.map(line => line.count)).toEqual(Array.from({ length: 12 }, (_, index) => String(14 - index)));
    expect(result.lines.every(line => line.lng2 === 120 && line.lat2 === 30)).toBe(true);
    expect(riskAccessTargetFlows("world", geo, [{ ...entrance, enabled: false }], sources).lines).toEqual([]);
    expect(riskAccessTargetFlows("world", geo, [{ ...entrance, latitude: null }], sources).lines).toEqual([]);
    expect(riskAccessTargetFlows("world", geo, [entrance, { ...entrance, id: "2" }], sources).lines).toEqual([]);
  });

  it("速率换算使用十进制 Mbps，趋势缺少两个采样时隐藏", () => {
    expect(riskNetworkMbps("400000")).toBe("3.2 Mbps");
    expect(riskNetworkMbps("200000.00")).toBe("1.6 Mbps");
    expect(riskNetworkMbps("0")).toBe("0 Mbps");
    expect(riskNetworkMbps(null)).toBe("—");
    expect(riskSparkline([{ at: minuteTime, value: 10 }])).toBe("");
    expect(riskSparkline([{ at: minuteTime, value: 10 }, { at: "2026-11-06T19:31:00+08:00", value: 20 }])).toBe("1.0,21.0 63.0,3.0");
  });
});
