import type { EntityId } from "@/types/api";

export type MenuNodeType = "DIRECTORY" | "MENU" | "BUTTON";
export interface MenuRequest {
  parentId: EntityId | null;
  menuName: string;
  menuType: "CONTENTS" | "MENU" | "LINK";
  routeName: string;
  routeLink: string;
  componentPath: string;
  icon: string;
  sortNo: number;
  visible: number;
  isCache: number;
  alwaysShow: number;
  isExternal: number;
  status: number;
  remark: string;
}
export interface PermissionRequest {
  permissionName: string;
  permissionCode: string;
  permissionType: "MENU_ACTION" | "API";
  menuId: EntityId;
  apiMethod: "GET" | "POST" | "";
  apiPath: string;
  authTag: string;
  sortNo: number;
  status: number;
  remark: string;
}
/** Management projection; menu and permission IDs are separate namespaces. */
export type NullableFields<T> = { [K in keyof T]?: T[K] | null };
export interface MenuManagementNode extends NullableFields<MenuRequest>, NullableFields<PermissionRequest> {
  id: EntityId;
  nodeKey: string;
  nodeType: MenuNodeType;
  menuName: string;
  status: number;
  sortNo: number;
  isSystem?: number | null;
  children?: MenuManagementNode[];
}
export interface MenuQuery { menuName?: string; nodeType?: MenuNodeType; status?: number }
/** Frozen grant response. IDs absent from tree remain in the save payload. */
export interface MenuGrantTree {
  tree: MenuManagementNode[];
  menuIds: EntityId[];
  permissionIds: EntityId[];
}
export interface MenuGrants { roleId: EntityId; menuIds: EntityId[]; permissionIds: EntityId[] }

export interface MenuDetail extends NullableFields<MenuRequest> { id: EntityId; isSystem?: number | null }
export interface MenuSelectNode { id: EntityId; label: string; children?: MenuSelectNode[] }
