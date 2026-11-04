import { describe, expect, it } from "vitest";
import { riskCount, riskPermission, riskPreset, riskRate, shanghaiDate, validateRiskDates } from "@/utils/risk";
import { buildDynamicRoutes, menuComponentPaths } from "@/router/dynamic";

describe("risk filters and presentation", () => {
  it("uses Shanghai midnight and expands presets to inclusive dates", () => {
    const now = new Date("2026-10-26T16:00:00Z");
    expect(shanghaiDate(now)).toBe("2026-10-27");
    expect(riskPreset(1, now)).toEqual(["2026-10-27", "2026-10-27"]);
    expect(riskPreset(2, now)).toEqual(["2026-10-26", "2026-10-26"]);
    expect(riskPreset(7, now)).toEqual(["2026-10-21", "2026-10-27"]);
  });
  it("rejects invalid, future, reversed and over-31-day ranges", () => {
    expect(validateRiskDates("2026-08-06", "2026-08-06", "2026-11-03")).toBe("");
    expect(validateRiskDates("2026-08-05", "2026-08-05", "2026-11-03")).toContain("最近90");
    expect(validateRiskDates("2026-09-27", "2026-10-27", "2026-10-27")).toBe("");
    for (const pair of [["2026-09-26", "2026-10-27"], ["2026-10-27", "2026-10-26"], ["2026-02-30", "2026-10-27"], ["2026-10-27", "2026-10-28"], ["", "2026-10-27"]]) {
      expect(validateRiskDates(pair[0]!, pair[1]!, "2026-10-27")).not.toBe("");
    }
  });
  it("preserves long counts and distinguishes unknown, zero and overflow", () => {
    expect(riskCount("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(riskCount("0")).toBe("0"); expect(riskCount(null)).toBe("—");
    expect(riskRate(null)).toBe("—"); expect(riskRate("0.001000")).toBe("0.10%");
  });
  it("requires AND permissions for restricted detail", () => {
    expect(riskPermission(["system:risk:exception:view"], "exception")).toBe(false);
    expect(riskPermission(["system:risk:view"], "exception")).toBe(false);
    expect(riskPermission(["system:risk:view", "system:risk:exception:view"], "exception")).toBe(true);
    expect(riskPermission(["**:**:**"], "exception")).toBe(true);
  });
  it("registers the exact backend component under the dynamic route", async () => {
    expect(menuComponentPaths).toContain("risk/dashboard/index");
    const [route] = buildDynamicRoutes([{ routeName: "RiskDashboard", path: "/risk/dashboard", component: "risk/dashboard/index", hidden: false, meta: { menuName: "系统风控" } }]);
    expect(route?.meta?.loadError).toBeUndefined();
    expect(typeof route?.component).toBe("function");
    const module = await (route!.component as () => Promise<unknown>)();
    expect(module).toHaveProperty("default");
  });
});
