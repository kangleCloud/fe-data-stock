import type { RiskDashboard } from "@/types/risk";
import { riskCount } from "@/utils/risk";
import { riskTime } from "@/utils/riskTime";

export function riskSparkline(samples: { at: string; value: number | null }[]): string {
  const points = samples.flatMap(sample => {
    const time = Date.parse(sample.at);
    return sample.value !== null && Number.isFinite(sample.value) && Number.isFinite(time)
      ? [{ time, value: sample.value }]
      : [];
  });
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || last.time <= first.time) return "";
  const values = points.map(point => point.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  return points.map(point => {
    const x = 1 + 62 * (point.time - first.time) / (last.time - first.time);
    const y = span > 0 ? 21 - 18 * (point.value - min) / span : 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function riskNetworkMbps(bytesPerSecond: string | null | undefined): string {
  if (!bytesPerSecond || !/^\d+(?:\.\d+)?$/.test(bytesPerSecond)) return "—";
  const value = Number(bytesPerSecond) * 8 / 1_000_000;
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 && value < 0.01 ? "<0.01" : Number(value.toFixed(2)).toLocaleString("en-US")} Mbps`;
}


export function riskMinuteRequests(qps?: RiskDashboard["qps"]) {
  if (qps?.requestCount == null || !qps.minuteTime) return { value: "—", path: "" };

  const latest = Date.parse(qps.minuteTime);
  const points = qps.samples.map(sample => ({ time: Date.parse(sample.minuteTime), count: Number(sample.requestCount) }));
  const counts = points.map(point => point.count);
  const minimum = Math.min(...counts);
  const span = Math.max(...counts) - minimum;
  const path = points.map((point, index) => {
    const x = 63 - 31 * (latest - point.time) / 60_000;
    const y = span > 0 ? 21 - 18 * (point.count - minimum) / span : 12;
    const joinsPrevious = point.time - (points[index - 1]?.time ?? -Infinity) === 60_000;
    const joinsNext = (points[index + 1]?.time ?? Infinity) - point.time === 60_000;
    // A short stroke renders isolated samples without connecting across a missing minute.
    const dot = !joinsPrevious && !joinsNext ? " h-0.01" : "";
    return `${joinsPrevious ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}${dot}`;
  }).join(" ");

  return {
    value: `${riskCount(qps.requestCount)} 次/分钟`,
    description: `${riskTime(qps.minuteTime, "axis")} · 部分覆盖`,
    path,
  };
}
