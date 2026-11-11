import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { defaultRiskMapView, riskMapGeoCenter } from "@/utils/riskMapView";

const geo = (kind: RiskMapKind) => validateRiskGeo(kind, JSON.parse(readFileSync(`public/maps/risk-v1/${kind}.geojson`, "utf8")));
const target: RiskServerTarget = { configured: true, alias: "上海目标", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL", locationStatus: "LOCATED", resolveStatus: "NOT_ATTEMPTED", resolvedAt: null, updatedAt: null };

function option(kind: RiskMapKind, rows: { regionCode: string; requestCount: string }[], overrides: Partial<Parameters<typeof buildRiskMapOption>[0]> = {}) {
  const asset = { geo: geo(kind), origin: "local" as const };
  const counts = riskMapCounts(kind, rows, asset.geo);
  const flows = riskFlows(kind, rows, overrides.serverTarget ?? target, asset.geo);
  return buildRiskMapOption({ kind, asset, counts, flows, view: defaultRiskMapView(), mode: "3d", backdrop: true, reducedMotion: false, serverTarget: target, ...overrides });
}

describe("risk multilayer geo option", () => {
  it("places fixed-view depth layers in one canvas and draws real source-to-target coordinates", () => {
    const value = option("china", [{ regionCode: "CN-44", requestCount: "9" }]);
    const geos = value.geo as { zoom: number; center: number[]; layoutCenter: string[]; layoutSize: string; silent: boolean }[];
    const series = value.series as { id: string; geoIndex: number; data: { coords?: number[][]; count?: string; value?: number[] }[] }[];
    expect(geos).toHaveLength(3);
    expect(geos.map((item) => item.silent)).toEqual([true, true, false]);
    const base = riskMapGeoCenter(geo("china"));
    expect(geos.every((item) => item.zoom === 1 && item.center[0] === base[0] && item.center[1] === base[1])).toBe(true);
    expect(new Set(geos.map((item) => item.layoutCenter[1])).size).toBe(1);
    expect(new Set(geos.map((item) => item.layoutSize)).size).toBe(3);
    expect(series[0]!.geoIndex).toBe(2);
    const flowing = series.find((item) => item.id === "risk-map-flows")!;
    const targetPoint = series.find((item) => item.id === "risk-map-target")!;
    expect(flowing.data[0]!.coords?.at(-1)).toEqual([121.47, 31.23]);
    expect(flowing.data[0]!.count).toBe("9");
    expect(targetPoint.data[0]!.value).toEqual([121.47, 31.23]);
    expect((value.visualMap as { show: boolean }).show).toBe(false);
    expect(value.animation).toBe(false);
  });

  it("uses a single geo layer in 2D and keeps the controlled zoom and center", () => {
    const value = option("world", [{ regionCode: "US", requestCount: "4" }], { mode: "2d", view: { zoom: 2.5, offset: [110, 25] } });
    const geos = value.geo as { zoom: number; center: number[]; map: string }[];
    expect(geos).toHaveLength(1);
    const base = riskMapGeoCenter(geo("world"));
    expect(geos[0]!.zoom).toBe(2.5);
    expect(geos[0]!.center[0]).toBeCloseTo(base[0] + 110);
    expect(geos[0]!.center[1]).toBeCloseTo(base[1] + 25);
    expect(geos[0]!.map).toBe("risk-v1-world");
    expect((value.series as { geoIndex: number }[])[0]!.geoIndex).toBe(0);
  });

  it("turns off flying-line motion but keeps static directed arrows when reduced motion is requested", () => {
    const value = option("china", [{ regionCode: "CN-44", requestCount: "9" }], { reducedMotion: true });
    const flowing = (value.series as { id: string; effect: { show: boolean }; symbol: string[] }[]).find((item) => item.id === "risk-map-flows")!;
    expect(flowing.effect.show).toBe(false);
    expect(flowing.symbol).toEqual(["none", "arrow"]);
    const moving = option("china", [{ regionCode: "CN-44", requestCount: "9" }]);
    expect((moving.series as { id: string; effect: { show: boolean } }[]).find((item) => item.id === "risk-map-flows")!.effect.show).toBe(true);
  });

  it("keeps huge counts exact in text while refusing an imprecise heatmap", () => {
    const value = option("china", [{ regionCode: "CN-44", requestCount: "9007199254740993" }]);
    const series = value.series as { id: string; data: { count?: string; coords?: number[][] }[] }[];
    expect(series[0]!.data).toEqual([]);
    expect(value.visualMap).toBeUndefined();
    expect((value.aria as { label: { description: string } }).label.description).toContain("超出安全绘图精度");
    expect(series.find((item) => item.id === "risk-map-flows")!.data[0]!.count).toBe("9007199254740993");
    const formatter = (value.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(formatter({ name: "CN-44", data: { count: "9007199254740993" } })).toContain("9,007,199,254,740,993");
  });

  it("does not invent target markers or lines without a valid located target", () => {
    const value = option("china", [{ regionCode: "CN-31", requestCount: "7" }], { serverTarget: { ...target, locationStatus: "UNRESOLVED", longitude: null, latitude: null, regionCode: null } });
    const series = value.series as { id: string; data: unknown[] }[];
    expect(series.find((item) => item.id === "risk-map-flows")!.data).toEqual([]);
    expect(series.find((item) => item.id === "risk-map-target")!.data).toEqual([]);
    expect((value.aria as { label: { description: string } }).label.description).toContain("不绘制汇聚飞线");
  });

  it("renders only boundaries for empty regional data and describes the text fallback", () => {
    const value = option("world", []);
    const series = value.series as { id: string; data: unknown[] }[];
    expect(series[0]!.data).toEqual([]);
    expect(series.find((item) => item.id === "risk-map-flows")!.data).toEqual([]);
    expect(value.visualMap).toBeUndefined();
    expect((value.aria as { label: { description: string } }).label.description).toContain("仅显示边界");
  });

  it("keeps same-region convergence and unplaced sources out of invented points", () => {
    const value = option("china", [{ regionCode: "CN-31", requestCount: "7" }, { regionCode: "UNKNOWN", requestCount: "2" }]);
    const series = value.series as { id: string; data: { name?: string; count?: string }[] }[];
    expect(series.find((item) => item.id === "risk-map-flows")!.data).toEqual([]);
    expect(series.find((item) => item.id === "risk-map-same")!.data[0]).toMatchObject({ name: "CN-31", count: "7" });
    expect((value.aria as { label: { description: string } }).label.description).toContain("1 条地域记录无本图边界");
  });
});
