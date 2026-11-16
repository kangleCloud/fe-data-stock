import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "@/charts/echarts";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { defaultRiskMapView, riskMapGeoBounds, riskMapGeoCenter } from "@/utils/riskMapView";

echarts.use([SVGRenderer]);

const geo = (kind: RiskMapKind) => validateRiskGeo(kind, JSON.parse(readFileSync(`public/maps/risk-v1/${kind}.geojson`, "utf8")));
const target: RiskServerTarget = { configured: true, alias: "目标", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL", locationStatus: "LOCATED", resolveStatus: "NOT_ATTEMPTED", resolvedAt: null, updatedAt: null };

function render(kind: RiskMapKind, rows: { regionCode: string; requestCount: string }[], mode: "2d" | "3d" = "3d") {
  const asset = { geo: geo(kind), origin: "local" as const };
  echarts.registerMap(`risk-v1-${kind}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
  const counts = riskMapCounts(kind, rows, asset.geo);
  const flows = riskFlows(kind, rows, target, asset.geo);
  const option = buildRiskMapOption({ kind, asset, counts, flows, view: defaultRiskMapView(), mode, backdrop: true, reducedMotion: true, serverTarget: target });
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 900, height: 520 });
  try {
    chart.setOption(option);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

function projectedCenter(kind: RiskMapKind) {
  const asset = { geo: geo(kind), origin: "local" as const };
  echarts.registerMap(`risk-v1-${kind}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
  const counts = riskMapCounts(kind, [{ regionCode: kind === "china" ? "CN-44" : "US", requestCount: "9" }], asset.geo);
  const flows = riskFlows(kind, [{ regionCode: kind === "china" ? "CN-44" : "US", requestCount: "9" }], target, asset.geo);
  const option = buildRiskMapOption({ kind, asset, counts, flows, view: defaultRiskMapView(), mode: "3d", backdrop: true, reducedMotion: true, serverTarget: target });
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: 900, height: 520 });
  try {
    chart.setOption(option);
    const model = (chart as unknown as { getModel: () => { getComponent: (type: string, index: number) => { coordinateSystem: unknown } } }).getModel();
    const geoModel = model.getComponent("geo", 2);
    const cs = geoModel.coordinateSystem as unknown as { dataToPoint: (point: number[]) => number[] };
    return cs.dataToPoint(riskMapGeoCenter(asset.geo));
  } finally {
    chart.dispose();
  }
}

function chartFor(kind: RiskMapKind, rows: { regionCode: string; requestCount: string }[], viewport: { width: number; height: number }) {
  const asset = { geo: geo(kind), origin: "local" as const };
  echarts.registerMap(`risk-v1-${kind}`, asset.geo as Parameters<typeof echarts.registerMap>[1]);
  const counts = riskMapCounts(kind, rows, asset.geo);
  const flows = riskFlows(kind, rows, target, asset.geo);
  const option = buildRiskMapOption({ kind, asset, counts, flows, view: defaultRiskMapView(), mode: "2d", backdrop: true, reducedMotion: true, serverTarget: target, viewport });
  (option.geo as { map: string }[])[0]!.map = `risk-v1-${kind}`;
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width: viewport.width, height: viewport.height });
  chart.setOption(option);
  return chart;
}

interface RealGeoModel {
  getRegionModel: (name: string) => { getModel: (path: string) => { get: (key: string) => unknown } };
  coordinateSystem: { dataToPoint: (point: number[]) => number[] };
}

function realGeoModel(chart: ReturnType<typeof chartFor>): RealGeoModel {
  const model = (chart as unknown as { getModel: () => { getComponent: (type: string, index: number) => RealGeoModel } }).getModel();
  return model.getComponent("geo", 0);
}

describe("risk map real ECharts hover", () => {
  it("resolves geo hover and select labels to verified Chinese names, never internal codes", () => {
    const chart = chartFor("china", [{ regionCode: "CN-65", requestCount: "1" }], { width: 900, height: 520 });
    try {
      chart.dispatchAction({ type: "highlight", geoIndex: 0, name: "CN-65" });
      const geoModel = realGeoModel(chart);
      const hover = geoModel.getRegionModel("CN-65").getModel("emphasis.label");
      expect(hover.get("show")).toBe(true);
      const formatter = hover.get("formatter") as (params: unknown) => string;
      expect(formatter({ name: "CN-65" })).toBe("新疆");
      expect(formatter({ name: "BOUNDARY_1" })).toBe("未命名地域");
      const selected = geoModel.getRegionModel("CN-65").getModel("select.label");
      expect((selected.get("formatter") as (params: unknown) => string)({ name: "CN-65" })).toBe("新疆");
      expect(chart.renderToSVGString()).not.toContain("CN-65");
    } finally {
      chart.dispose();
    }
  });

  it("keeps the real projected map inside desktop and narrow chart bounds", () => {
    for (const viewport of [{ width: 900, height: 520 }, { width: 390, height: 470 }]) {
      const chart = chartFor("china", [{ regionCode: "CN-44", requestCount: "9" }], viewport);
      try {
        const cs = realGeoModel(chart).coordinateSystem;
        const bounds = riskMapGeoBounds(geo("china"));
        const west = cs.dataToPoint([bounds.minLng, bounds.minLat]);
        const east = cs.dataToPoint([bounds.maxLng, bounds.maxLat]);
        const width = Math.abs(east[0]! - west[0]!);
        const height = Math.abs(east[1]! - west[1]!);
        expect(Math.min(west[0]!, east[0]!)).toBeGreaterThanOrEqual(0);
        expect(Math.max(west[0]!, east[0]!)).toBeLessThanOrEqual(viewport.width);
        expect(Math.min(west[1]!, east[1]!)).toBeGreaterThanOrEqual(0);
        expect(Math.max(west[1]!, east[1]!)).toBeLessThanOrEqual(viewport.height);
        expect(width).toBeGreaterThan(viewport.width * (viewport.width < 500 ? 0.8 : 0.75));
        expect(height).toBeGreaterThan(viewport.height * (viewport.width < 500 ? 0.35 : 0.7));
      } finally {
        chart.dispose();
      }
    }
  });
});

describe("risk map runtime option acceptance", () => {
  it("projects the real map center inside the viewport for both scopes", () => {
    for (const kind of ["china", "world"] as const) {
      const [x, y] = projectedCenter(kind);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(900);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(520);
    }
  });

  it("accepts multilayer China and world maps with real coordinates in the ECharts runtime", () => {
    const china = render("china", [{ regionCode: "CN-44", requestCount: "9" }]);
    expect(china.length).toBeGreaterThan(10_000);
    expect(china).toContain("path");
    const world = render("world", [{ regionCode: "US", requestCount: "4" }]);
    expect(world.length).toBeGreaterThan(10_000);
  });

  it("accepts 2D, unsafe precision and empty data without inventing series markers", () => {
    expect(render("china", [{ regionCode: "CN-44", requestCount: "9" }], "2d").length).toBeGreaterThan(10_000);
    expect(render("china", [{ regionCode: "CN-44", requestCount: "9007199254740993" }]).length).toBeGreaterThan(10_000);
    expect(render("world", []).length).toBeGreaterThan(10_000);
  });
});
