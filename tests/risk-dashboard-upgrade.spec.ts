import { describe, expect, it, vi } from "vitest";
import { getRiskDashboard, getRiskQps } from "@/api/risk";
import type { RiskDashboard, RiskQps } from "@/types/risk";
import type { RiskDashboardMapServer } from "@/types/riskMonitor";
import { riskAccessTargetFlows, type RiskAccessHeatPoint } from "@/utils/riskAccessMap";
import { riskMinuteQps, riskNetworkMbps, riskSparkline } from "@/utils/riskDashboardVisual";
import { riskMapRanking, type RiskGeo } from "@/utils/riskMap";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ request }));

const minuteTime = "2026-11-06T19:30:00+08:00";
const query = { startDate: "2026-11-01", endDate: "2026-11-06" };
const sample = { minuteTime, requestCount: "120", value: "2" };
const unavailableQps: RiskQps = { minuteTime: null, requestCount: null, value: null, coverageStatus: "UNAVAILABLE", samples: [] };
const dashboard: RiskDashboard = {
  metrics: { requestCount: "10", successCount: "4", failureCount: "3", otherCount: "3", failureRate: "0.428571",
    sourceCount: "3", interfaceCount: "1", http4xxCount: "2", http5xxCount: "1", http4xxRate: "0.200000", http5xxRate: "0.100000" },
  trendBucketMinutes: 360,
  trend: [{ minuteTime, requestCount: "10", apiRequestCount: "4", sourceCount: "3", successCount: "4", failureCount: "3", otherCount: "3", http4xxCount: "2", http5xxCount: "1" }],
  statuses: [], regions: [], topInterfaces: [], topSources: [],
  metadata: { generatedTime: minuteTime, dataUpdatedTime: minuteTime, collectorHeartbeatTime: minuteTime, lastEventTime: minuteTime,
    lagSeconds: "0", unknownRegionRequestCount: "1", internalRegionRequestCount: "2", completeness: "PARTIAL", warnings: [] },
};

describe("大屏统计契约", () => {
  it("展示整数 QPS、原始请求数和覆盖提示，并保留缺失分钟", () => {
    const latest = { minuteTime: "2026-11-06T19:32:00+08:00", requestCount: "128", value: "2" };
    const earlier = { ...sample, requestCount: "64", value: "1" };
    expect(riskMinuteQps({ ...latest, coverageStatus: "PARTIAL", samples: [earlier, latest] })).toEqual({
      value: "2 QPS",
      description: "19:32 · 128 次 · 部分覆盖",
      path: "M1.0,21.0 h-0.01 M63.0,3.0 h-0.01",
    });
    const quiet = { ...sample, requestCount: "0", value: "0" };
    expect(riskMinuteQps({ ...quiet, coverageStatus: "PARTIAL", samples: [quiet] }))
      .toMatchObject({ value: "0 QPS", description: "19:30 · 0 次 · 部分覆盖" });
    expect(riskMinuteQps({ ...unavailableQps, samples: [earlier] }))
      .toEqual({ value: "—", description: "暂无采集样本", path: "" });
    const previous = { ...latest, minuteTime: "2026-11-06T19:31:00+08:00" };
    expect(riskMinuteQps({ ...unavailableQps, samples: [earlier, previous] }))
      .toEqual({ value: "—", description: "暂无采集样本", path: "M1.0,21.0 L32.0,3.0" });
  });

  it("历史统计和当前 QPS 使用不同请求，QPS 不传历史筛选", async () => {
    request.mockResolvedValueOnce(dashboard);
    const result = await getRiskDashboard(query);
    expect(result.metrics.http4xxRate).toBe("0.200000");
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ url: "/risk/dashboard", params: query }));
    const live = { ...sample, coverageStatus: "PARTIAL", samples: [sample] };
    request.mockResolvedValueOnce(live);
    await expect(getRiskQps()).resolves.toEqual(live);
    expect(request).toHaveBeenLastCalledWith({ url: "/risk/qps", method: "GET", silentError: true });
  });

  it("接受上一分钟缺失但仍有较早样本，拒绝不一致或非整数 QPS", async () => {
    const absent = { ...unavailableQps, samples: [sample] };
    request.mockResolvedValueOnce(absent);
    await expect(getRiskQps()).resolves.toEqual(absent);
    request.mockResolvedValueOnce({ ...sample, coverageStatus: "PARTIAL", value: "0", samples: [sample] });
    await expect(getRiskQps()).rejects.toThrow("RISK_QPS_INVALID");
    const nonInteger = { ...sample, value: "2.000000" };
    request.mockResolvedValueOnce({ ...nonInteger, coverageStatus: "PARTIAL", samples: [nonInteger] });
    await expect(getRiskQps()).rejects.toThrow("RISK_QPS_INVALID");
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
    const entrance: RiskDashboardMapServer = { id: "1", version: null, name: "入口", enabled: true, longitude: "120", latitude: "30", coordinateSystem: "WGS84", locationSource: "MANUAL", locationStatus: "LOCATED" };
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
