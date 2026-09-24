import type {
  MarketDashboardSnapshot,
  MarketFundPoint,
  SnapshotFundPoint,
  SnapshotModule,
} from "@/types/market";
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
  if (!module?.tradeDate) return "数据日期待确认";
  const source = module.tradeDateBasis === "SOURCE" ? "源数据日期" : "参考交易日";
  const historical = module.tradeDate < today ? " · 历史数据" : "";
  return `${source} ${module.tradeDate}${historical}`;
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

export function toChartPoint(point: SnapshotFundPoint): MarketFundPoint {
  return {
    date: point.date,
    mainNetInflow: point.mainNetInflow,
    superLargeNetInflow: point.superLargeNetInflow,
    largeNetInflow: point.largeNetInflow,
    mediumNetInflow: point.mediumNetInflow,
    smallNetInflow: point.smallNetInflow,
    indexPoint: point.shanghaiClose,
    indexChangePercent: point.shanghaiChangePercent,
  };
}
