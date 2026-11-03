import centers from "@/data/risk-region-centers.json";
import { canonicalRiskRegion, type RiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { riskCoordinate } from "@/utils/riskServer";
import type { RiskServerTarget } from "@/types/riskServer";
const points: Record<string, { longitude: string; latitude: string }> = centers.regions;
export function riskFlows(kind: RiskMapKind, rows: { regionCode: string; requestCount: string }[], target: RiskServerTarget | undefined, geo: RiskGeo) {
  const result: { lines: { name: string; coords: number[][]; count: string; weight: number; lineStyle: { color: string; width: number } }[]; same: { name: string; value: number[]; count: string }[]; unplaced: { regionCode: string; requestCount: string; reason: string }[]; target?: number[]; notice: string } = { lines: [], same: [], unplaced: [], notice: "" };
  if (!target?.configured) { result.notice = "服务器目标未配置，不绘制来源弧线"; return result; }
  const longitude = riskCoordinate(target.longitude, 180); const latitude = riskCoordinate(target.latitude, 90);
  if (target.locationStatus !== "LOCATED" || longitude === undefined || latitude === undefined || !target.regionCode) { result.notice = "服务器目标尚无有效位置，不绘制来源弧线"; return result; }
  const knownProvinces = new Set(Object.keys(points).filter((code) => code.startsWith("CN-")));
  const displayCode = (raw: string) => { const code = canonicalRiskRegion(raw); return kind === "world" && knownProvinces.has(code) ? "CN" : code; };
  const targetCode = displayCode(target.regionCode);
  if (kind === "china" && !(targetCode === "CN" || targetCode.startsWith("CN-") || ["HK", "MO", "TW"].includes(targetCode))) { result.notice = "服务器位于中国图范围外，请切换世界地图查看汇聚"; return result; }
  if (kind === "china" && (!riskPointInGeo(longitude, latitude, geo))) { result.notice = "服务器坐标超出中国图范围，请切换世界地图"; return result; }
  result.target = [longitude, latitude];
  const geometry = new Set(geo.features.flatMap((feature) => feature.properties.code ? [feature.properties.code] : []));
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const code = displayCode(row.regionCode);
    if (!/^\d+$/.test(row.requestCount) || !points[code] || (!geometry.has(code) && !(kind === "world" && /^CN-\d{2}$/.test(code) && geometry.has("CN")))) { result.unplaced.push({ ...row, reason: "来源无本图代表坐标，不造点" }); continue; }
    if (BigInt(row.requestCount) === 0n) continue;
    totals.set(code, (totals.get(code) ?? 0n) + BigInt(row.requestCount));
  }
  const max = Array.from(totals.values()).reduce((value, count) => count > value ? count : value, 1n);
  for (const [code, count] of totals) {
    const point = points[code]!; const source = [Number(point.longitude), Number(point.latitude)];
    if (code === targetCode || (source[0] === longitude && source[1] === latitude)) { result.same.push({ name: code, value: result.target, count: count.toString() }); continue; }
    const weight = Number(count * 1000n / max) / 1000;
    result.lines.push({ name: code, coords: [source, result.target], count: count.toString(), weight, lineStyle: { color: weight < .34 ? "#39d9ed" : weight < .67 ? "#ffb65c" : "#ff655b", width: 1 + weight * 2.5 } });
  }
  return result;
}

export function riskPointInGeo(longitude: number, latitude: number, geo: RiskGeo): boolean {
  const containsRing = (ring: number[][]) => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const aa = ring[index]!; const bb = ring[previous]!;
      if ((aa[1]! > latitude) !== (bb[1]! > latitude) && longitude < (bb[0]! - aa[0]!) * (latitude - aa[1]!) / (bb[1]! - aa[1]!) + aa[0]!) inside = !inside;
    }
    return inside;
  };
  return geo.features.some((feature) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][];
    return polygons.some((polygon) => !!polygon[0] && containsRing(polygon[0]) && !polygon.slice(1).some(containsRing));
  });
}
