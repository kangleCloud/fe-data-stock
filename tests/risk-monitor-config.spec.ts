import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/views/risk/server-config/index.vue";
import RiskMapServers from "@/components/risk/RiskMapServers.vue";
import { useAuthStore } from "@/stores/auth";
import { ElMessageBox } from "element-plus";
import { ApiError } from "@/utils/request";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";

const api = vi.hoisted(() => ({
  getRiskTargets: vi.fn(), saveRiskTarget: vi.fn(), enableRiskTarget: vi.fn(), getRiskConfigSync: vi.fn(), retryRiskConfigSync: vi.fn(), getRiskResources: vi.fn(),
  getRiskMapServers: vi.fn(), saveRiskMapServer: vi.fn(), enableRiskMapServer: vi.fn(),
}));
vi.mock("@/api/riskMonitor", () => api);
const target = { targetId: "1", version: null, alias: "远程", type: "REMOTE", enabled: true, intervalSeconds: 30, collectorId: "collector", logSourceId: null, connection: { host: "example.internal", port: 22, username: "monitor", passwordConfigured: true }, publicIp: null, manualLocation: null };
const mapServer = { id: "3", version: null, name: "地图代理", publicIp: "198.51.100.1", longitude: null, latitude: null, coordinateSystem: null, locationSource: "AMAP", enabled: true, locationStatus: "UNRESOLVED" };
const resource = { targetId: "1", freshness: "FRESH", status: "SUCCEEDED", sampledTime: null, cpuPercent: "15", memoryUsedBytes: null, memoryTotalBytes: null, diskUsedBytes: null, diskTotalBytes: null, networkReceiveBytesPerSecond: null, networkTransmitBytesPerSecond: null, load1: null, uptimeSeconds: null };
const permissions = ["system:risk:view", "system:risk:config:view", "system:risk:config:update"];
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
function setupPolling() {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const pinia = createPinia(); setActivePinia(pinia);
  const auth = useAuthStore();
  auth.permissionCodes = permissions;
  return { pinia, auth, visibility };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  Object.values(api).forEach(fn => fn.mockReset());
  api.getRiskTargets.mockResolvedValue({ list: [target], total: 1 });
  api.getRiskConfigSync.mockResolvedValue({ status: "SYNCED" });
  api.getRiskResources.mockResolvedValue({ items: [] });
  api.getRiskMapServers.mockResolvedValue([]);
  api.saveRiskTarget.mockResolvedValue(target);
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("monitor configuration", () => {
  it("shows sync status and failure without displaying snapshot versions", async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().permissionCodes = ["system:risk:view", "system:risk:config:view"];
    api.getRiskConfigSync.mockResolvedValue({ status: "PENDING", stale: true, failureCode: "REDIS_UNAVAILABLE", configVersion: "9", redisConfigVersion: "8" });
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
    expect(wrapper.get(".risk-admin-sync").text()).toBe("PENDING · 已过期 · REDIS_UNAVAILABLE");
  });

  it("polls all four data regions independently and keeps their last successful results", async () => {
    const { pinia } = setupPolling();
    api.getRiskTargets.mockResolvedValue({ list: [target], total: 11 });
    api.getRiskResources.mockResolvedValue({ items: [resource] });
    api.getRiskMapServers.mockResolvedValue([mapServer]);
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } }));
    await flushPromises();
    const manager = wrapper.get('[aria-labelledby="monitor-servers-title"]');
    const mapPanel = wrapper.get('[aria-labelledby="map-servers-title"]');
    const row = manager.get("tbody tr").element;
    const mapRow = mapPanel.get("tbody tr").element;
    const refresh = manager.get<HTMLButtonElement>("button");
    const resourcePanel = wrapper.get('[aria-labelledby="risk-resource-title"]');
    const syncPanel = wrapper.get('[aria-labelledby="risk-sync-title"]');
    const slow = deferred<{ status: string; stale: boolean }>();
    api.getRiskConfigSync.mockReturnValueOnce(slow.promise);
    api.getRiskTargets.mockResolvedValueOnce({ list: [{ ...target, alias: "更新后的目标" }], total: 11 });
    api.getRiskMapServers.mockResolvedValueOnce([{ ...mapServer, name: "更新后的代理" }]);
    api.getRiskResources.mockResolvedValueOnce({ items: [{ ...resource, cpuPercent: "25" }] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resourcePanel.text()).toContain("25 %");
    expect(syncPanel.text()).toContain("SYNCED");
    expect(refresh.element.disabled).toBe(false);
    expect(manager.get("tbody tr").element).toBe(row);
    expect(manager.text()).toContain("更新后的目标");
    expect(mapPanel.get("tbody tr").element).toBe(mapRow);
    expect(mapPanel.text()).toContain("更新后的代理");

    api.getRiskTargets.mockRejectedValueOnce(new Error("offline"));
    api.getRiskMapServers.mockRejectedValueOnce(new Error("offline"));
    api.getRiskResources.mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskConfigSync).toHaveBeenCalledTimes(2);
    expect(api.getRiskResources).toHaveBeenCalledTimes(3);
    expect(manager.text()).toContain("更新后的目标");
    expect(wrapper.get('.risk-server-config > [role="alert"]').text()).toContain("读取失败");
    expect(mapPanel.text()).toContain("更新后的代理");
    expect(mapPanel.get('[role="alert"]').text()).toContain("读取失败");
    expect(resourcePanel.text()).toContain("25 %");
    expect(resourcePanel.get('[role="alert"]').text()).toContain("读取失败");
    slow.resolve({ status: "PENDING", stale: true });
    await flushPromises();
    expect(syncPanel.text()).toContain("PENDING");

    api.getRiskConfigSync.mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPanel.get('[role="alert"]').text()).toContain("读取失败");
    expect(syncPanel.text()).toContain("PENDING");
    expect(resourcePanel.text()).toContain("15 %");
    expect(mapPanel.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('.risk-server-config > [role="alert"]').exists()).toBe(false);
    expect(api.getRiskTargets).toHaveBeenCalledTimes(4);
    expect(api.getRiskMapServers).toHaveBeenCalledTimes(4);
  });

  it("refreshes the current page and discards a slow response from its previous page", async () => {
    const { pinia } = setupPolling();
    api.getRiskTargets.mockResolvedValue({ list: [target], total: 11 });
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } }));
    await flushPromises();
    const old = deferred<{ list: typeof target[]; total: number }>();
    api.getRiskTargets.mockReturnValueOnce(old.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    await click(wrapper, "下一页");
    expect(api.getRiskTargets).toHaveBeenCalledTimes(2);

    const secondPage = { list: [{ ...target, targetId: "2", alias: "第二页目标" }], total: 11 };
    const fresh = deferred<typeof secondPage>();
    api.getRiskTargets.mockReturnValueOnce(fresh.promise).mockResolvedValue(secondPage);
    old.resolve({ list: [{ ...target, alias: "过期响应" }], total: 1 });
    await flushPromises();

    const manager = wrapper.get('[aria-labelledby="monitor-servers-title"]');
    expect(manager.text()).not.toContain("过期响应");
    expect(api.getRiskTargets).toHaveBeenLastCalledWith(2, 10);
    fresh.resolve(secondPage);
    await flushPromises();
    expect(manager.text()).toContain("第二页目标");
    expect(manager.text()).toContain("第 2 页");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskTargets).toHaveBeenCalledTimes(4);
    expect(api.getRiskTargets).toHaveBeenLastCalledWith(2, 10);
  });

  it("discards status responses superseded by manual refresh or permission changes", async () => {
    const { pinia, auth } = setupPolling();
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } }));
    await flushPromises();
    const old = deferred<{ status: string }>();
    api.getRiskConfigSync.mockReturnValueOnce(old.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    await click(wrapper, "刷新");
    expect(api.getRiskTargets).toHaveBeenCalledTimes(3);
    expect(api.getRiskConfigSync).toHaveBeenCalledTimes(2);
    expect(api.getRiskResources).toHaveBeenCalledTimes(3);
    old.resolve({ status: "STALE_RESPONSE" });
    await flushPromises();
    expect(wrapper.get(".risk-admin-sync").text()).toContain("SYNCED");

    const pending = deferred<{ items: typeof resource[] }>();
    api.getRiskResources.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    auth.permissionCodes = [];
    await nextTick();
    auth.permissionCodes = permissions;
    await flushPromises();
    pending.resolve({ items: [resource] });
    await flushPromises();
    expect(wrapper.get('[aria-labelledby="risk-resource-title"]').text()).toContain("暂无资源样本");
  });

  it("pauses hidden or cached pages and preserves drafts while other data regions refresh", async () => {
    const { pinia, visibility } = setupPolling();
    api.getRiskMapServers.mockResolvedValue([mapServer]);
    const active = ref(true);
    const harness = defineComponent(() => () => h(KeepAlive, null, {
      default: () => active.value ? h(Page) : h("div"),
    }));
    const wrapper = mount(harness, { global: { plugins: [pinia] } });
    try {
      await flushPromises();
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.getRiskTargets).toHaveBeenCalledTimes(1);
      expect(api.getRiskMapServers).toHaveBeenCalledTimes(1);
      expect(api.getRiskResources).toHaveBeenCalledTimes(1);

      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await click(wrapper, "新增目标");
      await fill(wrapper, "别名", "监控草稿");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.getRiskTargets).toHaveBeenCalledTimes(1);
      expect(api.getRiskMapServers).toHaveBeenCalledTimes(2);
      expect(api.getRiskResources).toHaveBeenCalledTimes(2);
      expect(wrapper.get<HTMLInputElement>('form input[maxlength="64"]').element.value).toBe("监控草稿");
      await click(wrapper, "取消");

      await click(wrapper, "新增地图服务器");
      await fill(wrapper, "名称", "代理草稿");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.getRiskTargets).toHaveBeenCalledTimes(2);
      expect(api.getRiskMapServers).toHaveBeenCalledTimes(2);
      expect(wrapper.get<HTMLInputElement>('[aria-labelledby="map-servers-title"] form input').element.value).toBe("代理草稿");
      await click(wrapper, "取消");

      active.value = false;
      await nextTick();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(api.getRiskResources).toHaveBeenCalledTimes(3);
      expect(api.getRiskMapServers).toHaveBeenCalledTimes(2);
      active.value = true;
      await nextTick();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.getRiskResources).toHaveBeenCalledTimes(4);
      expect(api.getRiskTargets).toHaveBeenCalledTimes(3);
      expect(api.getRiskMapServers).toHaveBeenCalledTimes(3);
    } finally {
      wrapper.unmount();
    }
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskResources).toHaveBeenCalledTimes(4);
    expect(api.getRiskMapServers).toHaveBeenCalledTimes(3);
  });

  it("refreshes the target list after a save completes in a hidden tab", async () => {
    const { pinia, visibility } = setupPolling();
    const saved = deferred<typeof target>();
    api.saveRiskTarget.mockReturnValueOnce(saved.promise);
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } }));
    await flushPromises();
    await click(wrapper, "编辑");
    await fill(wrapper, "别名", "更新后的目标");
    await wrapper.get("form").trigger("submit");

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    const updated = { ...target, alias: "更新后的目标" };
    api.getRiskTargets.mockResolvedValue({ list: [updated], total: 1 });
    saved.resolve(updated);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskTargets).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.getRiskTargets).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[aria-labelledby="monitor-servers-title"] tbody').text()).toContain("更新后的目标");
    expect(wrapper.get<HTMLInputElement>('form input[maxlength="64"]').element.value).toBe("更新后的目标");
  });

  it("keeps an existing SSH password without returning it or sending it on edit", async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().permissionCodes = ["system:risk:view", "system:risk:config:view", "system:risk:config:update"];
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
    await click(wrapper, "编辑");
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).toContain("留空保留原密码");
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(api.saveRiskTarget).toHaveBeenCalledWith({
      targetId: "1", version: null, alias: "远程", type: "REMOTE", enabled: true, intervalSeconds: 30, collectorId: "collector",
      connection: { host: "example.internal", port: 22, username: "monitor" },
    });
    expect(api.getRiskTargets).toHaveBeenCalledTimes(2);
    expect(api.getRiskConfigSync).toHaveBeenCalledTimes(2);
    expect(api.getRiskResources).toHaveBeenCalledTimes(2);
  });
  it("explains a missing target without discarding the edit draft", async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().permissionCodes = permissions;
    api.saveRiskTarget.mockRejectedValueOnce(new ApiError("not found", 404));
    const wrapper = keep(mount(Page, { global: { plugins: [pinia] } }));
    await flushPromises();

    await click(wrapper, "编辑");
    await fill(wrapper, "别名", "待保存的名称");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("该监控目标已不存在");
    expect(wrapper.get<HTMLInputElement>('form input[maxlength="64"]').element.value).toBe("待保存的名称");
    expect(api.getRiskTargets).toHaveBeenCalledTimes(1);
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
  it("drops a list response started before a map server update", async () => {
    setupPolling();
    api.getRiskMapServers.mockResolvedValue([mapServer]);
    vi.spyOn(ElMessageBox, "confirm").mockResolvedValue("confirm" as never);
    api.enableRiskMapServer.mockResolvedValue({ ...mapServer, enabled: false });
    const wrapper = keep(mount(RiskMapServers, { props: { readable: true, writable: true } }));
    await flushPromises();

    const old = deferred<typeof mapServer[]>();
    const fresh = deferred<typeof mapServer[]>();
    api.getRiskMapServers.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await vi.advanceTimersByTimeAsync(10_000);
    await click(wrapper, "停用");
    expect(api.enableRiskMapServer).toHaveBeenCalledWith({ id: "3", version: null, enabled: false });
    expect(api.getRiskMapServers).toHaveBeenCalledTimes(2);

    old.resolve([{ ...mapServer, name: "过期响应" }]);
    await flushPromises();
    expect(wrapper.get("tbody").text()).not.toContain("过期响应");
    expect(api.getRiskMapServers).toHaveBeenCalledTimes(3);
    fresh.resolve([{ ...mapServer, enabled: false }]);
    await flushPromises();
    expect(wrapper.get("tbody").text()).toContain("已停用");
  });

  it("distinguishes a duplicate map IP from a missing server and retains both drafts", async () => {
    api.getRiskMapServers.mockResolvedValue([mapServer]);
    api.saveRiskMapServer
      .mockRejectedValueOnce(new ApiError("duplicate", 423))
      .mockRejectedValueOnce(new ApiError("not found", 404));
    const wrapper = keep(mount(RiskMapServers, { props: { readable: true, writable: true } }));
    await flushPromises();

    await click(wrapper, "编辑");
    await fill(wrapper, "公网 IP", "198.51.100.2");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("该公网 IP 已被其他地图代理服务器使用");
    expect(api.saveRiskMapServer).toHaveBeenCalledWith({
      id: "3", version: null, name: "地图代理", publicIp: "198.51.100.2",
      longitude: null, latitude: null, coordinateSystem: null, locationSource: "AMAP", enabled: true,
    });

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("该地图代理服务器已不存在");
    const ip = wrapper.findAll("label").find(label => label.text().startsWith("公网 IP"));
    expect(ip?.get<HTMLInputElement>("input").element.value).toBe("198.51.100.2");
  });

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
  api.getRiskMapServers.mockResolvedValue([{ id: "2", version: null, name: "代理", enabled: true, locationStatus: "UNRESOLVED" }]);
  api.enableRiskMapServer.mockResolvedValue({});
  const wrapper = keep(mount(Page, { global: { plugins: [pinia] } })); await flushPromises();
  await click(wrapper, "停用"); expect(api.enableRiskMapServer).not.toHaveBeenCalled();
  await click(wrapper, "停用"); expect(api.enableRiskMapServer).toHaveBeenCalledWith({ id: "2", version: null, enabled: false });
  await wrapper.findAll("button").filter(item => item.text() === "停用").at(-1)!.trigger("click"); await flushPromises();
  expect(api.enableRiskTarget).toHaveBeenCalledWith({ targetId: "1", version: null, enabled: false });
  expect(api.getRiskTargets).toHaveBeenCalledTimes(2);
  expect(api.getRiskConfigSync).toHaveBeenCalledTimes(2);
  expect(api.getRiskResources).toHaveBeenCalledTimes(2);
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
  const result = riskAccessTargetFlows("world", { type: "FeatureCollection", features: [] }, [{ id: "1", version: null, name: "代理", longitude: "116.410244", latitude: "39.916404", coordinateSystem: "GCJ02", locationSource: "AMAP", enabled: true, locationStatus: "LOCATED" }]);
  expect(result.lines).toEqual([]);
  expect(result.points).toHaveLength(1);
  expect(result.points[0]![0]).toBeCloseTo(116.404, 3);
});
