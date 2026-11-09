import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadConfigFromFile } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());
describe("frontend modules", () => {
  it.each(["stock-dashboard", "admin", "risk-dashboard"])("configures isolated output and base for %s", async (name) => {
    vi.stubEnv("STOCK_FRONTEND_MODULE", name);
    const result = await loadConfigFromFile({ command: "build", mode: "production" }, resolve("vite.config.ts"));
    expect(result?.config.base).toBe(`/${name}/`);
    expect(result?.config.build?.outDir).toBe(`dist/${name}`);
  });
  it("rejects a missing or unknown module before starting Vite", () => {
    for (const args of [["dev"], ["build", "unknown"]]) {
      expect(() => execFileSync(process.execPath, ["scripts/module.mjs", ...args], { stdio: "pipe" })).toThrow();
    }
  });
});
