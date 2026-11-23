import type { StyleSpecification } from "maplibre-gl";
import centers from "@/data/risk-region-centers.json";
import type { RiskDetailCounts, RiskDetailGeo } from "@/utils/riskMapDetail";
import type { RiskServerTarget } from "@/types/riskServer";
import type { RiskDashboardMapServer } from "@/types/riskMonitor";
import { riskFlows, riskPointInGeo } from "@/utils/riskFlows";
import { gcj02ToWgs84 } from "@/utils/riskCoordinates";
import { canonicalRiskRegion, compareRiskMapCounts, riskMapCounts, type RiskGeo, type RiskMapKind } from "@/utils/riskMap";
import { riskMapGeoBounds, riskMapGeoCenter } from "@/utils/riskMapView";
import { riskCoordinate } from "@/utils/riskServer";

export interface RiskAccessViewport {
  width: number;
  height: number;
}

export interface RiskAccessCamera {
  center: [number, number];
  zoom: number;
  bounds: ReturnType<typeof riskMapGeoBounds>;
}

export interface RiskAccessMapFeatureProperties {
  name: string;
  label: string;
  code: string | null;
  count: string | null;
  value: number;
  /** 0 = no verified data or unsafe precision; 1..5 = fill step. */
  riskLevel: number;
  fill: string;
  hasData: boolean;
}

export interface RiskAccessMapFeature {
  type: "Feature";
  properties: RiskAccessMapFeatureProperties;
  geometry: RiskGeo["features"][number]["geometry"];
}

export interface RiskAccessMapGeo {
  type: "FeatureCollection";
  features: RiskAccessMapFeature[];
}

export interface RiskAccessHeatPoint {
  lng: number;
  lat: number;
  value: number;
  count: string;
  code: string;
  label: string;
}

export interface RiskAccessFlowLine {
  lng1: number;
  lat1: number;
  lng2: number;
  lat2: number;
  color: string;
  width: number;
  count: string;
  name: string;
  weight: number;
}

export interface RiskAccessFlowLayer {
  lines: RiskAccessFlowLine[];
  target: [number, number] | undefined;
  same: { name: string; value: number[]; count: string }[];
  unplaced: { regionCode: string; requestCount: string; reason: string }[];
  notice: string;
}

/**
 * MapLibre only needs a local background. No tile source, glyph URL,
 * sprite URL or third-party transform is declared, so initialising the map
 * cannot trigger a network request.
 */
export const RISK_ACCESS_EMPTY_STYLE: StyleSpecification = {
  version: 8,
  name: "vita-risk-local-empty",
  sources: {},
  layers: [
    {
      id: "risk-local-background",
      type: "background" as const,
      paint: { "background-color": "#031426" },
    },
  ],
};

/** 5-step cyan scale used for verified request counts; neutral for no data. */
export const RISK_ACCESS_FILL_COLORS = ["#0f6b86", "#1596a8", "#23bec6", "#56e4e0", "#b5fffa"] as const;
export const RISK_ACCESS_EMPTY_FILL = "#0b3f63";
export const RISK_ACCESS_UNSAFE_FILL = "#113550";
/** Index 0 is the neutral empty/unsafe step; 1..5 mirror RISK_ACCESS_FILL_COLORS. */
export const RISK_ACCESS_LEVEL_COLORS = [RISK_ACCESS_EMPTY_FILL, ...RISK_ACCESS_FILL_COLORS] as const;
export function riskAccessLevelColor(value: number): string {
  const level = Number.isFinite(value) ? clamp(Math.round(value), 0, RISK_ACCESS_LEVEL_COLORS.length - 1) : 0;
  return RISK_ACCESS_LEVEL_COLORS[level]!;
}

const MAX_MERCATOR_LATITUDE = 85;
const DEFAULT_VIEWPORT: RiskAccessViewport = { width: 960, height: 600 };
const regionPoints: Record<string, { longitude: string; latitude: string }> = centers.regions;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mercatorY(latitude: number): number {
  const radians = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return 0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI);
}

/**
 * Initial camera for a local GeoJSON asset.
 */
