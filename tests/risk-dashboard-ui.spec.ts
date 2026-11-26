import { describe, expect, it } from "vitest";
import { riskMapCameraPixel } from "@/composables/useRiskMapNavigation";
import { riskCountPercent, riskBarWidths } from "@/utils/riskBars";

describe("risk dashboard presentation", () => {
  it("scales bar widths and percentages without coercing large counts", () => {
    const total = 90071992547409930n;
    expect(riskCountPercent(total / 10n, total)).toBe("10.00%");
    expect(riskCountPercent(0n, total)).toBe("0.00%");
    expect(riskCountPercent(0n, 0n)).toBe("—");
    expect(riskBarWidths([String(total), String(total / 10n), "0"])).toEqual([100, 10, 0]);
  });

  it("holds the pointer coordinate fixed under zoom and translates the map under drag", () => {
    expect(riskMapCameraPixel([300, 200], [500, 100], [0, 0], 2)).toEqual([400, 150]);
    expect(riskMapCameraPixel([300, 200], [500, 100], [40, -20], 1)).toEqual([260, 220]);
    expect(riskMapCameraPixel([300, 200], [500, 100], [40, -20], 2)).toEqual([380, 160]);
  });
});
