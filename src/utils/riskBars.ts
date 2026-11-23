const SCALE = 1_000_000n;

/** Scale a count with integer arithmetic before handing a bounded value to the renderer. */
export function riskCountRatio(count: bigint, total: bigint): number {
  return total > 0n ? Number((count * SCALE + total / 2n) / total) / Number(SCALE) : 0;
}

export function riskCountPercent(count: bigint, total: bigint): string {
  if (total <= 0n) return "—";
  const basisPoints = (count * 10_000n + total / 2n) / total;
  return `${basisPoints / 100n}.${(basisPoints % 100n).toString().padStart(2, "0")}%`;
}

export function riskBarWidths(counts: string[]): (number | null)[] {
  const values = counts.map(value => /^\d+$/.test(value) ? BigInt(value) : null);
  const max = values.reduce<bigint>((highest, value) => value !== null && value > highest ? value : highest, 0n);
  return values.map(value => value === null ? null : riskCountRatio(value, max) * 100);
}
