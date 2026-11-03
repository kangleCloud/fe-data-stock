import { canAccess } from "@/utils/permission";
import type { RiskServerSave } from "@/types/riskServer";
export function riskConfigPermission(permissions: string[], action: "view" | "update") {
  return canAccess(permissions, "system:risk:view") && canAccess(permissions, `system:risk:config:${action}`);
}
export function riskCoordinate(value: string | null | undefined, limit: number): number | undefined {
  if (!value || !/^-?\d+(?:\.\d{1,6})?$/.test(value)) return undefined;
  const number = Number(value); return Number.isFinite(number) && Math.abs(number) <= limit ? number : undefined;
}
export function validateRiskServer(input: RiskServerSave): string {
  if (!input.alias.trim() || Array.from(input.alias).length > 64) return "请填写不超过64字的服务器别名";
  if (!input.publicIp.trim() || /[\s/?#@]/.test(input.publicIp)) return "请填写显式公网IP，不得填写URL或域名";
  // 公网属性与规范IPv4/IPv6由后端最终校验，前端不发定位请求。
  if (!/^[0-9a-fA-F:.]+$/.test(input.publicIp)) return "请填写IPv4或IPv6地址";
  const location = input.manualLocation;
  if (location && (!/^(?:[A-Z]{2}|CN-(?:\d{2}|[A-Z]{2}))$/.test(location.regionCode) || riskCoordinate(location.longitude, 180) === undefined || riskCoordinate(location.latitude, 90) === undefined)) return "人工地域、经度和纬度必须成组填写，经纬度最多6位小数且范围有效";
  return "";
}
