import { describe, expect, it } from "vitest";
import { addDecimal, signedAmountInputValid, subtractDecimal } from "@/utils/portfolio";

describe("portfolio decimal arithmetic", () => {
  it("adds and subtracts cents without floating point loss", () => {
    expect(addDecimal("12232.61", "-2368.61")).toBe("9864.00");
    expect(subtractDecimal("9864.00", "12232.61")).toBe("-2368.61");
    expect(addDecimal("99999999999999999999.99", "0.01")).toBe("100000000000000000000.00");
    expect(addDecimal("0", "0")).toBe("0.00");
    expect(addDecimal("-0.00", "0")).toBe("0.00");
    expect(addDecimal("1", "-2")).toBe("-1.00");
  });

  it("returns null for invalid operands", () => {
    expect(addDecimal("", "1")).toBeNull();
    expect(addDecimal("1.234", "1")).toBeNull();
    expect(subtractDecimal("1", "abc")).toBeNull();
  });

  it("validates signed amounts with at most two decimals", () => {
    expect(signedAmountInputValid("-2368.61")).toBe(true);
    expect(signedAmountInputValid("2368.61")).toBe(true);
    expect(signedAmountInputValid("-0.00")).toBe(true);
    expect(signedAmountInputValid("-1.234")).toBe(false);
    expect(signedAmountInputValid("-")).toBe(false);
    expect(signedAmountInputValid("1e3")).toBe(false);
    expect(signedAmountInputValid("999999999999999999999")).toBe(false);
  });
});
