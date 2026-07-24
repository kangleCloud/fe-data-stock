import type {
  EntityId,
  PageResponse,
  RoleCreateRequest,
  RoleSearchQuery,
  RoleUpdateRequest,
  SysRole,
} from "@/types/api";
import { request } from "@/utils/request";

export const getRolePage = (params: RoleSearchQuery) =>
  request<PageResponse<SysRole>>({
    url: "/system/sysRole/page",
    method: "GET",
    params,
  });

export const getRoleDetail = (id: EntityId) =>
  request<SysRole>({
    url: "/system/sysRole/getDetail",
    method: "GET",
    params: { id },
  });

export const createRole = (data: RoleCreateRequest) =>
  request<EntityId>({
    url: "/system/sysRole/add",
    method: "POST",
    data,
  });

export const updateRole = (data: RoleUpdateRequest) =>
  request<boolean>({
    url: "/system/sysRole/update",
    method: "POST",
    data,
  });

export const deleteRole = (id: EntityId) =>
  request<boolean>({
    url: "/system/sysRole/delete",
    method: "POST",
    params: { id },
  });

export const checkRoleNameUnique = (roleName: string, id?: EntityId) =>
  request<boolean>({
    url: "/system/sysRole/checkRoleNameUnique",
    method: "GET",
    params: { roleName, id },
  });

export const checkRoleCodeUnique = (roleCode: string, id?: EntityId) =>
  request<boolean>({
    url: "/system/sysRole/checkRoleCodeUnique",
    method: "GET",
    params: { roleCode, id },
  });
