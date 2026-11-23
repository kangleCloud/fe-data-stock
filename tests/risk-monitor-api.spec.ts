import { afterEach, expect, it } from "vitest";
import { AxiosHeaders } from "axios";
import { httpClient } from "@/utils/request";
import { enableRiskMapServer, getRiskMapServers, saveRiskMapServer, saveRiskTarget } from "@/api/riskMonitor";

const adapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = adapter; });
it("uses separate map and monitor API contracts", async () => {
  const calls: { url?: string; method?: string; data: unknown }[] = [];
  httpClient.defaults.adapter = async config => {
    calls.push({ url: config.url, method: config.method, data: config.data ? JSON.parse(config.data) : undefined });
    return { data: { success: true, code: 200, content: {} }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config };
  };
  await getRiskMapServers();
  const map = { id: null, version: null, name: "代理", publicIp: "198.51.100.1", longitude: null, latitude: null, coordinateSystem: null, locationSource: "AMAP" as const, enabled: true };
  await saveRiskMapServer(map); await enableRiskMapServer({ id: "1", version: "2", enabled: false });
  const monitor = { targetId: null, version: null, alias: "主机", type: "REMOTE" as const, enabled: true, intervalSeconds: 30, collectorId: "collector", connection: { host: "example.internal", port: 22, username: "monitor", password: "test-only" } };
  await saveRiskTarget(monitor);
  expect(calls.map(call => [call.method, call.url])).toEqual([["get", "/risk/map-servers/list"], ["post", "/risk/map-servers/save"], ["post", "/risk/map-servers/enable"], ["post", "/risk/targets/save"]]);
  expect(calls[1]?.data).toEqual(map); expect(calls[3]?.data).toEqual(monitor);
});
