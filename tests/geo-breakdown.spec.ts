import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Panel from "@/components/risk/GeoBreakdownPanel.vue";
import type { GeoBreakdown } from "@/types/geoDrilldown";
function fixture(): GeoBreakdown { return { coverage: { status: "PARTIAL", startedAt: "2026-10-31T00:00:00+08:00", collectedRequestCount: "5", totalRequestCount: "10", uncollectedRequestCount: "5" }, collectedRequestCount: "5", identifiedRequestCount: "3", unknownRequestCount: "2", coverageRate: "0.600000", items: [{ provinceCode: null, provinceName: "Verified subdivision name", requestCount: "9007199254740993" }] }; }
describe("V1.2 breakdown presentation boundary", () => {
  it("keeps background refresh quiet while showing loading for first and changed selections", async () => {
    const wrapper = mount(Panel, { props: { kind: "subdivisions", selectedCode: "US", loading: true } });
    expect(wrapper.text()).toContain("正在读取细分");
    await wrapper.setProps({ data: fixture() });
    expect(wrapper.text()).not.toContain("正在读取细分");
    expect(wrapper.text()).toContain("Verified subdivision name");
    await wrapper.setProps({ stale: true });
    expect(wrapper.text()).toContain("正在读取细分");
    expect(wrapper.text()).toContain("当前筛选尚未生效");
    await wrapper.setProps({ loading: false, failed: true });
    expect(wrapper.text()).toContain("细分读取失败");
    wrapper.unmount();
  });
  it("keeps city rows visible in compact mode and moves codes and collection prose out of the card", () => {
    const data = fixture(); data.items = [{ cityCode: "110000", cityName: "北京市", requestCount: "9" }];
    const wrapper = mount(Panel, { props: { kind: "cities", selectedCode: "CN-11", data, compact: true } });
    expect(wrapper.get('tbody').text()).toContain("北京市9"); expect(wrapper.get('thead').text()).not.toContain("编码");
    expect(wrapper.text()).not.toContain("采集起点"); expect(wrapper.find('button[aria-label="查看地域覆盖详细说明"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it("retains verified subdivision names without inventing codes or losing integer precision", () => { const wrapper = mount(Panel, { props: { kind: "subdivisions", selectedCode: "US", data: fixture() } }); expect(wrapper.text()).toContain("Verified subdivision name"); expect(wrapper.text()).toContain("无已验证编码"); expect(wrapper.text()).toContain("9,007,199,254,740,993"); expect(wrapper.text()).toContain("混合范围"); wrapper.unmount(); });
  it("does not equate uncollected history with unknown or zero", () => { const data = fixture(); data.coverage.status = "NOT_COLLECTED"; const wrapper = mount(Panel, { props: { kind: "cities", selectedCode: "CN-31", data } }); expect(wrapper.text()).toContain("历史未采集细分"); expect(wrapper.text()).toContain("不解释为零请求"); expect(wrapper.text()).not.toContain("已采集但细分未知："); wrapper.unmount(); });
  it("keeps a null zero-denominator rate distinct and retains stale successful output", () => { const data = fixture(); data.coverageRate = null; data.unknownRequestCount = "0"; const wrapper = mount(Panel, { props: { kind: "subdivisions", selectedCode: "US", data, failed: true, stale: true } }); expect(wrapper.text()).toContain("无已采集分母"); expect(wrapper.text()).toContain("当前筛选尚未生效"); expect(wrapper.text()).toContain("Verified subdivision name"); wrapper.unmount(); });
});
it("renders dashboard bars without adding a coverage Tips button or losing unsafe counts", () => {
 const w=mount(Panel,{props:{kind:"subdivisions",selectedCode:"US",data:fixture(),compact:true,bars:true}});
 expect(w.find('button[aria-label="查看地域覆盖详细说明"]').exists()).toBe(false);
 expect(w.get('.risk-bars').text()).toContain('9,007,199,254,740,993');expect(w.find('.risk-bar-track').exists()).toBe(false);
 expect(w.text()).toContain('识别率');w.unmount();
});
