import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { riskFlows } from "@/utils/riskFlows";
import { validateRiskGeo } from "@/utils/riskMap";
import { riskConfigPermission, validateRiskServer } from "@/utils/riskServer";
import type { RiskServerTarget } from "@/types/riskServer";
const geo = (kind: "china" | "world") => validateRiskGeo(kind, JSON.parse(readFileSync(`public/maps/risk-v1/${kind}.geojson`, "utf8")));
const target: RiskServerTarget = { configured: true, alias: "目标", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL", locationStatus: "LOCATED", resolveStatus: "NOT_ATTEMPTED", resolvedAt: null, updatedAt: null };
describe("risk target flows", () => {
  it("uses the same auditable shared asset bytes with valid finite decimal coordinates", () => {
    const local = readFileSync("src/data/risk-region-centers.json"); expect(local.equals(readFileSync("../docs/risk-region-centers.json"))).toBe(true);
    expect(createHash("sha256").update(local).digest("hex")).toBe("59dc9673418dc73a2af05239875a96a06610ef06bc8a64b802b99b81060fa6f2");
    const asset = JSON.parse(local.toString()); expect(Object.keys(asset.regions)).toHaveLength(208); expect(asset.regions.CN).toBeDefined();
    for (const point of Object.values(asset.regions) as { longitude: string; latitude: string }[]) { expect(point.longitude).toMatch(/^-?\d+\.\d{6}$/); expect(Math.abs(Number(point.longitude))).toBeLessThanOrEqual(180); expect(Math.abs(Number(point.latitude))).toBeLessThanOrEqual(90); }
  });
  it("draws source to target with safe normalized weights while keeping huge exact strings", () => {
    const result = riskFlows("china", [{ regionCode: "CN-44", requestCount: "90071992547409930" }, { regionCode: "CN-11", requestCount: "2" }], target, geo("china"));
    expect(result.lines[0]?.coords[1]).toEqual([121.47, 31.23]); expect(result.lines[0]?.count).toBe("90071992547409930"); expect(result.lines[0]?.weight).toBe(1); expect(result.lines[0]?.lineStyle.color).toBe("#ff655b"); expect(result.lines[1]?.weight).toBe(0);
  });
  it("aggregates known provinces exactly once into world CN and converges at a China target", () => {
    const rows = [{ regionCode: "CN-31", requestCount: "10" }, { regionCode: "CN-44", requestCount: "20" }, { regionCode: "CN", requestCount: "30" }, { regionCode: "CN-XX", requestCount: "5" }, { regionCode: "US", requestCount: "0" }];
    const result = riskFlows("world", rows, target, geo("world")); expect(result.lines).toHaveLength(0); expect(result.same).toHaveLength(1); expect(result.same[0]?.count).toBe("60"); expect(result.unplaced[0]?.regionCode).toBe("CN-XX");
    const foreign = { ...target, regionCode: "US", longitude: "-100", latitude: "40" };
    const large = riskFlows("world", [{ regionCode: "CN-SH", requestCount: "9007199254740993" }, { regionCode: "CN-44", requestCount: "9" }], foreign, geo("world")); expect(large.lines).toHaveLength(1); expect(large.lines[0]?.count).toBe("9007199254741002"); expect(large.lines[0]?.name).toBe("CN");
  });
  it("uses same-region convergence instead of zero-length lines and lists unknown sources", () => {
    const result = riskFlows("china", [{ regionCode: "CN-SH", requestCount: "7" }, { regionCode: "UNKNOWN", requestCount: "3" }, { regionCode: "INTERNAL", requestCount: "4" }, { regionCode: "XX", requestCount: "1" }], target, geo("china"));
    expect(result.lines).toHaveLength(0); expect(result.same[0]?.count).toBe("7"); expect(result.unplaced).toHaveLength(3);
  });
  it("does not invent missing targets and asks for world view for foreign targets", () => {
    expect(riskFlows("china", [], undefined, geo("china")).target).toBeUndefined();
    expect(riskFlows("china", [], { ...target, longitude: "135", latitude: "40" }, geo("china")).target).toBeUndefined();
    expect(riskFlows("china", [], { ...target, longitude: null }, geo("china")).target).toBeUndefined();
    const foreign = { ...target, regionCode: "US", longitude: "-100", latitude: "40" };
    expect(riskFlows("china", [], foreign, geo("china")).notice).toContain("切换世界"); expect(riskFlows("world", [], foreign, geo("world")).target).toEqual([-100, 40]);
  });
  it("uses AND permissions and rejects partial or excessive precision manual locations", () => {
    expect(riskConfigPermission(["system:risk:config:view"], "view")).toBe(false); expect(riskConfigPermission(["system:risk:view"], "update")).toBe(false); expect(riskConfigPermission(["**:**:**"], "update")).toBe(true);
    const input = { version: null, alias: "server", publicIp: "8.8.8.8", manualLocation: { regionCode: "CN-31", longitude: "121.1234567", latitude: "31" } }; expect(validateRiskServer(input)).not.toBe(""); input.manualLocation.longitude = "121"; expect(validateRiskServer(input)).toBe("");
  });
});
