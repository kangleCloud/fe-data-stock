import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/views/risk/server-config/index.vue";
import RiskMapServers from "@/components/risk/RiskMapServers.vue";
import { useAuthStore } from "@/stores/auth";
import { ElMessageBox } from "element-plus";

const api = vi.hoisted(() => ({
  getRiskTargets: vi.fn(), saveRiskTarget: vi.fn(), enableRiskTarget: vi.fn(), getRiskConfigSync: vi.fn(), retryRiskConfigSync: vi.fn(), getRiskResources: vi.fn(),
  getRiskMapServers: vi.fn(), saveRiskMapServer: vi.fn(), enableRiskMapServer: vi.fn(),
}));
vi.mock("@/api/riskMonitor", () => api);
const target = { targetId: "1", version: "1", alias: "远程", type: "REMOTE", enabled: true, intervalSeconds: 30, collectorId: "collector", logSourceId: null, connection: { host: "example.internal", port: 22, username: "monitor", passwordConfigured: true }, publicIp: null, manualLocation: null };
const wrappers: ReturnType<typeof mount>[] = [];
function keep<T extends ReturnType<typeof mount>>(wrapper: T): T { wrappers.push(wrapper); return wrapper; }
async function click(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll("button").find(item => item.text() === label);
  expect(button).toBeDefined(); await button!.trigger("click"); await flushPromises();
}
async function fill(wrapper: ReturnType<typeof mount>, label: string, value: string) {
  const field = wrapper.findAll("label").find(item => item.text().startsWith(label));
  expect(field).toBeDefined(); await field!.get("input").setValue(value);
}
beforeEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
  api.getRiskTargets.mockResolvedValue({ list: [target], total: 1 });
  api.getRiskConfigSync.mockResolvedValue({ status: "SYNCED" });
  api.getRiskResources.mockResolvedValue({ items: [] });
  api.getRiskMapServers.mockResolvedValue([]);
  api.saveRiskTarget.mockResolvedValue(target);
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
describe("monitor configuration", () => {
  it("keeps an existing SSH password without returning it or sending it on edit", async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().permissionCodes = ["system:risk:view", "system:risk:config:view", "system:risk:config:update"];
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
    await click(wrapper, "编辑");
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).toContain("留空保留原密码");
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(api.saveRiskTarget).toHaveBeenCalledWith(expect.objectContaining({ connection: { host: "example.internal", port: 22, username: "monitor" } }));
  });
  it("defaults local monitoring to 30 seconds without SSH credentials", async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().permissionCodes = ["system:risk:view", "system:risk:config:view", "system:risk:config:update"];
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
    await click(wrapper, "新增目标");
    expect(wrapper.text()).toContain("127.0.0.1");
    await fill(wrapper, "别名", "本机"); await fill(wrapper, "采集器 ID", "collector");
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(api.saveRiskTarget).toHaveBeenCalledWith(expect.objectContaining({ type: "LOCAL", intervalSeconds: 30, connection: null }));
  });
});
describe("map servers", () => {
  it("saves independently and allows manual coordinates after geolocation fails", async () => {
    api.saveRiskMapServer.mockResolvedValue({ locationStatus: "UNRESOLVED" });
    const wrapper = keep(mount(RiskMapServers, { props: { readable: true, writable: true } })); await flushPromises();
    await click(wrapper, "新增地图服务器");
    await fill(wrapper, "名称", "代理"); await fill(wrapper, "公网 IP", "198.51.100.1");
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(api.saveRiskMapServer).toHaveBeenCalledWith(expect.objectContaining({ locationSource: "AMAP", longitude: null, latitude: null }));
    expect(wrapper.text()).toContain("手工录入坐标");
    await click(wrapper, "新增地图服务器");
    await fill(wrapper, "名称", "代理"); await fill(wrapper, "公网 IP", "198.51.100.1");
    wrapper.findAllComponents({ name: "ElSelect" })[0]!.vm.$emit("update:modelValue", "MANUAL"); await flushPromises();
    await fill(wrapper, "经度", "121.2"); await fill(wrapper, "纬度", "31.2");
    wrapper.findAllComponents({ name: "ElSelect" })[1]!.vm.$emit("update:modelValue", "WGS84"); await flushPromises();
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(api.saveRiskMapServer).toHaveBeenLastCalledWith(expect.objectContaining({ locationSource: "MANUAL", longitude: "121.2", latitude: "31.2", coordinateSystem: "WGS84" }));
  });
});

it("requires confirmation for both server types and respects cancellation", async () => {
  const confirm = vi.spyOn(ElMessageBox, "confirm").mockRejectedValueOnce("cancel").mockResolvedValue("confirm" as never);
  const pinia = createPinia(); setActivePinia(pinia);
  useAuthStore().permissionCodes = ["system:risk:view", "system:risk:config:view", "system:risk:config:update"];
  api.enableRiskTarget.mockResolvedValue(target);
  api.getRiskMapServers.mockResolvedValue([{ id: "2", version: "1", name: "代理", enabled: true, locationStatus: "UNRESOLVED" }]);
  api.enableRiskMapServer.mockResolvedValue({});
  const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
  await click(wrapper, "停用"); expect(api.enableRiskMapServer).not.toHaveBeenCalled();
  await click(wrapper, "停用"); expect(api.enableRiskMapServer).toHaveBeenCalledWith({ id: "2", version: "1", enabled: false });
  await wrapper.findAll("button").filter(item => item.text() === "停用").at(-1)!.trigger("click"); await flushPromises();
  expect(api.enableRiskTarget).toHaveBeenCalledWith({ targetId: "1", version: "1", enabled: false });
  expect(confirm).toHaveBeenCalledTimes(3);
});

it("converts a known GCJ-02 location to the WGS84 map coordinates", async () => {
  const { gcj02ToWgs84 } = await import("@/utils/riskCoordinates");
  const [longitude, latitude] = gcj02ToWgs84(116.410244, 39.916404);
  expect(longitude).toBeCloseTo(116.404, 3);
  expect(latitude).toBeCloseTo(39.915, 3);
});

it("plots independent map servers without inventing traffic flows", async () => {
  const { riskAccessTargetFlows } = await import("@/utils/riskAccessMap");
  const result = riskAccessTargetFlows("world", { type: "FeatureCollection", features: [] }, [{ id: "1", version: "1", name: "代理", longitude: "116.410244", latitude: "39.916404", coordinateSystem: "GCJ02", locationSource: "AMAP", enabled: true, locationStatus: "LOCATED" }]);
  expect(result.lines).toEqual([]);
  expect(result.points).toHaveLength(1);
  expect(result.points[0]![0]).toBeCloseTo(116.404, 3);
});
