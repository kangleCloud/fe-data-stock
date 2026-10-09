import type { MarketDashboardSnapshot } from "@/types/market";
import { chinaDate } from "@/utils/marketSnapshot";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): boolean {
  return value === null || finiteNumber(value);
}

function timestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function sectorItem(value: unknown, sectorType: "industry" | "concept"): boolean {
  if (!record(value) || value.type !== sectorType ||
      !(value.code === null || typeof value.code === "string" && value.code.trim().length > 0) ||
      typeof value.name !== "string" || !value.name.trim() ||
      !(value.leader === null || typeof value.leader === "string")) return false;
  return ["indexValue", "changePct", "inflow", "outflow", "netAmount", "netFlowRate",
    "companyCount", "leaderChangePct", "leaderPrice"].every((key) => nullableNumber(value[key]));
}

function fundPoint(value: unknown): boolean {
  if (!record(value) || !timestamp(value.collectedAt) ||
      !["inflow", "outflow", "netAmount"].every((key) => nullableNumber(value[key]))) return false;
  const { inflow, outflow, netAmount } = value;
  return inflow === null || outflow === null || netAmount === null ||
    (typeof inflow === "number" && typeof outflow === "number" && typeof netAmount === "number" &&
      Math.abs(inflow - outflow - netAmount) <= 0.011);
}

function fundData(value: unknown, tradeDate: string): boolean {
  if (!record(value) || value.source !== "THS_INDIVIDUAL_AGGREGATE" ||
      typeof value.reconciledFromLegacy !== "boolean" ||
      !record(value.latest) || !fundPoint(value.latest) ||
      !["riseCount", "fallCount", "flatCount", "stockCount"].every((key) => nullableNumber((value.latest as Record<string, unknown>)[key])) ||
      !Array.isArray(value.series) || !value.series.every(fundPoint)) return false;
  const series = value.series as Array<{ collectedAt: string }>;
  if (chinaDate(new Date(value.latest.collectedAt as string)) !== tradeDate ||
      series.some((point) => chinaDate(new Date(point.collectedAt)) !== tradeDate)) return false;
  return series.every((point, index) =>
    index === 0 || Date.parse(point.collectedAt) > Date.parse(series[index - 1]!.collectedAt));
}

function coreIndexData(value: unknown): boolean {
  if (!record(value) || value.source !== "SINA_INDEX" || value.sourceTime !== null ||
      !Array.isArray(value.items) || value.items.length > 5) return false;
  const codes = new Set(["sh000001", "sz399001", "sh000300", "sz399006", "sh000688"]);
  const seen = new Set<string>();
  return value.items.every((raw) => {
    if (!record(raw) || typeof raw.code !== "string" || !codes.has(raw.code) || seen.has(raw.code) ||
        typeof raw.name !== "string" || !raw.name ||
        raw.sourceTime !== null || !(raw.collectedAt === null || timestamp(raw.collectedAt)) ||
        !["price", "change", "changePercent", "previousClose", "open", "high", "low", "volume", "amount"]
          .every((key) => nullableNumber(raw[key])) || !Array.isArray(raw.series)) return false;
    seen.add(raw.code);
    let previous = -Infinity;
    return raw.series.every((point) => {
      if (!record(point) || !timestamp(point.collectedAt) || !finiteNumber(point.price) ||
          Date.parse(point.collectedAt as string) <= previous) return false;
      previous = Date.parse(point.collectedAt as string);
      return true;
    });
  });
}

function validModule(value: unknown, kind: "sectors" | "fund" | "indices", sectorType?: "industry" | "concept"): boolean {
  if (!record(value) || !["FRESH", "STALE", "ERROR"].includes(String(value.status))) return false;
  if (!(value.tradeDate === null || typeof value.tradeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.tradeDate))) return false;
  if (value.tradeDateBasis !== "CALENDAR") return false;
  if (!(value.lastSuccessAt === null || timestamp(value.lastSuccessAt))) return false;
  if (!(value.lastAttemptAt === null || timestamp(value.lastAttemptAt))) return false;
  if (!(value.message === null || typeof value.message === "string")) return false;
  if (value.data === null) return value.status === "ERROR";
  if (value.status === "ERROR") return false;
  if (value.tradeDate === null || value.lastSuccessAt === null) return false;
  if (!record(value.data)) return false;
  if (kind === "indices") return coreIndexData(value.data);
  if (kind === "fund") return fundData(value.data, value.tradeDate as string);
  return value.data.source === "THS" && value.data.period === "INTRADAY" &&
    Array.isArray(value.data.items) && value.data.items.every((item) => sectorItem(item, sectorType!));
}

export function parseMarketSnapshot(value: unknown): MarketDashboardSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || !timestamp(value.generatedAt) ||
      !(value.snapshotId == null || typeof value.snapshotId === "string" && value.snapshotId.length > 0) ||
      value.provider !== "akshare" || !record(value.modules) ||
      Object.keys(value.modules).some((key) => !["industrySectors", "conceptSectors", "marketFundFlow", "coreIndices"].includes(key)) ||
      !validModule(value.modules.industrySectors, "sectors", "industry") ||
      !validModule(value.modules.conceptSectors, "sectors", "concept") ||
      !validModule(value.modules.marketFundFlow, "fund") ||
      (value.modules.coreIndices !== undefined && !validModule(value.modules.coreIndices, "indices"))) {
    throw new Error("市场快照结构或版本无效");
  }
  return { ...value, snapshotId: value.snapshotId ?? null } as unknown as MarketDashboardSnapshot;
}

export function applyMarketPatch(current: MarketDashboardSnapshot, value: unknown): MarketDashboardSnapshot | "duplicate" {
  if (!record(value) || !(value.baseSnapshotId === null || typeof value.baseSnapshotId === "string") ||
      typeof value.snapshotId !== "string" || !value.snapshotId ||
      !timestamp(value.generatedAt) || !record(value.modules)) throw new Error("市场增量结构无效");
  if (value.snapshotId === current.snapshotId) return "duplicate";
  // 同轮模块可共享秒级生成时间，连续性仍以 baseSnapshotId 为准。
  if (value.baseSnapshotId !== current.snapshotId ||
      Date.parse(value.generatedAt as string) < Date.parse(current.generatedAt)) throw new Error("市场增量版本不连续");
  const keys = Object.keys(value.modules);
  if (keys.some((key) => !["industrySectors", "conceptSectors", "marketFundFlow", "coreIndices"].includes(key))) {
    throw new Error("市场增量模块无效");
  }
  return parseMarketSnapshot({ ...current, snapshotId: value.snapshotId,
    generatedAt: value.generatedAt, modules: { ...current.modules, ...value.modules } });
}
