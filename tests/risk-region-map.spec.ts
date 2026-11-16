import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { flushPromises, mount } from "@vue/test-utils";
import type { EChartsType } from "echarts/core";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskMapCanvas from "@/components/risk/RiskMapCanvas.vue";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import { riskMapAssets, validateRiskGeo } from "@/utils/riskMap";
import { riskMapGeoCenter } from "@/utils/riskMapView";

const texts = Object.fromEntries(riskMapAssets.map((asset) => [asset.kind, readFileSync(`public/${asset.localPath}`, "utf8")]));
const chinaGeo = validateRiskGeo("china", JSON.parse(texts.china!));
const detailChinaText = readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8");
const wrappers: ReturnType<typeof mount>[] = [];
const RiskMapCanvasStub = {
  name: "RiskMapCanvas",
  props: ["option", "accessibleLabel", "kind", "height"],
  emits: ["regionSelect", "chartReady", "viewportChange"],
  template: "<div data-map-canvas />",
};

// Mirrors vue-echarts 8.3.2: the component exposes a readonly `chart` getter
// instead of emitting a `ready` event. Mounting the real RiskMapCanvas here
// exercises the same chartReady path production uses.
const liveChart = shallowRef<EChartsType>();
const VChartStub = defineComponent({
  name: "VChartStub",
  props: {
    option: { type: Object, default: () => ({}) },
    initOptions: { type: Object, default: () => ({}) },
    updateOptions: { type: Object, default: () => ({}) },
    ariaLabel: { type: String, default: "" },
  },
  emits: ["click"],
  setup(_props, { expose }) {
    expose({
      get chart() {
        return liveChart.value;
      },
    });
    return () => h("div", { class: "vchart-stub" });
  },
});

function render(backdrop = false) {
  const wrapper = mount(RiskRegionMap, {
    props: { regions: [{ regionCode: "CN-31", requestCount: "7" }], backdrop },
    global: { stubs: { RiskMapCanvas: RiskMapCanvasStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  liveChart.value = undefined;
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, text: async () => texts[url.includes("china") ? "china" : "world"]! })));
});
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function ready(wrapper: ReturnType<typeof mount>) {
  await vi.waitFor(() => expect(wrapper.find("[data-map-canvas]").exists()).toBe(true));
}

function option(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent({ name: "RiskMapCanvas" }).props("option") as {
    aria: { label: { description: string } };
    geo: { zoom: number; center: number[] }[];
    series: { id: string; data: { count?: string; coords?: number[][] }[] }[];
  };
}

