import { canAccess } from "@/utils/permission";
export function riskConfigPermission(permissions: string[], action: "view" | "update") {
  return canAccess(permissions, "system:risk:view") && canAccess(permissions, `system:risk:config:${action}`);
}
export function riskCoordinate(value: string | null | undefined, limit: number): number | undefined {
  if (!value || !/^-?\d+(?:\.\d{1,6})?$/.test(value)) return undefined;
  const number = Number(value); return Number.isFinite(number) && Math.abs(number) <= limit ? number : undefined;
}
