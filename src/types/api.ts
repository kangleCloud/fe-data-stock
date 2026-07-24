export type EntityId = number | string;

export interface CommonResult<T> {
  code: number;
  success: boolean;
  msg: string;
  content: T;
}

export interface PageResponse<T> {
  list: T[];
  total: number;
}

export interface PageQuery {
  pageNum: number;
  pageSize: number;
}

export interface CaptchaResponse {
  captchaImg: string;
  uuid: string;
  captchaType: "char" | "math" | "slide" | "all_slide";
  encryptData: string;
  captchaData?: unknown;
}

export interface LoginRequest {
  userName: string;
  password: string;
  captchaCode: string;
  captchaUuid: string;
  captchaEncryptData: string;
  captchaMix: string;
}

export interface LoginResponse {
  tokenName: string;
  tokenValue: string;
  tokenPrefix: string;
  expiresIn: number;
  userId: EntityId;
  username: string;
  nickName: string;
}

export interface LoginUserInfo {
  id: EntityId;
  username: string;
  nickName: string;
  deptId?: EntityId;
  deptName?: string;
  avatarUrl?: string;
  isSuperAdmin: number;
  isSystem: number;
  loginAddress?: string;
  loginLocation?: string;
  browser?: string;
  os?: string;
  loginTime?: string;
}

export interface AuthInfo {
  userInfo: LoginUserInfo;
  roleCodes: string[];
  permissionCodes: string[];
}

export interface BackendRouteMeta {
  menuName: string;
  icon?: string;
  isCache?: number;
}

export interface BackendRoute {
  routeName: string;
  routeLink?: string;
  path: string;
  hidden: boolean;
  component: string;
  alwaysShow?: boolean;
  meta: BackendRouteMeta;
  children?: BackendRoute[];
}

export interface SysUser {
  id: EntityId;
  deptId?: EntityId;
  nickName?: string;
  userName: string;
  mobile?: string;
  email?: string;
  avatarUrl?: string;
  gender?: string;
  status: number;
  isSuperAdmin: number;
  isSystem: number;
  loginTime?: string;
  loginAddress?: string;
  pwdUpdateDate?: string;
  remark?: string;
}

export interface UserSearchQuery extends PageQuery {
  deptId?: EntityId;
  userName?: string;
  nickName?: string;
  mobile?: string;
  status?: number;
}

export interface UserCreateRequest {
  deptId?: EntityId;
  nickName?: string;
  userName: string;
  password: string;
  mobile?: string;
  email?: string;
  avatarUrl?: string;
  gender?: string;
  status: number;
  remark?: string;
}

export interface UserUpdateRequest
  extends Omit<UserCreateRequest, "password"> {
  id: EntityId;
  password?: string;
}

export type DataScope =
  | "ALL"
  | "DEPT_AND_CHILD"
  | "DEPT_SELF"
  | "SELF"
  | "CUSTOM";

export interface SysRole {
  id: EntityId;
  roleName: string;
  roleCode: string;
  roleSort: number;
  status: number;
  dataScopeType: DataScope;
  isSystem: number;
  remark?: string;
}

export interface RoleSearchQuery extends PageQuery {
  id?: EntityId;
  roleName?: string;
  roleCode?: string;
  status?: number;
}

export interface RoleCreateRequest {
  roleName: string;
  roleCode: string;
  roleSort: number;
  status: number;
  dataScopeType: DataScope;
  remark?: string;
}

export interface RoleUpdateRequest extends RoleCreateRequest {
  id: EntityId;
}

export interface StoredCredential {
  tokenName: string;
  tokenValue: string;
  tokenPrefix: string;
  expiresAt: number;
}
