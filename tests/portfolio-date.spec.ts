import { describe, expect, it } from "vitest";
import { currentTradeDate, formatTradeDate, tradeDateValid } from "@/utils/portfolio";

describe("portfolio daily date", () => {
  it.each([
    ["2026-10-16", "2026-10-16"],
    ["2026-01-05", "2026-01-05"],
    [null, "—"],
    [undefined, "—"],
    ["", "—"],
    ["invalid", "—"],
  ])("formats %s as a record date", (input, expected) => {
    expect(formatTradeDate(input)).toBe(expected);
  });

  it.each([
    ["2026-01-05", true],
    ["2099-01-01", false],
    ["2026-02-30", false],
    ["2026-1-5", false],
    ["", false],
  ])("validates %s against the Shanghai today", (input, expected) => {
    expect(tradeDateValid(input)).toBe(expected);
  });

  it("accepts the current Shanghai record date", () => {
    expect(tradeDateValid(currentTradeDate())).toBe(true);
  });
});
