import type { EntityId } from "@/types/api";
import type { MenuManagementNode, MenuQuery, MenuRequest, PermissionRequest, MenuGrantTree, MenuGrants, MenuDetail, MenuSelectNode } from "@/types/menu";
import { request } from "@/utils/request";

export const getManagementTree = (params: MenuQuery = {}) => request<MenuManagementNode[]>({ url: "/system/sysMenu/getManagementTree", method: "GET", params });
export const getMenuDetail = (id: EntityId) => request<MenuDetail>({ url: "/system/sysMenu/getDetail", method: "GET", params: { id } });
export const getMenuTreeList = () => request<MenuSelectNode[]>({ url: "/system/sysMenu/getMenuTreeList", method: "GET" });
export const createMenu = (data: MenuRequest) => request<EntityId>({ url: "/system/sysMenu/add", method: "POST", data });
export const updateMenu = (data: MenuRequest & { id: EntityId }) => request<boolean>({ url: "/system/sysMenu/update", method: "POST", data });
export const deleteMenu = (id: EntityId) => request<boolean>({ url: "/system/sysMenu/delete", method: "POST", data: { id } });
export const createMenuAction = (data: PermissionRequest) => request<EntityId>({ url: "/system/sysMenu/action/add", method: "POST", data });
export const updateMenuAction = (data: PermissionRequest & { id: EntityId }) => request<boolean>({ url: "/system/sysMenu/action/update", method: "POST", data });
export const deleteMenuAction = (id: EntityId) => request<boolean>({ url: "/system/sysMenu/action/delete", method: "POST", data: { id } });
export const getMenuGrantTree = (roleId: EntityId) => request<MenuGrantTree>({ url: "/system/sysRole/getMenuGrantTree", method: "GET", params: { roleId } });
export const saveMenuGrants = (data: MenuGrants) => request<boolean>({ url: "/system/sysRole/saveMenuGrants", method: "POST", data });
