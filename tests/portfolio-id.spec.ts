import { AxiosHeaders, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPortfolioAnalysis,
  getPortfolioContext,
  positions,
  trades,
} from "@/api/portfolio";
import { httpClient, request } from "@/utils/request";
import { normalizePortfolioIds, portfolioIdString } from "@/utils/portfolioId";
import type { TradeInput } from "@/types/portfolio";
const previousAdapter = httpClient.defaults.adapter;
// 模拟 JSON 已将超安全范围数字解析为浮点数，不能事后 String() 恢复。
const unsafeNumber = JSON.parse("9007199254740993") as number;
function responseAdapter(
  content: unknown,
  inspect?: (config: Parameters<AxiosAdapter>[0]) => void,
): AxiosAdapter {
  return async (config) => {
    inspect?.(config);
    return {
      data: { success: true, code: 200, content, msg: "ok" },
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config,
    } as AxiosResponse;
  };
}
afterEach(() => {
  httpClient.defaults.adapter = previousAdapter;
});
describe("portfolio ID boundary", () => {
  it("preserves Long.MAX_VALUE and >2^53 identifiers through nested records and arrays", () => {
    expect(
      normalizePortfolioIds({
        id: "9223372036854775807",
        positionId: "9007199254740993",
        children: [{ recordId: 7, dictionaryId: "9007199254740995" }],
        ownerUserId: "9223372036854775806",
        relatedIds: [2, "9007199254740993"],
      }),
    ).toEqual({
      id: "9223372036854775807",
      positionId: "9007199254740993",
      children: [{ recordId: "7", dictionaryId: "9007199254740995" }],
      ownerUserId: "9223372036854775806",
      relatedIds: ["2", "9007199254740993"],
    });
  });
  it("rejects already rounded numeric IDs instead of claiming string conversion repaired precision", async () => {
    expect(() => portfolioIdString(unsafeNumber)).toThrow("安全整数");
    expect(() => normalizePortfolioIds({ positionId: unsafeNumber })).toThrow(
      "重新读取",
    );
    httpClient.defaults.adapter = responseAdapter({
      list: [{ id: unsafeNumber }],
      total: 1,
    });
    await expect(positions.page({ pageNum: 1, pageSize: 10 })).rejects.toThrow(
      "重新读取",
    );
  });
  it("keeps portfolio pagination, quantities, versions and financial strings unchanged", async () => {
    const content = {
      list: [
        {
          id: "9223372036854775807",
          currentQuantity: 100,
          version: 3,
          remainingCost: "9999999999999999.99",
        },
      ],
      total: 25,
    };
    httpClient.defaults.adapter = responseAdapter(content);
    expect(await positions.page({ pageNum: 2, pageSize: 10 })).toEqual(content);
    expect(
      normalizePortfolioIds({
        quantity: 100,
        entrySeq: 2,
        total: 25,
        expiresIn: 3600,
        price: "10.12345678",
        code: "000001",
      }),
    ).toEqual({
      quantity: 100,
      entrySeq: 2,
      total: 25,
      expiresIn: 3600,
      price: "10.12345678",
      code: "000001",
    });
  });
  it("round trips create IDs, lookup IDs and scalar results without Number conversion", async () => {
    const identifier = "9223372036854775807";
    httpClient.defaults.adapter = responseAdapter(identifier, (config) => {
      const body = JSON.parse(config.data as string);
      expect(body.dictionaryId).toBe("9007199254740993");
      expect(body.quantity).toBe(100);
    });
    const input = {
      assetType: "STOCK",
      dictionaryId: "9007199254740993",
      tradeType: "BUY",
      businessDate: "2026-01-01",
      quantity: 100,
      price: "10.00000001",
      grossAmount: "1000.00",
      actualFee: "0",
    } as TradeInput;
    expect(await trades.create(input)).toBe(identifier);
    httpClient.defaults.adapter = responseAdapter(
      {
        list: [{ id: identifier, version: 3, currentQuantity: 100 }],
        total: 1,
      },
      (config) => {
        expect(config.params.id).toBe(identifier);
      },
    );
    expect((await getPortfolioContext(identifier)).id).toBe(identifier);
  });
  it("normalizes historical safe number IDs, and rejects unsafe outgoing IDs before sending", async () => {
    httpClient.defaults.adapter = responseAdapter(
      {
        position: { id: 7, dictionaryId: 9 },
        costEntries: [{ recordId: 11, entrySeq: 1, quantityDelta: 100 }],
      },
      (config) => {
        expect(config.params.id).toBe("7");
      },
    );
    expect(await getPortfolioAnalysis(7)).toEqual({
      position: { id: "7", dictionaryId: "9" },
      costEntries: [{ recordId: "11", entrySeq: 1, quantityDelta: 100 }],
    });
    await expect(getPortfolioAnalysis(unsafeNumber)).rejects.toThrow(
      "安全整数",
    );
  });
  it("does not alter other management APIs, public snapshots or opaque request objects", async () => {
    httpClient.defaults.adapter = responseAdapter({
      id: 7,
      quantity: 100,
      total: 25,
    });
    expect(
      await request({ url: "/system/sysUser/page", method: "GET" }),
    ).toEqual({ id: 7, quantity: 100, total: 25 });
    expect(
      await request({
        url: "/market/dashboard",
        method: "GET",
        publicAccess: true,
      }),
    ).toEqual({ id: 7, quantity: 100, total: 25 });
    const form = new FormData();
    form.append("file", new Blob(["id=9223372036854775807"]));
    const params = new URLSearchParams({ id: "9223372036854775807" });
    expect(normalizePortfolioIds(form)).toBe(form);
    expect(normalizePortfolioIds(params)).toBe(params);
  });
});
