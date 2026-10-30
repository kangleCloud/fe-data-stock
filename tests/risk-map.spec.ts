import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { riskMapSha256 } from "@/utils/riskMapChecksum";
import { createRiskMapLoader, riskMapAssets, riskMapCounts, validateRiskGeo } from "@/utils/riskMap";
const texts = Object.fromEntries(riskMapAssets.map((asset) => [asset.kind, readFileSync(`public/${asset.localPath}`, "utf8")]));
const raw = (kind: "china" | "world") => JSON.parse(texts[kind]!);
const success = (text: string) => ({ ok: true, text: async () => text }) as Response;
const loaders: ReturnType<typeof createRiskMapLoader>[] = [];
function loader(fetcher: typeof fetch, baseUrl = "/") { const value = createRiskMapLoader({ fetcher, baseUrl }); loaders.push(value); return value; }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { loaders.splice(0).forEach((item) => item.stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("risk map real pinned assets", () => {
  it("ships actual licensed geometry with exact published SHA, fixed commits and exhaustive source-ID mapping", () => {
    for (const asset of riskMapAssets) {
      expect(asset.commit).toMatch(/^[a-f0-9]{40}$/); expect(asset.url).toContain(asset.commit); expect(asset.url).not.toContain("master");
      expect(asset.license).toBe("Public Domain"); expect(asset.licenseUrl).toMatch(/^https:\/\//);
      const license = readFileSync("public/maps/risk-v1/LICENSES.md", "utf8"); expect(license).toContain(asset.sha256); expect(license).toContain(asset.licenseUrl);
      expect(createHash("sha256").update(texts[asset.kind]!).digest("hex")).toBe(asset.sha256);
      const geo = validateRiskGeo(asset.kind as "china" | "world", raw(asset.kind as "china" | "world"));
      expect(geo.features).toHaveLength(asset.features);
      expect(Object.keys(asset.mapping)).toHaveLength(asset.features);
    }
    expect(validateRiskGeo("china", raw("china")).features).toHaveLength(34);
    expect(validateRiskGeo("world", raw("world")).features).toHaveLength(177);
  });
  it("verifies SHA on offline HTTP without Web Crypto using standard vectors and actual Unicode assets", async () => {
    vi.stubGlobal("crypto", {});
    for (const text of ["", "abc", "中文地图", texts.china!, texts.world!]) expect(await riskMapSha256(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
  it("rejects malformed geometry, duplicate IDs and wrong geographic encoding", () => {
    for (const mutation of [
      (value: ReturnType<typeof raw>) => { value.type = "Feature"; },
      (value: ReturnType<typeof raw>) => { value.features[0].geometry.coordinates = [[[0, 0], [1, 1]]]; },
      (value: ReturnType<typeof raw>) => { value.features[0].properties.shapeISO = "US"; },
      (value: ReturnType<typeof raw>) => { value.features[0].properties.shapeID = value.features[1].properties.shapeID; },
    ]) { const value = raw("china"); mutation(value); expect(() => validateRiskGeo("china", value)).toThrow(); }
  });
  it("keeps exact China province aliases, HK/MO/TW and world aggregation without counting any record twice", () => {
    const rows = [{ regionCode: "CN-31", requestCount: "2" }, { regionCode: "CN-SH", requestCount: "3" }, { regionCode: "CN", requestCount: "7" }, { regionCode: "HK", requestCount: "11" }, { regionCode: "CN-MO", requestCount: "13" }, { regionCode: "TW", requestCount: "17" }, { regionCode: "US", requestCount: "19" }, { regionCode: "UNKNOWN", requestCount: "23" }, { regionCode: "INTERNAL", requestCount: "29" }, { regionCode: "CN-XX", requestCount: "31" }];
    const china = riskMapCounts("china", rows, validateRiskGeo("china", raw("china")));
    expect(china.exact).toEqual([{ name: "CN-31", count: "5" }, { name: "HK", count: "11" }, { name: "MO", count: "13" }, { name: "TW", count: "17" }]);
    expect(china.unplaced.find((row) => row.regionCode === "CN")?.reason).toBe("中国来源缺省份");
    const world = riskMapCounts("world", rows, validateRiskGeo("world", raw("world")));
    expect(world.exact.find((row) => row.name === "CN")?.count).toBe("12");
    expect(world.unplaced.map((row) => row.regionCode)).toEqual(expect.arrayContaining(["HK", "CN-MO", "UNKNOWN", "INTERNAL", "CN-XX"]));
    const sum = (value: typeof china) => value.exact.reduce((total, row) => total + BigInt(row.count), 0n) + value.unplaced.reduce((total, row) => total + BigInt(row.requestCount), 0n);
    const total = rows.reduce((value, row) => value + BigInt(row.requestCount), 0n); expect(sum(china)).toBe(total); expect(sum(world)).toBe(total);
  });
  it("retains huge counts exactly and refuses imprecise heatmap values", () => {
    const value = riskMapCounts("world", [{ regionCode: "CN-31", requestCount: "9007199254740993" }, { regionCode: "CN", requestCount: "9" }], validateRiskGeo("world", raw("world")));
    expect(value.safe).toBe(false); expect(value.exact).toEqual([{ name: "CN", count: "9007199254741002" }]);
  });
});
describe("risk map local-first loader", () => {
  it("loads local assets under BASE_URL, zero external requests, single flight and page caching", async () => {
    const fetcher = vi.fn().mockResolvedValue(success(texts.china!)); const value = loader(fetcher, "/stock/");
    const first = value.load("china"); expect(value.load("china")).toBe(first);
    expect((await first).origin).toBe("local"); await value.load("china"); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/stock/maps/risk-v1/china.geojson");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", method: "GET", headers: { Accept: "application/geo+json, application/json" } }));
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/Authorization|Cookie|token|ip=/i);
  });
  it.each(["404", "invalid", "failure", "structure", "encoding"])("falls back exactly once after local %s", async (mode) => {
    const wrong = raw("china"); if (mode === "structure") wrong.type = "Feature"; else wrong.features[0].properties.shapeISO = "US";
    const fetcher = vi.fn().mockImplementationOnce(() => mode === "failure" ? Promise.reject(new Error("offline")) : Promise.resolve(mode === "404" ? { ok: false } : success(mode === "invalid" ? "not JSON" : JSON.stringify(wrong)))).mockResolvedValue(success(texts.china!));
    const value = loader(fetcher); expect((await value.load("china")).origin).toBe("external"); await value.load("china");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[1]?.[0]).toBe(riskMapAssets[0]!.url);
    expect(fetcher.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" }));
  });
  it.each(["invalid", "encoding"])("caches double failure after external %s without polling retries", async (mode) => {
    const wrong = raw("china"); wrong.features[0].properties.shapeISO = "US";
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue(success(mode === "invalid" ? "{" : JSON.stringify(wrong)));
    const value = loader(fetcher); await expect(value.load("china")).rejects.toThrow(); await expect(value.load("china")).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds external timeout to five seconds even when transport ignores abort", async () => {
    vi.useFakeTimers(); const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockImplementation(() => new Promise(() => undefined)); const value = loader(fetcher);
    const promise = value.load("world"); const checked = expect(promise).rejects.toThrow("MAP_TIMEOUT"); await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(2); await vi.advanceTimersByTimeAsync(5000); await checked;
    await expect(value.load("world")).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cancels in-flight work on unmount and never starts external fallback after stop", async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined)); const value = loader(fetcher); const promise = value.load("china"); const checked = expect(promise).rejects.toThrow("MAP_ABORTED"); value.stop(); await checked;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1); await expect(value.load("world")).rejects.toThrow();
  });
});
