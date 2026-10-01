import type {
  StockMonitorDashboard,
  StockMonitorStock,
  StockPricePoint,
  StockQuote,
  StockQuoteStatus,
} from "@/types/market";

const SYMBOL = /^(SH|SZ|BJ)\d{6}$/;
const TRADE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHANGHAI_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+08:00$/;
const QUOTE_STATUSES = new Set<StockQuoteStatus>(["DISABLED", "FRESH", "STALE", "ERROR"]);

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
    previousTime = epoch;
    return { time, price: point.price };
  });
  const quote = xqEnabled ? parseQuote(stock.quote) : disabledQuote;
  const unavailable = quote.status === "ERROR" || quote.status === "DISABLED";
  return {
    symbol,
    code,
    name: stock.name,
    market: market as StockMonitorStock["market"],
    sortOrder: stock.sortOrder,
    profile: profile ? {
      industry: profile.industry as string | null,
      listingDate: nullableDate(profile.listingDate),
      marketCap: nullableNumber(profile.marketCap),
      updatedAt: nullableTime(profile.updatedAt),
    } : { industry: null, listingDate: null, marketCap: null, updatedAt: null },
    quote: unavailable ? { ...disabledQuote, status: quote.status } : quote,
    series: unavailable ? [] : series,
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
  if (dashboard.schemaVersion !== 1 || typeof dashboard.xqEnabled !== "boolean" ||
    !Array.isArray(dashboard.stocks) || dashboard.stocks.length > 10) {
    throw new Error("个股监控 V1 响应格式异常");
  }
  const stocks = dashboard.stocks.map((stock: unknown) => parseStock(stock, dashboard.xqEnabled as boolean));
  if (new Set(stocks.map((stock) => stock.symbol)).size !== stocks.length) {
    throw new Error("个股监控股票重复");
  }
  return {
    schemaVersion: 1,
    xqEnabled: dashboard.xqEnabled,
    tradeDate: dashboard.xqEnabled ? nullableDate(dashboard.tradeDate) : null,
    stocks: stocks.sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function shanghaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isHistoricalStock(stock: StockMonitorStock, today = shanghaiToday()): boolean {
  return stock.quote.tradeDate !== null && stock.quote.tradeDate !== today;
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
