import detailMetadata from "@/data/riskDetailAssets.json";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import type { RiskGeo, RiskGeoFeature, RiskMapKind } from "@/utils/riskMap";
import { riskMapSha256 } from "@/utils/riskMapChecksum";

export type RiskDetailKind = "cities" | "subdivisions";

export interface RiskDetailFeatureProperties {
  name: string;
  code: string | null;
  label: string;
  nameZh: boolean;
  cp: [number, number];
  area: number;
}

export interface RiskDetailFeature {
  type: "Feature";
  properties: RiskDetailFeatureProperties;
  geometry: RiskGeoFeature["geometry"];
}

export interface RiskDetailGeo {
  type: "FeatureCollection";
  features: RiskDetailFeature[];
}

export interface RiskDetailFileMeta {
  sha256: string;
  bytes: number;
  features: number;
  coded: number;
}

export interface RiskDetailCoverage {
  mainlandProvinces: number;
  adm2Features: number;
  codedFeatures: number;
  uncodedFeatures: number;
  citiesWithoutBoundary: number;
  uncoded: { provinceCode: string; name: string }[];
  citiesWithoutBoundaryList: { code: string; name: string }[];
}

interface RiskDetailSourceMeta {
  name: string;
  version?: string;
  dataset?: string;
  repository: string;
  commit?: string;
  url?: string;
  resource?: string;
  datasetDate?: string;
  resourceLastModified?: string;
  tarball?: string;
  integrity?: string;
  tarballSha256?: string;
  sha256?: string;
  shpSha256?: string;
  dbfSha256?: string;
  prjSha256?: string;
  license: string;
  licenseUrl?: string;
  licenseEvidence?: string;
  attribution?: string;
  caveat?: string;
  usage: string;
  processing: string;
  coverage?: RiskDetailCoverage;
}

export interface RiskDetailManifest {
  version: string;
  china: { files: Record<string, RiskDetailFileMeta>; source: RiskDetailSourceMeta };
  world: { files: Record<string, RiskDetailFileMeta>; source: RiskDetailSourceMeta };
}

export interface RiskDetailAsset {
  geo: RiskDetailGeo;
  key: string;
  sha256: string;
}

export interface RiskDetailCountRow {
  code: string;
  name: string;
  count: string;
}

export interface RiskDetailUnplaced {
  code: string | null;
  name: string;
  count: string;
  reason: string;
}

export interface RiskDetailCounts {
  exact: RiskDetailCountRow[];
  unplaced: RiskDetailUnplaced[];
  safe: boolean;
}

export interface RiskDetailLayer {
  kind: RiskDetailKind;
  regionCode: string;
  geo: RiskDetailGeo;
  counts: RiskDetailCounts;
  selectedName: string | null;
}

/** 仅用于国家/全国视野的城市标签，不改变父级地图或统计。 */
export interface RiskViewportDetail {
  parentCode: string;
  features: RiskDetailFeature[];
}

export interface RiskDetailLabelRow {
  label: string;
  nameZh: boolean;
}

export interface RiskDetailLabels {
  kind: RiskDetailKind;
  regionCode: string;
  labels: Record<string, RiskDetailLabelRow>;
}

export const riskDetailAssets = detailMetadata as unknown as RiskDetailManifest;

