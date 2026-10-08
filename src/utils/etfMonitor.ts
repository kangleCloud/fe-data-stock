import type {
  EtfAssetAllocation, EtfMonitorDashboard, EtfMonitorItem, EtfPricePoint, EtfProfile, EtfQuote,
} from "@/types/etf";
import { shanghaiToday } from "@/utils/stockMonitor";

const SYMBOL = /^(SH|SZ)\d{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+08:00$/;
const DATA_STATUSES = new Set(["CURRENT", "DELAYED", "HISTORICAL", "NO_DATA"]);
const QUOTE_STATUSES = new Set(["FRESH", "STALE", "ERROR"]);

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("ETF 监控响应格式异常");
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("ETF 资料字段无效");
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("ETF 数值无效");
  return value;
}

function nullableDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error("ETF 日期无效");
  return value;
}

function nullableTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !TIME.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("ETF 采集时间无效");
  }
  return value;
}

function profileValue(value: unknown): EtfProfile {
  const profile = record(value);
  return {
    fullName: nullableString(profile.fullName ?? null), fundType: nullableString(profile.fundType ?? null),
    investmentType: nullableString(profile.investmentType ?? null), fundManager: nullableString(profile.fundManager ?? null),
    establishedDate: nullableDate(profile.establishedDate ?? null),
    performanceBenchmark: nullableString(profile.performanceBenchmark ?? null), source: nullableString(profile.source ?? null),
    exchange: nullableString(profile.exchange), etfType: nullableString(profile.etfType),
    listingStatus: profile.source === "THS" ? null : nullableString(profile.listingStatus),
    listingDate: profile.source === "THS" ? null : nullableDate(profile.listingDate),
    manager: nullableString(profile.manager), custodian: nullableString(profile.custodian),
    shareCount: profile.source === "THS" ? null : nullableNumber(profile.shareCount),
    shareDate: profile.source === "THS" ? null : nullableDate(profile.shareDate),
    trackingIndexCode: nullableString(profile.trackingIndexCode),
    trackingIndexName: nullableString(profile.trackingIndexName), updatedAt: nullableTime(profile.updatedAt),
  };
}

function quoteValue(value: unknown): EtfQuote {
  const quote = record(value);
  if (quote.source !== "SINA_ETF" || quote.sourceTime !== null || !QUOTE_STATUSES.has(String(quote.status))) {
    throw new Error("ETF 行情来源或状态无效");
  }
  return {
    source: "SINA_ETF", sourceTime: null, tradeDate: nullableDate(quote.tradeDate),
    price: nullableNumber(quote.price), change: nullableNumber(quote.change),
    changePercent: nullableNumber(quote.changePercent), previousClose: nullableNumber(quote.previousClose),
    open: nullableNumber(quote.open), high: nullableNumber(quote.high), low: nullableNumber(quote.low),
    volume: nullableNumber(quote.volume), amount: nullableNumber(quote.amount),
    collectedAt: nullableTime(quote.collectedAt), status: quote.status as EtfQuote["status"],
  };
}

function allocationValue(value: unknown): EtfAssetAllocation | null {
  if (value === null) return null;
  const report = record(value);
  if (report.source !== "XQ_DANJUAN" || !Array.isArray(report.categories)) throw new Error("ETF 资产配置格式无效");
  const requestedReportPeriod = nullableDate(report.requestedReportPeriod);
  const collectedAt = nullableTime(report.collectedAt);
  if (!requestedReportPeriod || !collectedAt) throw new Error("ETF 资产配置日期无效");
  const categories = report.categories.map((raw: unknown) => {
    const item = record(raw);
    if (typeof item.category !== "string" || !item.category.trim() ||
        typeof item.percent !== "number" || !Number.isFinite(item.percent) || item.percent < 0 || item.percent > 100) {
      throw new Error("ETF 资产配置类别无效");
    }
    return { category: item.category, percent: item.percent };
  });
  return { source: "XQ_DANJUAN", requestedReportPeriod, collectedAt, categories };
}

