import type { EChartsCoreOption } from "echarts/core";

import type {
  FundType,
  MarketFundPoint,
  StockPricePoint,
} from "@/types/market";
import { formatAmount, formatPlainNumber } from "@/utils/market";
import { splitPriceSeries } from "@/utils/stockMonitor";

const axisColor = "#5F718A";
const splitColor = "rgba(148, 163, 184, 0.12)";
const textColor = "#94A3B8";
const riseColor = "#F05252";
const fallColor = "#22A06B";
const primaryColor = "#3B82F6";
const amberColor = "#F5B942";

export function buildSparklineOption(
  points: Array<{ time: string; value: number | null }>,
  changePercent: number | null,
): EChartsCoreOption {
  const color =
    changePercent == null || changePercent === 0
      ? textColor
      : changePercent > 0
        ? riseColor
        : fallColor;
  return {
    animation: false,
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: "category", show: false, data: points.map((item) => item.time) },
    yAxis: { type: "value", show: false, scale: true },
    series: [
      {
        type: "line",
        data: points.map((item) => item.value),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color, width: 1.5 },
        areaStyle: { color, opacity: 0.08 },
      },
    ],
  };
}

const fundKeys: Record<FundType, keyof MarketFundPoint> = {
  MAIN: "mainNetInflow",
  SUPER_LARGE: "superLargeNetInflow",
  LARGE: "largeNetInflow",
  MEDIUM: "mediumNetInflow",
  SMALL: "smallNetInflow",
};

const fundNames: Record<FundType, string> = {
  MAIN: "主力净流入",
  SUPER_LARGE: "超大单净流入",
  LARGE: "大单净流入",
  MEDIUM: "中单净流入",
  SMALL: "小单净流入",
};

const fundColors: Record<FundType, string> = {
  MAIN: riseColor,
  SUPER_LARGE: "#FB7185",
  LARGE: amberColor,
  MEDIUM: "#38BDF8",
  SMALL: "#A78BFA",
};

export function buildMarketFundOption(
  points: MarketFundPoint[],
  visibleTypes: FundType[],
  indexName: string,
): EChartsCoreOption {
  const series: Array<Record<string, unknown>> = visibleTypes.map((type) => ({
    name: fundNames[type],
    type: "line" as const,
    showSymbol: false,
    connectNulls: false,
    data: points.map((point) => point[fundKeys[type]]),
    lineStyle: { color: fundColors[type], width: type === "MAIN" ? 3 : 1.5 },
    itemStyle: { color: fundColors[type] },
    yAxisIndex: 0,
  }));
  series.push({
    name: indexName,
    type: "line",
    showSymbol: false,
    connectNulls: false,
    data: points.map((point) => point.indexPoint),
    lineStyle: { color: primaryColor, width: 2, type: "dashed" },
    itemStyle: { color: primaryColor },
    yAxisIndex: 1,
  });
  return {
    tooltip: { trigger: "axis", backgroundColor: "#102039", borderColor: "#20334D" },
    legend: {
      top: 0,
      textStyle: { color: textColor },
      selectedMode: false,
    },
    grid: { top: 44, right: 56, bottom: 28, left: 58 },
    xAxis: {
      type: "category",
      data: points.map((point) => point.date),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor },
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: number) => formatAmount(value) },
        splitLine: { lineStyle: { color: splitColor } },
      },
      {
        type: "value",
        scale: true,
        axisLabel: { color: textColor },
        splitLine: { show: false },
      },
    ],
    series,
  };
}

export function buildStockPriceOption(points: StockPricePoint[]): EChartsCoreOption {
  const segments = splitPriceSeries(points);
  return {
    aria: { enabled: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#102039",
      borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      valueFormatter: (value: unknown) =>
        Array.isArray(value) ? `${formatPlainNumber(Number(value[1]))} 元` : "—",
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
