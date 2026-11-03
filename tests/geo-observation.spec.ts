import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Panel from "@/components/risk/GeoObservationPanel.vue";
import { geoMetricText, geoStateText } from "@/utils/geoObservation";
describe("geo observation presentation independent of pending wire", () => {
  it("recognizes only frozen offline statuses", () => {
    expect(geoStateText("SUCCESS")).toBe("离线地域结果可用");
    expect(geoStateText("CONFLICT")).toBe("来源编码冲突");
    expect(geoStateText("READY")).toBe("不支持的地域状态");
  });
  it("distinguishes zero and unknown while preserving exact cumulative counts", () => {
    expect(geoMetricText("0")).toBe("0"); expect(geoMetricText(null)).toBe("未知"); expect(geoMetricText("9007199254740993")).toBe("9,007,199,254,740,993");
  });
  it("shows unavailable/stale alongside retained data and safely interpolates text", () => {
    const wrapper = mount(Panel, { props: { unavailable: true, stale: true, sections: [{ title: "<img src=x>", metrics: [{ label: "队列深度", value: "0" }, { label: "最老年龄", value: null, unit: "秒" }] }] } });
    expect(wrapper.text()).toContain("观测服务不可用"); expect(wrapper.text()).toContain("上次成功结果"); expect(wrapper.text()).toContain("队列深度"); expect(wrapper.text()).toContain("未知"); expect(wrapper.find("img").exists()).toBe(false);
    wrapper.unmount();
  });
});
