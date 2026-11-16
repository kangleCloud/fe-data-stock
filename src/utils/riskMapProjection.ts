export interface RiskProjectionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RiskProjectionMatrices {
  viewMatrix: ArrayLike<number>;
  projectionMatrix: ArrayLike<number>;
  viewport: RiskProjectionViewport;
}

export interface RiskProjectedPoint {
  /** Screen pixel position inside the chart element. */
  x: number;
  y: number;
  ndcX: number;
  ndcY: number;
  visible: boolean;
}

export interface RiskChartProjector {
  project(point: readonly [number, number, number]): RiskProjectedPoint | undefined;
}

export interface RiskProjectionCandidate {
  name: string;
  cp: [number, number];
  area: number;
}

export interface RiskProjectionRegion {
  code: string;
  center: [number, number];
  probes: [number, number][];
}

function matrix(value: unknown): ArrayLike<number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const array = (value as { array?: unknown }).array;
  if (!array || typeof array !== "object" || typeof (array as ArrayLike<number>).length !== "number" || (array as ArrayLike<number>).length < 16) return undefined;
  return array as ArrayLike<number>;
}

function multiply(point: readonly [number, number, number, number], matrixValue: ArrayLike<number>): [number, number, number, number] | undefined {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = point[3];
  const result: [number, number, number, number] = [
    matrixValue[0]! * x + matrixValue[4]! * y + matrixValue[8]! * z + matrixValue[12]! * w,
    matrixValue[1]! * x + matrixValue[5]! * y + matrixValue[9]! * z + matrixValue[13]! * w,
    matrixValue[2]! * x + matrixValue[6]! * y + matrixValue[10]! * z + matrixValue[14]! * w,
    matrixValue[3]! * x + matrixValue[7]! * y + matrixValue[11]! * z + matrixValue[15]! * w,
  ];
  return result.every(Number.isFinite) ? result : undefined;
}

/**
 * Projects a geo3D local point with the same view/projection matrices used by
 * the interactive WebGL camera. The returned `visible` flag is strict: points
 * outside the actual chart viewport or the near/far clip range are rejected.
 */
export function projectRiskPoint(point: readonly [number, number, number], matrices: RiskProjectionMatrices): RiskProjectedPoint | undefined {
  const { viewport } = matrices;
  if (!(viewport.width > 0) || !(viewport.height > 0)) return undefined;
  const view = multiply([point[0], point[1], point[2], 1], matrices.viewMatrix);
  if (!view) return undefined;
  const clip = multiply(view, matrices.projectionMatrix);
  if (!clip) return undefined;
  const w = clip[3];
  if (!(w > 1e-6)) return undefined;
  const ndcX = clip[0] / w;
  const ndcY = clip[1] / w;
  const ndcZ = clip[2] / w;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || !Number.isFinite(ndcZ)) return undefined;
  return {
    x: viewport.x + (ndcX + 1) * 0.5 * viewport.width,
    y: viewport.y + (ndcY + 1) * 0.5 * viewport.height,
    ndcX,
    ndcY,
    visible: Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1 && ndcZ >= -1 && ndcZ <= 1,
  };
}

interface InternalCoordinateSystem {
  dataToPoint?: (data: number[]) => number[] | undefined;
  viewGL?: {
    camera?: { viewMatrix?: unknown; projectionMatrix?: unknown };
    viewport?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  };
}

interface InternalSeries {
  coordinateSystem?: InternalCoordinateSystem;
}

interface InternalChart {
  getModel?: () => { getSeriesByType?: (type: string) => InternalSeries[] } | undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reads the internal map3D coordinate system that owns the interactive orbit
 * camera. ECharts GL creates a separate coordinate system for map3D, so using
 * the top-level geo3D component here would project with the wrong camera.
 */
export function createRiskChartProjector(chart: unknown): RiskChartProjector | undefined {
  let model: ReturnType<NonNullable<InternalChart["getModel"]>>;
  try {
    model = (chart as InternalChart).getModel?.();
  } catch {
    return undefined;
  }
  let seriesList: InternalSeries[];
  try {
    seriesList = model?.getSeriesByType?.("map3D") ?? [];
  } catch {
    return undefined;
  }
  for (const series of seriesList) {
    const coordinateSystem = series.coordinateSystem;
    const viewGL = coordinateSystem?.viewGL;
    const viewMatrix = matrix(viewGL?.camera?.viewMatrix);
    const projectionMatrix = matrix(viewGL?.camera?.projectionMatrix);
    const viewport = viewGL?.viewport;
    if (!coordinateSystem?.dataToPoint || !viewMatrix || !projectionMatrix || !viewport
      || !finite(viewport.x) || !finite(viewport.y) || !finite(viewport.width) || !finite(viewport.height)
      || viewport.width <= 0 || viewport.height <= 0) continue;
    const matrices: RiskProjectionMatrices = {
      viewMatrix,
      projectionMatrix,
      viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height },
    };
    return {
      project(point) {
        try {
          const local = coordinateSystem.dataToPoint!([point[0], point[1], point[2]]);
          if (!local || local.length < 3 || !local.every(Number.isFinite)) return undefined;
          return projectRiskPoint([local[0]!, local[1]!, local[2]!], matrices);
        } catch {
          return undefined;
        }
      },
    };
  }
  return undefined;
}

