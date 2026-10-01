import type { SnapshotStatus } from "@/types/market";

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
});

export function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const absolute = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  if (absolute >= 100_000_000) {
    return `${sign}${numberFormatter.format(absolute / 100_000_000)}亿`;
  }
  if (absolute >= 10_000) {
    return `${sign}${numberFormatter.format(absolute / 10_000)}万`;
  }
  return `${sign}${numberFormatter.format(absolute)}`;
}

export function formatPlainNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSignedNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPlainNumber(value, digits)}`;
}

export function formatPercent(value: number | null | undefined): string {
  const formatted = formatSignedNumber(value, 2);
  return formatted === "—" ? formatted : `${formatted}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function valueTone(
  value: number | null | undefined,
): "rise" | "fall" | "flat" {
  if (value == null || value === 0) {
    return "flat";
  }
  return value > 0 ? "rise" : "fall";
}

export const dataStatusLabels: Record<SnapshotStatus, string> = {
  FRESH: "数据正常",
  STALE: "本次刷新失败",
  ERROR: "数据加载失败",
};