function parseItem(value: unknown, xqEnabled: boolean, previous?: EtfMonitorItem): EtfMonitorItem {
  const item = record(value);
  const symbol = item.symbol;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol) || item.code !== symbol.slice(2) ||
      item.market !== symbol.slice(0, 2) || typeof item.name !== "string" || !item.name.trim() ||
      typeof item.sortOrder !== "number" || !Number.isInteger(item.sortOrder) || item.sortOrder < 0 ||
      !DATA_STATUSES.has(String(item.dataStatus)) || typeof item.closeConfirmed !== "boolean" ||
      item.fundFlowStatus !== "NO_RELIABLE_SOURCE" || !Array.isArray(item.series) ||
      !Array.isArray(item.fundSeries) || item.fundSeries.length !== 0) throw new Error("ETF 监控条目无效");
  const effectiveTradeDate = nullableDate(item.effectiveTradeDate);
  const quote = item.quote === null ? null : quoteValue(item.quote);
  if (quote?.tradeDate && effectiveTradeDate && quote.tradeDate !== effectiveTradeDate) {
    throw new Error("ETF 行情交易日不一致");
  }
  let previousTime = -Infinity;
  const series: EtfPricePoint[] = item.series.map((raw: unknown) => {
    const point = record(raw);
    const collectedAt = nullableTime(point.collectedAt);
    if (!collectedAt || typeof point.price !== "number" || !Number.isFinite(point.price) ||
        Date.parse(collectedAt) <= previousTime || !effectiveTradeDate ||
        shanghaiToday(new Date(collectedAt)) !== effectiveTradeDate) throw new Error("ETF 曲线采样点无效");
    previousTime = Date.parse(collectedAt);
    return { collectedAt, price: point.price };
  });
  // 行情补丁不重复发送静态资产配置；资料变化由 resync 重新读取全量。
  const allocation = item.assetAllocation === undefined && previous
    ? previous.assetAllocation : allocationValue(item.assetAllocation);
  if (!xqEnabled && allocation) throw new Error("雪球关闭时 ETF 资产配置必须隐藏");
  return {
    symbol, code: item.code as string, name: item.name as string,
    market: item.market as EtfMonitorItem["market"], sortOrder: item.sortOrder,
    profile: profileValue(item.profile), quote, series, fundSeries: [],
    fundFlowStatus: "NO_RELIABLE_SOURCE", effectiveTradeDate,
    dataStatus: item.dataStatus as EtfMonitorItem["dataStatus"], closeConfirmed: item.closeConfirmed,
    assetAllocation: allocation,
  };
}

export function parseEtfMonitorDashboard(value: unknown): EtfMonitorDashboard {
  const dashboard = record(value);
  if (dashboard.schemaVersion !== 1 ||
      !(dashboard.stateId == null || typeof dashboard.stateId === "string" && dashboard.stateId.length > 0) ||
      typeof dashboard.xqEnabled !== "boolean" || !Array.isArray(dashboard.etfs) || dashboard.etfs.length > 10) {
    throw new Error("ETF 监控 V1 响应格式异常");
  }
  const etfs = dashboard.etfs.map((item: unknown) => parseItem(item, dashboard.xqEnabled as boolean));
  if (new Set(etfs.map((item) => item.symbol)).size !== etfs.length) throw new Error("ETF 监控代码重复");
  return { schemaVersion: 1, stateId: dashboard.stateId ?? null, xqEnabled: dashboard.xqEnabled,
    tradeDate: nullableDate(dashboard.tradeDate), etfs: etfs.sort((a, b) => a.sortOrder - b.sortOrder) };
}

export function applyEtfMonitorPatch(current: EtfMonitorDashboard, value: unknown): EtfMonitorDashboard | "duplicate" {
  const patch = record(value);
  if (!(patch.baseStateId === null || typeof patch.baseStateId === "string") ||
      typeof patch.stateId !== "string" || !patch.stateId || !Array.isArray(patch.etfs) || !patch.etfs.length) {
    throw new Error("ETF 增量结构无效");
  }
  if (patch.stateId === current.stateId) return "duplicate";
  if (patch.baseStateId !== current.stateId) throw new Error("ETF 增量版本不连续");
  const bySymbol = new Map(current.etfs.map((item) => [item.symbol, item]));
  const changed = patch.etfs.map((raw: unknown) => {
    const item = record(raw);
    return parseItem(item, current.xqEnabled,
      typeof item.symbol === "string" ? bySymbol.get(item.symbol) : undefined);
  });
  if (new Set(changed.map((item) => item.symbol)).size !== changed.length) throw new Error("ETF 增量代码重复");
  for (const item of changed) {
    const old = bySymbol.get(item.symbol);
    if (!old || old.sortOrder !== item.sortOrder || old.code !== item.code || old.market !== item.market) {
      throw new Error("ETF 配置变化，需要全量重同步");
    }
    bySymbol.set(item.symbol, item);
  }
  return { ...current, stateId: patch.stateId,
    etfs: current.etfs.map((item) => bySymbol.get(item.symbol)!) };
}