/**
 * Builds a pixel projector from the 2D `geo` coordinate system. ECharts already
 * owns the real layout, zoom, pan and chart size, so `convertToPixel` is the
 * source of truth for viewport culling instead of a second geometry estimate.
 */
export function createRiskMapProjector(chart: unknown, geoIndex = 0): RiskChartProjector | undefined {
  const internal = chart as {
    convertToPixel?: (finder: { geoIndex: number }, point: [number, number]) => unknown;
    getWidth?: () => number;
    getHeight?: () => number;
  } | undefined;
  if (!internal?.convertToPixel || !internal.getWidth || !internal.getHeight) return undefined;
  let width = 0;
  let height = 0;
  try {
    width = internal.getWidth();
    height = internal.getHeight();
  } catch {
    return undefined;
  }
  if (!(width > 0) || !(height > 0)) return undefined;
  return {
    project(point) {
      try {
        const pixel = internal.convertToPixel!({ geoIndex }, [point[0], point[1]]);
        if (!Array.isArray(pixel) || pixel.length < 2 || !finite(pixel[0]) || !finite(pixel[1])) return undefined;
        const x = pixel[0];
        const y = pixel[1];
        return {
          x,
          y,
          ndcX: x / width * 2 - 1,
          ndcY: 1 - y / height * 2,
          visible: x >= 0 && x <= width && y >= 0 && y <= height,
        };
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Picks labels from points that are truly inside the current viewport. Area is
 * used only to decide which real feature wins when two labels would overlap;
 * no off-screen or synthetic coordinate is added.
 */
export function selectRiskVisibleLabels<T extends RiskProjectionCandidate>(
  candidates: readonly T[],
  project: RiskChartProjector["project"],
  options: { minPixelDistance?: number; limit?: number } = {},
): T[] {
  const minDistance = Math.max(0, options.minPixelDistance ?? 56);
  const limit = Math.max(0, options.limit ?? 32);
  if (!limit) return [];
  const projected = candidates.flatMap((candidate) => {
    if (!(candidate.area > 0) || !Number.isFinite(candidate.cp[0]) || !Number.isFinite(candidate.cp[1])) return [];
    const point = project([candidate.cp[0], candidate.cp[1], 0]);
    return point?.visible ? [{ candidate, point }] : [];
  });
  projected.sort((left, right) => right.candidate.area - left.candidate.area || left.candidate.name.localeCompare(right.candidate.name));
  const picked: T[] = [];
  const pickedPoints: RiskProjectedPoint[] = [];
  for (const item of projected) {
    if (pickedPoints.some((point) => Math.hypot(point.x - item.point.x, point.y - item.point.y) < minDistance)) continue;
    picked.push(item.candidate);
    pickedPoints.push(item.point);
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * Selects visible parent regions for on-demand detail loading. A parent counts
 * as visible when any real probe point (center or geometry bounding-box corner)
 * is inside the viewport. The result is capped so panning cannot fan out into
 * an unbounded request queue.
 */
export function selectRiskViewportRegions(
  regions: readonly RiskProjectionRegion[],
  project: RiskChartProjector["project"],
  options: { limit?: number; margin?: number } = {},
): string[] {
  const limit = Math.max(0, options.limit ?? 6);
  const margin = Math.max(0, options.margin ?? 0.08);
  if (!limit) return [];
  const visible: { code: string; distance: number }[] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    if (!region.code || seen.has(region.code) || !Number.isFinite(region.center[0]) || !Number.isFinite(region.center[1])) continue;
    const center = project([region.center[0], region.center[1], 0]);
    const points = [center, ...region.probes.map((point) => project([point[0], point[1], 0]))].filter((point): point is RiskProjectedPoint => !!point);
    const near = points.find((point) => Math.abs(point.ndcX) <= 1 + margin && Math.abs(point.ndcY) <= 1 + margin);
    if (!near) continue;
    seen.add(region.code);
    const distance = center?.visible
      ? Math.hypot(center.ndcX, center.ndcY)
      : Math.min(...points.map((point) => Math.hypot(point.ndcX, point.ndcY)));
    visible.push({ code: region.code, distance: Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY });
  }
  visible.sort((left, right) => left.distance - right.distance || left.code.localeCompare(right.code));
  return visible.slice(0, limit).map((item) => item.code);
}
