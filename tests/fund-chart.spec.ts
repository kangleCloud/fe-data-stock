import { afterEach, describe, expect, it, vi } from "vitest";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "@/charts/echarts";
import { buildIntradayFundOption, buildStockFundOption } from "@/charts/marketOptions";
import { fundUnit, latestFundPoint } from "@/utils/fundChart";
import type { StockFundPoint } from "@/types/market";

echarts.use(SVGRenderer);
afterEach(() => vi.restoreAllMocks());
const sample = (netAmount: number | null, collectedAt = "2026-10-12T10:00:01+08:00"): StockFundPoint => ({ collectedAt, netAmount, inflow: null, outflow: null });
type FundOption = {
  xAxis: { min: number; max: number };
  yAxis: { min: number; max: number; name: string; axisLabel: { formatter: (value: number) => string } };
  series: Array<{ data: Array<[string, number]>; showSymbol: boolean; smooth: boolean; connectNulls: boolean; markLine?: { label: { show: boolean }; data: unknown[] } }>;
  visualMap: { pieces: Array<{ gt?: number; lt?: number; value?: number; color: string }> };
  tooltip: { confine: boolean; valueFormatter: (value: unknown) => string; formatter: (params: unknown) => string };
};
const builders = [buildStockFundOption, buildIntradayFundOption];

describe.each(builders)("fund chart %s", (build) => {
  it.each([
    { values: [-20, 40], unit: "元" }, { values: [200, 400], unit: "元" }, { values: [-400, -200], unit: "元" },
    { values: [0, 0], unit: "元" }, { values: [300], unit: "元" }, { values: [500, 500], unit: "元" },
    { values: [0.001, -0.001], unit: "元" }, { values: [9999, 10000], unit: "万元" },
    { values: [99999999, 100000000], unit: "亿元" }, { values: [-100000000], unit: "亿元" },
  ])("renders distinct actual ticks containing zero and all $values in $unit", ({ values, unit }) => {
    const points = values.map((value, index) => sample(value, `2026-10-12T10:0${index}:01+08:00`));
    const original = structuredClone(points);
    const option = build(points) as FundOption;
    expect(option.yAxis.name).toBe(unit);
    expect(option.yAxis.min).toBeLessThan(Math.min(0, ...values));
    expect(option.yAxis.max).toBeGreaterThan(Math.max(0, ...values));
    expect(option.series.flatMap((series) => series.data)).toEqual(points.map((point) => [point.collectedAt, point.netAmount]));
    expect(points).toEqual(original);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ measureText: (text: string) => ({ width: text.length * 7 }) }) as unknown as CanvasRenderingContext2D);
    const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 220 });
    try {
      chart.setOption(option);
      const ticks = (chart as unknown as { getModel: () => { getComponent: (name: string) => { axis: { scale: { getTicks: () => Array<{ value: number }> } } } } }).getModel().getComponent("yAxis").axis.scale.getTicks().map((tick) => tick.value);
      expect(ticks).toContain(0);
      const labels = ticks.map(option.yAxis.axisLabel.formatter);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.length).toBeGreaterThan(1);
      expect(labels.every((label) => !label.includes(".") || label.split(".")[1]!.length <= 2)).toBe(true);
      expect(chart.renderToSVGString()).toContain(unit);
    } finally { chart.dispose(); }
  });
  it("keeps real time gaps/null breaks and leaves continuous segments without permanent markers", () => {
    const points = [sample(10), sample(20, "2026-10-12T10:01:01+08:00"), sample(null, "2026-10-12T10:01:30+08:00"),
      sample(-10, "2026-10-12T10:02:01+08:00"), sample(5, "2026-10-12T13:00:01+08:00")];
    const option = build(points) as FundOption;
    expect(option.series.map((part) => part.data.length)).toEqual([2, 1, 1]);
    expect(option.series.map((part) => part.showSymbol)).toEqual([false, true, true]);
    expect(option.series.every((part) => !part.smooth && !part.connectNulls)).toBe(true);
    expect(option.series.flatMap((part) => part.data)).toEqual(points.filter((point) => point.netAmount !== null).map((point) => [point.collectedAt, point.netAmount]));
    expect(option.xAxis.min).toBeLessThan(Date.parse(points[0]!.collectedAt));
    expect(option.xAxis.max).toBeGreaterThan(Date.parse(points.at(-1)!.collectedAt));
    expect(option.xAxis.max - option.xAxis.min).toBeGreaterThan(3 * 60 * 60 * 1000);
    expect(option.series[0]!.markLine!.label.show).toBe(false);
    expect(option.visualMap.pieces.map((piece) => [piece.gt, piece.lt, piece.value])).toEqual([[0, undefined, undefined], [undefined, 0, undefined], [undefined, undefined, 0]]);
    expect(new Set(option.visualMap.pieces.map((piece) => piece.color)).size).toBe(3);
  });
  it("uses a four-minute viewport for a single actual sample", () => {
    const point = sample(0); const option = build([point]) as FundOption;
    expect(option.xAxis.min).toBe(Date.parse(point.collectedAt) - 120000);
    expect(option.xAxis.max).toBe(Date.parse(point.collectedAt) + 120000);
    expect(option.series[0]!.data).toEqual([[point.collectedAt, 0]]);
  });
  it("formats signed amounts and actual second-level dates, escapes names, and omits invented gap values", () => {
    const point = sample(-123456789.123); const option = build([point]) as FundOption;
    expect(option.tooltip.confine).toBe(true);
    expect(option.tooltip.valueFormatter(point.netAmount)).toBe("−1.23亿元");
    expect(option.tooltip.valueFormatter([point.collectedAt, point.netAmount])).toBe("−1.23亿元");
    for (const value of [null, undefined, Number.NaN, [point.collectedAt, null], [point.collectedAt], "10"]) expect(option.tooltip.valueFormatter(value)).toBe("—");
    const html = option.tooltip.formatter([{ data: [point.collectedAt, point.netAmount], seriesName: '<img onerror="x">' }]);
    expect(html).toContain("2026/10/12 10:00:01"); expect(html).toContain("−123,456,789.123 元");
    const element = document.createElement("div"); element.innerHTML = html;
    expect(element.querySelector("img")).toBeNull(); expect(element.textContent).toContain('<img onerror="x">');
    expect(option.tooltip.formatter({ value: [point.collectedAt, point.netAmount] })).toContain("−1.23亿元");
    expect(option.tooltip.formatter({ data: ["2026-10-12T10:02:00+08:00", point.netAmount] })).toBe("");
    expect(option.tooltip.formatter({ data: [point.collectedAt, null] })).toBe("");
    for (const params of [null, undefined, [null], 10]) expect(option.tooltip.formatter(params)).toBe("");
  });
});

it.each([[9999, "元"], [10000, "万元"], [99999999, "万元"], [100000000, "亿元"], [-100000000, "亿元"]] as const)("selects unit at boundary %s", (value, name) => {
  expect(fundUnit([value]).name).toBe(name);
});
it("finds the most recent valid sample without sorting or changing input", () => {
  const points = [sample(20, "2026-10-12T10:02:00+08:00"), sample(null, "2026-10-12T10:03:00+08:00"), sample(10), sample(Number.NaN), sample(30, "invalid")];
  expect(latestFundPoint(points)).toBe(points[0]); expect(latestFundPoint([sample(null)])).toBeUndefined();
});
