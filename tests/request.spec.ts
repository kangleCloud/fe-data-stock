import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteRole } from "@/api/role";
import { deleteUser } from "@/api/user";
import type { CommonResult, LoginResponse } from "@/types/api";
import { httpClient, request } from "@/utils/request";
import { saveCredential } from "@/utils/storage";

const originalAdapter = httpClient.defaults.adapter;

function successAdapter<T>(
  content: T,
  onRequest?: (config: InternalAxiosRequestConfig) => void,
): AxiosAdapter {
  return async (config) => {
    onRequest?.(config);
    return {
      data: {
        code: 200,
        success: true,
        msg: "接口调用成功",
        content,
      } satisfies CommonResult<T>,
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    } as AxiosResponse<CommonResult<T>>;
  };
}

describe("request", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    httpClient.defaults.adapter = originalAdapter;
  });

  it("unwraps CommonResult content", async () => {
    httpClient.defaults.adapter = successAdapter({ id: 7 });

    await expect(
      request<{ id: number }>({ url: "/testing", method: "GET" }),
    ).resolves.toEqual({ id: 7 });
  });

  it("attaches the backend-provided token header", async () => {
    const login: LoginResponse = {
      tokenName: "Authorization",
      tokenValue: "token-value",
      tokenPrefix: "Bearer",
      expiresIn: 3600,
      userId: 1,
      username: "admin",
      nickName: "管理员",
    };
    saveCredential(login);
    let authorization = "";
    httpClient.defaults.adapter = successAdapter(true, (config) => {
      authorization = String(config.headers.get("Authorization") ?? "");
    });

    await request<boolean>({ url: "/testing", method: "GET" });

    expect(authorization).toBe("Bearer token-value");
  });

  it("uses POST for user and role deletion", async () => {
    const requests: Array<{
      method: string;
      url: string;
      id: number;
    }> = [];
    httpClient.defaults.adapter = successAdapter(true, (config) => {
      requests.push({
        method: String(config.method).toUpperCase(),
        url: String(config.url),
        id: Number(config.params?.id),
      });
    });

    await deleteUser(7);
    await deleteRole(8);

    expect(requests).toEqual([
      { method: "POST", url: "/system/sysUser/delete", id: 7 },
      { method: "POST", url: "/system/sysRole/delete", id: 8 },
    ]);
  });
});
