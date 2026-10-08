import { flushPromises, shallowMount } from "@vue/test-utils";
import { ElMessage } from "element-plus";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EtfPage from "@/views/system/etfMonitor/index.vue";
import StockPage from "@/views/system/stockMonitor/index.vue";
import { ApiError } from "@/utils/request";

const mocks = vi.hoisted(() => ({ auth: { permissionCodes: [] as string[] }, refresh: vi.fn(),
  config: vi.fn(), page: vi.fn(), status: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/api/etf", () => ({ getEtfMonitorConfig: mocks.config, refreshEtfMonitor: mocks.refresh,
  getEtfDictionaryPage: vi.fn(), setEtfEnabled: vi.fn(), sortEtfMonitor: vi.fn() }));
vi.mock("@/api/market", () => ({ getStockMonitorConfig: mocks.config, refreshStockMonitor: mocks.refresh,
  getStockMonitorRefreshStatus: mocks.status, searchStockDictionary: vi.fn(), setStockEnabled: vi.fn(), sortStockMonitor: vi.fn() }));
vi.mock("@/api/stockData", () => ({ getStockMonitorAdminPage: mocks.page }));

beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); mocks.auth.permissionCodes = [];
  mocks.config.mockResolvedValue([]); mocks.page.mockResolvedValue({ list: [], total: 0 });
  mocks.status.mockResolvedValue({ status: "IDLE", startedAt: null, finishedAt: null, message: null });
});

describe.each([["ETF", EtfPage, "system:etf-monitor:refresh"],
  ["stock", StockPage, "system:stock-monitor:refresh"]] as const)("%s overall refresh", (_name, component, permission) => {
  function mountPage() {
    return shallowMount(component, { global: { renderStubDefaultSlot: true,
      stubs: { ElTableColumn: { template: "<span />" },
        ElButton: { props: ["disabled", "loading"], template: '<button :disabled="disabled"><slot /></button>' } },
      directives: { loading: () => {} } } });
  }

  it("requires the independent refresh permission", async () => {
    const wrapper = mountPage(); await flushPromises();
    expect(wrapper.findAll("button").some((button) => button.text() === "整体刷新")).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it.each([["SUCCESS", "success"], ["PARTIAL", "warning"], ["ERROR", "error"], ["LOCKED", "warning"]] as const)(
    "reports %s with final times and ignores legacy accepted", async (status, level) => {
      mocks.auth.permissionCodes = [permission];
      const success = vi.spyOn(ElMessage, "success").mockImplementation(() => ({ close: vi.fn() }));
      const warning = vi.spyOn(ElMessage, "warning").mockImplementation(() => ({ close: vi.fn() }));
      const error = vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: vi.fn() }));
      mocks.refresh.mockResolvedValue({ accepted: true, status, message: "本次结果",
        startedAt: "2026-10-03T09:00:00+08:00", finishedAt: "2026-10-03T09:01:00+08:00" });
      const wrapper = mountPage(); await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "整体刷新")!.trigger("click");
      await flushPromises();
      expect({ success, warning, error }[level]).toHaveBeenCalledTimes(1);
      if (level !== "success") expect(success).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain("09:00"); expect(wrapper.text()).toContain("09:01");
      expect(mocks.status).toHaveBeenCalledTimes(component === StockPage ? 1 : 0);
      wrapper.unmount();
    });

  it("blocks duplicate submission and keeps timeout unconfirmed without retry", async () => {
    mocks.auth.permissionCodes = [permission];
    const warning = vi.spyOn(ElMessage, "warning").mockImplementation(() => ({ close: vi.fn() }));
    let reject!: (cause: Error) => void;
    mocks.refresh.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const wrapper = mountPage(); await flushPromises();
    const button = wrapper.findAll("button").find((item) => item.text() === "整体刷新")!;
    await button.trigger("click"); await button.trigger("click");
    expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(button.attributes("disabled")).toBeDefined();
    reject(new Error("整体刷新请求超时，结果未确认")); await flushPromises();
    expect(wrapper.text()).toContain("结果未确认"); expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(button.attributes("disabled")).toBeUndefined(); wrapper.unmount();
  });

  it("warns on a rejected 423 lock conflict without reporting failure or success", async () => {
    mocks.auth.permissionCodes = [permission];
    const warning = vi.spyOn(ElMessage, "warning").mockImplementation(() => ({ close: vi.fn() }));
    const error = vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: vi.fn() }));
    const success = vi.spyOn(ElMessage, "success").mockImplementation(() => ({ close: vi.fn() }));
    mocks.refresh.mockRejectedValue(new ApiError("同步正在执行", 423));
    const wrapper = mountPage(); await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "整体刷新")!.trigger("click");
    await flushPromises();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("刷新锁冲突，本次未执行");
    expect(mocks.refresh).toHaveBeenCalledTimes(1); wrapper.unmount();
  });
});
