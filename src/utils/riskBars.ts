/** Ratios are only drawn when every count is safe; labels always retain exact strings. */
export function riskBarWidths(counts: string[]): (number | null)[] {
  if (!counts.every(value => /^\d+$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))) return counts.map(() => null);
  const values = counts.map(Number);
  const max = Math.max(1, ...values);
  return values.map(value => value / max * 100);
}
