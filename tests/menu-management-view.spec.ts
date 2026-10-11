import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "@/views/system/sysMenu/index.vue";
const mocks = vi.hoisted(() => ({ auth: { permissionCodes: [] as string[] }, tree: vi.fn(), add: vi.fn(), refresh: vi.fn(), detail: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => ({ refresh: mocks.refresh }) }));
vi.mock("vue-router", async (original) => ({ ...await original<typeof import("vue-router")>(), useRouter: () => ({ currentRoute: { value: { name: "SysMenu", path: "/system/sysMenu" } } }) }));
vi.mock("@/api/menu", () => ({ getManagementTree: mocks.tree, createMenuAction: mocks.add, getMenuDetail: mocks.detail }));
const tree = [{ id: 1, nodeKey: "menu:1", nodeType: "DIRECTORY", menuName: "系统", status: 1, sortNo: 10, children: [{ id: 2, nodeKey: "menu:2", nodeType: "MENU", menuName: "资料", status: 1, sortNo: 10, parentId: 1, children: [] }] }];
beforeEach(() => { vi.clearAllMocks(); mocks.auth.permissionCodes = ["system:menu:add", "system:menu:view"]; mocks.tree.mockResolvedValue(tree); mocks.refresh.mockResolvedValue(undefined); });
const button = (label: string) => [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === label)!;
async function field(label: string, value: string) {
  const item = [...document.querySelectorAll(".el-drawer .el-form-item")].find((element) => element.querySelector("label")?.textContent?.trim() === label)!;
  await new DOMWrapper(item.querySelector("input")!).setValue(value);
}
describe("menu management page", () => {
  it("shows loading errors with retry and permission-gated actions", async () => {
    mocks.auth.permissionCodes = ["system:menu:view"]; mocks.tree.mockRejectedValueOnce(new Error("暂不可用"));
    const wrapper = mount(MenuPage, { attachTo: document.body }); await flushPromises();
    expect(wrapper.text()).toContain("菜单数据加载失败：暂不可用"); expect(wrapper.findAll("button").some((item) => item.text() === "新增目录")).toBe(false);
    button("刷新").click(); await flushPromises(); expect(wrapper.text()).toContain("资料"); wrapper.unmount();
  });
  it("validates button fields, prevents duplicate saves, and refreshes permissions after success", async () => {
    let finish!: (value: number) => void; mocks.add.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const wrapper = mount(MenuPage, { attachTo: document.body }); await flushPromises(); button("新增按钮").click(); await flushPromises();
    button("保存").click(); await flushPromises(); expect(mocks.add).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("名称不能为空");
    await field("按钮名称", "刷新"); await field("权限编码", "stock:refresh"); await field("鉴权标识", "stock:refresh");
    button("保存").click(); button("保存").click(); await flushPromises(); expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ menuId: 2, permissionName: "刷新", permissionCode: "stock:refresh", permissionType: "MENU_ACTION" }));
    finish(6); await flushPromises(); expect(mocks.refresh).toHaveBeenCalledTimes(1); wrapper.unmount();
  });
});