export function riskAccessCamera(geo: RiskGeo, viewport: RiskAccessViewport = DEFAULT_VIEWPORT): RiskAccessCamera {
  const bounds = riskMapGeoBounds(geo);
  const width = viewport.width > 0 && Number.isFinite(viewport.width) ? viewport.width : DEFAULT_VIEWPORT.width;
  const height = viewport.height > 0 && Number.isFinite(viewport.height) ? viewport.height : DEFAULT_VIEWPORT.height;
  const center = riskMapGeoCenter(geo);
  const centerY = (mercatorY(bounds.maxLat) + mercatorY(bounds.minLat)) / 2;
  const centerLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * centerY))) * 180 / Math.PI;
  const horizontal = Math.max(0.0001, Math.abs(bounds.maxLng - bounds.minLng) / 360);
  const vertical = Math.max(0.0001, Math.abs(mercatorY(bounds.maxLat) - mercatorY(bounds.minLat)));
  const fitWidth = (Math.max(160, width) * 0.96) / (512 * horizontal);
  const fitHeight = (Math.max(120, height) * 0.94) / (512 * vertical);
  const zoom = clamp(Math.log2(Math.max(0.0001, Math.min(fitWidth, fitHeight))), -2, 6);
  return { center: [center[0], centerLat], zoom, bounds };
}

/** Exact counts only become numeric style values when every value is safe. */
export function riskAccessMapFeatures(
  kind: RiskMapKind,
  geo: RiskGeo,
  rows: { regionCode: string; requestCount: string }[],
): RiskAccessMapGeo {
  const counts = riskMapCounts(kind, rows, geo);
  const countByCode = new Map(counts.exact.map((row) => [row.name, row.count] as const));
  const numeric = counts.safe
    ? counts.exact.map((row) => Number(row.count)).filter((value) => Number.isFinite(value))
    : [];
  const max = numeric.reduce((value, count) => Math.max(value, count), 0);
  const features = geo.features.map((feature): RiskAccessMapFeature => {
    const code = feature.properties.code;
    const count = code ? countByCode.get(code) ?? null : null;
    const numericCount = count === null ? 0 : Number(count);
    const ratio = counts.safe && max > 0 && numericCount > 0 ? numericCount / max : 0;
    const riskLevel = ratio > 0
      ? clamp(Math.ceil(ratio * RISK_ACCESS_FILL_COLORS.length), 1, RISK_ACCESS_FILL_COLORS.length)
      : 0;
    const fill = !counts.safe
      ? RISK_ACCESS_UNSAFE_FILL
      : riskLevel === 0
        ? RISK_ACCESS_EMPTY_FILL
        : RISK_ACCESS_FILL_COLORS[riskLevel - 1]!;
    return {
      type: "Feature",
      properties: {
        name: feature.properties.name,
        label: feature.properties.label,
        code,
        count,
        value: counts.safe && count !== null ? numericCount : 0,
        riskLevel: counts.safe ? riskLevel : 0,
        fill,
        hasData: count !== null && numericCount > 0,
      },
      geometry: feature.geometry,
    };
  });
  return { type: "FeatureCollection", features };
}

/**
 * Representative points are display centroids from the bundled, audited
 * region-centers file. They are not IP locations and never invent a point for
 * an unknown or missing region.
 */
