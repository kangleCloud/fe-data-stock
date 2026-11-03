import type { GeoObservation } from "@/types/geoObservation";
import { riskTime } from "@/utils/riskTime";
export interface GeoObservationMetric { label: string; value: string | null; unit?: string }
export interface GeoObservationSection { title: string; metrics: GeoObservationMetric[] }
export const geoResultLabels: Record<string, string> = { SUCCESS: "离线地域结果可用", UNKNOWN: "地域未知", CONFLICT: "来源编码冲突", INVALID_IP: "IP格式无效", NON_PUBLIC_IP: "非公网来源", PROVIDER_UNAVAILABLE: "离线数据源不可用" };
export function geoStateText(result: string | null | undefined): string { return result && Object.hasOwn(geoResultLabels, result) ? geoResultLabels[result]! : "不支持的地域状态"; }
export function geoMetricText(value: string | null): string { return value === null ? "未知" : /^\d+$/.test(value) ? BigInt(value).toLocaleString("en-US") : value; }
export function geoOperationalState(value: string | null | undefined): string {
  const labels: Record<string, string> = { DISABLED: "禁用", READY: "就绪", UNAVAILABLE: "不可用", EXPIRED: "已过期", NOT_ATTEMPTED: "尚未尝试", SUCCEEDED: "成功", FAILED: "失败" };
  return value && Object.hasOwn(labels, value) ? `${labels[value]} (${value})` : value ? `不支持的状态 (${value})` : "状态未知";
}
export function geoObservationSections(data: GeoObservation): GeoObservationSection[] {
  const metric = (label: string, value: string | null): GeoObservationMetric => ({ label, value });
  return [
    { title: "离线地域策略", metrics: [metric("缓存版本", data.cacheVersion), metric("融合策略", data.strategy === "PREFER_PRIMARY" ? "优先主源，缺字段才查启用备用" : "不支持的策略"), metric("Redis", data.redisAvailable ? "可用" : "不可用")] },
    ...(["DBIP", "MAXMIND"] as const).map((key) => { const provider = data.providers[key]; return { title: key === "DBIP" ? "DB-IP 主源" : "MaxMind 备用源", metrics: [metric("已启用", provider.enabled ? "是" : "否"), metric("健康", geoOperationalState(provider.health)), metric("数据库版本", provider.databaseVersion), metric("文件摘要", provider.digest), metric("加载时间（北京时间）", riskTime(provider.loadedAt)), metric("有效截止", riskTime(provider.expiresAt)), metric("更新状态", geoOperationalState(provider.updateStatus)), metric("固定失败分类", provider.updateFailureCode)] }; }),
    { title: "Python批次去重IP缓存决策（非请求量）", metrics: [metric("观测完整", data.cache.available ? "是" : "否/不可用"), metric("口径", data.cache.scope === "PYTHON_BATCH_DISTINCT_IP" ? "每批规范去重IP一次决策" : "不支持的观测口径"), metric("报告时间", riskTime(data.cache.reportedAt)), metric("命中", data.cache.hits), metric("未命中", data.cache.misses), metric("陈旧", data.cache.stale), metric("命中率（0–1）", data.cache.hitRate), ...["COUNTRY", "PROVINCE", "CITY", "UNKNOWN"].map((key) => metric(`精度 ${key}`, data.cache.levelCounts[key] ?? null))] },
    { title: "地域质量与冲突", metrics: [metric("观测完整", data.quality.available ? "是" : "否/不可用"), metric("报告时间", riskTime(data.quality.reportedAt)), ...([['决策总数','total'],['未知','unknown'],['不可信','untrusted'],['非公网','nonPublic'],['服务不可用','serviceUnavailable'],['编码冲突','conflicts'],['本地降级','localDegraded'],['版本陈旧','versionStale']] as const).map(([label, key]) => metric(label, data.quality[key]))] },
  ];
}
