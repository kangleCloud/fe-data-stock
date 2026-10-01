import type { MarketDashboardSnapshot, SnapshotFundPoint, SnapshotModule, SnapshotSectorItem } from "@/types/market";
import { formatDateTime } from "@/utils/market";

export function chinaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function snapshotDateLabel(
  module: SnapshotModule<unknown> | null,
  today = chinaDate(),
): string {
  if (!module?.tradeDate) return "参考交易日待确认";
  return `参考交易日 ${module.tradeDate}${module.tradeDate < today ? " · 历史数据" : ""}`;
}

export function snapshotStatusLabel(module: SnapshotModule<unknown> | null): string {
  if (!module) return "暂无快照";
  if (module.status === "FRESH") return "本轮采集成功";
  if (module.status === "STALE") return "本轮采集失败，显示上次成功数据";
  return "采集失败，暂无可用数据";
}

export function snapshotGeneratedLabel(snapshot: MarketDashboardSnapshot | null): string {
  return snapshot ? `快照生成于 ${formatDateTime(snapshot.generatedAt)}` : "尚无市场快照";
}

export function snapshotDelayLevel(module: SnapshotModule<unknown> | null, now = Date.now()): "normal" | "delayed" | "severe" {
  if (module?.status !== "FRESH" || !module.lastSuccessAt) return "normal";
  const age = now - Date.parse(module.lastSuccessAt);
  return age > 300_000 ? "severe" : age > 120_000 ? "delayed" : "normal";
}

export function sectorRankings(items: SnapshotSectorItem[]): {
  topRise: SnapshotSectorItem[];
  topFall: SnapshotSectorItem[];
  topInflow: SnapshotSectorItem[];
  topOutflow: SnapshotSectorItem[];
} {
  return {
    topRise: items.filter((item) => item.changePct !== null && item.changePct > 0)
      .sort((a, b) => b.changePct! - a.changePct!).slice(0, 5),
    topFall: items.filter((item) => item.changePct !== null && item.changePct < 0)
      .sort((a, b) => a.changePct! - b.changePct!).slice(0, 5),
    topInflow: items.filter((item) => item.netAmount !== null && item.netAmount > 0)
      .sort((a, b) => b.netAmount! - a.netAmount!).slice(0, 10),
    topOutflow: items.filter((item) => item.netAmount !== null && item.netAmount < 0)
      .sort((a, b) => a.netAmount! - b.netAmount!).slice(0, 10),
  };
}

/** A missing sample or collection gap starts a new line rather than inventing an intraday point. */
export function splitFundSeries(points: SnapshotFundPoint[], gapMs = 180_000): SnapshotFundPoint[][] {
  const segments: SnapshotFundPoint[][] = [];
  let breakNext = false;
  for (const point of points) {
    if (point.netAmount === null) { breakNext = true; continue; }
    const last = segments.at(-1);
    const previous = last?.at(-1);
    if (breakNext || !previous || Date.parse(point.collectedAt) - Date.parse(previous.collectedAt) > gapMs) {
      segments.push([point]);
    } else {
      last!.push(point);
    }
    breakNext = false;
  }
  return segments;
}
