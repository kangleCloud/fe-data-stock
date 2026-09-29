import { resolve } from "node:path";

import { loadConfigFromFile } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("development API proxies", () => {
  it("routes admin and public market requests to their respective services", async () => {
    vi.stubEnv("VITE_API_PROXY_TARGET", "http://127.0.0.1:19001");
    vi.stubEnv("VITE_OPENAPI_PROXY_TARGET", "http://127.0.0.1:19002");

    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      resolve(process.cwd(), "vite.config.ts"),
    );
    const server = loaded?.config.server;

    expect(server?.proxy?.["/admin/api"]).toMatchObject({ target: "http://127.0.0.1:19001" });
    expect(server?.proxy?.["/openapi/api"]).toMatchObject({ target: "http://127.0.0.1:19002" });
  });
});
