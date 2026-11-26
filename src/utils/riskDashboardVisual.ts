import type { RiskQps, RiskQpsSample } from "@/types/risk";
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

function qpsSparkline(samples: RiskQpsSample[], latest: number): string {
  const points = samples.map(sample => ({ time: Date.parse(sample.minuteTime), value: Number(sample.value) }));
  const values = points.map(point => point.value);
  const minimum = Math.min(...values);
  const span = Math.max(...values) - minimum;
  return points.map((point, index) => {
    const x = 63 - 31 * (latest - point.time) / 60_000;
    const y = span > 0 ? 21 - 18 * (point.value - minimum) / span : 12;
    const joinsPrevious = point.time - (points[index - 1]?.time ?? -Infinity) === 60_000;
    const joinsNext = (points[index + 1]?.time ?? Infinity) - point.time === 60_000;
    // A short stroke renders isolated samples without connecting across a missing minute.
    const dot = !joinsPrevious && !joinsNext ? " h-0.01" : "";
    return `${joinsPrevious ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}${dot}`;
  }).join(" ");
}

export function riskMinuteQps(qps?: RiskQps) {
  if (qps?.value == null || qps.requestCount == null || qps.minuteTime == null) {
    const [earlier, later] = qps?.samples ?? [];
    const laterTime = later ? Date.parse(later.minuteTime) : NaN;
    // 两个连续旧样本能确定它们在三分钟窗口中的位置，右侧留给缺失的上一分钟。
    const path = qps && earlier && laterTime - Date.parse(earlier.minuteTime) === 60_000
      ? qpsSparkline(qps.samples, laterTime + 60_000)
      : "";
    return { value: "—", description: "暂无采集样本", path };
  }

  return {
    value: `${riskCount(qps.value)} QPS`,
    description: `${riskTime(qps.minuteTime, "axis")} · ${riskCount(qps.requestCount)} 次 · 部分覆盖`,
    path: qpsSparkline(qps.samples, Date.parse(qps.minuteTime)),
  };
}
