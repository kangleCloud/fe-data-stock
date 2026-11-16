import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RiskServerTarget } from "@/types/riskServer";
import {
  defaultRiskCamera,
  normalizeRiskCamera,
  riskArc3D,
  riskCameraKey,
  riskCameraZoom,
  sameRiskCamera,
  zoomRiskCamera,
} from "@/utils/riskCamera3d";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo } from "@/utils/riskMap";
import { buildRiskMap3DOption, risk3DDetailLabelMinimumZoom, risk3DViewControl } from "@/utils/riskMap3dOption";
import { riskDetailCounts, validateRiskDetailGeo } from "@/utils/riskMapDetail";

const chinaGeo = validateRiskGeo("china", JSON.parse(readFileSync("public/maps/risk-v1/china.geojson", "utf8")));
const defaultDetail = validateRiskDetailGeo("china", "CN-31", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8")));
const target: RiskServerTarget = { configured: true, alias: "上海目标", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL", locationStatus: "LOCATED", resolveStatus: "NOT_ATTEMPTED", resolvedAt: null, updatedAt: null };

interface Row { name: string; value: number; count?: string; detail?: boolean; itemStyle: { color: string; borderColor?: string } }
interface Series { id: string; type: string; map?: string; data: Row[] }

function option(overrides: Partial<Parameters<typeof buildRiskMap3DOption>[0]> = {}) {
  const rows = [{ regionCode: "CN-44", requestCount: "9" }];
  const counts = overrides.counts ?? riskMapCounts("china", rows, chinaGeo);
  const flows = overrides.flows ?? riskFlows("china", rows, target, chinaGeo);
  return buildRiskMap3DOption({
    kind: "china",
    mapName: "risk-v1-china",
    geo: chinaGeo,
    counts,
    flows,
    camera: defaultRiskCamera(),
    reducedMotion: false,
    serverTarget: target,
    boxWidth: 200,
    ...overrides,
  });
}

function detailLayer(selectedName: string | null = "310000") {
  const counts = riskDetailCounts("cities", [{ cityCode: "310000", cityName: "上海市", requestCount: "7" }], defaultDetail);
  return { kind: "cities" as const, regionCode: "CN-31", geo: defaultDetail, counts, selectedName };
}

describe("risk 3D camera", () => {
  it("normalizes angle, distance, beta wrapping and center without throwing", () => {
    expect(normalizeRiskCamera({ alpha: 5, beta: 200, distance: 20, center: [1, 2, 3] }))
      .toEqual({ alpha: 10, beta: -160, distance: 60, center: [1, 2, 3] });
    expect(normalizeRiskCamera({ alpha: 90, beta: -200, distance: 999 }))
      .toEqual({ alpha: 75, beta: 160, distance: 300, center: [0, 0, 0] });
    expect(normalizeRiskCamera({ alpha: Number.NaN, beta: Number.POSITIVE_INFINITY, center: [1] }))
      .toEqual(defaultRiskCamera());
    expect(normalizeRiskCamera({ center: [Number.NaN, 0, 0] }).center).toEqual([0, 0, 0]);
  });

  it("keys rotate, zoom and reset with the same bounds as pointer interaction", () => {
    const camera = defaultRiskCamera();
    expect(riskCameraKey(camera, "ArrowLeft")?.beta).toBe(-10);
    expect(riskCameraKey(camera, "ArrowRight")?.beta).toBe(10);
    expect(riskCameraKey(camera, "ArrowUp")?.alpha).toBe(40);
    expect(riskCameraKey(camera, "ArrowDown")?.alpha).toBe(30);
    expect(riskCameraKey(camera, "+")?.distance).toBe(128);
    expect(riskCameraKey(camera, "=")?.distance).toBe(128);
    expect(riskCameraKey(camera, "-")?.distance).toBe(200);
    expect(riskCameraKey(camera, "0")).toEqual(defaultRiskCamera());
    expect(riskCameraKey(camera, "a")).toBeUndefined();
    expect(zoomRiskCamera(camera, 2).distance).toBe(80);
    expect(zoomRiskCamera(camera, 0).distance).toBe(160);
    expect(zoomRiskCamera(camera, Number.NaN).distance).toBe(160);
    expect(riskCameraZoom(camera)).toBe(1);
    expect(riskCameraZoom({ ...camera, distance: 80 })).toBe(2);
  });

  it("keeps comparison tolerant and builds exact 25-point arcs", () => {
    expect(sameRiskCamera(defaultRiskCamera(), { ...defaultRiskCamera(), beta: 0.005 })).toBe(true);
    expect(sameRiskCamera(defaultRiskCamera(), { ...defaultRiskCamera(), distance: 161 })).toBe(false);
    const arc = riskArc3D([[100, 20], [120, 30]]);
    expect(arc).toHaveLength(25);
    expect(arc[0]).toEqual([100, 20, 0.02]);
    expect(arc[24]![0]).toBeCloseTo(120);
    expect(arc[24]![1]).toBeCloseTo(30);
    expect(arc[12]![2]).toBeGreaterThan(0.8);
  });
});

describe("risk 3D option", () => {
  it("maps interactive map3D regions and synced invisible geo3D coordinates", () => {
    const value = option();
    const geos = value.geo3D as unknown as { show: boolean; map: string; viewControl: Record<string, unknown> };
    const series = value.series as unknown as Series[];
    expect(geos.show).toBe(false);
    expect(geos.map).toBe("risk-v1-china");
    expect(geos.viewControl).toMatchObject({ rotateSensitivity: 0, panSensitivity: 0, zoomSensitivity: 0 });
    expect(series.map((item) => item.id)).toEqual([
      "risk3d-regions", "risk3d-city-labels", "risk3d-flows", "risk3d-sources", "risk3d-source-halos", "risk3d-target-halo", "risk3d-target", "risk3d-height-range",
    ]);
    expect(series.find((item) => item.id === "risk3d-regions")).toMatchObject({ type: "map3D", map: "risk-v1-china", coordinateSystem: "geo3D" });
    expect((series.find((item) => item.id === "risk3d-regions")!.data[0] as Row).count).toBe("9");
    expect((series.find((item) => item.id === "risk3d-target")!.data[0] as unknown as { value: number[] }).value).toEqual([121.47, 31.23, 0.02]);
    expect(risk3DViewControl(defaultRiskCamera())).toMatchObject({
      autoRotate: false,
      rotateMouseButton: "left",
      panMouseButton: "right",
      damping: 0,
      rotateSensitivity: 1,
    });
  });

  it("uses verified Chinese names for 3D hover without falling back to internal codes", () => {
    const value = option();
    const series = value.series as unknown as {
      id: string;
      emphasis: { label: { formatter: (params: unknown) => string } };
    }[];
    const regions = series.find((item) => item.id === "risk3d-regions")!;
    expect(regions.emphasis.label.formatter({ name: "CN-65" })).toBe("新疆");
    expect(regions.emphasis.label.formatter({ name: "BOUNDARY_1" })).toBe("未命名地域");
    const tooltip = (value.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(tooltip({ name: "CN-65" })).toBe("新疆\n请求：无可定位统计");
    expect(tooltip({ name: "BOUNDARY_1" })).toBe("未命名地域\n请求：无可定位统计");
  });

  it("keeps huge counts exact in text while refusing an imprecise color scale", () => {
    const rows = [{ regionCode: "CN-44", requestCount: "9007199254740993" }];
    const value = option({ counts: riskMapCounts("china", rows, chinaGeo), flows: riskFlows("china", rows, target, chinaGeo) });
    const series = value.series as unknown as Series[];
    expect(series.find((item) => item.id === "risk3d-regions")!.data).toEqual([]);
    expect((value.aria as { label: { description: string } }).label.description).toContain("超出安全绘图精度");
    expect(series.find((item) => item.id === "risk3d-flows")!.data[0]!.count).toBe("9007199254740993");
  });

  it("adds detail boundaries with Chinese labels only after the zoom threshold", () => {
    const detail = detailLayer();
    const rows = [{ regionCode: "CN-31", requestCount: "9" }, { regionCode: "CN-44", requestCount: "5" }];
    const near = option({
      detail,
      visibleDetailLabels: new Set(["310000"]),
      counts: riskMapCounts("china", rows, chinaGeo),
      flows: riskFlows("china", rows, target, chinaGeo),
      camera: { ...defaultRiskCamera(), distance: 82 },
    });
    const far = option({ detail, visibleDetailLabels: new Set() });
    const nearData = (near.series as unknown as Series[]).find((item) => item.id === "risk3d-regions")!.data;
    const nearRow = nearData.find((row) => row.detail)!;
    const farRow = (far.series as unknown as Series[]).find((item) => item.id === "risk3d-regions")!.data.find((row) => row.detail)!;
    expect(nearData.map((row) => row.name)).not.toContain("CN-31");
    expect(nearRow).toMatchObject({ name: "310000", value: 7, count: "7", detail: true });
    expect((nearRow as unknown as { label: { show: boolean; formatter: string } }).label).toMatchObject({ show: true, formatter: "上海市" });
    expect((farRow as unknown as { label: { show: boolean } }).label.show).toBe(false);
    expect(nearRow.itemStyle).toMatchObject({ color: "#46c9e8", borderColor: "#ffd37d" });
    expect((near.aria as { label: { description: string } }).label.description).toContain("已叠加CN-31细分边界");

    const tooltip = (near.tooltip as { formatter: (params: unknown) => string }).formatter;
    expect(tooltip({ name: "310000", data: nearRow })).toBe("上海市\n细分请求：7");
    expect(tooltip({ name: "310000", data: { detail: true } })).toContain("无可核实统计");
  });

  it("renders only explicitly selected viewport city labels with original-name marking", () => {
    const value = option({
      cityLabels: [
        { name: "110000", label: "北京市", cp: [116.4, 39.9], area: 100, parentCode: "CN-11" },
        { name: "US-CA", label: "California（原名）", cp: [-119.4, 36.7], area: 80, parentCode: "US" },
      ],
    });
    const series = value.series as unknown as Series[];
    const labels = series.find((item) => item.id === "risk3d-city-labels")!;
    expect(labels).toMatchObject({ type: "scatter3D", coordinateSystem: "geo3D", silent: true });
    expect(labels.data.map((row) => row.name)).toEqual(["北京市", "California（原名）"]);
    expect((value.aria as { label: { description: string } }).label.description).toContain("仅在当前真实视口内显示2个地域标签");
    expect(risk3DDetailLabelMinimumZoom("china")).toBe(1.8);
    expect(risk3DDetailLabelMinimumZoom("world")).toBe(2.2);
  });

  it("keeps unmatched detail boundaries neutral and omits absent targets", () => {
    const geo = { ...defaultDetail, features: [{ ...defaultDetail.features[0]!, properties: { ...defaultDetail.features[0]!.properties, code: null } }] };
    const detail = { ...detailLayer(), geo, counts: { exact: [], unplaced: [], safe: true } };
    const value = option({ detail, serverTarget: { ...target, locationStatus: "UNRESOLVED", longitude: null, latitude: null, regionCode: null }, flows: riskFlows("china", [], { ...target, locationStatus: "UNRESOLVED", longitude: null, latitude: null, regionCode: null }, chinaGeo) });
    const series = value.series as unknown as Series[];
    const row = series.find((item) => item.id === "risk3d-regions")!.data.find((item) => item.detail)!;
    expect(row.itemStyle.color).toBe("#064770");
    expect(series.find((item) => item.id === "risk3d-target")!.data).toEqual([]);
    expect((value.aria as { label: { description: string } }).label.description).toContain("不绘制汇聚飞线");
  });
});
