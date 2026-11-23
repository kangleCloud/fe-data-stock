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
