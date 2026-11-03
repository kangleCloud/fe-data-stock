import { describe, expect, it } from "vitest";
import { riskTime, riskBusinessDate } from "@/utils/riskTime";
describe("risk Beijing display times", () => {
  it("converts explicit offsets across midnight independently of browser zone", () => {
    expect(riskTime("2026-10-30T18:02:03Z")).toBe("2026-10-31 02:02:03");
    expect(riskTime("2026-10-30T14:02:03-04:00", "minute")).toBe("2026-10-31 02:02");
    expect(riskTime("2026-10-30T18:02:03Z", "axis")).toBe("02:02");
    expect(riskTime("2026-10-30T18:02:03Z", "axis", true)).toBe("10-31 02:02");
  });
  it("rejects missing offsets and invalid values and preserves valid business dates", () => {
    for (const value of [null, undefined, "", "invalid", "2026-02-30T12:00:00Z", "2026-10-30T24:00:00Z", "2026-10-30T12:00:00"]) expect(riskTime(value)).toBe("—");
    expect(riskBusinessDate("2026-02-30")).toBe("—"); expect(riskBusinessDate("2026-10-30")).toBe("2026-10-30");
  });
});