const HAN = /[\u3400-\u9fff]/;
const CHINA_DETAIL_CODE = /^\d{6}$/;
const WORLD_DETAIL_CODE = /^[A-Z]{2}-[A-Z0-9]{1,5}$/;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ring(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  if (!value.every((point) => Array.isArray(point) && point.length >= 2 && typeof point[0] === "number" && typeof point[1] === "number" && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) return false;
  const first = value[0] as number[];
  const last = value[value.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1];
}

function polygon(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(ring);
}

/** 6 位城市编码：CN-31 -> 310000；其余编码返回 undefined，绝不截断猜测。 */
export function riskDetailAdcode(regionCode: string): string | undefined {
  const match = /^CN-(\d{2})$/.exec(regionCode);
  return match ? `${match[1]}0000` : undefined;
}

export function riskDetailFileKey(kind: RiskMapKind, regionCode: string): string | undefined {
  if (kind === "china") {
    const key = riskDetailAdcode(regionCode);
    return key && Object.hasOwn(riskDetailAssets.china.files, key) ? key : undefined;
  }
  return Object.hasOwn(riskDetailAssets.world.files, regionCode) ? regionCode : undefined;
}

export function riskDetailMeta(kind: RiskMapKind, regionCode: string): RiskDetailFileMeta | undefined {
  const key = riskDetailFileKey(kind, regionCode);
  if (!key) return undefined;
  return kind === "china" ? riskDetailAssets.china.files[key] : riskDetailAssets.world.files[key];
}

export function hasHan(value: string): boolean {
  return HAN.test(value);
}

/**
 * 细分资产是固定静态资源，不是业务数据。每个 feature 只接受受控属性；
 * 编码必须唯一且属于当前省/国家，未核实边界保留 code=null。
 */
export function validateRiskDetailGeo(kind: RiskMapKind, regionCode: string, input: unknown): RiskDetailGeo {
  const meta = riskDetailMeta(kind, regionCode);
  if (!meta) throw new Error("DETAIL_ASSET_MISSING");
  if (!object(input) || input.type !== "FeatureCollection" || !Array.isArray(input.features) || input.features.length !== meta.features) throw new Error("DETAIL_STRUCTURE");
  const expectedPrefix = kind === "china" ? riskDetailAdcode(regionCode)!.slice(0, 2) : `${regionCode}-`;
  const names = new Set<string>();
  const codes = new Set<string>();
  const features = input.features.map((feature): RiskDetailFeature => {
    if (!object(feature) || feature.type !== "Feature" || !object(feature.properties) || !object(feature.geometry)) throw new Error("DETAIL_STRUCTURE");
    const properties = feature.properties;
    const name = properties.name;
    if (typeof name !== "string" || !name || names.has(name)) throw new Error("DETAIL_NAME");
    names.add(name);
    const rawCode = properties.code;
    if (rawCode !== null && typeof rawCode !== "string") throw new Error("DETAIL_CODE");
    const code = rawCode as string | null;
    if (code !== null) {
      const valid = kind === "china"
        ? CHINA_DETAIL_CODE.test(code) && code.startsWith(expectedPrefix)
        : WORLD_DETAIL_CODE.test(code) && code.startsWith(expectedPrefix);
      if (!valid || codes.has(code)) throw new Error("DETAIL_CODE");
      codes.add(code);
    }
    const label = properties.label;
    if (typeof label !== "string" || !label.trim()) throw new Error("DETAIL_LABEL");
    if (typeof properties.nameZh !== "boolean") throw new Error("DETAIL_LABEL");
    const cp = properties.cp;
    if (!Array.isArray(cp) || cp.length !== 2 || !cp.every((value) => typeof value === "number" && Number.isFinite(value)) || Math.abs(cp[0] as number) > 180 || Math.abs(cp[1] as number) > 90) throw new Error("DETAIL_CENTER");
    const area = properties.area;
    if (typeof area !== "number" || !Number.isFinite(area) || area < 0) throw new Error("DETAIL_CENTER");
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") throw new Error("DETAIL_GEOMETRY");
    const geometryValid = geometry.type === "Polygon"
      ? polygon(geometry.coordinates)
      : Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(polygon);
    if (!geometryValid) throw new Error("DETAIL_GEOMETRY");
    return {
      type: "Feature",
      properties: {
        name,
        code,
        label,
        nameZh: properties.nameZh,
        cp: [cp[0] as number, cp[1] as number],
        area,
      },
      geometry: { type: geometry.type, coordinates: geometry.coordinates as RiskGeoFeature["geometry"]["coordinates"] },
    };
  });
  if (codes.size !== meta.coded) throw new Error("DETAIL_CODE");
  return { type: "FeatureCollection", features };
}

/** 每个页面实例独立缓存成功与失败 Promise；按需加载，不重新下载已选地域。 */
export function createRiskDetailLoader(options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
  const controller = new AbortController();
  const cache = new Map<string, Promise<RiskDetailAsset>>();
  const fetcher = options.fetcher ?? ((...args) => fetch(...args));

  async function attempt(kind: RiskMapKind, regionCode: string, key: string): Promise<RiskDetailAsset> {
    const meta = riskDetailMeta(kind, regionCode);
    if (!meta) throw new Error("DETAIL_ASSET_MISSING");
    const child = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => { child.abort(); reject(new Error("DETAIL_ABORTED")); };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
      timer = setTimeout(() => { child.abort(); reject(new Error("DETAIL_TIMEOUT")); }, 5000);
    });
    try {
      return await Promise.race([interrupted, (async () => {
        const base = (options.baseUrl ?? import.meta.env.BASE_URL).replace(/\/?$/, "/");
        const url = `${base}maps/${riskDetailAssets.version}/${kind}/${key}.geojson`;
        const response = await fetcher(url, {
          method: "GET",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          redirect: "error",
          signal: child.signal,
          headers: { Accept: "application/geo+json, application/json" },
        });
        if (!response.ok) throw new Error("DETAIL_HTTP");
        const text = await response.text();
        const sha = await riskMapSha256(text);
        if (sha !== meta.sha256) throw new Error("DETAIL_CHECKSUM");
        return { geo: validateRiskDetailGeo(kind, regionCode, JSON.parse(text)), key, sha256: sha };
      })()]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }

  return {
    load(kind: RiskMapKind, regionCode: string): Promise<RiskDetailAsset> {
      if (controller.signal.aborted) return Promise.reject(new Error("DETAIL_ABORTED"));
      const key = riskDetailFileKey(kind, regionCode);
      if (!key) return Promise.reject(new Error("DETAIL_ASSET_MISSING"));
      const cacheKey = `${kind}:${key}`;
      const existing = cache.get(cacheKey);
      if (existing) return existing;
      const promise = attempt(kind, regionCode, key);
      cache.set(cacheKey, promise);
      return promise;
    },
    stop() {
      controller.abort();
      cache.clear();
    },
  };
}

/**
 * 将细分统计按真实编码投影到边界。只匹配已核实编码；重复编码累加，
 * 无编码、格式错误或本图无边界项进入文字未定位列表，不模拟任何计数。
 */
export function riskDetailCounts(kind: RiskDetailKind, items: GeoBreakdown["items"], geo: RiskDetailGeo): RiskDetailCounts {
  const geometryCodes = new Set(geo.features.flatMap((feature) => feature.properties.code ? [feature.properties.code] : []));
  const pattern = kind === "cities" ? CHINA_DETAIL_CODE : WORLD_DETAIL_CODE;
  const totals = new Map<string, bigint>();
  const names = new Map<string, string>();
  const unplaced: RiskDetailUnplaced[] = [];
  for (const item of items) {
    const code = kind === "cities" ? item.cityCode ?? null : item.provinceCode ?? null;
    const name = (kind === "cities" ? item.cityName : item.provinceName) ?? "未提供名称";
    if (!code || !pattern.test(code)) {
      unplaced.push({ code, name, count: item.requestCount, reason: "无可核实细分编码" });
      continue;
    }
    if (!/^\d+$/.test(item.requestCount)) {
      unplaced.push({ code, name, count: item.requestCount, reason: "计数格式无效" });
      continue;
    }
    if (!geometryCodes.has(code)) {
      unplaced.push({ code, name, count: item.requestCount, reason: "本细分图无对应边界" });
      continue;
    }
    totals.set(code, (totals.get(code) ?? 0n) + BigInt(item.requestCount));
    names.set(code, name);
  }
  const exact = Array.from(totals, ([code, count]) => ({ code, name: names.get(code) ?? code, count: count.toString() }));
  return {
    exact,
    unplaced,
    safe: exact.every((row) => BigInt(row.count) <= BigInt(Number.MAX_SAFE_INTEGER)),
  };
}

/** 父级边界替换为细分边界；未匹配父级时原图不变。 */
export function mergeRiskDetailGeo(parent: RiskGeo, detail: RiskDetailGeo, parentCode: string): RiskGeo {
  const features = parent.features.filter((feature) => feature.properties.code !== parentCode);
  return { type: "FeatureCollection", features: [...features, ...detail.features] as RiskGeoFeature[] };
}

export function riskDetailLabelMap(geo: RiskDetailGeo): Record<string, RiskDetailLabelRow> {
  const labels: Record<string, RiskDetailLabelRow> = {};
  for (const feature of geo.features) {
    if (!feature.properties.code) continue;
    labels[feature.properties.code] = { label: feature.properties.label, nameZh: feature.properties.nameZh };
  }
  return labels;
}

export function riskDetailDisplayName(feature: RiskDetailFeature, markOriginal = true): string {
  return feature.properties.nameZh || !markOriginal ? feature.properties.label : `${feature.properties.label}（原名）`;
}

/** 视野内按面积优先、最小间距贪心选标签，避免城市/行政区标签互相遮挡。 */
export function riskDetailLabelNames(
  geo: RiskDetailGeo,
  options: { minDistance: number; bounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }; limit?: number },
): Set<string> {
  const bounds = options.bounds;
  const candidates = geo.features
    .filter((feature) => {
      const [lng, lat] = feature.properties.cp;
      return feature.properties.area > 0 && Number.isFinite(lng) && Number.isFinite(lat)
        && (!bounds || (lng >= bounds.minLng && lng <= bounds.maxLng && lat >= bounds.minLat && lat <= bounds.maxLat));
    })
    .sort((left, right) => right.properties.area - left.properties.area || left.properties.name.localeCompare(right.properties.name));
  const picked: RiskDetailFeature[] = [];
  const names = new Set<string>();
  const minDistance = Math.max(0.0001, options.minDistance);
  for (const feature of candidates) {
    const [lng, lat] = feature.properties.cp;
    if (picked.some((other) => Math.hypot(other.properties.cp[0] - lng, other.properties.cp[1] - lat) < minDistance)) continue;
    picked.push(feature);
    names.add(feature.properties.name);
    if (names.size >= (options.limit ?? 40)) break;
  }
  return names;
}
