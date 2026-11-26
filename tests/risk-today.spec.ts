import { defineComponent } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { useRiskDashboard } from "@/composables/useRiskDashboard";
import { useAuthStore } from "@/stores/auth";
import { validateRiskDates } from "@/utils/risk";

const api = vi.hoisted(() => ({ getRiskDashboard: vi.fn(), getRiskQps: vi.fn(), getRiskSources: vi.fn(), getRiskExceptions: vi.fn(), getRiskInterfaces: vi.fn() }));
vi.mock("@/api/risk", () => api);
vi.mock("@/api/geoObservation", () => ({ getGeoObservation: vi.fn() }));
vi.mock("@/api/geoDrilldown", () => ({ getGeoCities: vi.fn(), getGeoSubdivisions: vi.fn() }));
let state: ReturnType<typeof useRiskDashboard>;
const Harness = defineComponent({ setup() { state = useRiskDashboard(); return () => null; } });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("accepts only the last 30 Beijing calendar days", () => {
  expect(validateRiskDates("2026-11-19", "2026-11-19", "2026-11-19")).toBe("");
  expect(validateRiskDates("2026-10-21", "2026-11-19", "2026-11-19")).toBe("");
  expect(validateRiskDates("2026-10-20", "2026-11-19", "2026-11-19")).toContain("30");
  expect(validateRiskDates("2026-11-20", "2026-11-20", "2026-11-19")).toContain("30");
  expect(validateRiskDates("2026-11-19", "2026-11-18", "2026-11-19")).toContain("开始日期");
});
it("advances queries at Beijing midnight and removes the previous day's display", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T15:59:00Z"));
  const pinia = createPinia(); setActivePinia(pinia); useAuthStore().permissionCodes = ["system:risk:view"];
  api.getRiskDashboard.mockResolvedValue({ metrics: {} });
  const wrapper = mount(Harness, { global: { plugins: [pinia] } });
  await flushPromises();
  expect(api.getRiskDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: "2026-11-19", endDate: "2026-11-19" }));
  expect(state.dashboard.value).toBeDefined();
  vi.setSystemTime(new Date("2026-11-19T16:00:01Z"));
  state.syncDay();
  expect(state.dashboard.value).toBeUndefined();
  await flushPromises();
  expect(api.getRiskDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: "2026-11-20", endDate: "2026-11-20" }));
  wrapper.unmount();
});
it("preserves a manually selected historical range across Beijing midnight", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T15:59:00Z"));
  const pinia = createPinia(); setActivePinia(pinia); useAuthStore().permissionCodes = ["system:risk:view"];
  api.getRiskDashboard.mockResolvedValue({ metrics: {} });
  const wrapper = mount(Harness, { global: { plugins: [pinia] } });
  await flushPromises();
  state.manualRange(); state.filters.value = { startDate: "2026-11-12", endDate: "2026-11-14" };
  await flushPromises();
  vi.setSystemTime(new Date("2026-11-19T16:00:01Z")); state.syncDay();
  expect(state.filters.value).toEqual({ startDate: "2026-11-12", endDate: "2026-11-14" });
  expect(state.validation.value).toBe("");
  wrapper.unmount();
});

it("refreshes QPS while history fails or dates are invalid, and clears it on permission loss", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-19T15:59:00Z"));
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.permissionCodes = ["system:risk:view"];
  const sample = { minuteTime: "2026-11-19T23:58:00+08:00", requestCount: "120", value: "2" };
  api.getRiskDashboard.mockRejectedValueOnce(new Error("history unavailable"));
  api.getRiskQps.mockResolvedValueOnce({ ...sample, coverageStatus: "PARTIAL", samples: [sample] });
  const wrapper = mount(Harness, { global: { plugins: [pinia] } });
  try {
    await flushPromises();
    expect(state.dashboard.value).toBeUndefined();
    expect(state.qps.value?.value).toBe("2");

    state.filters.value = { startDate: "2026-11-19", endDate: "2026-11-12" };
    await flushPromises();
    const quiet = { ...sample, requestCount: "0", value: "0" };
    api.getRiskQps.mockResolvedValueOnce({ ...quiet, coverageStatus: "PARTIAL", samples: [quiet] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskDashboard).toHaveBeenCalledTimes(1);
    expect(state.qps.value?.value).toBe("0");

    auth.permissionCodes = [];
    await flushPromises();
    expect(state.qps.value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskQps).toHaveBeenCalledTimes(2);
  } finally {
    wrapper.unmount();
  }
});
