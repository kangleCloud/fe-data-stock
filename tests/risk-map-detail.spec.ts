import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRiskDetailLoader,
  mergeRiskDetailGeo,
  riskDetailAdcode,
  riskDetailAssets,
  riskDetailCounts,
  riskDetailDisplayName,
  riskDetailFileKey,
  riskDetailLabelMap,
  riskDetailLabelNames,
  riskDetailMeta,
  validateRiskDetailGeo,
  type RiskDetailFeature,
  type RiskDetailGeo,
} from "@/utils/riskMapDetail";
import { validateRiskGeo } from "@/utils/riskMap";

const baseGeo = validateRiskGeo("china", JSON.parse(readFileSync("public/maps/risk-v1/china.geojson", "utf8")));
const chinaText = readFileSync("public/maps/risk-detail-v2/china/310000.geojson", "utf8");
const worldText = readFileSync("public/maps/risk-detail-v2/world/PS.geojson", "utf8");

function fetcherFor(text: string, calls?: unknown[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls?.push([url, init]);
    return { ok: true, text: async () => text };
  }) as unknown as typeof fetch;
}

function square(lng: number, lat: number, size = 0.5): RiskDetailFeature["geometry"] {
  return {
    type: "Polygon",
    coordinates: [[
      [lng - size, lat - size],
      [lng + size, lat - size],
      [lng + size, lat + size],
      [lng - size, lat + size],
      [lng - size, lat - size],
    ]],
  };
}

function detailFeature(name: string, code: string | null, lng: number, lat: number, area: number, label = name, nameZh = true): RiskDetailFeature {
  return {
    type: "Feature",
    properties: { name, code, label, nameZh, cp: [lng, lat], area },
    geometry: square(lng, lat),
  };
}

