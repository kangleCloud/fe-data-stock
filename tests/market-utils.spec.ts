import { describe, expect, it } from "vitest";

import { buildStockPriceOption } from "@/charts/marketOptions";
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
  const points: StockPricePoint[] = [
    { time: "2026-09-28T09:30:00+08:00", price: 10 },
    { time: "2026-09-28T09:32:00+08:00", price: 10.1 },
    { time: "2026-09-28T13:02:00+08:00", price: 10.3 },
  ];

  it("draws only actual source points and breaks across lunch", () => {
    const option = buildStockPriceOption(points) as {
      series: Array<{ data: Array<[string, number]> }>;
    };
    expect(option.series).toHaveLength(2);
    expect(option.series.map((part) => part.data)).toEqual([
      [[points[0]!.time, 10], [points[1]!.time, 10.1]],
      [[points[2]!.time, 10.3]],
    ]);
  });
});
