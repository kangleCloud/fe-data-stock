/** 快照只含 JSON 值；保留未变化的数据引用，避免后台重同步重绘图表。 */
export function shareSnapshot<T>(previous: T, next: T): T {
  if (previous === next) return previous;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return next;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = next.map((value, index) => shareSnapshot(previous[index], value));
    return (previous.length === shared.length && shared.every((value, index) => value === previous[index])
      ? previous : shared) as T;
  }
  if (Array.isArray(previous) || Array.isArray(next)) return next;
  const old = previous as Record<string, unknown>;
  const incoming = next as Record<string, unknown>;
  const keys = Object.keys(incoming);
  const shared = Object.fromEntries(keys.map((key) => [key, shareSnapshot(old[key], incoming[key])]));
  return (keys.length === Object.keys(old).length && keys.every((key) => Object.hasOwn(old, key) && old[key] === shared[key])
    ? previous : shared) as T;
}
