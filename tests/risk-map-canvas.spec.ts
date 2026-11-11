import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RiskMapCanvas from "@/components/risk/RiskMapCanvas.vue";

const VChartStub = {
  name: "Echarts",
  props: ["option", "initOptions", "updateOptions", "ariaLabel"],
  emits: ["click"],
  template: "<div class=\"vchart-stub\" />",
};

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

describe("RiskMapCanvas vue-echarts wrapper", () => {
  it("initializes one Canvas instance and forwards controlled option updates", () => {
    const wrapper = render();
    const chart = wrapper.getComponent({ name: "Echarts" });
    expect(chart.props("option")).toEqual({ geo: [{ map: "risk-v1-china" }], series: [] });
    expect(chart.props("initOptions")).toMatchObject({ renderer: "canvas" });
    expect(chart.props("updateOptions")).toMatchObject({ notMerge: false, replaceMerge: ["series", "geo"], lazyUpdate: true });
    expect(chart.props("ariaLabel")).toContain("中国省级");
    expect(wrapper.attributes("data-map-kind")).toBe("china");
    expect(wrapper.attributes("style")).toContain("520px");
  });

  it("emits only string map names so drilldown cannot use injected or unknown values", async () => {
    const wrapper = render();
    const chart = wrapper.getComponent({ name: "Echarts" });
    chart.vm.$emit("click", { name: "CN-31" });
    chart.vm.$emit("click", { name: 42 });
    chart.vm.$emit("click", {});
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("regionSelect")).toEqual([["CN-31"]]);
  });
});
