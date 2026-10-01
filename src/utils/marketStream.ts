import type { MarketDashboardSnapshot } from "@/types/market";
import { chinaDate } from "@/utils/marketSnapshot";

export interface SseFrame { event: string; data: string }

export class SseParser {
  private buffer = "";
  private event = "message";
  private data: string[] = [];

  constructor(private readonly onFrame: (frame: SseFrame) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let end = this.buffer.indexOf("\n");
    while (end !== -1) {
      const line = this.buffer.slice(0, end).replace(/\r$/, "");
      this.buffer = this.buffer.slice(end + 1);
      if (!line) {
        if (this.data.length) this.onFrame({ event: this.event, data: this.data.join("\n") });
        this.event = "message";
        this.data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const name = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (name === "event") this.event = value;
        if (name === "data") this.data.push(value);
      }
      end = this.buffer.indexOf("\n");
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): boolean {
  return value === null || finiteNumber(value);
}

function timestamp(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function sectorItem(value: unknown, sectorType: "industry" | "concept"): boolean {
  if (!record(value) || value.type !== sectorType ||
      !(value.code === null || typeof value.code === "string" && value.code.trim().length > 0) ||
      typeof value.name !== "string" || !value.name.trim() ||
      !(value.leader === null || typeof value.leader === "string")) return false;
  return ["indexValue", "changePct", "inflow", "outflow", "netAmount", "netFlowRate",
    "companyCount", "leaderChangePct", "leaderPrice"].every((key) => nullableNumber(value[key]));
}

function fundPoint(value: unknown): boolean {
  return record(value) && timestamp(value.collectedAt) &&
    ["inflow", "outflow", "netAmount"].every((key) => nullableNumber(value[key]));
}

function fundData(value: unknown, tradeDate: string): boolean {
  if (!record(value) || value.source !== "THS_INDIVIDUAL_AGGREGATE" ||
      !record(value.latest) || !fundPoint(value.latest) ||
      !["riseCount", "fallCount", "flatCount", "stockCount"].every((key) => nullableNumber((value.latest as Record<string, unknown>)[key])) ||
      !Array.isArray(value.series) || !value.series.every(fundPoint)) return false;
  const series = value.series as Array<{ collectedAt: string }>;
  if (chinaDate(new Date(value.latest.collectedAt as string)) !== tradeDate ||
      series.some((point) => chinaDate(new Date(point.collectedAt)) !== tradeDate)) return false;
  return series.every((point, index) =>
    index === 0 || Date.parse(point.collectedAt) > Date.parse(series[index - 1]!.collectedAt));
}

function validModule(value: unknown, kind: "sectors" | "fund", sectorType?: "industry" | "concept"): boolean {
  if (!record(value) || !["FRESH", "STALE", "ERROR"].includes(String(value.status))) return false;
  if (!(value.tradeDate === null || typeof value.tradeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.tradeDate))) return false;
  if (value.tradeDateBasis !== "CALENDAR") return false;
  if (!(value.lastSuccessAt === null || timestamp(value.lastSuccessAt))) return false;
  if (!(value.lastAttemptAt === null || timestamp(value.lastAttemptAt))) return false;
  if (!(value.message === null || typeof value.message === "string")) return false;
  if (value.data === null) return value.status === "ERROR";
  if (value.status === "ERROR") return false;
  if (value.tradeDate === null || value.lastSuccessAt === null) return false;
  if (!record(value.data)) return false;
  if (kind === "fund") return fundData(value.data, value.tradeDate as string);
  return value.data.source === "THS" && value.data.period === "INTRADAY" &&
    Array.isArray(value.data.items) && value.data.items.every((item) => sectorItem(item, sectorType!));
}

export function parseMarketSnapshot(value: unknown): MarketDashboardSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || !timestamp(value.generatedAt) ||
      value.provider !== "akshare" || !record(value.modules) || Object.keys(value.modules).length !== 3 ||
      !validModule(value.modules.industrySectors, "sectors", "industry") ||
      !validModule(value.modules.conceptSectors, "sectors", "concept") ||
      !validModule(value.modules.marketFundFlow, "fund")) {
    throw new Error("市场快照结构或版本无效");
  }
  return value as unknown as MarketDashboardSnapshot;
}

export async function readMarketStream(
  response: Response,
  onSnapshot: (snapshot: MarketDashboardSnapshot) => void,
  onInvalid: (error: Error) => void,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser(({ event, data }) => {
    if (event !== "snapshot") return;
    try {
      onSnapshot(parseMarketSnapshot(JSON.parse(data)));
    } catch (error) {
      onInvalid(error instanceof Error ? error : new Error("市场快照解析失败"));
    }
  });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
