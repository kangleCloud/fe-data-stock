import type { EChartsCoreOption } from "echarts/core";

import type {
  SnapshotFundPoint,
  SnapshotSectorItem,
  StockPricePoint,
  StockFundPoint,
} from "@/types/market";
import { formatAmount, formatPercent, formatPlainNumber } from "@/utils/market";
import { splitPriceSeries, splitStockFundSeries } from "@/utils/stockMonitor";
import { fundAxisRange, fundCollectedTime, fundUnit, formatFundAmount, fullFundAmount } from "@/utils/fundChart";
import { splitFundSeries } from "@/utils/marketSnapshot";

const axisColor = "#5F718A";
const splitColor = "rgba(148, 163, 184, 0.12)";
const textColor = "#94A3B8";
const riseColor = "#F05252";
const fallColor = "#22A06B";
const primaryColor = "#3B82F6";

function stockPriceOption(points: StockPricePoint[], unit = "元", digits = 2): EChartsCoreOption {
  const segments = splitPriceSeries(points);
  const formatTooltipPrice = (value: unknown): string => {
    const price = Array.isArray(value) ? value[1] : value;
    return typeof price === "number" && Number.isFinite(price)
      ? `${formatPlainNumber(price, digits)} ${unit}`
      : "—";
  };
  return {
    aria: { enabled: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#102039",
      borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      valueFormatter: formatTooltipPrice,
    },
    grid: { top: 16, right: 18, bottom: 34, left: 55 },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, hideOverlap: true, formatter: (value: number) => {
        const date = new Date(value);
        return new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(date);
      } },
    },
    yAxis: {
      type: "value",
      scale: true,
      minInterval: 10 ** -digits,
      splitNumber: 4,
      axisLabel: { color: textColor, formatter: (value: number) => formatPlainNumber(value, digits) },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: segments.map((segment, index) => ({
      id: `segment-${index}`,
      name: unit === "点" ? "指数点位" : "采样价格",
      type: "line",
      data: segment.map((point) => [point.time, point.price]),
      showSymbol: segment.length === 1,
      symbolSize: 5,
      connectNulls: false,
      lineStyle: { color: primaryColor, width: 2 },
      itemStyle: { color: primaryColor },
      areaStyle: { color: primaryColor, opacity: 0.05 },
    })),
  };
}

function escapeHtml(value: string): string {
  // 仅在 HTML Tooltip 输出边界转义；原始数据与 Canvas 标签保持原文，避免二次编码。
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function collectedTime(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false }).format(new Date(value));
}

function amountYuan(value: number | null): string {
  return value === null ? "—" : `${formatAmount(value)}元`;
}

function sectorTreemapOption(items: SnapshotSectorItem[], lastSuccessAt: string | null = null): EChartsCoreOption {
  const data = items.filter((item) => item.companyCount !== null && item.companyCount > 0)
    .map((item) => ({
      name: item.name,
      value: item.companyCount,
      changePct: item.changePct,
      sector: item,
      itemStyle: { color: item.changePct === null || item.changePct === 0 ? axisColor
        : item.changePct > 0 ? riseColor : fallColor },
    }));
  return {
    aria: { enabled: true },
    tooltip: { trigger: "item", renderMode: "html", appendToBody: true, confine: true,
      extraCssText: "max-width:min(300px, calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;",
      formatter: (params: { data: { sector: SnapshotSectorItem } }) => {
      const item = params.data.sector;
      const row = (label: string, value: string) => `<div>${label}：${value}</div>`;
      return [
        `<strong>${escapeHtml(item.name)}</strong>`,
        row("涨跌幅", formatPercent(item.changePct)),
        row("板块指数", formatPlainNumber(item.indexValue)),
        row("企业数", item.companyCount === null ? "—" : `${item.companyCount} 家`),
        row("流入", amountYuan(item.inflow)),
        row("流出", amountYuan(item.outflow)),
        row("净额", amountYuan(item.netAmount)),
        row("领涨股", item.leader === null ? "—" : escapeHtml(item.leader)),
        row("领涨股涨幅", formatPercent(item.leaderChangePct)),
        row("来源", "AKShare / 同花顺"),
        row("采集时间", collectedTime(lastSuccessAt)),
      ].join("");
      } },
    series: [{ id: "sector-treemap",
      type: "treemap", data, roam: false, nodeClick: false,
      breadcrumb: { show: false },
      label: { show: true, color: "#fff", fontSize: 12,
        formatter: (params: { data?: { changePct?: number | null }; name: string }) =>
          `${params.name}\n${params.data?.changePct == null ? "—" : `${formatPlainNumber(params.data.changePct)}%`}` },
      itemStyle: { borderColor: "#081221", borderWidth: 2, gapWidth: 2 },
    }],
  };
}

