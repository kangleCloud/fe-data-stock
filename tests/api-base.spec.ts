import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("REST and SSE API bases", () => {
  it.each([
    ["", "", "/admin/api", "/openapi/api"],
    ["/stock/admin/api", "/stock/openapi/api", "/stock/admin/api", "/stock/openapi/api"],
    ["/stock/admin/api///", "/stock/openapi/api///", "/stock/admin/api", "/stock/openapi/api"],
  ])("shares bases for config %s and %s", async (admin, publicBase, expectedAdmin, expectedPublic) => {
    vi.stubEnv("VITE_API_BASE_URL", admin!); vi.stubEnv("VITE_OPENAPI_BASE_URL", publicBase!);
    vi.resetModules();
    const request = await import("@/utils/request");
    const calls: InternalAxiosRequestConfig[] = [];
    request.httpClient.defaults.adapter = async (config) => {
      calls.push(config);
      return { data: { success: true, content: config.publicAccess ? {
        schemaVersion: 1, stateId: null, xqEnabled: false, tradeDate: null, etfs: [],
      } : {} }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
    };
    const { getCaptcha } = await import("@/api/auth");
    const { getEtfMonitorDashboard } = await import("@/api/etf");
    await getCaptcha(); await getEtfMonitorDashboard();
    expect(calls.map((call) => call.baseURL)).toEqual([expectedAdmin, expectedPublic]);
    const fetch = vi.fn().mockResolvedValue(new Response(": ping\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetch);
    await request.requestStream("/etf-monitor/v1/stream", new AbortController().signal, true);
    expect(fetch).toHaveBeenCalledWith(`${expectedPublic}/etf-monitor/v1/stream`, expect.objectContaining({ credentials: "omit" }));
  });
});
