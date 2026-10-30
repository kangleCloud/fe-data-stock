/** 金额只作十进制字符串输入/展示；派生值全部由后端计算。 */
export function amountInputValue(value: string | null | undefined): string {
  return value == null ? "" : value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
export function amountInputValid(value: string): boolean {
  return /^\d{1,20}(?:\.\d{1,2})?$/.test(amountInputValue(value));
}
export function quantityInputValid(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}
export function snapshotTimeValid(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value + "+08:00");
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now() && formatPortfolioDateTime(value).replace(" ", "T") === value;
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
export const operationNames: Record<string, string> = { INITIAL: "首次录入", BUY: "买入后持仓", SELL: "卖出后持仓", ADJUST: "调整持仓" };
/** 无时区的账务时点按上海时间解释，展示到秒，不改写原始字段。 */
export function formatPortfolioDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
    ? normalized : `${normalized}+08:00`);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
export const currentSnapshotTime = () => formatPortfolioDateTime(new Date().toISOString()).replace(" ", "T");
export const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请稍后重试";
export const isPortfolioConflict = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error.code === 409 || error.code === 423);
export const isUncertainWrite = (error: unknown) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code >= 500 : /超时|结果未确认|网络/.test(errorText(error));
