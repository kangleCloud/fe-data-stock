import { describe, expect, it } from "vitest";
import { filterMenuTree, flattenMenus, isBuiltinNode, isProtectedMenu, MenuGrantSelection, validExternalUrl, validParents, validateMenuForm } from "@/utils/menu";
import type { MenuManagementNode, MenuRequest, PermissionRequest } from "@/types/menu";

const button: MenuManagementNode = { id: 2, nodeKey: "permission:2", nodeType: "BUTTON", menuName: "刷新", permissionName: "刷新", permissionCode: "stock:refresh", menuId: 2, status: 1, sortNo: 10 };
const page: MenuManagementNode = { id: 2, nodeKey: "menu:2", nodeType: "MENU", menuName: "股票资料", parentId: 1, status: 1, sortNo: 10, routeLink: "/system/stockProfile", children: [button] };
const disabled: MenuManagementNode = { id: 3, nodeKey: "permission:3", nodeType: "BUTTON", menuName: "旧按钮", menuId: 2, status: 0, sortNo: 20 };
const tree: MenuManagementNode[] = [{ id: 1, nodeKey: "menu:1", nodeType: "DIRECTORY", menuName: "股票管理", status: 1, sortNo: 10, children: [{ ...page, children: [button, disabled] }, { ...page, id: 4, nodeKey: "menu:4", menuName: "字典", children: [] }] }];
const menu: MenuRequest = { parentId: 1, menuName: "新页面", menuType: "MENU", routeName: "NewPage", routeLink: "/system/new", componentPath: "system/sysMenu/index", icon: "menu", sortNo: 10, status: 1, visible: 1, isCache: 0, alwaysShow: 0, isExternal: 0, remark: "" };
const action: PermissionRequest = { permissionName: "新增", permissionCode: "stock:add", authTag: "stock:add", permissionType: "MENU_ACTION", menuId: 2, apiMethod: "", apiPath: "", sortNo: 10, status: 1, remark: "" };

describe("menu management hierarchy and forms", () => {
  it("retains ancestors when name/type/status filters match only a permission", () => {
    const filtered = filterMenuTree(tree, { menuName: "旧按钮", nodeType: "BUTTON", status: 0 });
    expect(flattenMenus(filtered).map((node) => node.nodeKey)).toEqual(["menu:1", "menu:2", "permission:3"]);
    expect(flattenMenus(tree)).toHaveLength(5);
  });
  it("prevents cycles and prevents pages being parents of navigation", () => {
    expect(validParents(tree, "DIRECTORY", tree[0])).toEqual([]);
    expect(validParents(tree, "MENU").map((node) => node.id)).toEqual([1]);
    expect(validParents(tree, "BUTTON").map((node) => node.id)).toEqual([2, 4]);
    expect(validateMenuForm({ ...menu, parentId: 2 }, action, "MENU", tree, [menu.componentPath])).toContain("不合法");
  });
  it("validates actual components, route uniqueness, permission uniqueness and API fields", () => {
    expect(validateMenuForm(menu, action, "MENU", tree, [menu.componentPath])).toBe("");
    expect(validateMenuForm(menu, action, "MENU", tree, [])).toContain("实际存在");
    expect(validateMenuForm({ ...menu, routeLink: "/system/stockProfile" }, action, "MENU", tree, [menu.componentPath])).toContain("已存在");
    expect(validateMenuForm(menu, { ...action, permissionCode: "stock:refresh" }, "BUTTON", tree, [])).toContain("已存在");
    expect(validateMenuForm(menu, { ...action, permissionType: "API" }, "BUTTON", tree, [])).toContain("GET/POST");
    expect(validateMenuForm(menu, { ...action, menuId: 1 }, "BUTTON", tree, [])).toContain("不合法");
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "//example.com", "https://name:secret@example.com", "bad"])("rejects unsafe external URL %s", (url) => expect(validExternalUrl(url)).toBe(false));
  it("allows ordinary builtin business menus to move/change status, while preventing their deletion", () => {
    const builtin = { ...page, isSystem: 1, componentPath: "system/stockProfile/index" };
    expect(isBuiltinNode(builtin)).toBe(true); expect(isProtectedMenu(builtin)).toBe(false);
    expect(validParents(tree, "MENU", builtin).map((node) => node.id)).toEqual([1]);
  });
  it("accepts HTTPS links and protects core pages even without builtin metadata", () => {
    expect(validExternalUrl("https://example.com/path?q=1")).toBe(true);
    expect(isProtectedMenu({ ...page, componentPath: "system/sysMenu/index" })).toBe(true);
  });
});
describe("role menu selection", () => {
  it("selects page ancestors for a button while keeping colliding IDs separate", () => {
    const selection = new MenuGrantSelection({ tree, menuIds: [], permissionIds: [] });
    selection.toggle(button, true);
    expect(selection.payload(9)).toEqual({ roleId: 9, menuIds: [2, 1], permissionIds: [2] });
    expect(selection.indeterminate(tree[0]!)).toBe(true);
    selection.toggle(page, false);
    expect(selection.payload(9)).toEqual({ roleId: 9, menuIds: [], permissionIds: [] });
  });
  it("directory selection grants pages but does not grant buttons", () => {
    const selection = new MenuGrantSelection({ tree, menuIds: [], permissionIds: [] });
    selection.toggle(tree[0]!, true);
    expect(selection.payload(9).menuIds.sort()).toEqual([1, 2, 4]);
    expect(selection.payload(9).permissionIds).toEqual([]);
  });
  it("preserves independent permissions and absent/disabled historical relations when cancelling a directory", () => {
    const selection = new MenuGrantSelection({ tree, menuIds: [1, 2, 88], permissionIds: [2, 3, 99] });
    selection.toggle(tree[0]!, false);
    expect(selection.payload(9)).toEqual({ roleId: 9, menuIds: [88], permissionIds: [3, 99] });
    selection.toggle(disabled, false);
    expect(selection.payload(9).permissionIds).toEqual([3, 99]);
  });
  it("does not grant an operation below a disabled page", () => {
    const selection = new MenuGrantSelection({ tree: [{ ...tree[0]!, children: [{ ...page, status: 0 }] }], menuIds: [], permissionIds: [] });
    selection.toggle(button, true);
    expect(selection.payload(9).permissionIds).toEqual([]);
  });
});
