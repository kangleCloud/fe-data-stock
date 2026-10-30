import { beforeEach, describe, expect, it, vi } from "vitest";
import { audits, getPortfolioAnalysis, getPortfolioDictionary, getPortfolioSummary, positions, savePortfolioSnapshot } from "@/api/portfolio";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ request }));
beforeEach(() => request.mockReset());
describe("manual portfolio REST contracts", () => {
  it("keeps readonly position, analysis, dictionary, summary and audit paths", async () => {
    request.mockResolvedValue({ list: [], total: 0 });
    await positions.page({ pageNum: 2, pageSize: 10, holdingOnly: true });
    await positions.list({ keyword: "600000" });
    await positions.get("9223372036854775807");
    await getPortfolioAnalysis("9223372036854775807");
    await getPortfolioDictionary({ assetType: "ETF", keyword: "510300" });
    await getPortfolioSummary();
    await audits.list({ positionId: "9223372036854775807" });
    expect(request.mock.calls.map(([config]) => config.url)).toEqual(["/portfolio/portfolioPosition/page", "/portfolio/portfolioPosition/list", "/portfolio/portfolioPosition/getDetail", "/portfolio/portfolioPosition/analysis", "/portfolio/portfolioPosition/dictionary/page", "/portfolio/portfolioDashboard/summary", "/portfolio/portfolioAuditLog/list"]);
    expect(request.mock.calls[3]?.[0].params).toEqual({ id: "9223372036854775807" });
    expect(request.mock.calls.every(([config]) => config.method === "GET" && !config.data)).toBe(true);
  });
  it("saves one complete decimal snapshot with no preview, fees, prices or owner", async () => {
    request.mockResolvedValue("9223372036854775807");
    const input = { assetType: "STOCK" as const, dictionaryId: "9007199254740993", operationType: "INITIAL" as const, snapshotAt: "2026-10-19T15:00:00", quantity: 100, marketValue: "1200.50", totalCost: "1000.00" };
    expect(await savePortfolioSnapshot(input)).toBe("9223372036854775807");
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/portfolio/portfolioPosition/saveSnapshot", method: "POST", data: input }));
    expect(request.mock.calls[0]?.[0].data).not.toHaveProperty("ownerUserId");
  });
  it("existing and closing snapshots preserve identity, version and explicit zero", async () => {
    request.mockResolvedValue("9");
    await savePortfolioSnapshot({ positionId: "9223372036854775807", expectedVersion: 3, operationType: "SELL", snapshotAt: "2026-10-19T15:00:00", quantity: 0, marketValue: "0", totalCost: "0" });
    expect(request.mock.calls[0]?.[0].data).toEqual({ positionId: "9223372036854775807", expectedVersion: 3, operationType: "SELL", snapshotAt: "2026-10-19T15:00:00", quantity: 0, marketValue: "0", totalCost: "0" });
  });
});
