import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Panel from "@/components/risk/GeoObservationPanel.vue";
import { geoMetricText, geoObservationSections, geoStateText } from "@/utils/geoObservation";
import type { GeoObservation } from "@/types/geoObservation";
import geoFixture from "./fixtures/geo-status-example.json";
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
    const wrapper = mount(Panel, { props: { unavailable: true, sections: [{ title: "<img src=x>", metrics: [{ label: "队列深度", value: "0" }, { label: "最老年龄", value: null, unit: "秒" }] }] } });
    expect(wrapper.findAll('[role="alert"], [role="status"]').map((notice) => notice.text())).toEqual(["更新失败，显示上次结果"]); expect(wrapper.text()).toContain("队列深度"); expect(wrapper.text()).toContain("未知"); expect(wrapper.find("img").exists()).toBe(false);
    wrapper.unmount();
  });
  it.each([[false, "暂无观测结果"], [true, "观测服务不可用"]] as const)("shows one empty notice when unavailable=%s", (unavailable, message) => {
    const wrapper = mount(Panel, { props: { unavailable, sections: [] } });
    expect(wrapper.text()).toBe(message);
    wrapper.unmount();
  });
  it("keeps full diagnostic identifiers and only shows reported failure codes", () => {
    const fixture: GeoObservation = structuredClone(geoFixture);
    fixture.providers.DBIP.databaseVersion = "dbip:DBIP-City-Lite:" + "abcdef01".repeat(12);
    fixture.providers.DBIP.digest = "0123abcd".repeat(8);
    fixture.providers.DBIP.updateFailureCode = "CHECKSUM_MISMATCH";
    const wrapper = mount(Panel, { props: { sections: geoObservationSections(fixture) } });
    expect(wrapper.text()).toContain(fixture.providers.DBIP.databaseVersion);
    expect(wrapper.text()).toContain(fixture.providers.DBIP.digest);
    expect(wrapper.text()).toContain("CHECKSUM_MISMATCH");
    expect(wrapper.findAll("dt").filter((label) => label.text() === "失败分类")).toHaveLength(1);
    wrapper.unmount();
  });
});
