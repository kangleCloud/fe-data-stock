import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/views/risk/server-config/index.vue";
import { useAuthStore } from "@/stores/auth";
import { buildDynamicRoutes } from "@/router/dynamic";
const api = vi.hoisted(() => ({ getRiskServerConfig: vi.fn(), saveRiskServerConfig: vi.fn(), resolveRiskServerConfig: vi.fn() }));
vi.mock("@/api/riskServer", () => api);
const result = { configured: false, version: null, alias: null, publicIp: null, manualLocation: null, resolvedLocation: null, locationSource: null, locationStatus: "UNCONFIGURED", resolveStatus: "NOT_ATTEMPTED", resolveFailureCode: null, resolvedAt: null, updatedAt: null };
const wrappers: ReturnType<typeof mount>[] = [];
function render(permissions: string[]) { const pinia = createPinia(); setActivePinia(pinia); useAuthStore().permissionCodes = permissions; const wrapper = mount(Page, { global: { plugins: [pinia] } }); wrappers.push(wrapper); return wrapper; }
const read = ["system:risk:view", "system:risk:config:view"]; const write = [...read, "system:risk:config:update"];
beforeEach(() => { Object.values(api).forEach((method) => method.mockReset()); api.getRiskServerConfig.mockResolvedValue(result); });
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
describe("risk server configuration page", () => {
  it("registers dynamic component and never reads IP without both view permissions", async () => {
    const [route] = buildDynamicRoutes([{ routeName: "RiskConfig", path: "/risk/server-config", component: "risk/server-config/index", hidden: false, meta: { menuName: "服务器配置" } }]); expect(route?.meta?.loadError).toBeUndefined();
    const wrapper = render(["system:risk:config:view"]); await flushPromises(); expect(api.getRiskServerConfig).not.toHaveBeenCalled(); expect(wrapper.find("form").exists()).toBe(false);
  });
  it("renders unconfigured read-only state and hides update actions", async () => {
    const wrapper = render(read); await flushPromises(); expect(wrapper.text()).toContain("未配置"); expect(wrapper.text()).not.toContain("保存配置"); expect(wrapper.findAll("input").every((input) => input.attributes("disabled") !== undefined)).toBe(true);
  });
  it("submits grouped strings, preserves failed input and prevents duplicate saves", async () => {
    const wrapper = render(write); await flushPromises(); const inputs = wrapper.findAll("input"); await inputs[0]!.setValue("test"); await inputs[1]!.setValue("8.8.8.8");
    let reject!: (reason: unknown) => void; api.saveRiskServerConfig.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    await wrapper.get("form").trigger("submit"); await wrapper.get("form").trigger("submit"); expect(api.saveRiskServerConfig).toHaveBeenCalledTimes(1); expect(api.saveRiskServerConfig).toHaveBeenCalledWith({ version: null, alias: "test", publicIp: "8.8.8.8", manualLocation: null });
    reject({ code: 423 }); await flushPromises(); expect(wrapper.text()).toContain("版本冲突"); expect((inputs[1]!.element as HTMLInputElement).value).toBe("8.8.8.8");
  });
  it("retains saved configuration when lookup fails and resolves only its version", async () => {
    api.getRiskServerConfig.mockResolvedValue({ ...result, configured: true, version: "9007199254740993", alias: "server", publicIp: "8.8.8.8", locationStatus: "UNRESOLVED", resolveStatus: "FAILED", resolveFailureCode: "TIMEOUT" });
    api.resolveRiskServerConfig.mockResolvedValue({ ...result, configured: true, version: "9007199254740993", alias: "server", publicIp: "8.8.8.8", locationStatus: "UNRESOLVED", resolveStatus: "FAILED", resolveFailureCode: "TIMEOUT" });
    const wrapper = render(write); await flushPromises(); expect(wrapper.text()).toContain("TIMEOUT"); await wrapper.findAll("button").find((button) => button.text() === "重新解析已保存IP")!.trigger("click"); await flushPromises(); expect(api.resolveRiskServerConfig).toHaveBeenCalledWith("9007199254740993"); expect(wrapper.text()).toContain("已配置");
  });
  it("discards late private responses after permission loss", async () => {
    let resolve!: (value: unknown) => void; api.getRiskServerConfig.mockImplementation(() => new Promise((done) => { resolve = done; })); const wrapper = render(read);
    useAuthStore().permissionCodes = []; await flushPromises(); resolve({ ...result, publicIp: "8.8.8.8" }); await flushPromises(); expect(wrapper.text()).not.toContain("8.8.8.8"); expect(wrapper.find("form").exists()).toBe(false);
  });
});
