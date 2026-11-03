import { afterEach, expect, it } from "vitest";
import { AxiosHeaders } from "axios";
import { httpClient } from "@/utils/request";
import { getRiskServerConfig, saveRiskServerConfig, resolveRiskServerConfig } from "@/api/riskServer";
const adapter = httpClient.defaults.adapter;
afterEach(() => { httpClient.defaults.adapter = adapter; });
it("uses exact configuration endpoints, content unwrap and string versions", async () => {
  const calls: { url?: string; method?: string; data: unknown }[] = [];
  httpClient.defaults.adapter = async (config) => { calls.push({ url: config.url, method: config.method, data: config.data ? JSON.parse(config.data) : undefined }); return { data: { success: true, code: 200, content: { version: "9007199254740993" } }, status: 200, statusText: "OK", headers: new AxiosHeaders(), config }; };
  expect(await getRiskServerConfig()).toEqual({ version: "9007199254740993" });
  const input = { version: null, alias: "test", publicIp: "8.8.8.8", manualLocation: { regionCode: "CN-31", longitude: "121.123456", latitude: "31.23" } };
  await saveRiskServerConfig(input); await resolveRiskServerConfig("9007199254740993");
  expect(calls).toEqual([{ url: "/risk/server-config", method: "get", data: undefined }, { url: "/risk/server-config/save", method: "post", data: input }, { url: "/risk/server-config/resolve", method: "post", data: { version: "9007199254740993" } }]);
});
