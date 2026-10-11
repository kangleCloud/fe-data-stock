import type { EntityId } from "@/types/api";
import type { MenuManagementNode, MenuQuery, MenuGrantTree, MenuGrants, MenuRequest, PermissionRequest } from "@/types/menu";

export const nodeLabel = (node: MenuManagementNode) => node.nodeType === "BUTTON" ? node.permissionName || node.menuName : node.menuName;
export const flattenMenus = (nodes: MenuManagementNode[]): MenuManagementNode[] => nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
export function filterMenuTree(nodes: MenuManagementNode[], query: MenuQuery): MenuManagementNode[] {
  return nodes.flatMap((node) => {
    const children = filterMenuTree(node.children ?? [], query);
    const matches = (!query.menuName || nodeLabel(node).includes(query.menuName)) && (!query.nodeType || node.nodeType === query.nodeType) && (query.status == null || node.status === query.status);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}
export function isProtectedMenu(node: MenuManagementNode): boolean {
  const component = (node.componentPath ?? "").replace(/^\/+/, "").replace(/^views\//, "").replace(/\.vue$/, "");
  return ["system/sysUser/index", "system/sysRole/index", "system/sysMenu/index"].includes(component) || ["/system/sysUser", "/system/sysRole", "/system/sysMenu"].includes(node.routeLink ?? "");
}
export const isBuiltinNode = (node: MenuManagementNode): boolean => node.isSystem === 1 || isProtectedMenu(node);
export function validExternalUrl(value: string): boolean {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function validParents(nodes: MenuManagementNode[], type: MenuManagementNode["nodeType"], editing?: MenuManagementNode): MenuManagementNode[] {
  const excluded = new Set(editing ? flattenMenus([editing]).map((node) => node.nodeKey) : []);
  const all = flattenMenus(nodes);
  return all.filter((node) => !excluded.has(node.nodeKey) && node.nodeType === (type === "BUTTON" ? "MENU" : "DIRECTORY") && (type === "BUTTON" || directoryDepth(node, all) < (type === "DIRECTORY" ? 2 : 3)));
}
function directoryDepth(node: MenuManagementNode, all: MenuManagementNode[], visited = new Set<string>()): number {
  if (visited.has(node.nodeKey)) return 99;
  visited.add(node.nodeKey);
  const parent = all.find((item) => item.nodeType !== "BUTTON" && String(item.id) === String(node.parentId));
  return parent ? 1 + directoryDepth(parent, all, visited) : 1;
}
export function validateMenuForm(menu: MenuRequest, action: PermissionRequest, type: MenuManagementNode["nodeType"], nodes: MenuManagementNode[], componentPaths: string[], editing?: MenuManagementNode): string {
  const label = type === "BUTTON" ? action.permissionName : menu.menuName;
  if (!label.trim() || label.length > 50) return "名称不能为空且最多 50 字";
  const sort = type === "BUTTON" ? action.sortNo : menu.sortNo;
  if (!Number.isInteger(sort) || sort < 0 || sort > 999) return "排序必须为 0 到 999 的整数";
  const parentId = type === "BUTTON" ? action.menuId : menu.parentId;
  if (type === "BUTTON" && !parentId) return "按钮必须关联页面菜单";
  if (parentId && !validParents(nodes, type, editing).some((node) => String(node.id) === String(parentId))) return "上级节点不合法或将形成循环/超过三级导航";
  if (type === "DIRECTORY" && parentId && editing) {
    const parent = flattenMenus(nodes).find((node) => node.nodeType !== "BUTTON" && String(node.id) === String(parentId));
    const height = (node: MenuManagementNode): number => node.nodeType === "BUTTON" ? 0 : 1 + Math.max(0, ...(node.children ?? []).map(height));
    if (parent && directoryDepth(parent, flattenMenus(nodes)) + height(editing) > 3) return "移动后将超过三级导航";
  }
  if (type === "BUTTON") {
    if (!action.permissionCode.trim() || !action.authTag.trim()) return "请输入权限编码和鉴权标识";
    if (flattenMenus(nodes).some((node) => node.nodeType === "BUTTON" && node.nodeKey !== editing?.nodeKey && node.permissionCode === action.permissionCode.trim())) return "权限编码已存在";
    if (action.permissionType === "API" && (!action.apiMethod || !action.apiPath.startsWith("/"))) return "API 权限需选择 GET/POST 并填写以 / 开头的接口路径";
  } else {
    if (!menu.routeName.trim()) return "请输入路由名称";
    if (menu.menuType === "LINK" || menu.isExternal === 1) {
      if (!validExternalUrl(menu.routeLink)) return "外链仅支持有效的 HTTP/HTTPS 地址";
    } else {
      if (!/^\/(?!\/)[^?#\s]*$/.test(menu.routeLink)) return "请输入以 / 开头的内部路由地址";
      if (type === "MENU" && !componentPaths.includes(menu.componentPath)) return "请选择实际存在的页面组件";
    }
    if (flattenMenus(nodes).some((node) => node.nodeType !== "BUTTON" && node.nodeKey !== editing?.nodeKey && (node.routeName === menu.routeName || node.routeLink === menu.routeLink))) return "路由名称或地址已存在";
  }
  return "";
}

export class MenuGrantSelection {
  private menus: Map<string, EntityId>;
  private permissions: Map<string, EntityId>;
  private all: MenuManagementNode[];
  constructor(readonly data: MenuGrantTree) {
    this.menus = new Map(data.menuIds.map((id) => [String(id), id]));
    this.permissions = new Map(data.permissionIds.map((id) => [String(id), id]));
    this.all = flattenMenus(data.tree);
    for (const node of this.all.filter((item) => item.nodeType === "BUTTON" && this.checked(item) && this.enabled(item))) this.addAncestors(node);
  }
  checked(node: MenuManagementNode): boolean {
    return (node.nodeType === "BUTTON" ? this.permissions : this.menus).has(String(node.id));
  }
  indeterminate(node: MenuManagementNode): boolean {
    return node.nodeType === "DIRECTORY" && flattenMenus(node.children ?? []).some((child) => this.checked(child)) && !flattenMenus(node.children ?? []).filter((child) => child.nodeType === "MENU" && child.status === 1).every((child) => this.checked(child));
  }
  enabled(node: MenuManagementNode, visited = new Set<string>()): boolean {
    if (node.status !== 1 || visited.has(node.nodeKey)) return false;
    visited.add(node.nodeKey);
    const parentId = node.nodeType === "BUTTON" ? node.menuId : node.parentId;
    const parent = this.all.find((item) => item.nodeType !== "BUTTON" && String(item.id) === String(parentId));
    return parent ? this.enabled(parent, visited) : node.nodeType !== "BUTTON";
  }
  toggle(node: MenuManagementNode, checked: boolean): void {
    if (!this.enabled(node)) return;
    const targets = node.nodeType === "DIRECTORY" ? flattenMenus([node]).filter((item) => this.enabled(item) && (checked ? item.nodeType !== "BUTTON" : true)) : checked ? [node] : flattenMenus([node]).filter((item) => this.enabled(item));
    for (const target of targets) {
      const map = target.nodeType === "BUTTON" ? this.permissions : this.menus;
      if (checked) { map.set(String(target.id), target.id); this.addAncestors(target); } else map.delete(String(target.id));
    }
    for (const directory of this.all.filter((item) => item.nodeType === "DIRECTORY" && item.status === 1)) {
      const pages = flattenMenus(directory.children ?? []).filter((item) => item.nodeType === "MENU" && item.status === 1);
      if (pages.some((item) => this.checked(item))) this.menus.set(String(directory.id), directory.id);
      else this.menus.delete(String(directory.id));
    }
  }
  private addAncestors(node: MenuManagementNode, visited = new Set<string>()): void {
    if (visited.has(node.nodeKey)) return;
    visited.add(node.nodeKey);
    const parentId = node.nodeType === "BUTTON" ? node.menuId : node.parentId;
    const parent = this.all.find((item) => item.nodeType !== "BUTTON" && String(item.id) === String(parentId));
    if (parent && parent.status === 1) { this.menus.set(String(parent.id), parent.id); this.addAncestors(parent, visited); }
  }
  payload(roleId: EntityId): MenuGrants { return { roleId, menuIds: [...this.menus.values()], permissionIds: [...this.permissions.values()] }; }
}
