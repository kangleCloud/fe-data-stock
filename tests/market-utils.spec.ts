import { describe, expect, it } from "vitest";

import {
  buildStockFundOption,
  buildTreemapOption,
} from "@/charts/marketOptions";
import type { SectorSnapshot, StockFundPoint } from "@/types/market";
import {
  formatAmount,
  formatPercent,
  insertTimeBreaks,
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

describe("market chart adapters", () => {
  const points: StockFundPoint[] = [
    {
      time: "2026-07-28T09:30:00+08:00",
      inflow: 100,
      outflow: 70,
      netAmount: 30,
      latestPrice: 10,
      changePercent: 1,
    },
    {
      time: "2026-07-28T11:30:00+08:00",
      inflow: 120,
      outflow: 90,
      netAmount: 30,
      latestPrice: 10.1,
      changePercent: 1.1,
    },
  ];

  it("inserts a null break for gaps over 80 seconds", () => {
    const result = insertTimeBreaks(points);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ time: expect.any(String) });
  });

  it("maps outflow to the negative axis and never invents zero points", () => {
    const option = buildStockFundOption(points) as {
      series: Array<{ name: string; data: Array<number | null> }>;
    };
    const outflow = option.series.find((item) => item.name === "资金流出");
    expect(outflow?.data).toEqual([-70, null, -90]);
    const net = option.series.find((item) => item.name === "资金净额");
    expect(net?.data).toEqual([30, null, 30]);
  });

  it("uses change percentage as the treemap color dimension", () => {
    const sectors: SectorSnapshot[] = [
      {
        code: "BK001",
        name: "测试板块",
        type: "industry",
        changePercent: 2.3,
        turnover: 10,
        marketCap: 100,
        turnoverRate: 1,
        riseCount: 2,
        fallCount: 1,
        leadingStockName: "测试股份",
        mainNetInflow: 3,
      },
    ];
    const option = buildTreemapOption(sectors, "turnover") as {
      series: Array<{ data: Array<{ value: number[] }> }>;
    };
    expect(option.series[0]?.data[0]?.value).toEqual([10, 2.3]);
  });

  it("omits sectors without a valid area or change value instead of inventing zeroes", () => {
    const sectors: SectorSnapshot[] = [
      {
        code: "BK001",
        name: "面积缺失",
        type: "industry",
        changePercent: 1,
        turnover: null,
        marketCap: 100,
        turnoverRate: null,
        riseCount: null,
        fallCount: null,
        leadingStockName: null,
        mainNetInflow: null,
      },
      {
        code: "BK002",
        name: "涨跌缺失",
        type: "industry",
        changePercent: null,
        turnover: 10,
        marketCap: 100,
        turnoverRate: null,
        riseCount: null,
        fallCount: null,
        leadingStockName: null,
        mainNetInflow: null,
      },
    ];
    const option = buildTreemapOption(sectors, "turnover") as {
      series: Array<{ data: unknown[] }>;
    };

    expect(option.series[0]?.data).toEqual([]);
  });
});
