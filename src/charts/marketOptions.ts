import type { EChartsCoreOption } from "echarts/core";

import type {
  SnapshotFundPoint,
  SnapshotSectorItem,
  StockPricePoint,
  StockFundPoint,
} from "@/types/market";
import { formatAmount, formatPercent, formatPlainNumber } from "@/utils/market";
import { splitPriceSeries, splitStockFundSeries } from "@/utils/stockMonitor";
import { splitFundSeries } from "@/utils/marketSnapshot";

const axisColor = "#5F718A";
const splitColor = "rgba(148, 163, 184, 0.12)";
const textColor = "#94A3B8";
const riseColor = "#F05252";
const fallColor = "#22A06B";
const primaryColor = "#3B82F6";

function stockPriceOption(points: StockPricePoint[], unit = "元"): EChartsCoreOption {
  const segments = splitPriceSeries(points);
  const formatTooltipPrice = (value: unknown): string => {
    const price = Array.isArray(value) ? value[1] : value;
    return typeof price === "number" && Number.isFinite(price)
      ? `${formatPlainNumber(price)} ${unit}`
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
      minInterval: 0.01,
      splitNumber: 4,
      axisLabel: { color: textColor, formatter: (value: number) => formatPlainNumber(value) },
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

function intradayFundOption(points: SnapshotFundPoint[]): EChartsCoreOption {
  const segments = splitFundSeries(points);
  return {
    aria: { enabled: true },
    tooltip: { trigger: "axis", backgroundColor: "#102039", borderColor: "#20334D",
      valueFormatter: (value: unknown) => {
        const amount = Array.isArray(value) ? value[1] : value;
        return typeof amount === "number" && Number.isFinite(amount) ? `${formatAmount(amount)}元` : "—";
      } },
    grid: { top: 16, right: 22, bottom: 34, left: 72 },
    xAxis: { type: "time", axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, hideOverlap: true, formatter: (value: number) =>
        new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) } },
    yAxis: { type: "value", scale: true, splitNumber: 4,
      axisLabel: { color: textColor, formatter: (value: number) => formatAmount(value) },
      splitLine: { lineStyle: { color: splitColor } } },
    series: segments.map((segment, index) => ({
      id: `segment-${index}`,
      name: "全市场资金净额", type: "line",
      data: segment.map((point) => [point.collectedAt, point.netAmount]),
      showSymbol: segment.length === 1, symbolSize: 5, connectNulls: false,
      lineStyle: { color: primaryColor, width: 2 }, itemStyle: { color: primaryColor },
    })),
  };
}

function stockFundOption(points: StockFundPoint[]): EChartsCoreOption {
  const segments = splitStockFundSeries(points);
  return {
    aria: { enabled: true },
    tooltip: { trigger: "axis", backgroundColor: "#102039", borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      valueFormatter: (value: unknown) => {
        const amount = Array.isArray(value) ? value[1] : value;
        return typeof amount === "number" && Number.isFinite(amount) ? `${formatAmount(amount)}元` : "—";
      } },
    grid: { top: 20, right: 20, bottom: 35, left: 70 },
    xAxis: { type: "time", axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, hideOverlap: true, formatter: (value: number) =>
        new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) } },
    yAxis: { type: "value", min: (range: { min: number }) => Math.min(0, range.min),
      max: (range: { max: number }) => Math.max(0, range.max),
      axisLabel: { color: textColor, formatter: (value: number) => formatAmount(value) },
      splitLine: { lineStyle: { color: splitColor } } },
    visualMap: { type: "piecewise", show: false, dimension: 1,
      seriesIndex: segments.map((_, index) => index),
      pieces: [{ gt: 0, color: riseColor }, { lte: 0, color: fallColor }] },
    series: segments.map((segment, index) => ({
      id: `segment-${index}`,
      name: "个股资金净额", type: "line",
      data: segment.map((point) => [point.collectedAt, point.netAmount]),
      showSymbol: true, symbolSize: 5, connectNulls: false,
      lineStyle: { width: 2 },
      ...(index === 0 ? { markLine: { silent: true, symbol: "none", label: { formatter: "零轴" },
        lineStyle: { color: axisColor, type: "dashed", width: 1.5 }, data: [{ yAxis: 0 }] } } : {}),
    })),
  };
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
export function buildCollectedPriceOption(points: Array<{ collectedAt: string; price: number }>, unit = "元"): EChartsCoreOption {
  return cachedOption(points, `collected-price-${unit}`, () => stockPriceOption(points.map((point) => ({ time: point.collectedAt, price: point.price })), unit));
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
