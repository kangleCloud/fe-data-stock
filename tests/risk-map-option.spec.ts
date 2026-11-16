import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { mergeRiskDetailGeo, riskDetailCounts, validateRiskDetailGeo } from "@/utils/riskMapDetail";
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

  it("colors merged detail boundaries and labels them only at the China zoom threshold", () => {
    const china = geo("china");
    const detail = validateRiskDetailGeo("china", "CN-31", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8")));
    const layer = {
      kind: "cities" as const,
      regionCode: "CN-31",
      geo: detail,
      counts: riskDetailCounts("cities", [{ cityCode: "310000", cityName: "上海市", requestCount: "7" }], detail),
      selectedName: "310000",
    };
    const value = option("china", [{ regionCode: "CN-31", requestCount: "9" }, { regionCode: "CN-44", requestCount: "5" }], {
      geo: mergeRiskDetailGeo(china, detail, "CN-31"),
      mapName: "risk-v1-detail-china-CN-31",
      detail: layer,
      view: { zoom: 2, offset: [0, 0] },
    });
    const geos = value.geo as { map: string; zoom: number }[];
    const regions = (value.series as { id: string; map: string; data: { name: string; value: number; count?: string; detail?: boolean; itemStyle?: { areaColor?: string; borderColor?: string }; label: { show: boolean; formatter: string } }[] }[])[0]!;
    expect(geos.every((item) => item.map === "risk-v1-detail-china-CN-31" && item.zoom === 2)).toBe(true);
    expect(regions.map).toBe("risk-v1-detail-china-CN-31");
    expect(regions.data.map((item) => item.name)).not.toContain("CN-31");
    const row = regions.data.find((item) => item.detail)!;
    expect(row).toMatchObject({ name: "310000", value: 7, count: "7" });
    expect(row.label).toMatchObject({ show: true, formatter: "上海市" });
    expect(row.itemStyle).toMatchObject({ areaColor: "#2f8eae", borderColor: "#ffd37d" });
    const formatter = (value.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(formatter({ name: "310000", data: row })).toBe("上海市\n细分请求：7");
    expect((value.aria as { label: { description: string } }).label.description).toContain("已叠加CN-31的城市边界");

    const far = option("china", [{ regionCode: "CN-44", requestCount: "9" }], { geo: mergeRiskDetailGeo(china, detail, "CN-31"), mapName: "risk-v1-detail-china-CN-31", detail: layer });
    const farRow = (far.series as { data: { detail?: boolean; label: { show: boolean } }[] }[])[0]!.data.find((item) => item.detail)!;
    expect(farRow.label.show).toBe(false);
  });

  it("labels Chinese provinces in 2D without codes and switches to viewport city labels at the 1.8 zoom threshold", () => {
    const rows = [{ regionCode: "CN-44", requestCount: "9" }];
    const near = option("china", rows, { mode: "2d", view: { zoom: 1.79, offset: [0, 0] } });
    const nearRegions = (near.series as {
      id: string;
      data: { name: string; value: number; count?: string }[];
      label: { show: boolean; formatter: (params: unknown) => string };
    }[])[0]!;
    const china = geo("china");
    expect(nearRegions.label.show).toBe(true);
    expect(nearRegions.data).toHaveLength(china.features.length);
    expect(nearRegions.data.find((row) => row.name === "CN-44")).toMatchObject({ value: 9, count: "9" });
    expect(nearRegions.data.filter((row) => row.value === 0)).toHaveLength(china.features.length - 1);
    for (const row of nearRegions.data) {
      const label = nearRegions.label.formatter({ name: row.name });
      expect(label).not.toMatch(/^CN-/);
      expect(label).not.toMatch(/^[A-Z]{2}$/);
      expect(label).toMatch(/[\u4e00-\u9fa5]/);
    }

    const cityLabels = [{ name: "310000", label: "上海市", cp: [121.47, 31.23] as [number, number], area: 1, parentCode: "CN-31" }];
    const nearWithLabels = option("china", rows, { mode: "2d", view: { zoom: 1.79, offset: [0, 0] }, cityLabels });
    expect((nearWithLabels.series as { id: string; data: unknown[] }[]).find((item) => item.id === "risk-map-city-labels")!.data).toEqual([]);
    const far = option("china", rows, { mode: "2d", view: { zoom: 1.8, offset: [0, 0] }, cityLabels });
    const farSeries = far.series as {
      id: string;
      data: { name: string; label?: string; parentCode?: string; value?: number[] }[];
      label: { show: boolean; formatter: (params: unknown) => string };
    }[];
    const farRegions = farSeries[0]!;
    expect(farRegions.label.show).toBe(false);
    expect(farRegions.data.map((row) => row.name)).toEqual(["CN-44"]);
    const city = farSeries.find((item) => item.id === "risk-map-city-labels")!;
    expect(city.label.show).toBe(true);
    expect(city.data).toEqual([{ name: "上海市", label: "上海市", parentCode: "CN-31", value: [121.47, 31.23] }]);
    expect(city.label.formatter({ data: city.data[0] })).toBe("上海市");
    expect((far.aria as { label: { description: string } }).label.description).toContain("1个已核实城市标签");

    const threeD = option("china", rows, { mode: "3d" });
    expect((threeD.series as { label: { show: boolean } }[])[0]!.label.show).toBe(false);
    expect((threeD.series as { data: unknown[] }[])[0]!.data).toHaveLength(1);
  });

  it("shows verified Chinese names for hover, selected and tooltip states without exposing internal codes", () => {
    const rows = [{ regionCode: "CN-65", requestCount: "1" }];
    const twoD = option("china", rows, { mode: "2d", view: { zoom: 1, offset: [0, 0] } });
    const geos = twoD.geo as {
      emphasis: { label: { show: boolean; formatter: (params: unknown) => string } };
      select: { label: { show: boolean; formatter: (params: unknown) => string } };
    }[];
    expect(geos).toHaveLength(1);
    expect(geos[0]!.emphasis.label.show).toBe(true);
    expect(geos[0]!.emphasis.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(geos[0]!.select.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(geos[0]!.emphasis.label.formatter({ name: "BOUNDARY_1" })).toBe("未命名地域");

    const regions = (twoD.series as {
      id: string;
      label: { formatter: (params: unknown) => string };
      emphasis: { label: { formatter: (params: unknown) => string } };
      select: { label: { formatter: (params: unknown) => string } };
    }[])[0]!;
    expect(regions.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(regions.label.formatter({ name: "BOUNDARY_1" })).toBe("未命名地域");
    expect(regions.emphasis.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(regions.select.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(regions.emphasis.label.formatter({ name: "BOUNDARY_1" })).toBe("未命名地域");

    const tooltip = (twoD.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(tooltip({ name: "CN-65" })).toBe("新疆\n请求：1");
    expect(tooltip({ name: "BOUNDARY_1" })).toBe("未命名地域\n请求：无可定位统计");
    expect(tooltip({ name: "BOUNDARY_1" })).not.toContain("BOUNDARY_1");

    const targetSeries = (twoD.series as {
      id: string;
      label: { show: boolean; formatter: string; position: string };
    }[]).find((item) => item.id === "risk-map-target")!;
    expect(targetSeries.label).toMatchObject({ show: true, formatter: "上海目标", position: "right" });
    expect((twoD.series as { id: string }[]).some((item) => item.id === "risk-map-target-halo")).toBe(true);

    const threeD = option("china", rows, { mode: "3d" });
    const main = (threeD.geo as { emphasis: { label: { formatter: (params: unknown) => string } } }[])[2]!;
    expect(main.emphasis.label.formatter({ name: "CN-65" })).toBe("新疆");
    const threeDTooltip = (threeD.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(threeDTooltip({ name: "BOUNDARY_1" })).toBe("未命名地域\n请求：无可定位统计");
  });

  it("uses real chart dimensions to enlarge the map while keeping it inside desktop and narrow viewports", () => {
    const rows = [{ regionCode: "CN-44", requestCount: "9" }];
    const sizeOf = (viewport: { width: number; height: number }) => {
      const value = option("china", rows, { mode: "2d", viewport });
      const geo = (value.geo as { layoutSize: string; aspectScale: number }[])[0]!;
      return { px: Number.parseFloat(geo.layoutSize), unit: geo.layoutSize.endsWith("px"), aspectScale: geo.aspectScale, viewport };
    };
    const desktop = sizeOf({ width: 900, height: 520 });
    expect(desktop.unit).toBe(true);
    expect(desktop.aspectScale).toBe(1);
    expect(desktop.px).toBeGreaterThan(700);
    expect(desktop.px).toBeLessThanOrEqual(900 * 0.94);

    const narrow = sizeOf({ width: 390, height: 470 });
    expect(narrow.unit).toBe(true);
    expect(narrow.px).toBeLessThanOrEqual(390 * 0.94);
    expect(narrow.px).toBeGreaterThan(300);
  });

  it("keeps neighbouring province labels while a drilldown is below the city threshold", () => {
    const china = geo("china");
    const detail = validateRiskDetailGeo("china", "CN-31", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8")));
    const value = option("china", [{ regionCode: "CN-31", requestCount: "9" }], {
      mode: "2d",
      geo: mergeRiskDetailGeo(china, detail, "CN-31"),
      mapName: "risk-v1-detail-china-CN-31",
      detail: {
        kind: "cities",
        regionCode: "CN-31",
        geo: detail,
        counts: riskDetailCounts("cities", [], detail),
        selectedName: null,
      },
    });
    const regions = (value.series as {
      data: { name: string; detail?: boolean; value: number }[];
      label: { show: boolean };
    }[])[0]!;
    expect(regions.label.show).toBe(true);
    const provinceRows = regions.data.filter((row) => !row.detail);
    expect(provinceRows.some((row) => row.name === "CN-44")).toBe(true);
    expect(provinceRows.some((row) => row.name === "CN-31")).toBe(false);
    expect(provinceRows.every((row) => row.value === 0)).toBe(true);
    expect(regions.data.filter((row) => row.detail).every((row) => !row.value)).toBe(true);
  });
});
