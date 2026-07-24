import type {
  AuthInfo,
  BackendRoute,
  CaptchaResponse,
  LoginRequest,
  LoginResponse,
} from "@/types/api";
import { request } from "@/utils/request";

export const getCaptcha = () =>
  request<CaptchaResponse>({
    url: "/captcha/captcha",
    method: "GET",
  });

export const login = (data: LoginRequest) =>
  request<LoginResponse>({
    url: "/auth/login",
    method: "POST",
    data,
  });

export const logout = () =>
  request<boolean>({
    url: "/auth/logout",
    method: "POST",
  });

export const getAuthInfo = () =>
  request<AuthInfo>({
    url: "/auth/info",
    method: "GET",
  });

export const getAuthRouters = () =>
  request<BackendRoute[]>({
    url: "/auth/routers",
    method: "GET",
  });
