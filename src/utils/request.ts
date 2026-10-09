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

declare module "axios" {
  export interface AxiosRequestConfig {
    silentError?: boolean;
    publicAccess?: boolean;
    timeoutMessage?: string;
  }

  export interface InternalAxiosRequestConfig {
    silentError?: boolean;
    publicAccess?: boolean;
    timeoutMessage?: string;
  }
}

export const AUTH_EXPIRED_EVENT = "vita-stock-admin:auth-expired";
const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");
export const PUBLIC_API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_OPENAPI_BASE_URL || "/openapi/api");

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

export class StreamResponseError extends ApiError {
  constructor(message: string, code: number | undefined, public readonly httpStatus: number,
    public readonly contentType: string, public readonly classification: "http" | "html" | "json" | "non-sse" | "missing-body") {
    super(`${message}（HTTP ${httpStatus}，${classification}，Content-Type: ${contentType || "缺失"}）`, code);
    this.name = "StreamResponseError";
  }
}

export const httpClient = axios.create({
  baseURL: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "/admin/api"),
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

function shouldShowError(config?: AxiosRequestConfig): boolean {
  return config?.silentError !== true;
}

httpClient.interceptors.request.use((config) => {
  if (config.publicAccess) return config;
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

    if (result.code === 401 && !response.config.publicAccess) {
      expireSession();
    }
    const message = result.msg || "请求失败，请稍后重试";
    if (shouldShowError(response.config)) {
      showError(message);
    }
    throw new ApiError(message, result.code);
  },
  (error: AxiosError<CommonResult<unknown>>) => {
    const code = error.response?.data?.code ?? error.response?.status;
    const message =
      error.response?.data?.msg ||
      (["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "")
        ? error.config?.timeoutMessage || "请求超时，请检查服务状态"
        : "网络连接异常，请稍后重试");

    if (code === 401 && !error.config?.publicAccess) {
      expireSession();
    }
    if (shouldShowError(error.config)) {
      showError(message);
    }
    throw new ApiError(message, code);
  },
);

export function request<T>(config: ApiRequestConfig): Promise<T> {
  return httpClient.request<CommonResult<T>, T>(config);
}

/** Streaming counterpart to request: the SSE response is not a CommonResult. */
export async function requestStream(path: string, signal: AbortSignal, publicAccess = false): Promise<Response> {
  const headers = new Headers({ Accept: "text/event-stream" });
  const credential = publicAccess ? null : getCredential();
  if (credential) {
    headers.set(credential.tokenName, buildAuthorizationValue(credential));
  }
  const base = normalizeBaseUrl(publicAccess ? PUBLIC_API_BASE_URL : String(httpClient.defaults.baseURL || "/admin/api"));
  const response = await fetch(`${base}${path}`, {
    method: "GET",
    headers,
    signal,
    cache: "no-store",
    credentials: publicAccess ? "omit" : "same-origin",
  });
  const isEventStream = response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") ?? false;
  const contentType = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase().slice(0, 120);
  if (!response.ok || !isEventStream) {
    let code: number | undefined = response.ok ? undefined : response.status;
    let message = response.status === 403 ? "无权查看公开数据" : "事件流响应格式异常";
    try {
      const body = await response.json() as Partial<CommonResult<unknown>>;
      if (typeof body.code === "number") code = body.code;
      if (typeof body.msg === "string" && body.msg) message = body.msg;
    } catch { /* Error responses may not contain JSON. */ }
    if (code === 401 && !publicAccess) {
      expireSession();
      throw new StreamResponseError(message, 401, response.status, contentType, "http");
    }
    const classification = contentType.includes("html") ? "html" : contentType.includes("json") ? "json" : response.ok ? "non-sse" : "http";
    throw new StreamResponseError(message, code, response.status, contentType, classification);
  }
  if (!response.body) {
    throw new StreamResponseError("事件流响应缺少 body", undefined, response.status, contentType, "missing-body");
  }
  return response;
}
