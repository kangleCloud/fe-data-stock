import type {
  StockMonitorDashboard,
  StockMonitorStock,
  StockPricePoint,
  StockFundPoint,
  StockQuote,
  StockQuoteStatus,
  StockDataStatus,
  StockFundFlowStatus,
} from "@/types/market";

const SYMBOL = /^(SH|SZ|BJ)\d{6}$/;
const TRADE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHANGHAI_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+08:00$/;
const QUOTE_STATUSES = new Set<StockQuoteStatus>(["DISABLED", "FRESH", "STALE", "ERROR"]);
const DATA_STATUSES = new Set<StockDataStatus>(["CURRENT", "DELAYED", "HISTORICAL", "NO_DATA", "DISABLED"]);
const FUND_STATUSES = new Set<StockFundFlowStatus>(["AVAILABLE", "STALE", "NO_DATA", "DISABLED"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("个股监控响应格式异常");
  }
  return value as Record<string, unknown>;
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("个股监控数值无效");
  return value;
}

function optionalNullableNumber(value: unknown): number | null {
  return value === undefined ? null : nullableNumber(value);
}

function nullableTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !SHANGHAI_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("个股监控时间无效");
  }
  return value;
}

function nullableDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !TRADE_DATE.test(value)) throw new Error("个股监控交易日无效");
  return value;
}

function parseQuote(value: unknown): StockQuote {
  const quote = record(value);
  if (quote.source !== "XQ" || !QUOTE_STATUSES.has(quote.status as StockQuoteStatus)) {
    throw new Error("个股监控报价状态无效");
  }
  return {
    source: "XQ",
    sourceTime: nullableTime(quote.sourceTime),
    collectedAt: nullableTime(quote.collectedAt),
    tradeDate: nullableDate(quote.tradeDate),
    price: nullableNumber(quote.price),
    previousClose: optionalNullableNumber(quote.previousClose),
    low: optionalNullableNumber(quote.low),
    high: optionalNullableNumber(quote.high),
    open: optionalNullableNumber(quote.open),
    limitUp: optionalNullableNumber(quote.limitUp),
    limitDown: optionalNullableNumber(quote.limitDown),
    averagePrice: optionalNullableNumber(quote.averagePrice),
    volume: optionalNullableNumber(quote.volume),
    changePercent: nullableNumber(quote.changePercent),
    amount: nullableNumber(quote.amount),
    status: quote.status as StockQuoteStatus,
  };
}

