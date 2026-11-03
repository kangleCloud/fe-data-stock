import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Panel from "@/components/risk/GeoBreakdownPanel.vue";
import type { GeoBreakdown } from "@/types/geoDrilldown";
function fixture(): GeoBreakdown { return { coverage: { status: "PARTIAL", startedAt: "2026-10-31T00:00:00+08:00", collectedRequestCount: "5", totalRequestCount: "10", uncollectedRequestCount: "5" }, collectedRequestCount: "5", identifiedRequestCount: "3", unknownRequestCount: "2", coverageRate: "0.600000", items: [{ provinceCode: null, provinceName: "Verified subdivision name", requestCount: "9007199254740993" }] }; }
describe("V1.2 breakdown presentation boundary", () => {
  it("retains verified subdivision names without inventing codes or losing integer precision", () => { const wrapper = mount(Panel, { props: { kind: "subdivisions", selectedCode: "US", data: fixture() } }); expect(wrapper.text()).toContain("Verified subdivision name"); expect(wrapper.text()).toContain("无已验证编码"); expect(wrapper.text()).toContain("9,007,199,254,740,993"); expect(wrapper.text()).toContain("混合范围"); wrapper.unmount(); });
  it("does not equate uncollected history with unknown or zero", () => { const data = fixture(); data.coverage.status = "NOT_COLLECTED"; const wrapper = mount(Panel, { props: { kind: "cities", selectedCode: "CN-31", data } }); expect(wrapper.text()).toContain("历史未采集细分"); expect(wrapper.text()).toContain("不解释为零请求"); expect(wrapper.text()).not.toContain("已采集但细分未知："); wrapper.unmount(); });
  it("keeps a null zero-denominator rate distinct and retains stale successful output", () => { const data = fixture(); data.coverageRate = null; data.unknownRequestCount = "0"; const wrapper = mount(Panel, { props: { kind: "subdivisions", selectedCode: "US", data, failed: true, stale: true } }); expect(wrapper.text()).toContain("无已采集分母"); expect(wrapper.text()).toContain("当前筛选尚未生效"); expect(wrapper.text()).toContain("Verified subdivision name"); wrapper.unmount(); });
});
