import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import { riskMapAssets, validateRiskGeo } from "@/utils/riskMap";
import { riskMapGeoCenter } from "@/utils/riskMapView";

const texts = Object.fromEntries(riskMapAssets.map((asset) => [asset.kind, readFileSync(`public/${asset.localPath}`, "utf8")]));
const chinaGeo = validateRiskGeo("china", JSON.parse(texts.china!));
const wrappers: ReturnType<typeof mount>[] = [];
const RiskMapCanvasStub = {
  name: "RiskMapCanvas",
  props: ["option", "accessibleLabel", "kind", "height"],
  emits: ["regionSelect"],
  template: "<div data-map-canvas />",
};

function render(backdrop = false) {
  const wrapper = mount(RiskRegionMap, {
    props: { regions: [{ regionCode: "CN-31", requestCount: "7" }], backdrop },
    global: { stubs: { RiskMapCanvas: RiskMapCanvasStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
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

  it("supports fixed-view 2D/3D, full viewport, ESC and only real boundary drilldown", async () => {
    const wrapper = render();
    await ready(wrapper);
    expect(wrapper.find(".stage-3d").exists()).toBe(true);
    expect(option(wrapper).geo).toHaveLength(3);
    await wrapper.findAll(".map-scope button").find((button) => button.text() === "2D")!.trigger("click");
    expect(wrapper.find(".stage-2d").exists()).toBe(true);
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
    expect(wrapper.text()).toContain("固定视角示意");
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
    expect(wrapper.text()).toContain("立体固定视角");
    const chart = wrapper.getComponent({ name: "RiskMapCanvas" });
    expect(chart.props("height")).toBe("100%");
    chart.vm.$emit("regionSelect", "CN-31");
    expect(wrapper.emitted("regionSelect")?.[0]).toEqual(["CN-31", "china"]);
  });
});