type FundSample = Pick<StockFundPoint, "collectedAt" | "netAmount">;
function fundOption(segments: FundSample[][], name: string): EChartsCoreOption {
  const samples = segments.flat().filter((point) => Number.isFinite(point.netAmount) && Number.isFinite(Date.parse(point.collectedAt)));
  const values = samples.map((point) => point.netAmount!);
  const unit = fundUnit(values);
  const axisRange = fundAxisRange(values, unit.divisor);
  const times = samples.map((point) => Date.parse(point.collectedAt));
  const first = times.length ? Math.min(...times) : undefined;
  const last = times.length ? Math.max(...times) : undefined;
  // 时间轴保留真实午休和缺样间隔；单点只扩展视窗，不添加采样。
  const timePadding = first === last ? 120_000 : Math.max(1_000, ((last ?? 0) - (first ?? 0)) * 0.03);
  return {
    aria: { enabled: true },
    tooltip: { trigger: "axis", confine: true, renderMode: "html", backgroundColor: "#102039", borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      extraCssText: "max-width:min(320px, calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;",
      valueFormatter: (value: unknown) => formatFundAmount(value),
      formatter: (params: { data?: unknown; value?: unknown; seriesName?: string } | Array<{ data?: unknown; value?: unknown; seriesName?: string }>) => {
        const items = Array.isArray(params) ? params : [params];
        return items.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const pair = item.data ?? item.value;
          if (!Array.isArray(pair) || typeof pair[0] !== "string" || typeof pair[1] !== "number" || !Number.isFinite(pair[1])) return [];
          // 只展示真实采样，Tooltip 不使用缺口内的轴指示时间。
          if (!samples.some((point) => point.collectedAt === pair[0] && point.netAmount === pair[1])) return [];
          return [`<div>${escapeHtml(fundCollectedTime(pair[0]))}</div><strong>${escapeHtml(item.seriesName ?? name)}</strong>：${formatFundAmount(pair[1])}<div>${fullFundAmount(pair[1])}</div>`];
        }).join("<br>");
      } },
    grid: { top: 34, right: 16, bottom: 28, left: 16, containLabel: true },
    xAxis: { type: "time", min: first === undefined ? undefined : first - timePadding,
      max: last === undefined ? undefined : last + timePadding,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, hideOverlap: true, formatter: (value: number) =>
        new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) } },
    yAxis: { type: "value", name: unit.name, nameTextStyle: { color: textColor }, ...axisRange,
      splitNumber: 4, axisLabel: { color: textColor, formatter: (value: number) =>
        (value / unit.divisor).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) },
      splitLine: { lineStyle: { color: splitColor } } },
    visualMap: { type: "piecewise", show: false, dimension: 1,
      seriesIndex: segments.flatMap((segment, index) => segment.every((point) => point.netAmount === 0) ? [] : [index]),
      // 有限区间为折线提供不同坐标的渐变锚点，避免零点重合时负值线段颜色反转。
      pieces: [{ gt: 0, lte: axisRange.max, color: riseColor }, { gte: axisRange.min, lt: 0, color: fallColor }, { value: 0, color: textColor }] },
    series: segments.map((segment, index) => ({
      id: `segment-${index}`, name, type: "line",
      data: segment.map((point) => [point.collectedAt, point.netAmount]),
      showSymbol: segment.length === 1, symbolSize: 5, connectNulls: false, smooth: false,
      lineStyle: { width: 2, color: segment.every((point) => point.netAmount === 0) ? textColor : undefined },
      itemStyle: { color: segment.every((point) => point.netAmount === 0) ? textColor : undefined },
      ...(index === 0 ? { markLine: { silent: true, symbol: "none", label: { show: false },
        lineStyle: { color: axisColor, type: "dashed", width: 1.5 }, data: [{ yAxis: 0 }] } } : {}),
    })),
  };
}

function intradayFundOption(points: SnapshotFundPoint[]): EChartsCoreOption {
  return fundOption(splitFundSeries(points), "全市场资金净额");
}

function stockFundOption(points: StockFundPoint[]): EChartsCoreOption {
  return fundOption(splitStockFundSeries(points), "个股资金净额");
}

const optionsByData = new WeakMap<object, Map<string, EChartsCoreOption>>();
function cachedOption(data: object, key: string, build: () => EChartsCoreOption): EChartsCoreOption {
  let cache = optionsByData.get(data);
  if (!cache) { cache = new Map(); optionsByData.set(data, cache); }
  let option = cache.get(key);
  if (!option) { option = build(); cache.set(key, option); }
  return option;
}

export function buildStockPriceOption(points: StockPricePoint[], unit = "元"): EChartsCoreOption {
  return cachedOption(points, `price-${unit}`, () => stockPriceOption(points, unit));
}
export function buildCollectedPriceOption(points: Array<{ collectedAt: string; price: number }>, unit = "元", digits = 2): EChartsCoreOption {
  return cachedOption(points, `collected-price-${unit}-${digits}`, () => stockPriceOption(points.map((point) => ({ time: point.collectedAt, price: point.price })), unit, digits));
}
export function buildSectorTreemapOption(items: SnapshotSectorItem[], lastSuccessAt: string | null = null): EChartsCoreOption {
  return cachedOption(items, `treemap-${lastSuccessAt}`, () => sectorTreemapOption(items, lastSuccessAt));
}
export function buildIntradayFundOption(points: SnapshotFundPoint[]): EChartsCoreOption {
  return cachedOption(points, "intraday-fund", () => intradayFundOption(points));
}
export function buildStockFundOption(points: StockFundPoint[]): EChartsCoreOption {
  return cachedOption(points, "stock-fund", () => stockFundOption(points));
}
