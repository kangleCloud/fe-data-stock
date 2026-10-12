import type { StockFundPoint } from "@/types/market";

export function fundUnit(values: number[]): { name: string; divisor: number } {
  const maximum = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return maximum >= 100_000_000 ? { name: "亿元", divisor: 100_000_000 }
    : maximum >= 10_000 ? { name: "万元", divisor: 10_000 } : { name: "元", divisor: 1 };
}

export function formatFundAmount(value: unknown): string {
  const amount = Array.isArray(value) ? value[1] : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const selected = fundUnit([amount]);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${(Math.abs(amount) / selected.divisor).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${selected.name}`;
}

export function fullFundAmount(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("zh-CN", { maximumFractionDigits: 20 })} 元`;
}

export function fundCollectedTime(value: string): string {
  if (!Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export function latestFundPoint<T extends Pick<StockFundPoint, "collectedAt" | "netAmount">>(points: T[]): T | undefined {
  return points.reduce<T | undefined>((latest, point) => Number.isFinite(point.netAmount) && Number.isFinite(Date.parse(point.collectedAt))
    && (!latest || Date.parse(point.collectedAt) > Date.parse(latest.collectedAt)) ? point : latest, undefined);
}

export function fundAxisRange(values: number[], divisor: number): { min: number; max: number; interval: number } {
  const low = values.reduce((min, value) => Math.min(min, value), 0);
  const high = values.reduce((max, value) => Math.max(max, value), 0);
  const padding = (high - low || divisor) * 0.1;
  // 显示单位保留两位小数，刻度间隔至少为 0.01 单位，避免不同刻度显示成同一数字。
  const target = Math.max((high - low + padding * 2) / 4, divisor / 100);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= target) ?? 10) * magnitude;
  return { min: Math.floor((low - padding) / step) * step, max: Math.ceil((high + padding) / step) * step, interval: step };
}
