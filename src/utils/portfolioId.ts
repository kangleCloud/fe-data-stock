/** 持仓标识保留 Long 十进制字符串；旧安全数字可兼容，已失真的数字必须拒绝。 */
export function portfolioIdString(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("持仓标识已超出安全整数范围，请重新读取数据");
    }
    return String(value);
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new Error("持仓标识格式异常，请重新读取数据");
  }
  const identifier = BigInt(value);
  if (identifier < -9223372036854775808n || identifier > 9223372036854775807n) {
    throw new Error("持仓标识超出 Long 范围，请重新读取数据");
  }
  return value;
}
function isIdentifierField(field: string): boolean {
  return field === "id" || field.endsWith("Id") || field.endsWith("Ids");
}
/** 仅用于 portfolio REST 边界；数量、分页、金额和其他管理业务均不转换。 */
export function normalizePortfolioIds(value: unknown, field = ""): unknown {
  if (value == null) {
    return value;
  }
  if (isIdentifierField(field)) {
    return Array.isArray(value)
      ? value.map(portfolioIdString)
      : portfolioIdString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizePortfolioIds(item));
  }
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizePortfolioIds(item, key),
      ]),
    );
  }
  return value;
}