export function riskAccessHeatPoints(
  kind: RiskMapKind,
  geo: RiskGeo,
  rows: { regionCode: string; requestCount: string }[],
): RiskAccessHeatPoint[] {
  const counts = riskMapCounts(kind, rows, geo);
  if (!counts.safe) return [];
  const points: RiskAccessHeatPoint[] = [];
  for (const row of counts.exact) {
    const code = canonicalRiskRegion(row.name);
    const point = regionPoints[code];
    if (!point || !/^\d+$/.test(row.count) || Number(row.count) <= 0) continue;
    const lng = Number(point.longitude);
    const lat = Number(point.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
    points.push({ lng, lat, value: Number(row.count), count: row.count, code, label: row.name });
  }
  const max = Math.max(0, ...points.map((point) => point.value));
  return max ? points.map((point) => ({ ...point, value: point.value / max })) : points;
}

/** Valid server coordinates and audited source centroids become L7 arc input. */
export function riskAccessFlowLines(
  kind: RiskMapKind,
  geo: RiskGeo,
  rows: { regionCode: string; requestCount: string }[],
  target: RiskServerTarget | undefined,
): RiskAccessFlowLayer {
  const flows = riskFlows(kind, rows, target, geo);
  return {
    lines: flows.lines.map((line) => ({
      lng1: line.coords[0]![0]!,
      lat1: line.coords[0]![1]!,
      lng2: line.coords[1]![0]!,
      lat2: line.coords[1]![1]!,
      color: line.lineStyle.color,
      width: line.lineStyle.width,
      count: line.count,
      name: line.name,
      weight: line.weight,
    })),
    target: flows.target as [number, number] | undefined,
    same: flows.same,
    unplaced: flows.unplaced,
    notice: flows.notice,
  };
}

export interface RiskAccessMapMarker { lng: number; lat: number; name: string }

/** 以本图地域代表点为起点，向唯一有效入口汇聚。 */
export function riskAccessTargetFlows(kind: RiskMapKind, geo: RiskGeo, servers: RiskDashboardMapServer[], sources: RiskAccessHeatPoint[] = []) {
  const lines: RiskAccessFlowLine[] = [];
  const points: [number, number][] = [];
  const markers: RiskAccessMapMarker[] = [];
  const enabled = servers.filter(server => server.enabled);
  if (enabled.length !== 1) {
    return { lines, points, markers, notice: enabled.length ? "配置了多个入口，飞线暂不可用" : "" };
  }
  const server = enabled[0]!;
  const lng = riskCoordinate(server.longitude, 180);
  const lat = riskCoordinate(server.latitude, 90);
  if (server.locationStatus !== "LOCATED" || lng === undefined || lat === undefined || !server.coordinateSystem) {
    return { lines, points, markers, notice: "入口暂无有效位置，飞线暂不可用" };
  }
  const point: [number, number] = server.coordinateSystem === "GCJ02" ? gcj02ToWgs84(lng, lat) : [lng, lat];
  if (kind === "china" && !riskPointInGeo(point[0], point[1], geo)) {
    return { lines, points, markers, notice: "入口位于当前地图范围外，可切换世界地图" };
  }
  points.push(point);
  markers.push({ lng: point[0], lat: point[1], name: server.name });
  const topSources = sources.filter(source => source.value > 0 && (source.lng !== point[0] || source.lat !== point[1]))
    .sort((a, b) => compareRiskMapCounts(b.count, a.count) || a.code.localeCompare(b.code)).slice(0, 12);
  for (const source of topSources) {
    lines.push({ lng1: source.lng, lat1: source.lat, lng2: point[0], lat2: point[1], color: "#78eeff",
      width: 1 + source.value * 1.5, count: source.count, name: source.code, weight: source.value });
  }
  return { lines, points, markers, notice: "" };
}

export function riskAccessDetailFeatures(geo: RiskDetailGeo, counts: RiskDetailCounts): RiskAccessMapGeo {
  const exact = new Map(counts.exact.map((row) => [row.code, row.count] as const));
  const numeric = counts.safe
    ? counts.exact.map((row) => Number(row.count)).filter((value) => Number.isFinite(value))
    : [];
  const max = numeric.reduce((value, count) => Math.max(value, count), 0);
  return {
    type: "FeatureCollection",
    features: geo.features.map((feature) => {
      const code = feature.properties.code;
      const count = code ? exact.get(code) ?? null : null;
      const numericCount = count === null ? 0 : Number(count);
      const ratio = counts.safe && max > 0 && numericCount > 0 ? numericCount / max : 0;
      const riskLevel = ratio > 0
        ? clamp(Math.ceil(ratio * RISK_ACCESS_FILL_COLORS.length), 1, RISK_ACCESS_FILL_COLORS.length)
        : 0;
      return {
        type: "Feature" as const,
        properties: {
          name: feature.properties.name,
          label: feature.properties.label,
          code,
          count,
          value: counts.safe && count !== null ? numericCount : 0,
          riskLevel: counts.safe ? riskLevel : 0,
          fill: !counts.safe ? RISK_ACCESS_UNSAFE_FILL : riskLevel === 0 ? RISK_ACCESS_EMPTY_FILL : RISK_ACCESS_FILL_COLORS[riskLevel - 1]!,
          hasData: count !== null && numericCount > 0,
        },
        geometry: feature.geometry,
      };
    }),
  };
}

export function riskAccessSelectedFeature(geo: RiskGeo, code: string | undefined): RiskAccessMapGeo {
  const feature = code ? geo.features.find((item) => item.properties.code === code) : undefined;
  if (!feature) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        name: feature.properties.name,
        label: feature.properties.label,
        code: feature.properties.code,
        count: null,
        value: 1,
        riskLevel: 5,
        fill: "#26d9ff",
        hasData: true,
      },
      geometry: feature.geometry,
    }],
  };
}
