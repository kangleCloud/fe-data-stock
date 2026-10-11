import { beforeEach, describe, expect, it, vi } from "vitest";
import router from "@/router";
import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { flushPromises } from "@vue/test-utils";
import { PERMISSION_DENIED_EVENT } from "@/utils/request";
const mocks = vi.hoisted(() => ({ info: vi.fn(), routes: vi.fn() }));
vi.mock("@/api/auth", () => ({ getAuthInfo: mocks.info, getAuthRouters: mocks.routes }));
const menu = { routeName: "SysMenu", path: "/system/sysMenu", hidden: false, component: "system/sysMenu/index", meta: { menuName: "菜单" } };
const role = { routeName: "SysRole", path: "/system/sysRole", hidden: false, component: "system/sysRole/index", meta: { menuName: "角色" } };
const tree = (children: unknown[]) => [{ routeName: "System", path: "/system", hidden: false, component: "Layout", meta: { menuName: "系统" }, children }];
beforeEach(async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  usePermissionStore(pinia).resetRoutes(); const auth = useAuthStore(pinia); auth.clearSession(); await router.push("/");
  auth.credential = { tokenName: "t", tokenValue: "t", tokenPrefix: "", expiresAt: Date.now() + 10000 };
  mocks.info.mockReset().mockResolvedValue({ userInfo: {}, roleCodes: [], permissionCodes: ["system:menu:view"] });
  mocks.routes.mockReset().mockResolvedValue(tree([menu, role]));
});
describe("live permission navigation", () => {
  it("refreshes on page changes and redirects a revoked target to an authorized page", async () => {
    await router.push("/system/sysRole"); expect(mocks.info).toHaveBeenCalledTimes(1);
    mocks.routes.mockResolvedValue(tree([role])); mocks.info.mockResolvedValue({ userInfo: {}, roleCodes: [], permissionCodes: [] });
    await router.push("/system/sysMenu"); expect(router.currentRoute.value.path).toBe("/system/sysRole"); expect(useAuthStore(pinia).permissionCodes).toEqual([]);
    expect(mocks.info).toHaveBeenCalledTimes(2);
  });
  it("merges overlapping 403/visibility refreshes and keeps anonymous routes accessible", async () => {
    await router.push("/system/sysMenu");
    mocks.routes.mockResolvedValue(tree([role]));
    window.dispatchEvent(new Event(PERMISSION_DENIED_EVENT)); window.dispatchEvent(new Event(PERMISSION_DENIED_EVENT));
    await flushPromises(); expect(router.currentRoute.value.path).toBe("/system/sysRole"); expect(mocks.info).toHaveBeenCalledTimes(2);
    useAuthStore(pinia).clearSession(); usePermissionStore(pinia).resetRoutes();
    await router.push("/market/etf-monitor"); expect(router.currentRoute.value.meta.publicAccess).toBe(true); expect(mocks.info).toHaveBeenCalledTimes(2);
  });
});
