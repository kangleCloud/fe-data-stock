import { ref } from "vue";
import type { PortfolioPreview } from "@/types/portfolio";
/** 金额只做字符串校验与展示；账务计算由后端 BigDecimal 完成。 */
export function decimalValid(
  value: string,
  scale = 2,
  signed = false,
  integerDigits = 20,
): boolean {
  return new RegExp(
    `^${signed ? "-?" : ""}\\d{1,${integerDigits}}(?:\\.\\d{1,${scale}})?$`,
  ).test(value);
}
export function integerValid(value: string, signed = false): boolean {
  return (
    new RegExp(`^${signed ? "-?" : ""}\\d+$`).test(value) &&
    Number.isSafeInteger(Number(value))
  );
}
/** 新价格最多三位；更正未改变的历史八位价格时，保留原始事实。 */
export function priceInputValid(
  value: string,
  original?: string | null,
  signed = false,
): boolean {
  if (!decimalValid(value, 8, signed, 12)) {
    return false;
  }
  const normalize = (text: string) => {
    const [whole = "0", fraction = ""] = text.replace(/^-/, "").split(".");
    const integer = whole.replace(/^0+(?=\d)/, "");
    const decimals = fraction.replace(/0+$/, "");
    const negative = text.startsWith("-") && /[1-9]/.test(integer + decimals);
    return `${negative ? "-" : ""}${integer}${decimals ? "." + decimals : ""}`;
  };
  const normalized = normalize(value);
  return (
    decimalValid(normalized, 3, signed, 12) ||
    (original != null && normalized === normalize(original))
  );
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
export const assetName = (type: string) => (type === "ETF" ? "ETF" : "股票");
export const feeSourceNames: Record<string, string> = {
  MANUAL_ACTUAL: "人工实际费用",
  MANUAL_SETTLEMENT: "实际结算",
  MANUAL_ESTIMATE: "人工预估",
  BROKER_INFERRED_ESTIMATE: "明确采纳反推（预估）",
  HISTORICAL_ACTUAL: "历史实际费用",
  HISTORICAL_SETTLEMENT: "历史实际结算",
  HISTORICAL_ESTIMATE: "历史人工预估",
  HISTORICAL_RULE_ESTIMATE: "历史规则预估",
  ACTUAL: "人工实际费用",
  SETTLEMENT: "实际结算",
  ESTIMATED: "人工预估 / 采纳反推",
  INFERRED: "反推预估",
  INFERRED_ESTIMATED: "反推预估",
};
export const statusNames: Record<string, string> = {
  VERIFIED: "成本已核实",
  ESTIMATED: "预估",
  UNVERIFIED: "待核实",
  CONFIRMED: "已确认",
  INCOMPLETE: "不完整",
  RECHECK: "待复核",
  NONE: "未确认",
  ACTIVE: "有效",
  VOID: "已作废",
  PENDING: "待处理",
  BUY: "买入",
  SELL: "卖出",
  OPENING: "期初",
  ACTUAL: "实际费用",
  SETTLEMENT: "实际结算",
  COMPLETE: "已核算",
  EMPTY: "无数据",
  MISSING: "缺少估值",
  NO_HOLDING: "已清仓",
  AVAILABLE: "可用",
  UNRELIABLE: "依据待核实",
  UNCONFIGURED: "费用待补",
};
export const localDate = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
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
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "请求失败，请稍后重试";
/** 改动输入后只使预览失效；busy防双击不代表提交幂等。 */
export function usePortfolioCommand() {
  const preview = ref<PortfolioPreview | null>(null);
  function changed() {
    preview.value = null;
  }
  function accept(result: PortfolioPreview) {
    preview.value = result;
  }
  function canSave() {
    return preview.value?.canSave === true;
  }
  return { preview, changed, accept, canSave };
}
export function cutoffForDate(date?: string): string | undefined {
  return date && date < localDate() ? `${date}T23:59:59` : undefined;
}

export function isPortfolioConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === 409 || error.code === 423)
  );
}
export function writeErrorText(error: unknown): string {
  const message = errorText(error);
  if (isPortfolioConflict(error)) {
    return `${message}；请关闭表单，刷新持仓版本后重新预览`;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (
    (typeof code === "number" && code < 500) ||
    (code == null && !/超时|结果未确认|网络/.test(message))
  ) {
    return message;
  }
  return `${message}；结果未确认，请先查询流水核对；确认未入账后再明确重新录入，不要重复提交`;
}

export function isUncertainWrite(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return typeof code === "number"
    ? code >= 500
    : /超时|结果未确认|网络/.test(errorText(error));
}
