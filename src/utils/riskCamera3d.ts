export interface RiskCamera3D {
  alpha: number;
  beta: number;
  distance: number;
  center: number[];
}

export const DEFAULT_RISK_CAMERA_DISTANCE = 160;

export function defaultRiskCamera(): RiskCamera3D {
  return { alpha: 35, beta: 0, distance: DEFAULT_RISK_CAMERA_DISTANCE, center: [0, 0, 0] };
}

export function normalizeRiskCamera(value: Partial<RiskCamera3D>): RiskCamera3D {
  const fallback = defaultRiskCamera();
  const finite = (input: unknown, base: number) => typeof input === "number" && Number.isFinite(input) ? input : base;
  return {
    alpha: Math.max(10, Math.min(75, finite(value.alpha, fallback.alpha))),
    beta: ((finite(value.beta, 0) + 180) % 360 + 360) % 360 - 180,
    distance: Math.max(60, Math.min(300, finite(value.distance, DEFAULT_RISK_CAMERA_DISTANCE))),
    center: Array.isArray(value.center) && value.center.length === 3 && value.center.every((item) => Number.isFinite(item))
      ? [...value.center]
      : [...fallback.center],
  };
}

export function sameRiskCamera(left: RiskCamera3D, right: RiskCamera3D): boolean {
  return Math.abs(left.alpha - right.alpha) < 0.01
    && Math.abs(left.beta - right.beta) < 0.01
    && Math.abs(left.distance - right.distance) < 0.01
    && left.center.every((value, index) => Math.abs(value - (right.center[index] ?? 0)) < 0.01);
}

export function riskCameraKey(camera: RiskCamera3D, key: string): RiskCamera3D | undefined {
  const next = { ...camera, center: [...camera.center] };
  switch (key) {
    case "ArrowLeft": next.beta -= 10; break;
    case "ArrowRight": next.beta += 10; break;
    case "ArrowUp": next.alpha += 5; break;
    case "ArrowDown": next.alpha -= 5; break;
    case "+":
    case "=": next.distance /= 1.25; break;
    case "-": next.distance *= 1.25; break;
    case "0": return defaultRiskCamera();
    default: return undefined;
  }
  return normalizeRiskCamera(next);
}

export function zoomRiskCamera(camera: RiskCamera3D, factor: number): RiskCamera3D {
  if (!Number.isFinite(factor) || factor <= 0) return normalizeRiskCamera(camera);
  return normalizeRiskCamera({ ...camera, distance: camera.distance / factor });
}

/** 三维比例用于标签阈值：相机越近，可见标签越多。 */
export function riskCameraZoom(camera: RiskCamera3D): number {
  return DEFAULT_RISK_CAMERA_DISTANCE / normalizeRiskCamera(camera).distance;
}

export function riskArc3D(coords: number[][]): number[][] {
  const start = coords[0]!;
  const end = coords[1]!;
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    return [
      start[0]! + (end[0]! - start[0]!) * t,
      start[1]! + (end[1]! - start[1]!) * t,
      0.02 + Math.sin(Math.PI * t) * 0.9,
    ];
  });
}
