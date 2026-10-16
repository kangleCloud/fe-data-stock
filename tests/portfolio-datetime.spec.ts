import { describe, expect, it } from "vitest";
import { formatPortfolioDateTime } from "@/utils/portfolio";

describe("portfolio cutoff display", () => {
  it.each([
    ["2026-10-16T17:20:15.065849", "2026-10-16 17:20:15"],
    ["2026-10-16 17:20:15.999999", "2026-10-16 17:20:15"],
    ["2026-10-16T09:20:15.065849Z", "2026-10-16 17:20:15"],
    ["2026-10-16T17:20:15+08:00", "2026-10-16 17:20:15"],
    ["2026-10-16T23:20:15-04:00", "2026-10-17 11:20:15"],
    ["2026-10-16T00:00:00", "2026-10-16 00:00:00"],
    [null, "—"], [undefined, "—"], ["", "—"], ["invalid", "—"],
  ])("formats %s in Shanghai to seconds", (input, expected) => {
    expect(formatPortfolioDateTime(input)).toBe(expected);
  });
});
