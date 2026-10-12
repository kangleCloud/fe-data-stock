import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import ElementPlus, { ElCheckbox, ElPopover, ElTree } from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuGrantDrawer from "@/components/MenuGrantDrawer.vue";
import type { MenuGrantTree } from "@/types/menu";
import type { SysRole } from "@/types/api";

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), refresh: vi.fn(), router: {}, auth: { permissionCodes: ["system:role:grant"] as string[] } }));
vi.mock("@/api/menu", () => ({ getMenuGrantTree: mocks.get, saveMenuGrants: mocks.save }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/stores/permission", () => ({ usePermissionStore: () => ({ refresh: mocks.refresh }) }));
vi.mock("vue-router", async (original) => ({ ...await original<typeof import("vue-router")>(), useRouter: () => mocks.router }));
const role: SysRole = { id: 8, roleName: "资料管理员", roleCode: "DATA", roleSort: 1, status: 1, dataScopeType: "SELF", isSystem: 0 };
const data: MenuGrantTree = {
  menuIds: [99], permissionIds: [21, 900],
  tree: [{ id: 1, nodeKey: "menu:1", nodeType: "DIRECTORY", menuName: "股票管理", status: 1, sortNo: 1, children: [
    { id: 2, nodeKey: "menu:2", nodeType: "MENU", menuName: "资料", parentId: 1, status: 1, sortNo: 1, children: [
      { id: 20, nodeKey: "permission:20", nodeType: "BUTTON", menuName: "刷新", menuId: 2, status: 1, sortNo: 1, children: [] },
      { id: 21, nodeKey: "permission:21", nodeType: "BUTTON", menuName: "旧操作", menuId: 2, status: 0, sortNo: 2, children: [] },
    ] },
    { id: 3, nodeKey: "menu:3", nodeType: "MENU", menuName: "字典", parentId: 1, status: 1, sortNo: 2, children: [] },
    { id: 4, nodeKey: "menu:4", nodeType: "MENU", menuName: "旧页面", parentId: 1, status: 0, sortNo: 3, children: [] },
  ] }],
};
let wrapper: ReturnType<typeof mount>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.permissionCodes = ["system:role:grant"];
  mocks.get.mockResolvedValue(structuredClone(data)); mocks.save.mockResolvedValue(true); mocks.refresh.mockResolvedValue(undefined);
});
afterEach(() => wrapper?.unmount());
async function open(props: Partial<SysRole> = {}) {
  wrapper = mount(MenuGrantDrawer, { attachTo: document.body, props: { modelValue: false, role: { ...role, ...props } }, global: { plugins: [ElementPlus] } });
  await wrapper.setProps({ modelValue: true }); await flushPromises();
  expect(wrapper.findComponent(ElTree).exists()).toBe(true);
  expect(wrapper.findComponent(ElCheckbox).exists()).toBe(true);
}
const row = (key: string) => document.querySelector<HTMLElement>(`[data-node-key="${key}"]`)!;
const input = (key: string) => row(key).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const checked = (key: string) => input(key).checked;
const half = (key: string) => row(key).querySelector(".el-checkbox__input")!.classList.contains("is-indeterminate");
async function click(key: string) { input(key).click(); await flushPromises(); }
async function expand(key: string) {
  row(key).closest(".el-tree-node")!.querySelector<HTMLElement>(".el-tree-node__expand-icon")!.click(); await flushPromises();
}
const saveButton = () => [...document.querySelectorAll<HTMLButtonElement>(".grant-footer-actions button")].find((node) => node.textContent?.includes("保存授权"))!;

