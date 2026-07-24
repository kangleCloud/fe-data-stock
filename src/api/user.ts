import type {
  EntityId,
  PageResponse,
  SysUser,
  UserCreateRequest,
  UserSearchQuery,
  UserUpdateRequest,
} from "@/types/api";
import { request } from "@/utils/request";

export const getUserPage = (params: UserSearchQuery) =>
  request<PageResponse<SysUser>>({
    url: "/system/sysUser/page",
    method: "GET",
    params,
  });

export const getUserDetail = (id: EntityId) =>
  request<SysUser>({
    url: "/system/sysUser/getDetail",
    method: "GET",
    params: { id },
  });

export const createUser = (data: UserCreateRequest) =>
  request<EntityId>({
    url: "/system/sysUser/add",
    method: "POST",
    data,
  });

export const updateUser = (data: UserUpdateRequest) =>
  request<boolean>({
    url: "/system/sysUser/update",
    method: "POST",
    data,
  });

export const deleteUser = (id: EntityId) =>
  request<boolean>({
    url: "/system/sysUser/delete",
    method: "POST",
    params: { id },
  });
