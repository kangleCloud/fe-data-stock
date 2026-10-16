import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actions,
  audits,
  getPortfolioAnalysis,
  getPortfolioContext,
  getPortfolioContexts,
  getPortfolioDictionary,
  getPortfolioSummary,
  positions,
  previewActionReplacement,
  previewTradeReplacement,
  trades,
  valuations,
} from "@/api/portfolio";
import type {
  ActionInput,
  TradeInput,
  ValuationInput,
} from "@/types/portfolio";
const r = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ request: r }));
beforeEach(() => {
  r.mockReset();
  r.mockImplementation((config) =>
    Promise.resolve(
      config.method === "POST"
        ? /\/(add|replace|opening)$/.test(config.url)
          ? "9"
          : true
        : { list: [{ id: 5, version: 2 }], total: 1 },
    ),
  );
});
describe("portfolio REST contracts", () => {
  it("reads cached account resources with query params and no owner field", async () => {
    await positions.page({
      pageNum: 2,
      pageSize: 10,
      asOf: "2026-01-01T23:59:59",
    });
    expect(r).toHaveBeenLastCalledWith({
      url: "/portfolio/portfolioPosition/page",
      method: "GET",
      params: { pageNum: 2, pageSize: 10, asOf: "2026-01-01T23:59:59" },
    });
    await positions.history(5, "2026-01-01T23:59:59");
    await getPortfolioAnalysis(5);
    await getPortfolioSummary();
    await getPortfolioDictionary({ assetType: "ETF", keyword: "510300" });
    await getPortfolioContexts({ id: 5 });
    expect(await getPortfolioContext(5)).toEqual({ id: "5", version: 2 });
    expect(r.mock.calls.every(([c]) => c.method === "GET" && !c.data)).toBe(
      true,
    );
  });
  it("keeps opening separate and posts decimal strings unchanged", async () => {
    const input = {
      tradeType: "BUY",
      businessDate: "2026-01-01",
      quantity: 100,
      price: "0.12345678",
      grossAmount: "12.35",
      actualFee: "0",
    } as TradeInput;
    await trades.preview(input);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/preview",
        method: "POST",
        data: input,
      }),
    );
    await trades.create(input);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/add",
        data: input,
      }),
    );
    await trades.preview({ ...input, tradeType: "OPENING" });
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/opening/preview",
      }),
    );
    await trades.create({ ...input, tradeType: "OPENING" });
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: "/portfolio/portfolioTrade/opening" }),
    );
  });
  it("passes opening unit cost unchanged and never calculates or adds a total client-side", async () => {
    const input = {
      tradeType: "OPENING",
      positionId: "9223372036854775807",
      quantity: 24000,
      businessDate: "2026-10-16",
      openingUnitCost: "6.11300000",
    } as TradeInput;
    await trades.preview(input);
    await trades.create(input);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/opening",
        data: input,
      }),
    );
    expect(r.mock.calls[1]?.[0].data).not.toHaveProperty("openingCost");
  });
  it("uses atomic replacement preview and one server command", async () => {
    const replacement = {
      tradeType: "SELL",
      quantity: 100,
      businessDate: "2026-01-01",
    } as TradeInput;
    const payload = { id: 3, reason: "凭单更正", replacement };
    await previewTradeReplacement(payload);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/replace/preview",
        data: { ...payload, id: "3" },
      }),
    );
    await trades.replace(payload);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioTrade/replace",
        data: { ...payload, id: "3" },
      }),
    );
    const action = { id: 4, reason: "核对", replacement: {} as ActionInput };
    await previewActionReplacement(action);
    await actions.replace(action);
    expect(r).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/portfolio/portfolioCorporateAction/replace",
        data: { ...action, id: "4" },
      }),
    );
  });
  it("uses only approved write routes and readonly audit", async () => {
    const voidInput = { id: 1, expectedVersion: 2, reason: "重复凭单" };
    await trades.void(voidInput);
    await actions.void(voidInput);
    await valuations.void(voidInput);
    await actions.create({} as ActionInput);
    await valuations.create({} as ValuationInput);
    await valuations.replace({
      id: 1,
      reason: "更正",
      replacement: {} as ValuationInput,
    });
    await audits.list({ positionId: 1 });
    expect(
      r.mock.calls.every(([c]) => ["GET", "POST"].includes(c.method)),
    ).toBe(true);
    expect(r.mock.calls.some(([c]) => c.url.endsWith("/delete"))).toBe(false);
  });
  it("fails when id is unavailable instead of silently accepting missing context", async () => {
    r.mockResolvedValue({ list: [], total: 0 });
    await expect(getPortfolioContext(99)).rejects.toThrow("未找到本人持仓");
  });
});
