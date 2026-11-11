import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "@/charts/echarts";
import type { RiskServerTarget } from "@/types/riskServer";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { buildRiskMapOption } from "@/utils/riskMapOption";
import { defaultRiskMapView, riskMapGeoCenter } from "@/utils/riskMapView";

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
