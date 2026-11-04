export interface RiskCamera3D { alpha: number; beta: number; distance: number; center: number[] }
export function defaultRiskCamera(): RiskCamera3D { return { alpha: 35, beta: 0, distance: 160, center: [0, 0, 0] }; }
export function normalizeRiskCamera(value: Partial<RiskCamera3D>): RiskCamera3D {
  const fallback = defaultRiskCamera();
  const finite = (v: unknown, base: number) => typeof v === "number" && Number.isFinite(v) ? v : base;
  return { alpha: Math.max(10, Math.min(75, finite(value.alpha, fallback.alpha))), beta: ((finite(value.beta, 0) + 180) % 360 + 360) % 360 - 180, distance: Math.max(60, Math.min(300, finite(value.distance, 160))), center: Array.isArray(value.center) && value.center.length === 3 && value.center.every(Number.isFinite) ? [...value.center] : [...fallback.center] };
}
export function riskCameraKey(camera: RiskCamera3D, key: string): RiskCamera3D | undefined {
  const next = { ...camera, center: [...camera.center] };
  switch (key) {
    case "ArrowLeft": next.beta -= 10; break;
    case "ArrowRight": next.beta += 10; break;
    case "ArrowUp": next.alpha += 5; break;
    case "ArrowDown": next.alpha -= 5; break;
    case "+": case "=": next.distance /= 1.25; break;
    case "-": next.distance *= 1.25; break;
    case "0": return defaultRiskCamera();
    default: return undefined;
  }
  return normalizeRiskCamera(next);
}
export function riskArc3D(coords: number[][]): number[][] {
  const a = coords[0]!; const b = coords[1]!;
  return Array.from({ length: 25 }, (_, i) => { const t = i / 24; return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, .02 + Math.sin(Math.PI * t) * .9]; });
}