function parseStock(value: unknown, xqEnabled: boolean): StockMonitorStock {
  const stock = record(value);
  if (stock.fundFlowStatus != null && !FUND_STATUSES.has(stock.fundFlowStatus as StockFundFlowStatus)) {
    throw new Error("个股监控资金状态无效");
  }
  if (stock.fundFlowMessage != null && typeof stock.fundFlowMessage !== "string") {
    throw new Error("个股监控资金说明无效");
  }
  const profile = xqEnabled ? record(stock.profile) : null;
  const symbol = stock.symbol;
  const market = stock.market;
  const code = stock.code;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol) ||
    typeof code !== "string" || code !== symbol.slice(2) || market !== symbol.slice(0, 2) ||
    typeof stock.name !== "string" || !stock.name.trim() ||
    typeof stock.sortOrder !== "number" || !Number.isInteger(stock.sortOrder) || stock.sortOrder < 0 ||
    (profile && profile.industry !== null && typeof profile.industry !== "string")) {
    throw new Error("个股监控股票信息无效");
  }
  const dataStatus = xqEnabled ? stock.dataStatus as StockDataStatus : "DISABLED";
  const effectiveTradeDate = xqEnabled ? nullableDate(stock.effectiveTradeDate) : null;
  const closeConfirmed = xqEnabled ? stock.closeConfirmed : false;
  if (!DATA_STATUSES.has(dataStatus) || typeof closeConfirmed !== "boolean") {
    throw new Error("个股监控数据状态无效");
  }
  const rawSeries = xqEnabled ? stock.series : [];
  if (!Array.isArray(rawSeries)) throw new Error("个股监控曲线无效");
  let previousTime = -Infinity;
  const series: StockPricePoint[] = rawSeries.map((item: unknown) => {
    const point = record(item);
    const time = nullableTime(point.time);
    if (time === null || typeof point.price !== "number" || !Number.isFinite(point.price)) {
      throw new Error("个股监控曲线点无效");
    }
    const epoch = Date.parse(time);
    if (epoch <= previousTime) throw new Error("个股监控曲线时间未按序排列");
    if (effectiveTradeDate === null || shanghaiToday(new Date(time)) !== effectiveTradeDate) {
      throw new Error("个股监控价格曲线交易日不一致");
    }
    previousTime = epoch;
    return { time, price: point.price };
  });
  const rawFundSeries = xqEnabled ? stock.fundSeries : [];
  if (!Array.isArray(rawFundSeries)) throw new Error("个股监控资金曲线无效");
  let previousFundTime = -Infinity;
  const fundSeries: StockFundPoint[] = rawFundSeries.map((item: unknown) => {
    const point = record(item);
    const collectedAt = nullableTime(point.collectedAt);
    if (collectedAt === null || effectiveTradeDate === null ||
      shanghaiToday(new Date(collectedAt)) !== effectiveTradeDate ||
      Date.parse(collectedAt) <= previousFundTime) {
      throw new Error("个股监控资金采样时间无效");
    }
    previousFundTime = Date.parse(collectedAt);
    return { collectedAt, inflow: nullableNumber(point.inflow),
      outflow: nullableNumber(point.outflow), netAmount: nullableNumber(point.netAmount) };
  });
  const quote = xqEnabled ? parseQuote(stock.quote) : disabledQuote;
  if (xqEnabled && stock.fundFlowStatus === "AVAILABLE" && !fundSeries.some((point) => point.netAmount !== null)) {
    throw new Error("个股监控资金可用状态缺少有效采样点");
  }
  const unavailable = !xqEnabled || dataStatus === "NO_DATA" || dataStatus === "DISABLED";
  if (!unavailable && effectiveTradeDate === null) throw new Error("个股监控有效交易日缺失");
  if (!unavailable && quote.tradeDate !== null && quote.tradeDate !== effectiveTradeDate) {
    throw new Error("个股监控报价交易日不一致");
  }
  return {
    symbol,
    code,
    name: stock.name,
    market: market as StockMonitorStock["market"],
    sortOrder: stock.sortOrder,
    effectiveTradeDate: unavailable ? null : effectiveTradeDate,
    dataStatus,
    closeConfirmed: unavailable ? false : closeConfirmed,
    profile: profile ? {
      industry: profile.industry as string | null,
      listingDate: nullableDate(profile.listingDate),
      marketCap: nullableNumber(profile.marketCap),
      updatedAt: nullableTime(profile.updatedAt),
    } : { industry: null, listingDate: null, marketCap: null, updatedAt: null },
    quote: unavailable ? { ...disabledQuote, status: quote.status } : quote,
    series: unavailable ? [] : series,
    fundSeries: unavailable ? [] : fundSeries,
    fundFlowStatus: xqEnabled ? (stock.fundFlowStatus as StockFundFlowStatus | undefined) ?? null : "DISABLED",
    fundFlowMessage: (stock.fundFlowMessage as string | null | undefined) ?? null,
  };
}

const disabledQuote: StockQuote = {
  source: "XQ", sourceTime: null, collectedAt: null, tradeDate: null,
  price: null, previousClose: null, low: null, high: null, open: null, limitUp: null,
  limitDown: null, averagePrice: null, volume: null,
  changePercent: null, amount: null, status: "DISABLED",
};

