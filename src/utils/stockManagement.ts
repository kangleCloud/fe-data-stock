/** Reorder the complete enabled set; page filters must never be used as sort input. */
export function moveEnabledSymbol(symbols: string[], symbol: string, direction: -1 | 1): string[] {
  const index = symbols.indexOf(symbol);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= symbols.length) return [...symbols];
  const reordered = [...symbols];
  [reordered[index], reordered[next]] = [reordered[next]!, reordered[index]!];
  return reordered;
}

export function formatShanghaiDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
