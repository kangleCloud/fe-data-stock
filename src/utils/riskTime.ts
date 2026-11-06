const shanghaiFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** 风控展示时间统一采用北京时间；不修改用于请求和排序的原始值。 */
export function riskTime(value: string | null | undefined, format: "seconds" | "minute" | "axis" = "seconds", multipleDays = false): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "—";
  if (riskBusinessDate(value.slice(0, 10)) === "—" || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return "—";
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return "—";
  const parts = shanghaiFormatter.formatToParts(time);
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const clock = `${get("hour")}:${get("minute")}`;
  if (format === "axis") return `${multipleDays ? date.slice(5) + " " : ""}${clock}`;
  return `${date} ${clock}${format === "seconds" ? ":" + get("second") : ""}`;
}
export function riskBusinessDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "—";
}
