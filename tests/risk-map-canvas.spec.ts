import { mount } from "@vue/test-utils";
import type { EChartsType } from "echarts/core";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskMapCanvas from "@/components/risk/RiskMapCanvas.vue";

const liveChart = shallowRef<EChartsType>();

// Mirrors vue-echarts 8.3.2's public contract: no `ready` emit, but the
// component exposes a readonly `chart` getter on its public instance.
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

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  readonly callback: ResizeObserverCallback;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly unobserve = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }
}

function render() {
  return mount(RiskMapCanvas, {
    props: {
      option: { geo: [{ map: "risk-v1-china" }], series: [] },
      accessibleLabel: "中国省级请求数地图",
      kind: "china",
      height: "520px",
    },
    global: { stubs: { Echarts: VChartStub } },
  });
}

beforeEach(() => {
  liveChart.value = undefined;
  ResizeObserverStub.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RiskMapCanvas vue-echarts wrapper", () => {
  it("initializes one Canvas instance and forwards controlled option updates", () => {
    const wrapper = render();
    const chart = wrapper.getComponent(VChartStub);
    expect(chart.props("option")).toEqual({ geo: [{ map: "risk-v1-china" }], series: [] });
    expect(chart.props("initOptions")).toMatchObject({ renderer: "canvas" });
    expect(chart.props("updateOptions")).toMatchObject({ notMerge: false, replaceMerge: ["series", "geo"], lazyUpdate: true });
    expect(chart.props("ariaLabel")).toContain("中国省级");
    expect(wrapper.attributes("data-map-kind")).toBe("china");
    expect(wrapper.attributes("style")).toContain("520px");
  });

  it("emits only string map names so drilldown cannot use injected or unknown values", async () => {
    const wrapper = render();
    const chart = wrapper.getComponent(VChartStub);
    chart.vm.$emit("click", { name: "CN-31" });
    chart.vm.$emit("click", { name: 42 });
    chart.vm.$emit("click", {});
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("regionSelect")).toEqual([["CN-31"]]);
  });

  it("publishes the live chart from the exposed chart ref across init and re-initialization", async () => {
    const wrapper = render();
    expect(wrapper.emitted("chartReady")).toBeUndefined();

    const first = { id: "first" } as unknown as EChartsType;
    liveChart.value = first;
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("chartReady")).toEqual([[first]]);

    liveChart.value = undefined;
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("chartReady")).toEqual([[first]]);

    const second = { id: "second" } as unknown as EChartsType;
    liveChart.value = second;
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("chartReady")).toEqual([[first], [second]]);
  });

  it("signals container size changes and disconnects the observer on unmount", async () => {
    const wrapper = render();
    const observer = ResizeObserverStub.instances.at(-1)!;
    expect(observer.observe).toHaveBeenCalledWith(wrapper.element);

    observer.callback([], observer as unknown as ResizeObserver);
    await nextTick();
    expect(wrapper.emitted("viewportChange")).toHaveLength(1);

    wrapper.unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