// These tests mount the compiled Vue SFC with real ElTree and ElCheckbox.
// Its stable scoped slot is essential: a handwritten non-stable slot masks the regression.
describe("role menu grant drawer", () => {
  it("updates consecutive page/directory checks, parent half state and the final grant payload", async () => {
    await open();
    await click("menu:2"); expect(checked("menu:2")).toBe(true); expect(half("menu:1")).toBe(true);
    await expand("menu:2"); expect(checked("permission:20")).toBe(false);
    await click("menu:3"); expect(half("menu:1")).toBe(false); expect(checked("menu:1")).toBe(true);
    await click("menu:2"); expect(checked("menu:2")).toBe(false); expect(half("menu:1")).toBe(true);
    await click("menu:1"); expect(checked("menu:2")).toBe(false); expect(checked("menu:3")).toBe(false);
    await click("menu:1"); expect(checked("menu:2")).toBe(true); expect(checked("menu:3")).toBe(true); expect(checked("permission:20")).toBe(false);
    await click("menu:1"); expect(checked("menu:2")).toBe(false); expect(checked("menu:3")).toBe(false);
    await click("menu:2"); saveButton().click(); await flushPromises();
    const payload = mocks.save.mock.calls[0]![0];
    expect(payload.roleId).toBe(8); expect(payload.menuIds.sort((a: number, b: number) => a - b)).toEqual([1, 2, 99]); expect(payload.permissionIds).toEqual([21, 900]);
    expect(mocks.refresh).toHaveBeenCalledWith(mocks.router, true);
  });
  it("grants an operation independently and preserves tree instances, expansion, scroll and keyboard focus", async () => {
    await open(); await expand("menu:2");
    const tree = wrapper.findComponent(ElTree).element;
    const scroll = document.querySelector<HTMLElement>(".grant-tree-scroll")!; scroll.scrollTop = 120;
    const node = row("permission:20").closest<HTMLElement>('[role="treeitem"]')!;
    node.focus();
    await new DOMWrapper(node).trigger("keydown", { code: "Space", key: " " }); await flushPromises();
    expect(checked("permission:20")).toBe(true); expect(checked("menu:2")).toBe(true); expect(half("menu:1")).toBe(true);
    expect(wrapper.findComponent(ElTree).element).toBe(tree); expect(row("permission:20").closest('[role="treeitem"]')).toBe(node);
    expect(row("menu:2").closest('[role="treeitem"]')!.getAttribute("aria-expanded")).toBe("true");
    expect(scroll.scrollTop).toBe(120); expect(document.activeElement).toBe(node);
    await new DOMWrapper(node).trigger("keydown", { code: "Enter", key: "Enter" }); await flushPromises();
    expect(checked("permission:20")).toBe(false);
    await click("permission:20"); saveButton().click(); await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith({ roleId: 8, menuIds: [99, 2, 1], permissionIds: [21, 900, 20] });
  });
  it("disables stopped nodes and keeps their historical permissions", async () => {
    await open(); await expand("menu:2");
    expect(input("permission:21").disabled).toBe(true); expect(checked("permission:21")).toBe(true);
    expect(input("menu:4").disabled).toBe(true);
    await click("permission:21"); await click("menu:4");
    saveButton().click(); await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith({ roleId: 8, menuIds: [99], permissionIds: [21, 900] });
  });
  it("prevents system role edits and saves", async () => {
    await open({ isSystem: 1 }); expect(input("menu:1").disabled).toBe(true); expect(saveButton().disabled).toBe(true);
    await click("menu:1"); saveButton().click(); await flushPromises(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("blocks duplicate in-flight saves, retains checked inputs on server rejection, and allows retry", async () => {
    let reject!: (reason: Error) => void; mocks.save.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    await open(); await click("menu:2");
    saveButton().click(); saveButton().click(); await flushPromises(); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(input("menu:2").disabled).toBe(true);
    reject(new Error("授权校验失败，请检查角色状态")); await flushPromises();
    expect(document.querySelector(".el-alert")!.textContent).toContain("授权校验失败，请检查角色状态");
    expect(checked("menu:2")).toBe(true); expect(input("menu:2").disabled).toBe(false); expect(mocks.refresh).not.toHaveBeenCalled();
    saveButton().click(); await flushPromises(); expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1]![0]).toEqual(mocks.save.mock.calls[0]![0]);
  });
  it("opens explanation on focus/hover/click, keeps it collapsed normally, and shows load failures in the body", async () => {
    mocks.get.mockRejectedValueOnce(new Error("授权树暂不可用"));
    wrapper = mount(MenuGrantDrawer, { attachTo: document.body, props: { modelValue: false, role }, global: { plugins: [ElementPlus] } });
    await wrapper.setProps({ modelValue: true }); await flushPromises();
    expect(document.querySelector(".grant-drawer-body .el-alert")!.textContent).toContain("授权树暂不可用");
    expect((document.querySelector(".grant-drawer-body p")?.textContent ?? "")).not.toContain("页面与按钮分别");
    const tips = new DOMWrapper(document.querySelector<HTMLButtonElement>(".grant-tips-button")!);
    const explanation = wrapper.findComponent(ElPopover);
    expect(explanation.props("visible")).toBe(false);
    expect(document.activeElement).toBe(document.querySelector(".grant-title"));
    await tips.trigger("focus"); expect(explanation.props("visible")).toBe(true);
    await tips.trigger("blur"); expect(explanation.props("visible")).toBe(false);
    await tips.trigger("mouseenter"); expect(explanation.props("visible")).toBe(true);
    await tips.trigger("mouseleave"); expect(explanation.props("visible")).toBe(false);
    await tips.trigger("click"); await flushPromises(); expect(explanation.props("visible")).toBe(true);
    const descriptionId = tips.attributes("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)!.textContent).toContain("历史关联会保留");
    expect(document.getElementById(descriptionId!)!.getAttribute("role")).toBe("tooltip");
    await tips.trigger("keydown", { key: "Escape" }); expect(explanation.props("visible")).toBe(false);
    const retry = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.includes("重新加载"))!;
    retry.click(); await flushPromises(); expect(wrapper.findComponent(ElTree).exists()).toBe(true);
  });
});
