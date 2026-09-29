import type { MarketDashboardSnapshot } from "@/types/market";

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

function ranking(value: unknown, sectorType: "industry" | "concept"): boolean {
  return record(value) && typeof value.sectorName === "string" && value.sectorType === sectorType &&
    finiteNumber(value.changePercent) && finiteNumber(value.netFlowAmount) &&
    !("sectorCode" in value) && !("mainNetInflow" in value) && !("mainNetInflowRatio" in value);
}

const FUND_NUMBERS = [
  "mainNetInflow", "mainNetInflowRatio", "superLargeNetInflow", "superLargeNetInflowRatio",
  "largeNetInflow", "largeNetInflowRatio", "mediumNetInflow", "mediumNetInflowRatio",
  "smallNetInflow", "smallNetInflowRatio", "shanghaiClose", "shanghaiChangePercent",
  "shenzhenClose", "shenzhenChangePercent",
];

function fundPoint(value: unknown): boolean {
  return record(value) && typeof value.date === "string" &&
    FUND_NUMBERS.every((key) => nullableNumber(value[key]));
}

function validModule(value: unknown, kind: "top5" | "fund", sectorType?: "industry" | "concept"): boolean {
  if (!record(value) || !["FRESH", "STALE", "ERROR"].includes(String(value.status))) return false;
  if (!(value.tradeDate === null || typeof value.tradeDate === "string")) return false;
  if (!["CALENDAR", "SOURCE"].includes(String(value.tradeDateBasis))) return false;
  if (kind === "top5" && value.tradeDateBasis !== "CALENDAR") return false;
  if (kind === "fund" && value.tradeDateBasis !== "SOURCE") return false;
  if (!(value.lastSuccessAt === null || typeof value.lastSuccessAt === "string")) return false;
  if (!(value.lastAttemptAt === null || typeof value.lastAttemptAt === "string")) return false;
  if (!(value.message === null || typeof value.message === "string")) return false;
  if (value.data === null) return value.status === "ERROR";
  if (value.status === "ERROR") return false;
  if (!record(value.data)) return false;
  if (kind === "fund") return fundPoint(value.data.latest) && Array.isArray(value.data.series) && value.data.series.every(fundPoint);
  return value.data.source === "THS" && value.data.period === "INTRADAY" &&
    !("unmatchedFundRows" in value.data) &&
    ["topRise", "topFall", "topInflow", "topOutflow"].every((key) => {
    const list = (value.data as Record<string, unknown>)[key];
    return Array.isArray(list) && list.length <= 5 &&
      list.every((item) => ranking(item, sectorType!));
  });
}

export function parseMarketSnapshot(value: unknown): MarketDashboardSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== "string" ||
      value.provider !== "akshare" || !record(value.modules) || Object.keys(value.modules).length !== 3 ||
      !validModule(value.modules.industryTop5, "top5", "industry") ||
      !validModule(value.modules.conceptTop5, "top5", "concept") ||
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
