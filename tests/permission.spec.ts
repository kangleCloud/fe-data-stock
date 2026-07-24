import { describe, expect, it } from "vitest";

import { canAccess } from "@/utils/permission";

describe("permission checks", () => {
  it("supports exact permission codes", () => {
    expect(
      canAccess(["system:user:view", "system:user:add"], "system:user:add"),
    ).toBe(true);
    expect(canAccess(["system:user:view"], "system:user:delete")).toBe(false);
  });

  it("supports the super administrator wildcard", () => {
    expect(canAccess(["**:**:**"], "system:role:delete")).toBe(true);
  });
});
