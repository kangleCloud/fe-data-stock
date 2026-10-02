import { describe, expect, it, vi } from "vitest";
import { SVGRenderer } from "echarts/renderers";

import { echarts } from "@/charts/echarts";
import { buildStockFundOption, buildStockPriceOption } from "@/charts/marketOptions";
import type { StockPricePoint } from "@/types/market";
import {
  formatAmount,
  formatPercent,
  valueTone,
} from "@/utils/market";

describe("market formatters", () => {
  it("formats amounts with signs and preserves missing values", () => {
    expect(formatAmount(123_000_000)).toBe("+1.23亿");
    expect(formatAmount(-25_000)).toBe("−2.5万");
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount(null)).toBe("—");
  });

  it("formats percentage direction without relying on color", () => {
    expect(formatPercent(1.25)).toBe("+1.25%");
    expect(formatPercent(-0.8)).toBe("-0.80%");
    expect(valueTone(1)).toBe("rise");
    expect(valueTone(-1)).toBe("fall");
    expect(valueTone(null)).toBe("flat");
  });
});

describe("stock price chart", () => {
  echarts.use(SVGRenderer);
  const points: StockPricePoint[] = [
    { time: "2026-09-28T09:30:00+08:00", price: 10 },
    { time: "2026-09-28T09:32:00+08:00", price: 10.1 },
    { time: "2026-09-28T09:40:00+08:00", price: 10.2 },
    { time: "2026-09-28T13:02:00+08:00", price: 10.3 },
  ];

  it("draws only actual source points and breaks across collection gaps and lunch", () => {
    const option = buildStockPriceOption(points) as {
      series: Array<{ data: Array<[string, number]> }>;
    };
    expect(option.series).toHaveLength(3);
    expect(option.series.map((part) => part.data)).toEqual([
      [[points[0]!.time, 10], [points[1]!.time, 10.1]],
      [[points[2]!.time, 10.2]],
      [[points[3]!.time, 10.3]],
    ]);
  });

  it.each([
    ["narrow", [5.29, 5.295, 5.30]],
    ["constant", [5.29, 5.29, 5.29]],
    ["wide", [5.29, 8.45, 11.8]],
  ])("keeps %s price-axis labels distinct without changing sample values", (_case, prices) => {
    const samples: StockPricePoint[] = prices.map((price, index) => ({
      time: `2026-09-28T09:${30 + index * 2}:00+08:00`, price,
    }));
    const option = buildStockPriceOption(samples) as {
      yAxis: { minInterval: number; splitNumber: number; axisLabel: { formatter: (value: number) => string } };
      tooltip: { valueFormatter: (value: unknown) => string };
      series: Array<{ data: Array<[string, number]> }>;
    };
    expect(option.yAxis.minInterval).toBe(0.01);
    expect(option.yAxis.splitNumber).toBe(4);
    expect(option.series.flatMap((segment) => segment.data)).toEqual(samples.map((sample) => [sample.time, sample.price]));
    expect(option.tooltip.valueFormatter([samples[0]!.time, samples[0]!.price])).toBe(`${samples[0]!.price.toFixed(2)} 元`);

    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      measureText: (text: string) => ({ width: text.length * 7 }),
    }) as unknown as CanvasRenderingContext2D);
    const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 280 });
    try {
      chart.setOption(option);
      const model = (chart as unknown as { getModel: () => {
        getComponent: (type: string, index: number) => { axis: { scale: { getTicks: () => Array<{ value: number }> } } };
      } }).getModel();
      const ticks = model.getComponent("yAxis", 0).axis.scale.getTicks().map((tick) => tick.value);
      const labels = ticks.map(option.yAxis.axisLabel.formatter);
      expect(labels.length).toBeGreaterThan(1);
      expect(ticks.slice(1).every((tick, index) => tick - ticks[index]! >= 0.009999)).toBe(true);
      expect(labels.every((label) => /^\d+\.\d{2}$/.test(label))).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    } finally {
      chart.dispose();
      getContext.mockRestore();
    }
  });

  it("formats scalar and pair tooltip prices without turning missing values into zero", () => {
    const option = buildStockPriceOption(points) as { tooltip: { valueFormatter: (value: unknown) => string } };
    const format = option.tooltip.valueFormatter;
    expect(format(11.62)).toBe("11.62 元");
    expect(format([points[0]!.time, 11.62])).toBe("11.62 元");
    expect(format(0)).toBe("0.00 元");
    expect(format(null)).toBe("—");
    expect(format([points[0]!.time, null])).toBe("—");
    expect(format([points[0]!.time, "11.62"])).toBe("—");
    expect(format(Number.NaN)).toBe("—");
  });
});

describe("stock fund chart", () => {
  it("uses actual collection times, a zero axis, signed colors, and broken gaps", () => {
    const points = [
      { collectedAt: "2026-09-30T09:30:00+08:00", inflow: 2_000_000, outflow: 1_000_000, netAmount: 1_000_000 },
      { collectedAt: "2026-09-30T09:32:00+08:00", inflow: null, outflow: null, netAmount: null },
      { collectedAt: "2026-09-30T13:02:00+08:00", inflow: 1_000_000, outflow: 2_000_000, netAmount: -1_000_000 },
    ];
    const option = buildStockFundOption(points) as {
      xAxis: { type: string }; yAxis: { min: (value: { min: number }) => number; max: (value: { max: number }) => number };
      visualMap: { pieces: Array<{ color: string }> };
      tooltip: { valueFormatter: (value: unknown) => string };
      series: Array<{ data: Array<[string, number]>; markLine?: { data: Array<{ yAxis: number }> } }>;
    };
    expect(option.xAxis.type).toBe("time");
    expect(option.series.map((part) => part.data)).toEqual([
      [[points[0]!.collectedAt, 1_000_000]], [[points[2]!.collectedAt, -1_000_000]],
    ]);
    expect(option.series[0]?.markLine?.data).toEqual([{ yAxis: 0 }]);
    expect(option.yAxis.min({ min: 1_000_000 })).toBe(0);
    expect(option.yAxis.max({ max: -1_000_000 })).toBe(0);
    expect(option.visualMap.pieces[0]?.color).not.toBe(option.visualMap.pieces[1]?.color);
    expect(option.tooltip.valueFormatter([points[2]!.collectedAt, -1_000_000])).toContain("−100万");
  });
});
