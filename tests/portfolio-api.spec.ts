import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  audits,
  getPortfolioDictionary,
  getPortfolioPositionDetail,
  getPortfolioSummary,
  positions,
  savePortfolioDaily,
} from "@/api/portfolio";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ request }));

beforeEach(() => request.mockReset());

describe("daily portfolio REST contracts", () => {
  it("keeps readonly position, detail, dictionary, summary and audit paths", async () => {
    request.mockResolvedValue({ list: [], total: 0 });
    await positions.page({ pageNum: 2, pageSize: 10, holdingOnly: true });
    await positions.list({ keyword: "600000" });
    await getPortfolioPositionDetail("9223372036854775807");
    await getPortfolioDictionary({ assetType: "ETF", keyword: "510300" });
    await getPortfolioSummary();
    await audits.list({ positionId: "9223372036854775807" });
    await audits.get("9223372036854775807");
    expect(request.mock.calls.map(([config]) => config.url)).toEqual([
      "/portfolio/portfolioPosition/page",
      "/portfolio/portfolioPosition/list",
      "/portfolio/portfolioPosition/getDetail",
      "/portfolio/portfolioPosition/dictionary/page",
      "/portfolio/portfolioDashboard/summary",
      "/portfolio/portfolioAuditLog/list",
      "/portfolio/portfolioAuditLog/getDetail",
    ]);
    expect(request.mock.calls[2]?.[0].params).toEqual({ id: "9223372036854775807" });
    expect(request.mock.calls.every(([config]) => config.method === "GET" && !config.data)).toBe(true);
  });

  it("saves one daily record without operation, version, owner or derived fields", async () => {
    request.mockResolvedValue("9223372036854775807");
    const input = {
      assetType: "STOCK" as const,
      dictionaryId: "9007199254740993",
      tradeDate: "2026-10-19",
      quantity: 100,
      marketValue: "1200.50",
      totalCost: "1000.00",
    };
    expect(await savePortfolioDaily(input)).toBe("9223372036854775807");
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url: "/portfolio/portfolioPosition/saveDaily",
      method: "POST",
      data: input,
    }));
    expect(request.mock.calls[0]?.[0].data).not.toHaveProperty("ownerUserId");
    expect(request.mock.calls[0]?.[0].data).not.toHaveProperty("operationType");
    expect(request.mock.calls[0]?.[0].data).not.toHaveProperty("expectedVersion");
  });

  it("existing and closing records preserve position identity and explicit values", async () => {
    request.mockResolvedValue("9");
    await savePortfolioDaily({
      positionId: "9223372036854775807",
      tradeDate: "2026-10-19",
      quantity: 0,
      marketValue: "0",
      totalCost: "0",
    });
    expect(request.mock.calls[0]?.[0].data).toEqual({
      positionId: "9223372036854775807",
      tradeDate: "2026-10-19",
      quantity: 0,
      marketValue: "0",
      totalCost: "0",
    });
  });
});