describe("risk map component lifecycle", () => {
  it("defaults to China, renders real registered assets and caches both views across stats refreshes", async () => {
    const wrapper = render();
    await ready(wrapper);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("本地离线边界");
    expect(wrapper.text()).toContain("7");
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe("中国");
    expect(wrapper.findAll(".map-scope button")[1]!.attributes("aria-pressed")).toBe("false");

    await wrapper.findAll(".map-scope button")[1]!.trigger("click");
    await ready(wrapper);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe("世界");
    await wrapper.findAll(".map-scope button")[0]!.trigger("click");
    await ready(wrapper);
    expect(fetch).toHaveBeenCalledTimes(2);

    const instance = wrapper.getComponent({ name: "RiskMapCanvas" }).vm;
    vi.useFakeTimers();
    for (let tick = 0; tick < 3; tick++) {
      await vi.advanceTimersByTimeAsync(10_000);
      await wrapper.setProps({ regions: [{ regionCode: "CN-31", requestCount: String(tick + 9) }] });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("11");
    expect(wrapper.getComponent({ name: "RiskMapCanvas" }).vm).toBe(instance);
    const base = riskMapGeoCenter(chinaGeo);
    expect(option(wrapper).geo.every((item) => item.zoom === 1 && item.center[0] === base[0] && item.center[1] === base[1])).toBe(true);
  });

  it("renders neutral boundaries for unsafe counts while preserving exact labels and unplaced sources", async () => {
    const wrapper = render();
    await ready(wrapper);
    await wrapper.setProps({
      regions: [
        { regionCode: "CN-31", requestCount: "9007199254740993" },
        { regionCode: "CN", requestCount: "5" },
        { regionCode: "UNKNOWN", requestCount: "2" },
        { regionCode: "INTERNAL", requestCount: "3" },
      ],
    });
    expect(wrapper.text()).toContain("超出安全绘图精度");
    expect(wrapper.text()).toContain("9,007,199,254,740,993");
    expect(wrapper.text()).toContain("中国来源缺省份");
    expect(wrapper.text()).toContain("UNKNOWN");
    expect(wrapper.text()).toContain("INTERNAL");
    expect(option(wrapper).aria.label.description).toContain("超出安全绘图精度");
    expect(option(wrapper).series[0]!.data).toEqual([]);
  });

  it("draws static directed arrows and exact counts from real coordinates", async () => {
    const wrapper = render();
    await ready(wrapper);
    await wrapper.setProps({
      regions: [{ regionCode: "CN-44", requestCount: "90071992547409930" }, { regionCode: "CN-31", requestCount: "9" }],
      serverTarget: { configured: true, alias: "target", regionCode: "CN-31", longitude: "121.47", latitude: "31.23", locationSource: "MANUAL", locationStatus: "LOCATED", resolveStatus: "NOT_ATTEMPTED", resolvedAt: null, updatedAt: null },
    });
    const flows = option(wrapper).series.find((item) => item.id === "risk-map-flows")!;
    expect(flows.data[0]!.coords!.at(-1)).toEqual([121.47, 31.23]);
    expect(flows.data[0]!.count).toBe("90071992547409930");
    expect(wrapper.text()).toContain("同地域汇聚");
    expect(wrapper.text()).toContain("不是真实网络路径");
  });

  it("falls back to 2D without WebGL, keeps full viewport, ESC and only real boundary drilldown", async () => {
    const wrapper = render();
    await ready(wrapper);
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
    expect(wrapper.text()).toContain("当前浏览器不支持 WebGL");
    expect(option(wrapper).geo).toHaveLength(1);
    await wrapper.findAll(".map-scope button").find((button) => button.text() === "3D")!.trigger("click");
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
    expect(wrapper.findAll(".map-scope button").find((button) => button.text() === "2D")!.attributes("aria-pressed")).toBe("true");
    expect(option(wrapper).geo).toHaveLength(1);

    await wrapper.findAll("button").find((button) => button.attributes("aria-label") === "地图全屏")!.trigger("click");
    expect(wrapper.classes()).toContain("risk-map-expanded");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(wrapper.classes()).not.toContain("risk-map-expanded");

    const chart = wrapper.getComponent({ name: "RiskMapCanvas" });
    chart.vm.$emit("regionSelect", "CN-31");
    chart.vm.$emit("regionSelect", "UNKNOWN");
    expect(wrapper.emitted("regionSelect")).toEqual([["CN-31", "china"]]);
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.find('button[aria-label="查看地图操作说明"]').exists()).toBe(false);
    expect(chart.props("height")).toBe("520px");
    expect(wrapper.text()).toContain("二维俯视");
  });

  it("keeps a clear failure state after both sources fail without retrying on view toggles", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const wrapper = render();
    await vi.waitFor(() => expect(wrapper.text()).toContain("地图暂不可用"));
    expect(fetch).toHaveBeenCalledTimes(2);
    await wrapper.findAll(".map-scope button").find((button) => button.text() === "2D")!.trigger("click");
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels map fetch and suppresses late rendering when removed by permission loss or unmount", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
    const wrapper = render();
    await flushPromises();
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    wrapper.unmount();
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("moves backdrop status into the host and keeps controls and drilldown available", async () => {
    const wrapper = render(true);
    await ready(wrapper);
    expect(wrapper.find('button[aria-label="地图全屏"]').exists()).toBe(false);
    expect(wrapper.find(".access-map-caption").exists()).toBe(true);
    expect(wrapper.text()).toContain("二维俯视");
    const chart = wrapper.getComponent({ name: "RiskMapCanvas" });
    expect(chart.props("height")).toBe("100%");
    chart.vm.$emit("regionSelect", "CN-31");
    expect(wrapper.emitted("regionSelect")?.[0]).toEqual(["CN-31", "china"]);
  });

  it("loads the selected province detail, replaces its boundary and only highlights verified codes", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      return {
        ok: true,
        text: async () => url.includes("risk-detail-v2") ? detailChinaText : texts[url.includes("china") ? "china" : "world"]!,
      } as Response;
    });
    const wrapper = mount(RiskRegionMap, {
      props: {
        regions: [{ regionCode: "CN-31", requestCount: "7" }],
        selected: { code: "CN-31", kind: "cities" },
        detail: {
          coverage: { status: "COLLECTED", startedAt: null, collectedRequestCount: "7", totalRequestCount: "7", uncollectedRequestCount: "0" },
          collectedRequestCount: "7",
          identifiedRequestCount: "7",
          unknownRequestCount: "0",
          coverageRate: "1",
          items: [{ cityCode: "310000", cityName: "上海市", requestCount: "7" }],
        },
      },
      global: { stubs: { RiskMapCanvas: RiskMapCanvasStub } },
    });
    wrappers.push(wrapper);
    await ready(wrapper);
    await vi.waitFor(() => expect(wrapper.emitted("detailLabels")?.at(-1)?.[0]).toMatchObject({ kind: "cities", regionCode: "CN-31" }));
    const labels = wrapper.emitted("detailLabels")!.at(-1)![0] as { labels: Record<string, { label: string; nameZh: boolean }> };
    expect(labels.labels["310000"]).toEqual({ label: "上海市", nameZh: true });
    const chart = wrapper.getComponent({ name: "RiskMapCanvas" });
    const rows = (chart.props("option") as { series: { data: { name: string; detail?: boolean; count?: string }[] }[] }).series[0]!.data;
    expect(rows.map((row) => row.name)).not.toContain("CN-31");
    expect(rows.find((row) => row.detail)).toMatchObject({ name: "310000", count: "7" });

    chart.vm.$emit("regionSelect", "310000");
    await flushPromises();
    expect(wrapper.emitted("detailSelect")?.at(-1)).toEqual(["310000", "上海市"]);
    expect(wrapper.text()).toContain("已选细分：上海市 · 仅高亮，不改变筛选。");
    expect(wrapper.emitted("regionSelect")).toBeUndefined();
  });

  it("shows a missing detail state without fetching or inventing statistics", async () => {
    const wrapper = mount(RiskRegionMap, {
      props: {
        regions: [{ regionCode: "CN-31", requestCount: "7" }],
        selected: { code: "CN-99", kind: "cities" },
        detail: {
          coverage: { status: "COLLECTED", startedAt: null, collectedRequestCount: "7", totalRequestCount: "7", uncollectedRequestCount: "0" },
          collectedRequestCount: "7",
          identifiedRequestCount: "7",
          unknownRequestCount: "0",
          coverageRate: "1",
          items: [{ cityCode: "310000", cityName: "上海市", requestCount: "7" }],
        },
      },
      global: { stubs: { RiskMapCanvas: RiskMapCanvasStub } },
    });
    wrappers.push(wrapper);
    await ready(wrapper);
    expect(wrapper.text()).toContain("暂无细分边界");
    expect(fetch).toHaveBeenCalledTimes(1);
    const rows = (wrapper.getComponent({ name: "RiskMapCanvas" }).props("option") as { series: { data: { detail?: boolean }[] }[] }).series[0]!.data;
    expect(rows.some((row) => row.detail)).toBe(false);
  });

  it("keeps uncoded boundaries visible but refuses to select them as verified cities", async () => {
    const hainanText = readFileSync("public/maps/risk-detail-v2/china/460000.geojson", "utf8");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      return {
        ok: true,
        text: async () => url.includes("risk-detail-v2") ? hainanText : texts[url.includes("china") ? "china" : "world"]!,
      } as Response;
    });
    const wrapper = mount(RiskRegionMap, {
      props: {
        regions: [{ regionCode: "CN-46", requestCount: "7" }],
        selected: { code: "CN-46", kind: "cities" },
      },
      global: { stubs: { RiskMapCanvas: RiskMapCanvasStub } },
    });
    wrappers.push(wrapper);
    await ready(wrapper);
    await vi.waitFor(() => {
      const rows = (wrapper.getComponent({ name: "RiskMapCanvas" }).props("option") as { series: { data: { detail?: boolean }[] }[] }).series[0]!.data;
      expect(rows.some((row) => row.detail)).toBe(true);
    });
    const chart = wrapper.getComponent({ name: "RiskMapCanvas" });
    chart.vm.$emit("regionSelect", "临高县");
    chart.vm.$emit("regionSelect", "460100");
    await flushPromises();
    expect(wrapper.emitted("detailSelect")).toEqual([["460100", "海口市"]]);
    expect(wrapper.emitted("regionSelect")).toBeUndefined();
  });

  it("shows verified Chinese city labels only after the 2D viewport reaches about 1.8x and clears them on reset", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("risk-detail-v2")) {
        const match = /china\/(\d+)\.geojson/.exec(url);
        if (!match) throw new Error(`unexpected detail URL: ${url}`);
        return {
          ok: true,
          text: async () => readFileSync(`public/maps/risk-detail-v2/china/${match[1]}.geojson`, "utf8"),
        } as Response;
      }
      return { ok: true, text: async () => texts[url.includes("china") ? "china" : "world"]! } as Response;
    });
    const wrapper = mount(RiskRegionMap, {
      props: { regions: [{ regionCode: "CN-31", requestCount: "7" }] },
      global: { stubs: { Echarts: VChartStub } },
    });
    wrappers.push(wrapper);
    await vi.waitFor(() => expect(wrapper.find(".risk-map-canvas").exists()).toBe(true));
    const canvas = wrapper.getComponent(RiskMapCanvas);
    const citySeries = () => (canvas.props("option") as {
      series: { id: string; data: { name: string; label: string; parentCode: string }[] }[];
    }).series.find((item) => item.id === "risk-map-city-labels")!;
    const detailCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("risk-detail-v2"));

    liveChart.value = {
      getWidth: () => 600,
      getHeight: () => 400,
      convertToPixel: (_finder: unknown, point: [number, number]) => [
        10 + ((point[0] - 73) / 62) * 580,
        10 + ((54 - point[1]) / 36) * 380,
      ],
    } as unknown as EChartsType;
    await nextTick();
    await nextTick();
    await flushPromises();
    expect(detailCalls()).toHaveLength(0);
    expect(citySeries().data).toEqual([]);

    const zoomIn = wrapper.find('button[aria-label="放大"]');
    for (let click = 0; click < 3; click++) await zoomIn.trigger("click");
    await vi.waitFor(() => expect(detailCalls().length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(citySeries().data.length).toBeGreaterThan(0));
    for (const row of citySeries().data) {
      expect(row.label).toMatch(/[\u4e00-\u9fa5]/);
      expect(row.label).not.toMatch(/CN-/);
      expect(row.parentCode).toMatch(/^CN-\d{2}$/);
    }

    await wrapper.find('button[aria-label="复位视图"]').trigger("click");
    await vi.waitFor(() => expect(citySeries().data).toEqual([]));
    const loadedForChina = detailCalls().length;

    await wrapper.findAll(".map-scope button")[1]!.trigger("click");
    await vi.waitFor(() => expect(wrapper.find('.risk-map-canvas[data-map-kind="world"]').exists()).toBe(true));
    const worldCanvas = wrapper.getComponent(RiskMapCanvas);
    const worldCity = (worldCanvas.props("option") as {
      series: { id: string; data: unknown[] }[];
    }).series.find((item) => item.id === "risk-map-city-labels")!;
    expect(worldCanvas.props("kind")).toBe("world");
    expect(worldCity.data).toEqual([]);
    expect(detailCalls()).toHaveLength(loadedForChina);
  });
});
