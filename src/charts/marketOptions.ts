import type { EChartsCoreOption } from "echarts/core";

import type {
  FundType,
  MarketFundPoint,
  SectorAreaMetric,
  SectorSnapshot,
  StockFundPoint,
} from "@/types/market";
import { formatAmount, formatPercent, insertTimeBreaks } from "@/utils/market";

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

export function buildTreemapOption(
  sectors: SectorSnapshot[],
  metric: SectorAreaMetric,
): EChartsCoreOption {
  return {
    tooltip: {
      backgroundColor: "#102039",
      borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      formatter: (raw: unknown) => {
        const params = raw as { data?: SectorSnapshot & { value?: number } };
        const data = params.data;
        if (!data) return "暂无数据";
        return [
          `<strong>${data.name}</strong>`,
          `涨跌幅：${formatPercent(data.changePercent)}`,
          `成交额：${formatAmount(data.turnover)}`,
          `换手率：${formatPercent(data.turnoverRate)}`,
          `上涨 / 下跌：${data.riseCount ?? "—"} / ${data.fallCount ?? "—"}`,
          `领涨股票：${data.leadingStockName || "—"}`,
          `主力净流入：${formatAmount(data.mainNetInflow)}`,
        ].join("<br>");
      },
    },
    visualMap: {
      show: false,
      min: -5,
      max: 5,
      dimension: 1,
      inRange: { color: ["#146C43", "#223044", "#8E303A", "#E4505B"] },
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          color: "#F3F7FC",
          formatter: "{b}",
          textBorderColor: "rgba(7, 17, 31, .45)",
          textBorderWidth: 2,
        },
        upperLabel: { show: false },
        itemStyle: { borderColor: "#07111F", borderWidth: 2, gapWidth: 2 },
        data: sectors.map((sector) => ({
          ...sector,
          value: [
            metric === "turnover" ? sector.turnover ?? 0 : sector.marketCap ?? 0,
            sector.changePercent ?? 0,
          ],
        })),
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

export function buildStockFundOption(
  points: StockFundPoint[],
): EChartsCoreOption {
  const broken = insertTimeBreaks(points);
  const values = broken.map((point) => {
    const data = point as Partial<StockFundPoint> & { time: string };
    return {
      time: data.time,
      inflow: data.inflow ?? null,
      outflow: data.outflow == null ? null : -Math.abs(data.outflow),
      netAmount: data.netAmount ?? null,
      latestPrice: data.latestPrice ?? null,
      changePercent: data.changePercent ?? null,
    };
  });
  return {
    aria: { enabled: true, decal: { show: true } },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#102039",
      borderColor: "#20334D",
      textStyle: { color: "#F3F7FC" },
      formatter: (raw: unknown) => {
        const params = raw as Array<{ dataIndex: number; axisValue: string }>;
        const index = params[0]?.dataIndex ?? 0;
        const point = values[index];
        if (!point) return "暂无数据";
        return [
          `<strong>${params[0]?.axisValue || point.time}</strong>`,
          `流入：${formatAmount(point.inflow)}`,
          `流出：${formatAmount(point.outflow == null ? null : Math.abs(point.outflow))}`,
          `净额：${formatAmount(point.netAmount)}`,
          `最新价：${point.latestPrice ?? "—"}`,
          `涨跌幅：${formatPercent(point.changePercent)}`,
        ].join("<br>");
      },
    },
    legend: { top: 0, textStyle: { color: textColor } },
    grid: { top: 42, right: 16, bottom: 28, left: 56 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: values.map((point) => point.time.slice(11, 16)),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: textColor, formatter: (value: number) => formatAmount(value) },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: "资金流入",
        type: "line",
        data: values.map((point) => point.inflow),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: riseColor, width: 2 },
        itemStyle: { color: riseColor },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: axisColor },
          data: [{ yAxis: 0 }],
          label: { show: false },
        },
      },
      {
        name: "资金流出",
        type: "line",
        data: values.map((point) => point.outflow),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: fallColor, width: 2, type: "dashed" },
        itemStyle: { color: fallColor },
      },
      {
        name: "资金净额",
        type: "line",
        data: values.map((point) => point.netAmount),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: amberColor, width: 3 },
        itemStyle: { color: amberColor },
      },
    ],
  };
}
