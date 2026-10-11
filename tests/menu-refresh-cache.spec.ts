/* eslint-disable vue/one-component-per-file -- Each test builds independent router component fixtures. */
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePermissionStore } from "@/stores/permission";
import { useAuthStore } from "@/stores/auth";
import DirectoryLayout from "@/layout/DirectoryLayout.vue";
import RouteOutlet from "@/layout/components/RouteOutlet.vue";
const mocks = vi.hoisted(() => ({ info: vi.fn(), routes: vi.fn() }));
vi.mock("@/api/auth", () => ({ getAuthInfo: mocks.info, getAuthRouters: mocks.routes }));
const backend = [{ routeName: "System", path: "/system", component: "Layout", hidden: false, meta: { menuName: "系统" }, children: [{ routeName: "Menu", path: "/system/sysMenu", component: "system/sysMenu/index", hidden: false, meta: { menuName: "菜单", isCache: 1 } }] }];
beforeEach(() => { setActivePinia(createPinia()); useAuthStore().credential = { tokenName: "test", tokenValue: "test", tokenPrefix: "", expiresAt: Date.now() + 10000 }; mocks.info.mockResolvedValue({ userInfo: {}, roleCodes: [], permissionCodes: ["system:menu:view"] }); mocks.routes.mockResolvedValue(backend); mocks.info.mockClear(); mocks.routes.mockClear(); });
describe("permission refresh and cache", () => {
  it("coalesces refreshes, keeps cache on unchanged contracts and replaces removed permissions/routes", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] }); const store = usePermissionStore();
    await Promise.all([store.refresh(router), store.refresh(router)]);
    expect(mocks.info).toHaveBeenCalledTimes(1); expect(router.hasRoute("Menu")).toBe(true);
    const version = store.version; await store.refresh(router); expect(store.version).toBe(version);
    mocks.info.mockResolvedValue({ userInfo: {}, roleCodes: [], permissionCodes: [] }); mocks.routes.mockResolvedValue([]);
    await store.refresh(router); expect(router.hasRoute("Menu")).toBe(false); expect(useAuthStore().permissionCodes).toEqual([]); expect(store.version).toBe(version + 1);
  });
  it("ignores an in-flight response after reset/logout", async () => {
    let finish!: (value: unknown) => void;
    mocks.routes.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const router = createRouter({ history: createMemoryHistory(), routes: [] }); const store = usePermissionStore();
    const pending = store.refresh(router); store.resetRoutes(); useAuthStore().clearSession(); finish(backend); await pending;
    expect(store.initialized).toBe(false); expect(router.hasRoute("Menu")).toBe(false);
  });
  it("keeps cached leaf state through two directory RouterViews", async () => {
    let mounts = 0;
    const cached = defineComponent({ setup() { const id = ++mounts; return () => h("p", `leaf-${id}`); } });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/stocks", name: "Stocks", component: DirectoryLayout, children: [{ path: "data", name: "Data", component: DirectoryLayout, children: [{ path: "/system/a", name: "Leaf", component: cached, meta: { keepAlive: true } }, { path: "/system/b", name: "Other", component: { render: () => h("p", "other") } }] }] }] });
    await router.push("/system/a"); const wrapper = mount(RouteOutlet, { global: { plugins: [router] } });
    await router.push("/system/b"); await router.push("/system/a"); await flushPromises();
    expect(wrapper.text()).toBe("leaf-1"); wrapper.unmount();
  });
  it("preserves cached page state across navigation and clears it on permission generation changes", async () => {
    let mounts = 0;
    const cached = defineComponent({ setup() { const id = ++mounts; const count = ref(0); return () => h("button", { onClick: () => count.value++ }, `${id}:${count.value}`); } });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/a", name: "A", component: cached, meta: { keepAlive: true } }, { path: "/b", name: "B", component: { render: () => h("p", "B") } }] });
    await router.push("/a"); const wrapper = mount(RouteOutlet, { global: { plugins: [router] } });
    await wrapper.get("button").trigger("click"); await router.push("/b"); await router.push("/a"); await flushPromises();
    expect(wrapper.text()).toBe("1:1"); usePermissionStore().version++; await flushPromises(); expect(wrapper.text()).toBe("2:0"); wrapper.unmount();
  });
});
