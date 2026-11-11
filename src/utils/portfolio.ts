/** 金额只作十进制字符串输入/展示；派生值全部由后端计算。 */
export function amountInputValue(value: string | null | undefined): string {
  return value == null ? "" : value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function amountInputValid(value: string): boolean {
  return /^\d{1,20}(?:\.\d{1,2})?$/.test(amountInputValue(value));
}

/** 带符号金额：亏损可为负，整数位和小数位约束与非负金额一致。 */
export function signedAmountInputValid(value: string): boolean {
  return /^-?\d{1,20}(?:\.\d{1,2})?$/.test(amountInputValue(value));
}

/** 金额加减只在“分”上做 BigInt 运算，避免浮点误差；任一输入非法返回 null。 */
export function addDecimal(left: string, right: string): string | null {
  const leftCents = decimalToCents(left);
  const rightCents = decimalToCents(right);
  return leftCents == null || rightCents == null ? null : centsToDecimal(leftCents + rightCents);
}

export function subtractDecimal(left: string, right: string): string | null {
  const leftCents = decimalToCents(left);
  const rightCents = decimalToCents(right);
  return leftCents == null || rightCents == null ? null : centsToDecimal(leftCents - rightCents);
}

function decimalToCents(value: string): bigint | null {
  const normalized = amountInputValue(value);
  if (!/^-?\d{1,20}(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const negative = normalized.startsWith("-");
  const [integer = "0", fraction = ""] = normalized.replace(/^-/, "").split(".");
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative && absolute !== 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function quantityInputValid(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

/** 记录日只接受 yyyy-MM-dd，按上海日期解释，不能晚于今天。 */
export function tradeDateValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && formatDateInShanghai(date) === value && date.getTime() <= Date.now();
}

export const currentTradeDate = () => formatDateInShanghai(new Date());

/** 后端返回的 ISO 日期直接展示；非法值不猜测。 */
export function formatTradeDate(value: string | null | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "—";
}

function formatDateInShanghai(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** ECharts轴提示可能传数组；只提取索引，金额仍从原始十进制字段读取。 */
export function chartDataIndex(params: unknown): number {
  const point = Array.isArray(params) ? params[0] : params;
  return typeof point === "object" &&
    point !== null &&
    "dataIndex" in point &&
    typeof point.dataIndex === "number"
    ? point.dataIndex
    : -1;
}

/** 坐标刻度仅用于绘图，账务及Tooltip仍使用服务端十进制原值。 */
export function formatChartTick(value: number): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(value)
    : "—";
}

export function formatMoney(value: string | null | undefined): string {
  const scale = 3;
  if (value == null || !/^-?\d+(\.\d+)?$/.test(value)) {
    return "—";
  }
  const negative = value.startsWith("-");
  const [integer = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  // 显示按字符串四舍五入，避免大金额转为 Number 后丢失分位。
  let units = BigInt(integer + fraction.padEnd(scale, "0").slice(0, scale));
  if (Number(fraction[scale] || "0") >= 5) {
    units++;
  }
  const text = units.toString().padStart(scale + 1, "0");
  const whole = scale ? text.slice(0, -scale) : text;
  return `${negative && units !== 0n ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${scale ? "." + text.slice(-scale) : ""}`;
}

export function signedMoney(value: string | null | undefined): string {
  const text = formatMoney(value);
  return text !== "—" && !text.startsWith("-") && /[1-9]/.test(text) ? "+" + text : text;
}

export const assetName = (type: string) => type === "ETF" ? "ETF" : "股票";

export const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请稍后重试";
