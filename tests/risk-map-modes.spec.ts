import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";

const mock = vi.hoisted(() => ({ load: vi.fn(), stop: vi.fn(), registerMap: vi.fn() }));
const webgl = vi.hoisted(() => ({ supported: false }));
vi.mock("@/charts/echarts", () => ({ echarts: { registerMap: mock.registerMap } }));
vi.mock("@/utils/riskMap", async (original) => ({
  ...await original<typeof import("@/utils/riskMap")>(),
  createRiskMapLoader: () => ({ load: mock.load, stop: mock.stop }),
}));
vi.mock("@/utils/riskWebGL", () => ({ canRiskWebGL: () => webgl.supported }));

const target = { configured: true, alias: "target", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL" as const, locationStatus: "LOCATED" as const, resolveStatus: "NOT_ATTEMPTED" as const, resolvedAt: null, updatedAt: null };
const wrappers: ReturnType<typeof mount>[] = [];
const RiskMapCanvasStub = {
  name: "RiskMapCanvas",
  props: ["option", "accessibleLabel", "kind", "height"],
  emits: ["regionSelect"],
  template: "<div data-map-canvas />",
};
const RiskMap3DStub = {
  name: "RiskMap3D",
  props: ["kind", "mapName", "geo", "counts", "flows", "camera", "detail", "reducedMotion", "serverTarget", "height"],
  emits: ["regionSelect", "cameraChange", "failed"],
  template: "<div data-map-3d />",
};

function asset(kind: string) {
  return {
    origin: "local",
    geo: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: kind === "china" ? "CN-31" : "US", code: kind === "china" ? "CN-31" : "US", label: "Region" },
        geometry: { type: "Polygon", coordinates: [[[70, 15], [140, 15], [140, 55], [70, 55], [70, 15]]] },
      }],
    },
  };
}

function render(regions = [{ regionCode: "CN-44", requestCount: "9" }]) {
  const wrapper = mount(RiskRegionMap, {
    props: { regions, serverTarget: target },
    global: { stubs: { RiskMapCanvas: RiskMapCanvasStub, RiskMap3D: RiskMap3DStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function option(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent({ name: "RiskMapCanvas" }).props("option") as {
    geo: { zoom: number; center: number[] }[];
    series: { id: string; effect?: { show: boolean }; symbol?: string[] }[];
    aria: { label: { description: string } };
  };
}

async function click(wrapper: ReturnType<typeof mount>, label: string) {
  await wrapper.findAll("button").find((button) => button.attributes("aria-label") === label || button.text() === label)!.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  webgl.supported = false;
  mock.load.mockImplementation(async (kind: string) => asset(kind));
});
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.unstubAllGlobals(); });

describe("fixed-view map controls", () => {
  it("zooms, pans, resets and keeps China/world view state independent", async () => {
    const wrapper = render();
    await flushPromises();
    const chinaBase = option(wrapper).geo[0]!.center[0];
    await click(wrapper, "放大");
    await click(wrapper, "放大");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.5625);
    await wrapper.trigger("keydown", { key: "ArrowLeft" });
    expect(option(wrapper).geo[0]!.center[0]).toBeCloseTo(chinaBase - 6 / 1.5625);

    await click(wrapper, "世界");
    expect(option(wrapper).geo[0]!.zoom).toBe(1);
    const worldBase = option(wrapper).geo[0]!.center[0];
    await click(wrapper, "放大");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.25);

    await click(wrapper, "中国");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.5625);
    await click(wrapper, "世界");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.25);

    await click(wrapper, "复位视图");
    expect(option(wrapper).geo[0]!.zoom).toBe(1);
    expect(option(wrapper).geo[0]!.center[0]).toBeCloseTo(worldBase);
    await wrapper.trigger("keydown", { key: "+" });
    expect(option(wrapper).geo[0]!.zoom).toBe(1.25);
    await wrapper.trigger("keydown", { key: "0" });
    expect(option(wrapper).geo[0]!.zoom).toBe(1);
  });

  it("switches 2D/3D without losing zoom or emitting WebGL fallback messages", async () => {
    webgl.supported = true;
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find(".stage-3d").exists()).toBe(true);
    await click(wrapper, "2D");
    await click(wrapper, "放大");
    const before = wrapper.emitted("statusChange")?.length ?? 0;
    await click(wrapper, "3D");
    expect(wrapper.find(".stage-3d").exists()).toBe(true);
    await click(wrapper, "2D");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.25);
    expect((wrapper.emitted("statusChange")?.length ?? 0)).toBe(before);
    expect(wrapper.text()).not.toContain("WebGL");
  });

  it("keeps zoom and reports a retryable fallback when WebGL is unavailable", async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, "放大");
    await click(wrapper, "3D");
    expect(option(wrapper).geo[0]!.zoom).toBe(1.25);
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
    expect(wrapper.text()).toContain("当前浏览器不支持 WebGL");
    expect(wrapper.emitted("statusChange")?.at(-1)?.[0]).toEqual(["当前浏览器不支持 WebGL，已使用二维地图"]);
    await click(wrapper, "重试三维");
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
    expect(wrapper.text()).toContain("当前浏览器不支持 WebGL");
  });

  it("falls back to 2D when the 3D renderer reports a lost context", async () => {
    webgl.supported = true;
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find(".stage-3d").exists()).toBe(true);
    wrapper.getComponent({ name: "RiskMap3D" }).vm.$emit("failed", "WebGL 上下文丢失，已切回二维地图");
    await flushPromises();
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
    expect(wrapper.text()).toContain("WebGL 上下文丢失");
  });

  it("keeps static flying lines when the system requests reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const wrapper = render([{ regionCode: "CN-44", requestCount: "9" }, { regionCode: "CN-31", requestCount: "2" }]);
    await flushPromises();
    const flowing = option(wrapper).series.find((item) => item.id === "risk-map-flows")!;
    expect(flowing.effect?.show).toBe(false);
    expect(flowing.symbol).toEqual(["none", "arrow"]);
    expect(option(wrapper).aria.label.description).toContain("不是真实网络路径");
  });

  it("does not refetch or recreate the chart instance when statistics change", async () => {
    const wrapper = render();
    await flushPromises();
    expect(mock.load).toHaveBeenCalledTimes(1);
    const instance = wrapper.getComponent({ name: "RiskMapCanvas" }).vm;
    await wrapper.setProps({ regions: [{ regionCode: "CN-44", requestCount: "10" }] });
    expect(mock.load).toHaveBeenCalledTimes(1);
    expect(wrapper.getComponent({ name: "RiskMapCanvas" }).vm).toBe(instance);
  });
});
