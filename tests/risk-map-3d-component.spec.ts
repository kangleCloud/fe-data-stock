import { readFileSync } from "node:fs";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskMap3D from "@/components/risk/RiskMap3D.vue";
import { defaultRiskCamera } from "@/utils/riskCamera3d";
import { riskFlows } from "@/utils/riskFlows";
import { riskMapCounts, validateRiskGeo } from "@/utils/riskMap";
import { validateRiskDetailGeo, type RiskDetailFeature } from "@/utils/riskMapDetail";

const runtime = vi.hoisted(() => {
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  const chart = {
    handlers,
    setOption: vi.fn(),
    on: vi.fn((name: string, handler: (event: unknown) => void) => { (handlers[name] ??= []).push(handler); }),
    getZr: vi.fn(() => ({ flush: vi.fn(), animation: { stop: vi.fn(), start: vi.fn() } })),
    getModel: vi.fn(() => ({ getSeriesByType: () => [] as unknown[], getSeriesByIndex: () => ({}) })),
    getViewOfSeriesModel: vi.fn(() => ({ _control: { getCenter: () => [0, 0, 0] } })),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return { chart, init: vi.fn(() => chart) };
});
vi.mock("@/charts/risk3d", () => ({ echarts: { init: runtime.init } }));

const geo = validateRiskGeo("china", JSON.parse(readFileSync("public/maps/risk-v1/china.geojson", "utf8")));
const detailGeo = validateRiskDetailGeo("china", "CN-31", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8")));
const counts = riskMapCounts("china", [{ regionCode: "CN-31", requestCount: "7" }], geo);
const flows = riskFlows("china", [{ regionCode: "CN-31", requestCount: "7" }], undefined, geo);
const wrappers: ReturnType<typeof mount>[] = [];
const identity = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
const viewportScale = [
  1 / 30, 0, 0, 0,
  0, 1 / 20, 0, 0,
  0, 0, 1, 0,
  -110 / 30, -35 / 20, 0, 1,
];

function render(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(RiskMap3D, {
    props: {
      kind: "china",
      mapName: "risk-v1-china",
      geo,
      baseGeo: geo,
      counts,
      flows,
      camera: defaultRiskCamera(),
      reducedMotion: false,
      height: "520px",
      ...overrides,
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

function useProjection() {
  runtime.chart.getModel.mockReturnValue({
    getSeriesByIndex: () => ({}),
    getSeriesByType: () => [{
      coordinateSystem: {
        dataToPoint: (data: number[]) => [data[0], data[1], data[2]],
        viewGL: {
          camera: {
            viewMatrix: { array: identity },
            projectionMatrix: { array: viewportScale },
          },
          viewport: { x: 0, y: 0, width: 600, height: 400 },
        },
      },
    }],
  });
}

async function ready(wrapper: ReturnType<typeof mount>) {
  await flushPromises();
  await vi.waitFor(() => expect(runtime.init).toHaveBeenCalledTimes(1));
  await flushPromises();
  return wrapper;
}

function emitChart(name: string, payload?: unknown) {
  runtime.chart.handlers[name]?.forEach((handler) => handler(payload));
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(runtime.chart.handlers).forEach((key) => delete runtime.chart.handlers[key]);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe("risk 3D renderer wiring", () => {
  it("initializes once, registers events and renders a map3D option", async () => {
    const wrapper = await ready(render());
    expect(runtime.chart.on).toHaveBeenCalledWith("click", expect.any(Function));
    expect(runtime.chart.on).toHaveBeenCalledWith("map3dcamerachanged", expect.any(Function));
    expect(runtime.chart.setOption).toHaveBeenCalledTimes(1);
    const option = runtime.chart.setOption.mock.calls[0]![0] as { series: { id: string }[] };
    expect(option.series[0]!.id).toBe("risk3d-regions");
    expect(wrapper.get(".risk-map-3d").attributes("style")).toContain("520px");
    expect(wrapper.get(".risk-map-3d").attributes("data-view-beta")).toBe("0");
  });

  it("emits only real feature clicks and suppresses the click after a drag", async () => {
    const wrapper = await ready(render());
    const root = wrapper.get(".risk-map-3d");
    emitChart("click", { name: "CN-31" });
    expect(wrapper.emitted("regionSelect")?.at(-1)).toEqual(["CN-31"]);
    emitChart("click", { name: 42 });
    expect(wrapper.emitted("regionSelect")).toHaveLength(1);

    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const rootElement = root.element;
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "clientX", { value: x });
      Object.defineProperty(event, "clientY", { value: y });
      rootElement.dispatchEvent(event);
    };
    pointer("pointerdown", 10, 10);
    pointer("pointermove", 30, 30);
    pointer("pointerup", 30, 30);
    await flushPromises();
    now.mockReturnValue(1100);
    emitChart("click", { name: "CN-44" });
    expect(wrapper.emitted("regionSelect")).toHaveLength(1);
    now.mockReturnValue(1300);
    pointer("pointerdown", 5, 5);
    emitChart("click", { name: "CN-44" });
    expect(wrapper.emitted("regionSelect")?.at(-1)).toEqual(["CN-44"]);
  });

  it("keeps the camera synced, supports keyboard zoom and reset", async () => {
    const wrapper = await ready(render());
    emitChart("map3dcamerachanged", { alpha: 40, beta: 20, distance: 120, center: [1, 2, 3] });
    expect(wrapper.emitted("cameraChange")?.at(-1)?.[0]).toEqual({ alpha: 40, beta: 20, distance: 120, center: [1, 2, 3] });
    expect(runtime.chart.setOption).toHaveBeenCalledWith(expect.objectContaining({
      geo3D: expect.objectContaining({ viewControl: expect.objectContaining({ alpha: 40, beta: 20, distance: 120 }) }),
    }), expect.objectContaining({ silent: true }));

    await wrapper.get(".risk-map-3d").trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.get(".risk-map-3d").attributes("data-view-beta")).toBe("10");
    await wrapper.get(".risk-map-3d").trigger("keydown", { key: "+" });
    expect(Number(wrapper.get(".risk-map-3d").attributes("data-view-distance"))).toBe(96);
    await wrapper.get(".risk-map-3d").trigger("keydown", { key: "0" });
    expect(wrapper.get(".risk-map-3d").attributes("data-view-beta")).toBe("0");
    expect(wrapper.get(".risk-map-3d").attributes("data-view-distance")).toBe("160");
  });

  it("keeps the real orbit pan center when the camera event omits it", async () => {
    runtime.chart.getViewOfSeriesModel.mockReturnValue({
      _control: { getCenter: () => [12.5, 0, -8.25] },
    });
    const wrapper = await ready(render());
    emitChart("map3dcamerachanged", { alpha: 40, beta: 20, distance: 120 });
    expect(wrapper.emitted("cameraChange")?.at(-1)?.[0]).toEqual({
      alpha: 40,
      beta: 20,
      distance: 120,
      center: [12.5, 0, -8.25],
    });
    await flushPromises();
    expect(wrapper.get(".risk-map-3d").attributes("data-view-center")).toBe("12.5,0,-8.25");
    const geoCall = (runtime.chart.setOption.mock.calls as unknown as [{ geo3D?: { viewControl?: { center?: number[] } } }][])
      .filter(([option]) => option.geo3D)
      .at(-1)!;
    expect(geoCall[0].geo3D?.viewControl?.center).toEqual([12.5, 0, -8.25]);
  });

  it("reports only projected viewport parents and labels only cities inside the real viewport", async () => {
    useProjection();
    const first = detailGeo.features[0]!;
    const visible: RiskDetailFeature = {
      ...first,
      properties: { ...first.properties, name: "visible-city", label: "可见城市", cp: [115, 30], area: 100 },
    };
    const offscreen: RiskDetailFeature = {
      ...first,
      properties: { ...first.properties, name: "offscreen-city", label: "视口外城市", cp: [0, 120], area: 999 },
    };
    const wrapper = await ready(render({
      camera: { ...defaultRiskCamera(), distance: 80 },
      viewportDetails: [{ parentCode: "CN-31", features: [visible, offscreen] }],
    }));

    await vi.waitFor(() => expect(wrapper.emitted("viewportParents")?.at(-1)?.[0]).toBeTruthy());
    const parents = wrapper.emitted("viewportParents")!.at(-1)![0] as string[];
    expect(parents.length).toBeGreaterThan(0);
    expect(parents.length).toBeLessThanOrEqual(6);
    expect(parents.every((code) => geo.features.some((feature) => feature.properties.code === code))).toBe(true);

    await vi.waitFor(() => {
      const calls = runtime.chart.setOption.mock.calls as unknown as [{ series?: { id?: string; data?: { name?: string }[] }[] }][];
      expect(calls.some(([option]) => option.series?.find((item) => item.id === "risk3d-city-labels")?.data?.length === 1)).toBe(true);
    });
    const calls = runtime.chart.setOption.mock.calls as unknown as [{ series?: { id?: string; data?: { name?: string; label?: string }[] }[] }][];
    const labelSeries = calls.flatMap(([option]) => option.series ?? []).filter((item) => item.id === "risk3d-city-labels").at(-1)!;
    expect(labelSeries.data).toEqual([expect.objectContaining({ name: "可见城市", label: "可见城市" })]);
  });

  it("does not load or label national cities at the default overview zoom", async () => {
    useProjection();
    const wrapper = await ready(render());
    await flushPromises();
    expect(wrapper.emitted("viewportParents")).toBeUndefined();
    const calls = runtime.chart.setOption.mock.calls as unknown as [{ series?: { id?: string; data?: unknown[] }[] }][];
    const labelSeries = calls.flatMap(([option]) => option.series ?? []).find((item) => item.id === "risk3d-city-labels");
    expect(labelSeries?.data).toEqual([]);
  });

  it("falls back once and disposes when the WebGL context is lost", async () => {
    const wrapper = await ready(render());
    await wrapper.get(".risk-map-3d").trigger("webglcontextlost");
    expect(wrapper.emitted("failed")?.at(-1)).toEqual(["WebGL 上下文丢失，已切回二维地图"]);
    expect(runtime.chart.dispose).toHaveBeenCalledTimes(1);
    emitChart("click", { name: "CN-31" });
    expect(wrapper.emitted("regionSelect")).toBeUndefined();
    wrapper.unmount();
    expect(runtime.chart.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes on unmount without emitting a failure", async () => {
    const wrapper = await ready(render());
    wrapper.unmount();
    expect(runtime.chart.dispose).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("failed")).toBeUndefined();
  });
});
