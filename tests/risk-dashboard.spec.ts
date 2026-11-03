import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskDashboard from "@/views/risk/dashboard/index.vue";
import { useAuthStore } from "@/stores/auth";
import { getGeoObservation } from "@/api/geoObservation";
import geoFixture from "./fixtures/geo-status-example.json";
import { riskFixture } from "./fixtures/risk";
import wire from "./fixtures/risk-v1-wire.json";
const api = vi.hoisted(() => ({ getRiskDashboard: vi.fn(), getRiskInterfaces: vi.fn(), getRiskExceptions: vi.fn(), getRiskArchives: vi.fn() }));
vi.mock("@/api/risk", () => api);
vi.mock("@/api/geoObservation", () => ({ getGeoObservation: vi.fn().mockRejectedValue(new Error("offline observation")) }));
const wrappers: ReturnType<typeof mount>[] = [];
function render(permissions = ["system:risk:view"]) {
  const pinia = createPinia(); setActivePinia(pinia); useAuthStore().permissionCodes = permissions;
  const wrapper = mount(RiskDashboard, { global: { plugins: [pinia], stubs: { BaseChart: true, RiskRegionMap: true } } }); wrappers.push(wrapper); return wrapper;
}
beforeEach(() => {
  vi.mocked(getGeoObservation).mockReset().mockRejectedValue(new Error("offline observation"));
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T04:00:00Z"));
  Object.values(api).forEach((method) => method.mockReset());
  api.getRiskDashboard.mockResolvedValue(riskFixture());
  for (const method of [api.getRiskInterfaces, api.getRiskExceptions, api.getRiskArchives]) method.mockResolvedValue({ list: [], total: 0 });
});
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });
async function clickText(wrapper: ReturnType<typeof mount>, text: string) { await wrapper.findAll("button").find((button) => button.text() === text)!.trigger("click"); await flushPromises(); }
describe("real risk dashboard component", () => {
  it("makes no requests without page permission even when exception permission exists", async () => {
    const wrapper = render(["system:risk:exception:view"]); await flushPromises();
    expect(wrapper.text()).toContain("无系统风控查看权限");
    expect(Object.values(api).every((method) => method.mock.calls.length === 0)).toBe(true);
  });
  it("shares one polling cycle and preserves observation on independent geo failure", async () => {
    vi.mocked(getGeoObservation).mockResolvedValue(geoFixture);
    const wrapper = render(); await flushPromises(); expect(wrapper.text()).toContain(geoFixture.cacheVersion); expect(getGeoObservation).toHaveBeenCalledTimes(1);
    vi.mocked(getGeoObservation).mockRejectedValue(new Error("offline")); await vi.advanceTimersByTimeAsync(10_000); await flushPromises();
    expect(getGeoObservation).toHaveBeenCalledTimes(2); expect(api.getRiskDashboard).toHaveBeenCalledTimes(2); expect(wrapper.text()).toContain("观测服务不可用"); expect(wrapper.text()).toContain(geoFixture.cacheVersion);
    wrapper.unmount(); await vi.advanceTimersByTimeAsync(30_000); expect(getGeoObservation).toHaveBeenCalledTimes(2);
  });
  it("never requests observations without risk permission", async () => {
    render([]); await flushPromises(); expect(getGeoObservation).not.toHaveBeenCalled();
  });
  it("shows exact long counts, separate unknown/internal, safe text and truthful map fallback", async () => {
    const wrapper = render(); await flushPromises();
    expect(wrapper.text()).toContain("9,007,199,254,740,993"); expect(wrapper.text()).toContain("未知来源（UNKNOWN）"); expect(wrapper.text()).toContain("内部来源（INTERNAL）");
    expect(wrapper.find("risk-region-map-stub").exists()).toBe(true); expect(wrapper.text()).toContain("数据不完整"); expect(wrapper.text()).toContain("缺少采集心跳"); expect(wrapper.text()).toContain("不含499");
    expect(wrapper.find("img").exists()).toBe(false); expect(wrapper.text()).toContain("<img src=x onerror=alert(1)>");
    expect(wrapper.text()).toContain("超出安全绘图精度");
    expect(api.getRiskExceptions).not.toHaveBeenCalled(); expect(api.getRiskArchives).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000); expect(api.getRiskDashboard).toHaveBeenCalledTimes(2); expect(api.getRiskInterfaces).toHaveBeenCalledTimes(1);
  });
  it("reads restricted details only on selection and resets pagination for filters", async () => {
    const wrapper = render(["system:risk:view", "system:risk:exception:view", "system:risk:archive:view"]); await flushPromises();
    expect(api.getRiskExceptions).not.toHaveBeenCalled(); expect(api.getRiskArchives).not.toHaveBeenCalled();
    await clickText(wrapper, "异常汇总"); expect(api.getRiskExceptions).toHaveBeenCalledTimes(1);
    await clickText(wrapper, "归档批次"); expect(api.getRiskArchives).toHaveBeenCalledTimes(1);
    await clickText(wrapper, "昨日"); expect(api.getRiskDashboard).toHaveBeenLastCalledWith({ startDate: "2026-10-26", endDate: "2026-10-26" });
    expect(api.getRiskArchives).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 1 }));
  });
  it("retains last successful summary after failure and labels stale filters", async () => {
    const wrapper = render(); await flushPromises(); api.getRiskDashboard.mockRejectedValue(new Error("offline"));
    await clickText(wrapper, "昨日"); expect(wrapper.text()).toContain("汇总刷新失败"); expect(wrapper.text()).toContain("9,007,199,254,740,993"); expect(wrapper.text()).toContain("当前筛选尚未加载成功");
  });
  it("renders EMPTY and missing samples distinctly without invented metrics", async () => {
    const empty = riskFixture(); empty.trend = []; empty.regions = []; empty.dailySources = []; empty.topInterfaces = []; empty.requestTypes = []; empty.statuses = []; empty.quality = [];
    empty.metrics.requestCount = "0"; empty.metrics.httpErrorRate = null; empty.metrics.restP95Micros = null; empty.metrics.sseP95Micros = null; empty.metadata.completeness = "EMPTY";
    api.getRiskDashboard.mockResolvedValue(empty);
    const wrapper = render(); await flushPromises(); expect(wrapper.text()).toContain("范围内无有效请求"); expect(wrapper.text()).toContain("无有效样本"); expect(wrapper.text()).toContain("无有效请求"); expect(wrapper.text()).toContain("无每日来源样本");
  });
  it("stops polling while hidden and resumes once visible", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    render(); await flushPromises(); visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(30_000); expect(api.getRiskDashboard).toHaveBeenCalledTimes(1);
    visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); await flushPromises(); expect(api.getRiskDashboard).toHaveBeenCalledTimes(2);
  });
  it("renders the frozen shared dashboard and independent SSE latency fixture", async () => {
    api.getRiskDashboard.mockResolvedValue(wire.dashboardExample);
    api.getRiskInterfaces.mockResolvedValue({ list: [wire.sseInterfaceExample], total: 1 });
    const wrapper = render(); await flushPromises();
    expect(wrapper.text()).toContain("数据就绪");
    expect(wrapper.text()).toContain("无有效样本");
    expect(wrapper.text()).toContain("SSE时长P95近似");
    expect(wrapper.text()).toContain(wire.sseInterfaceExample.pathTemplate);
  });
  it("shows exception aggregates and archive failures only in authorized selected detail", async () => {
    api.getRiskExceptions.mockResolvedValue({ list: [{ id: "9007199254740993", minuteAt: "2026-10-27T12:00:00.000+08:00", regionCode: "UNKNOWN", requestType: "API", pathTemplate: "/api/example", status: "502", reasonCode: "HTTP_5XX", count: "9007199254740993", firstAt: "first", lastAt: "last" }], total: 12 });
    api.getRiskArchives.mockResolvedValue({ list: [{ id: "9007199254740993", batchId: "a-batch", businessDate: "2026-10-26", state: "FAILED", recordCount: "7", checksum: "abc", committedAt: null, cleanedAt: null, failureCode: "REDIS_CLEAN_FAILED" }], total: 1 });
    const wrapper = render(["system:risk:view", "system:risk:exception:view", "system:risk:archive:view"]); await flushPromises();
    await clickText(wrapper, "异常汇总"); expect(wrapper.text()).toContain("HTTP_5XX");
    await clickText(wrapper, "下一页"); expect(api.getRiskExceptions).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }));
    await clickText(wrapper, "归档批次"); expect(wrapper.text()).toContain("REDIS_CLEAN_FAILED"); expect(wrapper.text()).not.toContain("HTTP_5XX");
    useAuthStore().permissionCodes = ["system:risk:view"]; await flushPromises();
    expect(wrapper.text()).not.toContain("REDIS_CLEAN_FAILED");
    expect(api.getRiskArchives).toHaveBeenCalledTimes(1);
  });
  it("does not query invalid dates and clears restricted data on permission revocation", async () => {
    const wrapper = render(["system:risk:view", "system:risk:exception:view"]); await flushPromises();
    await wrapper.find('input[type="date"]').setValue("2026-11-01"); await flushPromises();
    expect(api.getRiskDashboard).toHaveBeenCalledTimes(1); expect(wrapper.text()).toContain("开始日期不能晚于结束日期");
    useAuthStore().permissionCodes = []; await flushPromises(); expect(wrapper.text()).toContain("无系统风控查看权限");
    await vi.advanceTimersByTimeAsync(20_000); expect(api.getRiskExceptions).not.toHaveBeenCalled();
  });
});