function detailGeo(features: RiskDetailFeature[]): RiskDetailGeo {
  return { type: "FeatureCollection", features };
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("risk detail asset metadata", () => {
  it("maps only six-digit province codes and never guesses missing files", () => {
    expect(riskDetailAdcode("CN-31")).toBe("310000");
    expect(riskDetailAdcode("CN-11")).toBe("110000");
    expect(riskDetailAdcode("CN-710000")).toBeUndefined();
    expect(riskDetailAdcode("US-CA")).toBeUndefined();
    expect(riskDetailFileKey("china", "CN-31")).toBe("310000");
    expect(riskDetailFileKey("china", "CN-99")).toBeUndefined();
    expect(riskDetailFileKey("world", "PS")).toBe("PS");
    expect(riskDetailFileKey("world", "ZZ")).toBeUndefined();
    expect(riskDetailMeta("china", "CN-31")?.features).toBe(1);
    expect(riskDetailMeta("world", "PS")?.coded).toBe(2);
    expect(riskDetailAssets.world.files.PS?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects structural, prefix and duplicate-code tampering", () => {
    const valid = JSON.parse(chinaText);
    expect(validateRiskDetailGeo("china", "CN-31", valid).features).toHaveLength(1);

    const shortened = { ...valid, features: [] };
    expect(() => validateRiskDetailGeo("china", "CN-31", shortened)).toThrow("DETAIL_STRUCTURE");

    const wrongPrefix = JSON.parse(chinaText);
    wrongPrefix.features[0].properties.code = "320000";
    expect(() => validateRiskDetailGeo("china", "CN-31", wrongPrefix)).toThrow("DETAIL_CODE");

    const duplicateCode = JSON.parse(worldText);
    duplicateCode.features[1].properties.code = duplicateCode.features[0].properties.code;
    expect(() => validateRiskDetailGeo("world", "PS", duplicateCode)).toThrow("DETAIL_CODE");

    const duplicateName = JSON.parse(worldText);
    duplicateName.features[1].properties.name = duplicateName.features[0].properties.name;
    expect(() => validateRiskDetailGeo("world", "PS", duplicateName)).toThrow("DETAIL_NAME");
  });
});

describe("risk detail China asset coverage", () => {
  it("validates every v2 province file with unique names and only verifiable six-digit codes", () => {
    const files = riskDetailAssets.china.files;
    expect(Object.keys(files)).toHaveLength(31);
    const codes = new Set<string>();
    const uncoded: string[] = [];
    let features = 0;
    for (const [key, meta] of Object.entries(files)) {
      const regionCode = `CN-${key.slice(0, 2)}`;
      const json = JSON.parse(readFileSync(`public/maps/risk-detail-v2/china/${key}.geojson`, "utf8"));
      const geo = validateRiskDetailGeo("china", regionCode, json);
      expect(geo.features).toHaveLength(meta.features);
      const names = new Set(geo.features.map((feature) => feature.properties.name));
      expect(names.size).toBe(geo.features.length);
      expect(names.has("null-undefined")).toBe(false);
      features += geo.features.length;
      for (const feature of geo.features) {
        const code = feature.properties.code;
        if (code === null) {
          expect(feature.properties.name).toBe(feature.properties.label);
          expect(feature.properties.label).toMatch(/[\u4e00-\u9fa5]/);
          uncoded.push(feature.properties.label);
          continue;
        }
        expect(code).toMatch(/^\d{6}$/);
        expect(code.startsWith(key.slice(0, 2))).toBe(true);
        expect(codes.has(code)).toBe(false);
        codes.add(code);
      }
      expect(geo.features.filter((feature) => feature.properties.code !== null)).toHaveLength(meta.coded);
    }
    expect(features).toBe(358);
    expect(codes.size).toBe(343);
    expect(uncoded).toHaveLength(15);
    expect(uncoded).toEqual(expect.arrayContaining([
      "莱芜市",
      "神农架林区",
      "那曲地区",
      "海西蒙古族自治州",
      "株州市",
      "临高县",
      "陵水黎族自治县",
    ]));
    const coverage = riskDetailAssets.china.source.coverage!;
    expect(coverage).toMatchObject({
      mainlandProvinces: 31,
      adm2Features: features,
      codedFeatures: codes.size,
      uncodedFeatures: uncoded.length,
      citiesWithoutBoundary: 15,
    });
  });

  it("uses one direct-municipality feature and keeps province-administered cities verifiable", () => {
    for (const key of ["110000", "120000", "310000", "500000"]) {
      const geo = validateRiskDetailGeo("china", `CN-${key.slice(0, 2)}`, JSON.parse(readFileSync(`public/maps/risk-detail-v2/china/${key}.geojson`, "utf8")));
      expect(geo.features.map((feature) => feature.properties.code)).toEqual([key]);
    }
    const henan = validateRiskDetailGeo("china", "CN-41", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/410000.geojson", "utf8")));
    expect(henan.features.find((feature) => feature.properties.code === "419001")?.properties.label).toBe("济源市");
    const xinjiang = validateRiskDetailGeo("china", "CN-65", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/650000.geojson", "utf8")));
    expect(xinjiang.features.find((feature) => feature.properties.code === "659001")?.properties.label).toBe("石河子市");
  });

  it("keeps uncoded Hainan boundaries visible but out of labels and verified statistics", () => {
    const hainan = validateRiskDetailGeo("china", "CN-46", JSON.parse(readFileSync("public/maps/risk-detail-v2/china/460000.geojson", "utf8")));
    const boundaries = hainan.features.filter((feature) => feature.properties.code === null);
    expect(boundaries).toHaveLength(10);
    expect(boundaries.map((feature) => feature.properties.label)).toContain("陵水黎族自治县");
    expect(boundaries.every((feature) => feature.properties.name === feature.properties.label)).toBe(true);
    expect(riskDetailLabelMap(hainan)["陵水黎族自治县"]).toBeUndefined();
    const counts = riskDetailCounts("cities", [
      { cityCode: "460100", cityName: "海口市", requestCount: "3" },
      { cityCode: null, cityName: "陵水黎族自治县", requestCount: "9" },
      { cityCode: "999999", cityName: "无边界", requestCount: "4" },
    ], hainan);
    expect(counts.exact).toEqual([{ code: "460100", name: "海口市", count: "3" }]);
    expect(counts.unplaced).toEqual([
      { code: null, name: "陵水黎族自治县", count: "9", reason: "无可核实细分编码" },
      { code: "999999", name: "无边界", count: "4", reason: "本细分图无对应边界" },
    ]);
  });
});

describe("risk detail loader", () => {
  it("loads and verifies a fixed local asset, then reuses the per-page cache", async () => {
    const fetcher = fetcherFor(chinaText);
    const loader = createRiskDetailLoader({ baseUrl: "/base/", fetcher });
    const first = loader.load("china", "CN-31");
    const second = loader.load("china", "CN-31");
    expect(second).toBe(first);
    const asset = await first;
    expect(asset.key).toBe("310000");
    expect(asset.geo.features[0]!.properties.label).toBe("上海市");
    expect(asset.sha256).toBe(riskDetailMeta("china", "CN-31")!.sha256);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/base/maps/risk-detail-v2/china/310000.geojson", expect.objectContaining({
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    }));
    loader.stop();
  });

  it("rejects checksum, HTTP and missing-asset failures without guessing", async () => {
    const checksum = createRiskDetailLoader({ baseUrl: "/", fetcher: fetcherFor(chinaText.replace("上海市", "上海市 ")) });
    await expect(checksum.load("china", "CN-31")).rejects.toThrow("DETAIL_CHECKSUM");

    const http = createRiskDetailLoader({ baseUrl: "/", fetcher: (async () => ({ ok: false })) as unknown as typeof fetch });
    await expect(http.load("world", "PS")).rejects.toThrow("DETAIL_HTTP");

    const fetcher = fetcherFor(chinaText);
    const missing = createRiskDetailLoader({ baseUrl: "/", fetcher });
    await expect(missing.load("china", "CN-99")).rejects.toThrow("DETAIL_ASSET_MISSING");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caches failures and aborts in-flight loads on teardown", async () => {
    const failing = fetcherFor("not-json");
    const loader = createRiskDetailLoader({ baseUrl: "/", fetcher: failing });
    const first = loader.load("world", "PS");
    const second = loader.load("world", "PS");
    expect(second).toBe(first);
    await expect(first).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);

    let pending: ((value: unknown) => void) | undefined;
    const hangingMock = vi.fn((url: string, init?: RequestInit) => {
      void url; void init;
      return new Promise<unknown>((resolve) => { pending = resolve; });
    });
    const abortable = createRiskDetailLoader({ baseUrl: "/", fetcher: hangingMock as unknown as typeof fetch });
    const promise = abortable.load("china", "CN-31");
    const signal = hangingMock.mock.calls[0]![1]!.signal!;
    abortable.stop();
    await expect(promise).rejects.toThrow("DETAIL_ABORTED");
    expect(signal.aborted).toBe(true);
    pending?.({ ok: true, text: async () => chinaText });
  });
});

