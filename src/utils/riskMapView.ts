import type { RiskGeo } from "@/utils/riskMap";

/** 固定视角地图的缩放与平移；offset 是相对地图几何中心的经纬度偏移。 */
export interface RiskMapView {
  zoom: number;
  offset: [number, number];
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 8;
const centers = new WeakMap<RiskGeo, [number, number]>();

/** 返回地图几何包围盒中心，作为 ECharts 绝对 center 的基准，避免把 0°E/0°N 当作中国地图中心。 */
export function riskMapGeoCenter(geo: RiskGeo): [number, number] {
  const cached = centers.get(geo);
  if (cached) return cached;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const [lng, lat] = value;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
      return;
    }
    value.forEach(visit);
  };
  geo.features.forEach((feature) => visit(feature.geometry.coordinates));
  const center: [number, number] = Number.isFinite(minLng)
    ? [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
    : [0, 0];
  centers.set(geo, center);
  return center;
}

export function defaultRiskMapView(): RiskMapView {
  return { zoom: 1, offset: [0, 0] };
}

export function normalizeRiskMapView(value: Partial<RiskMapView>): RiskMapView {
  const fallback = defaultRiskMapView();
  const zoom = typeof value.zoom === "number" && Number.isFinite(value.zoom)
    ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value.zoom))
    : fallback.zoom;
  const offset = Array.isArray(value.offset) && value.offset.length === 2 && value.offset.every(Number.isFinite)
    ? [
        Math.min(180, Math.max(-180, value.offset[0]!)),
        Math.min(90, Math.max(-90, value.offset[1]!)),
      ] as [number, number]
    : fallback.offset;
  return { zoom, offset };
}

export function zoomRiskMapView(view: RiskMapView, factor: number): RiskMapView {
  if (!Number.isFinite(factor) || factor <= 0) return normalizeRiskMapView(view);
  return normalizeRiskMapView({ ...view, zoom: view.zoom * factor });
}

/** 键盘操作只改变已有视图状态，不改变地图范围或下钻选择。 */
export function riskMapViewKey(view: RiskMapView, key: string): RiskMapView | undefined {
  const current = normalizeRiskMapView(view);
  switch (key) {
    case "+":
    case "=":
      return zoomRiskMapView(current, 1.25);
    case "-":
      return zoomRiskMapView(current, 0.8);
    case "0":
      return defaultRiskMapView();
    case "ArrowLeft":
      return { ...current, offset: [current.offset[0] - 6 / current.zoom, current.offset[1]] };
    case "ArrowRight":
      return { ...current, offset: [current.offset[0] + 6 / current.zoom, current.offset[1]] };
    case "ArrowUp":
      return { ...current, offset: [current.offset[0], current.offset[1] + 4 / current.zoom] };
    case "ArrowDown":
      return { ...current, offset: [current.offset[0], current.offset[1] - 4 / current.zoom] };
    default:
      return undefined;
  }
}