export function parseStockMonitorDashboard(value: unknown): StockMonitorDashboard {
  const dashboard = record(value);
  if (dashboard.schemaVersion !== 1 ||
    !(dashboard.stateId == null || typeof dashboard.stateId === "string" && dashboard.stateId.length > 0) ||
    typeof dashboard.xqEnabled !== "boolean" ||
    !Array.isArray(dashboard.stocks) || dashboard.stocks.length > 10) {
    throw new Error("个股监控 V1 响应格式异常");
  }
  const stocks = dashboard.stocks.map((stock: unknown) => parseStock(stock, dashboard.xqEnabled as boolean));
  if (new Set(stocks.map((stock) => stock.symbol)).size !== stocks.length) {
    throw new Error("个股监控股票重复");
  }
  return {
    schemaVersion: 1,
    stateId: dashboard.stateId ?? null,
    xqEnabled: dashboard.xqEnabled,
    tradeDate: dashboard.xqEnabled ? nullableDate(dashboard.tradeDate) : null,
    stocks: stocks.sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function applyStockMonitorPatch(current: StockMonitorDashboard, value: unknown): StockMonitorDashboard | "duplicate" {
  const patch = record(value);
  if (typeof patch.stateId !== "string" || !patch.stateId ||
      !(patch.baseStateId === null || typeof patch.baseStateId === "string") ||
      !Array.isArray(patch.stocks) || !patch.stocks.length) throw new Error("个股监控增量结构无效");
  if (patch.stateId === current.stateId) return "duplicate";
  if (patch.baseStateId !== current.stateId) throw new Error("个股监控增量版本不连续");
  const changes = patch.stocks.map((raw: unknown) => parseStock(raw, current.xqEnabled));
  const bySymbol = new Map(current.stocks.map((stock) => [stock.symbol, stock]));
  if (new Set(changes.map((stock) => stock.symbol)).size !== changes.length) throw new Error("个股监控增量股票重复");
  for (const change of changes) {
    const old = bySymbol.get(change.symbol);
    if (!old || old.sortOrder !== change.sortOrder || old.code !== change.code ||
        old.market !== change.market || old.name !== change.name) {
      throw new Error("个股监控配置变化，需要全量重同步");
    }
    bySymbol.set(change.symbol, change);
  }
  return { ...current, stateId: patch.stateId,
    stocks: current.stocks.map((stock) => bySymbol.get(stock.symbol)!) };
}

export function shanghaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isHistoricalStock(stock: StockMonitorStock, today = shanghaiToday()): boolean {
  return stock.effectiveTradeDate !== null && stock.effectiveTradeDate !== today;
}

export function stockFundFlowLabel(stock: StockMonitorStock): string {
  switch (stock.fundFlowStatus) {
    case "AVAILABLE": return "资金采样可用";
    case "STALE": return "资金数据已过期";
    case "NO_DATA": return "该有效日期无资金采样";
    case "DISABLED": return "个股资金展示授权关闭";
    default: return "资金状态未知";
  }
}

export function stockFundFlowMessage(stock: StockMonitorStock): string {
  if (stock.fundFlowStatus === "DISABLED") return "雪球采集授权关闭，个股资金数据暂不公开。";
  if (stock.fundFlowMessage) return stock.fundFlowMessage;
  if (stock.fundFlowStatus === "STALE") return "当前资金模块不可用，保留最近有效采样；请核对实际采集时间。";
  if (stock.fundFlowStatus === "NO_DATA") return `有效交易日 ${stock.effectiveTradeDate || "未确定"} 暂无资金采样点；不补零。`;
  if (stock.fundFlowStatus == null) return "服务未提供资金状态，暂无可确认的资金更新信息。";
  return "仅展示实际采样，不补点；横轴为实际采集时间。";
}

export function splitPriceSeries(points: StockPricePoint[], gapMilliseconds = 180_000): StockPricePoint[][] {
  const result: StockPricePoint[][] = [];
  for (const point of points) {
    const lastSegment = result.at(-1);
    const previous = lastSegment?.at(-1);
    if (!previous || Date.parse(point.time) - Date.parse(previous.time) > gapMilliseconds) {
      result.push([point]);
    } else {
      lastSegment!.push(point);
    }
  }
  return result;
}

export function splitStockFundSeries(points: StockFundPoint[], gapMilliseconds = 180_000): StockFundPoint[][] {
  const result: StockFundPoint[][] = [];
  let breakNext = false;
  for (const point of points) {
    if (point.netAmount === null) { breakNext = true; continue; }
    const lastSegment = result.at(-1);
    const previous = lastSegment?.at(-1);
    if (breakNext || !previous || Date.parse(point.collectedAt) - Date.parse(previous.collectedAt) > gapMilliseconds) {
      result.push([point]);
    } else {
      lastSegment!.push(point);
    }
    breakNext = false;
  }
  return result;
}