describe("risk detail statistics", () => {
  it("sums only verified codes and reports unplaced records without inventing counts", () => {
    const geo = detailGeo([
      detailFeature("3101", "310100", 121.4, 31.2, 2),
      detailFeature("3102", "310200", 121.6, 31.3, 1),
      detailFeature("unmatched", null, 121.5, 31.1, 1),
    ]);
    const counts = riskDetailCounts("cities", [
      { cityCode: "310100", cityName: "上海市", requestCount: "3" },
      { cityCode: "310100", cityName: "上海市", requestCount: "4" },
      { cityCode: "310200", cityName: "浦东", requestCount: "2" },
      { cityCode: "999999", cityName: "无边界", requestCount: "5" },
      { cityCode: null, cityName: "无编码", requestCount: "6" },
      { cityCode: "310100", cityName: "坏计数", requestCount: "1e3" },
    ], geo);
    expect(counts.safe).toBe(true);
    expect(counts.exact).toEqual([
      { code: "310100", name: "上海市", count: "7" },
      { code: "310200", name: "浦东", count: "2" },
    ]);
    expect(counts.unplaced).toEqual([
      { code: "999999", name: "无边界", count: "5", reason: "本细分图无对应边界" },
      { code: null, name: "无编码", count: "6", reason: "无可核实细分编码" },
      { code: "310100", name: "坏计数", count: "1e3", reason: "计数格式无效" },
    ]);
  });

  it("flags unsafe totals and keeps world subdivision codes separate from city adcodes", () => {
    const geo = detailGeo([detailFeature("PS-GZ", "PS-GZ", 34.3, 31.4, 1), detailFeature("PS-WE", "PS-WE", 35.2, 31.9, 1)]);
    const counts = riskDetailCounts("subdivisions", [
      { provinceCode: "PS-GZ", provinceName: "加沙省", requestCount: "9007199254740993" },
      { provinceCode: "PS-WE", provinceName: "约旦河西岸", requestCount: "2" },
      { provinceCode: "310100", provinceName: "错误格式", requestCount: "1" },
    ], geo);
    expect(counts.safe).toBe(false);
    expect(counts.exact[0]).toEqual({ code: "PS-GZ", name: "加沙省", count: "9007199254740993" });
    expect(counts.unplaced[0]).toMatchObject({ code: "310100", reason: "无可核实细分编码" });
  });
});

