import type { EChartsCoreOption } from "echarts/core";

import type {
  SnapshotFundPoint,
  SnapshotSectorItem,
  StockPricePoint,
} from "@/types/market";
import { formatAmount, formatPercent, formatPlainNumber } from "@/utils/market";
import { splitPriceSeries } from "@/utils/stockMonitor";
import { splitFundSeries } from "@/utils/marketSnapshot";

const axisColor = "#5F718A";
const splitColor = "rgba(148, 163, 184, 0.12)";
const textColor = "#94A3B8";
const riseColor = "#F05252";
const fallColor = "#22A06B";
const primaryColor = "#3B82F6";

export function buildStockPriceOption(points: StockPricePoint[]): EChartsCoreOption {
  const segments = splitPriceSeries(points);
  const formatTooltipPrice = (value: unknown): string => {
    const price = Array.isArray(value) ? value[1] : value;
    return typeof price === "number" && Number.isFinite(price)
      ? `${formatPlainNumber(price)} 元`
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
    series: segments.map((segment) => ({
      name: "采样价格",
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

export function buildSectorTreemapOption(items: SnapshotSectorItem[], lastSuccessAt: string | null = null): EChartsCoreOption {
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
    tooltip: { trigger: "item", formatter: (params: { data: { sector: SnapshotSectorItem } }) => {
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
    series: [{
      type: "treemap", data, roam: false, nodeClick: false,
      breadcrumb: { show: false },
      label: { show: true, color: "#fff", fontSize: 12,
        formatter: (params: { data?: { changePct?: number | null }; name: string }) =>
          `${params.name}\n${params.data?.changePct == null ? "—" : `${formatPlainNumber(params.data.changePct)}%`}` },
      itemStyle: { borderColor: "#081221", borderWidth: 2, gapWidth: 2 },
    }],
  };
}

export function buildIntradayFundOption(points: SnapshotFundPoint[]): EChartsCoreOption {
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
    series: segments.map((segment) => ({
      name: "全市场资金净额", type: "line",
      data: segment.map((point) => [point.collectedAt, point.netAmount]),
      showSymbol: segment.length === 1, symbolSize: 5, connectNulls: false,
      lineStyle: { color: primaryColor, width: 2 }, itemStyle: { color: primaryColor },
    })),
  };
}
