import { canAccess } from "@/utils/permission";
export const riskRequestTypes = ["API", "STATIC", "PAGE", "SSE", "RISK_INTERNAL", "OTHER"] as const;
export function riskPermission(permissions: string[], detail?: "exception" | "archive"): boolean {
  return canAccess(permissions, "system:risk:view") && (!detail || canAccess(permissions, `system:risk:${detail}:view`));
}
export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)?.value).join("-");
}
export function riskPreset(days: 1 | 2 | 7, now = new Date()): [string, string] {
  const today = shanghaiDate(now);
  const end = days === 2 ? shiftDate(today, -1) : today;
  return [days === 7 ? shiftDate(today, -6) : end, end];
}
function shiftDate(day: string, offset: number): string { return new Date(Date.parse(day + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10); }
export function validateRiskDates(start: string, end: string, today = shanghaiDate()): string {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) return "请选择有效的起止日期";
  if (start > end) return "开始日期不能晚于结束日期";
  if (end > today) return "不能查询未来日期";
  if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 31) return "最多查询31个自然日（含起止日）";
  return "";
}
export function riskCount(value: string | null | undefined): string {
  return value == null ? "—" : /^\d+$/.test(value) ? BigInt(value).toLocaleString("en-US") : "未知";
}
export function riskLatency(value: string | null, overflow: boolean): string {
  if (overflow) return "超出分桶上限";
  if (value === null) return "无有效样本";
  if (!/^\d+$/.test(value)) return "未知";
  const micros = BigInt(value);
  return `${micros / 1000n}.${(micros % 1000n).toString().padStart(3, "0")} ms`;
}
export function riskRate(value: string | null): string {
  if (value === null) return "无有效请求";
  return /^(0(?:\.\d+)?|1(?:\.0+)?)$/.test(value) ? `${(Number(value) * 100).toFixed(2)}%` : "未知";
}
export function riskRegion(value: string): string { return value === "UNKNOWN" ? "未知来源（UNKNOWN）" : value === "INTERNAL" ? "内部来源（INTERNAL）" : value; }