describe("risk detail geometry and labels", () => {
  it("replaces the selected parent boundary and keeps the rest of the base map", () => {
    const detail = validateRiskDetailGeo("china", "CN-31", JSON.parse(chinaText));
    const merged = mergeRiskDetailGeo(baseGeo, detail, "CN-31");
    expect(merged.features.some((feature) => feature.properties.code === "CN-31")).toBe(false);
    expect(merged.features.some((feature) => feature.properties.code === "310000")).toBe(true);
    expect(merged.features).toHaveLength(baseGeo.features.length);
    expect(mergeRiskDetailGeo(baseGeo, detail, "CN-99").features).toHaveLength(baseGeo.features.length + 1);
  });

  it("prefers verified Chinese labels and marks original names without guessing", () => {
    const zh = detailFeature("PS-GZ", "PS-GZ", 34.3, 31.4, 1, "加沙省", true);
    const original = detailFeature("XX-01", null, 10, 10, 1, "Example", false);
    expect(riskDetailDisplayName(zh)).toBe("加沙省");
    expect(riskDetailDisplayName(original)).toBe("Example（原名）");
    expect(riskDetailDisplayName(original, false)).toBe("Example");
    expect(riskDetailLabelMap(detailGeo([zh, original]))).toEqual({
      "PS-GZ": { label: "加沙省", nameZh: true },
    });
  });

  it("selects non-overlapping labels inside the current bounds by area", () => {
    const geo = detailGeo([
      detailFeature("large", null, 120, 30, 10),
      detailFeature("small", null, 120.3, 30.3, 1),
      detailFeature("far", null, 130, 40, 5),
      detailFeature("zero", null, 121, 31, 0),
    ]);
    expect(riskDetailLabelNames(geo, { minDistance: 1, bounds: { minLng: 119, maxLng: 122, minLat: 29, maxLat: 32 } }))
      .toEqual(new Set(["large"]));
    expect(riskDetailLabelNames(geo, { minDistance: 0.1, bounds: { minLng: 119, maxLng: 135, minLat: 29, maxLat: 45 } }))
      .toEqual(new Set(["large", "small", "far"]));
    expect(riskDetailLabelNames(geo, { minDistance: 0, limit: 1 })).toEqual(new Set(["large"]));
  });
});
