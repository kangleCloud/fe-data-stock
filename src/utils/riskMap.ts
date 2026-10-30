import { riskMapSha256 } from "@/utils/riskMapChecksum";
import assets from "@/data/riskMapAssets.json";
export type RiskMapKind = "china" | "world";
export interface RiskGeoFeature { type: "Feature"; properties: { name: string; label: string; code: string | null }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } }
export interface RiskGeo { type: "FeatureCollection"; features: RiskGeoFeature[] }
export interface RiskMapAsset { geo: RiskGeo; origin: "local" | "external" }
interface Mapping { code: string | null; sourceCode: string; label: string }
export const riskMapAssets = assets;
const aliases: Record<string, string> = Object.fromEntries([
  ["BJ", "11"], ["TJ", "12"], ["HE", "13"], ["SX", "14"], ["NM", "15"], ["LN", "21"], ["JL", "22"], ["HL", "23"], ["SH", "31"], ["JS", "32"], ["ZJ", "33"], ["AH", "34"], ["FJ", "35"], ["JX", "36"], ["SD", "37"], ["HA", "41"], ["HB", "42"], ["HN", "43"], ["GD", "44"], ["GX", "45"], ["HI", "46"], ["CQ", "50"], ["SC", "51"], ["GZ", "52"], ["YN", "53"], ["XZ", "54"], ["SN", "61"], ["GS", "62"], ["QH", "63"], ["NX", "64"], ["XJ", "65"],
].map(([alpha, numeric]) => [`CN-${alpha}`, `CN-${numeric}`]));
Object.assign(aliases, { "CN-91": "HK", "CN-HK": "HK", "CN-92": "MO", "CN-MO": "MO", "CN-71": "TW", "CN-TW": "TW" });
const provinceCodes = new Set(Object.values(aliases).filter((code) => code.startsWith("CN-")));
export function canonicalRiskRegion(code: string): string { return aliases[code] ?? code; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function ring(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  if (!value.every((point) => Array.isArray(point) && point.length >= 2 && typeof point[0] === "number" && typeof point[1] === "number" && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) return false;
  const first = value[0] as number[]; const last = value[value.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1];
}
function polygon(value: unknown): boolean { return Array.isArray(value) && value.length > 0 && value.every(ring); }
/** 固定源ID->静态协议编码；绝不根据英文地名在运行时猜测。 */
export function validateRiskGeo(kind: RiskMapKind, input: unknown): RiskGeo {
  const asset = assets.find((item) => item.kind === kind)!;
  const mapping = asset.mapping as unknown as Record<string, Mapping>;
  if (!object(input) || input.type !== "FeatureCollection" || !Array.isArray(input.features) || input.features.length !== asset.features) throw new Error("MAP_STRUCTURE");
  const seen = new Set<string>();
  const features = input.features.map((feature): RiskGeoFeature => {
    if (!object(feature) || feature.type !== "Feature" || !object(feature.properties) || !object(feature.geometry)) throw new Error("MAP_STRUCTURE");
    const id = feature.properties[asset.idProperty];
    if (typeof id !== "string" || !Object.hasOwn(mapping, id) || seen.has(id)) throw new Error("MAP_CODE");
    seen.add(id); const entry = mapping[id]!;
    if (feature.properties[asset.codeProperty] !== entry.sourceCode || (entry.code !== null && !/^(?:[A-Z]{2}|CN-\d{2})$/.test(entry.code))) throw new Error("MAP_CODE");
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") throw new Error("MAP_GEOMETRY");
    if (!(geometry.type === "Polygon" ? polygon(geometry.coordinates) : Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(polygon))) throw new Error("MAP_GEOMETRY");
    return { type: "Feature", properties: { name: entry.code ?? `BOUNDARY_${id}`, label: entry.label, code: entry.code }, geometry: { type: geometry.type, coordinates: geometry.coordinates } };
  });
  if (new Set(features.map((feature) => feature.properties.name)).size !== features.length) throw new Error("MAP_CODE");
  return { type: "FeatureCollection", features };
}

/** 每个页面实例各建一个加载器，缓存成功与失败Promise；切换和统计刷新不重复下载。 */
export function createRiskMapLoader(options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
  const controller = new AbortController();
  const cache = new Map<RiskMapKind, Promise<RiskMapAsset>>();
  const fetcher = options.fetcher ?? ((...args) => fetch(...args));
  async function attempt(kind: RiskMapKind, url: string): Promise<RiskGeo> {
    const child = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => undefined;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => { child.abort(); reject(new Error("MAP_ABORTED")); };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
      timer = setTimeout(() => { child.abort(); reject(new Error("MAP_TIMEOUT")); }, 5000);
    });
    try {
      return await Promise.race([interrupted, (async () => {
        const response = await fetcher(url, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: child.signal, headers: { Accept: "application/geo+json, application/json" } });
        if (!response.ok) throw new Error("MAP_HTTP");
        const text = await response.text();
        const sha = await riskMapSha256(text);
        if (sha !== assets.find((asset) => asset.kind === kind)!.sha256) throw new Error("MAP_CHECKSUM");
        return validateRiskGeo(kind, JSON.parse(text));
      })()]);
    } finally { clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); }
  }
  return {
    load(kind: RiskMapKind): Promise<RiskMapAsset> {
      if (controller.signal.aborted) return Promise.reject(new Error("MAP_ABORTED"));
      const existing = cache.get(kind); if (existing) return existing;
      const asset = assets.find((item) => item.kind === kind)!;
      const promise = (async (): Promise<RiskMapAsset> => {
        try { return { geo: await attempt(kind, `${(options.baseUrl ?? import.meta.env.BASE_URL).replace(/\/?$/, "/")}${asset.localPath}`), origin: "local" }; }
        catch { if (controller.signal.aborted) throw new Error("MAP_ABORTED"); return { geo: await attempt(kind, asset.url), origin: "external" }; }
      })();
      cache.set(kind, promise); return promise;
    },
    stop() { controller.abort(); cache.clear(); },
  };
}
export function riskMapCounts(kind: RiskMapKind, rows: { regionCode: string; requestCount: string }[], geo: RiskGeo) {
  const geometryCodes = new Set(geo.features.flatMap((feature) => feature.properties.code ? [feature.properties.code] : []));
  const totals = new Map<string, bigint>();
  const unplaced: { regionCode: string; requestCount: string; reason: string }[] = [];
  for (const row of rows) {
    if (!/^\d+$/.test(row.requestCount)) { unplaced.push({ ...row, reason: "计数格式无效" }); continue; }
    let code = canonicalRiskRegion(row.regionCode);
    if (kind === "world" && provinceCodes.has(code)) code = "CN";
    if (!geometryCodes.has(code)) { unplaced.push({ ...row, reason: row.regionCode === "UNKNOWN" || row.regionCode === "INTERNAL" ? "无地理位置" : kind === "china" && code === "CN" ? "中国来源缺省份" : "本图无对应边界" }); continue; }
    totals.set(code, (totals.get(code) ?? 0n) + BigInt(row.requestCount));
  }
  const exact = Array.from(totals, ([name, count]) => ({ name, count: count.toString() }));
  return { exact, unplaced, safe: exact.every((item) => BigInt(item.count) <= BigInt(Number.MAX_SAFE_INTEGER)) };
}
