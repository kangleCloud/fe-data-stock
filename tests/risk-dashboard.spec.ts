import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RiskDashboard from "@/views/risk/dashboard/index.vue";
import { useAuthStore } from "@/stores/auth";
import { getGeoObservation } from "@/api/geoObservation";
import collector from "./fixtures/risk-collector-query.json";
import geoFixture from "./fixtures/geo-status-example.json";
import { riskFixture } from "./fixtures/risk";
const api = vi.hoisted(() => ({ getRiskDashboard: vi.fn(), getRiskInterfaces: vi.fn(), getRiskExceptions: vi.fn(), getRiskSources: vi.fn() }));
vi.mock("@/api/risk", () => api);
vi.mock("@/api/geoObservation", () => ({ getGeoObservation: vi.fn().mockRejectedValue(new Error("offline observation")) }));
vi.mock("@/api/geoDrilldown", () => ({ getGeoCities: vi.fn().mockResolvedValue({ coverage: { status: "COLLECTED", startedAt: null, collectedRequestCount: "9", totalRequestCount: "9", uncollectedRequestCount: "0" }, collectedRequestCount: "9", identifiedRequestCount: "9", unknownRequestCount: "0", coverageRate: "1", items: [{ cityName: "北京市", requestCount: "9" }] }), getGeoSubdivisions: vi.fn() }));
const wrappers: ReturnType<typeof mount>[] = [];
function render(permissions = ["system:risk:view"]) {
  const pinia = createPinia(); setActivePinia(pinia); useAuthStore().permissionCodes = permissions;
  const wrapper = mount(RiskDashboard, { global: { plugins: [pinia], stubs: { BaseChart: true, RiskRegionMap: true, ElDrawer: { template: '<div><slot /></div>' }, RouterLink: { template: '<a><slot /></a>' } } } }); wrappers.push(wrapper); return wrapper;
}
beforeEach(() => {
  vi.mocked(getGeoObservation).mockReset().mockRejectedValue(new Error("offline observation"));
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T04:00:00Z"));
  Object.values(api).forEach((method) => method.mockReset());
  api.getRiskDashboard.mockResolvedValue(riskFixture());
  for (const method of [api.getRiskInterfaces, api.getRiskExceptions, api.getRiskSources]) method.mockResolvedValue({ list: [], total: 0 });
});
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });
async function clickText(wrapper: ReturnType<typeof mount>, text: string) { await wrapper.findAll("button").find((button) => button.text() === text || button.attributes("aria-label") === text)!.trigger("click"); await flushPromises(); }
describe("API access dashboard", () => {
  it("removes statistical Tips while preserving date and fullscreen controls", async () => {
    const w = render(); await flushPromises();
    expect(w.find('button[aria-label="查看统计口径"]').exists()).toBe(false);
    expect(w.find('input[aria-label="开始日期"]').exists()).toBe(true);
    expect(w.find('input[aria-label="结束日期"]').exists()).toBe(true);
    expect(w.find('button[aria-label="刷新"]').exists()).toBe(true);
  });
  it("requests fullscreen for the whole screen and exits through ESC", async () => {
    let active: Element | null = null;
    const oldElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    const oldRequest = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen');
    const oldExit = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
    const request = vi.fn(async function(this: HTMLElement) { active = this.closest(".access-screen"); document.dispatchEvent(new Event('fullscreenchange')); });
    const exit = vi.fn(async () => { active = null; document.dispatchEvent(new Event('fullscreenchange')); });
    Object.defineProperty(document,'fullscreenElement',{ configurable:true, get:()=>active });
    Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{ configurable:true, value:request });
    Object.defineProperty(document,'exitFullscreen',{ configurable:true, value:exit });
    try {
      const w=render(); await flushPromises(); await w.get('button[aria-label="整个大屏全屏"]').trigger('click'); await flushPromises();
      expect(active).toBe(w.get('main').element); expect(request).toHaveBeenCalledTimes(1);
      expect(w.find('button[aria-label="退出整个大屏全屏"]').exists()).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await flushPromises(); expect(exit).toHaveBeenCalledTimes(1); expect(active).toBeNull();
    } finally {
      for (const [target,key,descriptor] of [[document,'fullscreenElement',oldElement],[HTMLElement.prototype,'requestFullscreen',oldRequest],[document,'exitFullscreen',oldExit]] as const) {
        if(descriptor) Object.defineProperty(target,key,descriptor); else Reflect.deleteProperty(target,key);
      }
    }
  });
  it("renders the actual Collector/Java totals as six current KPIs", async () => {
    api.getRiskDashboard.mockResolvedValue(collector.dashboard);
    const w = render(); await flushPromises();
    const cards = w.findAll('.access-kpis article').map(card => card.text());
    expect(cards).toEqual(['请求总量12','成功请求7','失败请求3','失败率30.00%','来源 IP4','接口数2']);
    expect(w.text()).toContain('/api/行情/查询'); expect(w.text()).toContain('未知来源');
  });
  it("drills down from a region ranking without changing global filters", async () => {
    api.getRiskDashboard.mockResolvedValue(collector.dashboard);
    const w = render(); await flushPromises();
    const before = api.getRiskDashboard.mock.calls.length;
    await w.get('.access-bottom button.risk-bar-label').trigger('click'); await flushPromises();
    expect(w.text()).toContain('北京市');
    expect(api.getRiskDashboard).toHaveBeenCalledTimes(before);
    expect(w.get('.access-data-status').text()).toContain('数据完整性');
  });
  it("requires risk view before any request", async () => { const w = render(["system:risk:exception:view"]); await flushPromises(); expect(w.text()).toContain("无系统风控查看权限"); expect(api.getRiskDashboard).not.toHaveBeenCalled(); });
  it("shows exact counts and only loads detail or Geo on demand", async () => {
    const w = render(); await flushPromises(); expect(w.text()).toContain("9,007,199,254,740,993"); expect(w.text()).toContain("499"); expect(w.find("img").exists()).toBe(false);
    expect(api.getRiskInterfaces).not.toHaveBeenCalled(); expect(getGeoObservation).not.toHaveBeenCalled();
    await clickText(w,"接口明细"); expect(api.getRiskInterfaces).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000); expect(api.getRiskInterfaces).toHaveBeenCalledTimes(1); expect(api.getRiskDashboard).toHaveBeenCalledTimes(2);
  });
  it("preserves previous summary after failure", async () => { const w = render(); await flushPromises(); api.getRiskDashboard.mockRejectedValue(new Error("offline")); await clickText(w,"昨日"); expect(w.text()).toContain("汇总刷新失败"); expect(w.text()).toContain("9,007,199,254,740,993"); });
  it("keeps exception permission separate and supports source details", async () => { const w=render(["system:risk:view","system:risk:exception:view"]); await flushPromises(); await clickText(w,"失败请求"); expect(api.getRiskExceptions).toHaveBeenCalledTimes(1); await clickText(w,"来源 IP"); expect(api.getRiskSources).toHaveBeenCalledTimes(1); });
  it("fetches Geo only when diagnostics are opened", async () => { vi.mocked(getGeoObservation).mockResolvedValue(geoFixture); const w=render(); await flushPromises(); expect(getGeoObservation).not.toHaveBeenCalled(); await clickText(w,"Geo 诊断"); expect(getGeoObservation).toHaveBeenCalledTimes(1); });
  it("pauses while hidden and resumes when visible", async () => { let visibility: DocumentVisibilityState="visible"; vi.spyOn(document,"visibilityState","get").mockImplementation(()=>visibility); render(); await flushPromises(); visibility="hidden"; document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(30000); expect(api.getRiskDashboard).toHaveBeenCalledTimes(1); visibility="visible"; document.dispatchEvent(new Event("visibilitychange")); await flushPromises(); expect(api.getRiskDashboard).toHaveBeenCalledTimes(2); });
  it("clears private data and stops polling on permission loss", async () => { const w=render(); await flushPromises(); useAuthStore().permissionCodes=[]; await flushPromises(); expect(w.text()).not.toContain("8.8.8.8"); await vi.advanceTimersByTimeAsync(20000); expect(api.getRiskDashboard).toHaveBeenCalledTimes(1); });
});
