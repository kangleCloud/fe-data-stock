import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { ElMessage } from "element-plus";
import "element-plus/theme-chalk/el-message.css";

import type { CommonResult } from "@/types/api";
import {
  buildAuthorizationValue,
  clearCredential,
  getCredential,
} from "@/utils/storage";

export const AUTH_EXPIRED_EVENT = "vita-stock-admin:auth-expired";

export type ApiMethod = "GET" | "POST";

export type ApiRequestConfig = Omit<AxiosRequestConfig, "method"> & {
  method: ApiMethod;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/admin/api",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

function expireSession(): void {
  clearCredential();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

function showError(message: string): void {
  if (typeof document !== "undefined") {
    ElMessage.error(message);
  }
}

httpClient.interceptors.request.use((config) => {
  const credential = getCredential();
  if (credential) {
    config.headers.set(
      credential.tokenName,
      buildAuthorizationValue(credential),
    );
  }
  return config;
});

httpClient.interceptors.response.use(
  (response: AxiosResponse<CommonResult<unknown>>) => {
    const result = response.data;
    if (typeof result?.success !== "boolean") {
      throw new ApiError("服务响应格式异常");
    }
    if (result.success) {
      return result.content as unknown as AxiosResponse;
    }

    if (result.code === 401) {
      expireSession();
    }
    const message = result.msg || "请求失败，请稍后重试";
    showError(message);
    throw new ApiError(message, result.code);
  },
  (error: AxiosError<CommonResult<unknown>>) => {
    const code = error.response?.data?.code ?? error.response?.status;
    const message =
      error.response?.data?.msg ||
      (error.code === "ECONNABORTED"
        ? "请求超时，请检查服务状态"
        : "网络连接异常，请稍后重试");

    if (code === 401) {
      expireSession();
    }
    showError(message);
    throw new ApiError(message, code);
  },
);

export function request<T>(config: ApiRequestConfig): Promise<T> {
  return httpClient.request<CommonResult<T>, T>(config);
}
