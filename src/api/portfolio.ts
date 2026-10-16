import type { EntityId, PageResponse } from "@/types/api";
import type {
  ActionInput,
  PortfolioAction,
  PortfolioAudit,
  PortfolioPosition,
  PortfolioPreview,
  PortfolioQuery,
  PortfolioTrade,
  PortfolioValuation,
  ReplaceInput,
  TradeInput,
  ValuationInput,
  VoidInput,
} from "@/types/portfolio";
import { request, type ApiRequestConfig } from "@/utils/request";
import { normalizePortfolioIds, portfolioIdString } from "@/utils/portfolioId";
const root = "/portfolio/";
function resource<T>(name: string) {
  const base = root + name;
  return {
    page: (params: PortfolioQuery) =>
      portfolioRequest<PageResponse<T>>({
        url: `${base}/page`,
        method: "GET",
        params,
      }),
    list: (params: PortfolioQuery = {}) =>
      portfolioRequest<T[]>({ url: `${base}/list`, method: "GET", params }),
    get: (id: EntityId) =>
      portfolioRequest<T>({
        url: `${base}/getDetail`,
        method: "GET",
        params: { id },
      }),
  };
}
export const positions = {
  ...resource<PortfolioPosition>("portfolioPosition"),
  history: (id: EntityId, asOf: string) =>
    portfolioRequest<PortfolioPosition>({
      url: root + "portfolioPosition/history",
      method: "GET",
      params: { id, asOf },
    }),
};
export const trades = {
  ...resource<PortfolioTrade>("portfolioTrade"),
  preview: (data: TradeInput) =>
    post<PortfolioPreview>(
      `portfolioTrade/${data.tradeType === "OPENING" ? "opening/preview" : "preview"}`,
      data,
    ),
  create: (data: TradeInput) =>
    post<EntityId>(
      `portfolioTrade/${data.tradeType === "OPENING" ? "opening" : "add"}`,
      data,
      true,
    ),
  replace: (data: ReplaceInput<TradeInput>) =>
    post<EntityId>("portfolioTrade/replace", data, true),
  void: (data: VoidInput) => post<boolean>("portfolioTrade/void", data),
};
export const actions = {
  ...resource<PortfolioAction>("portfolioCorporateAction"),
  preview: (data: ActionInput) =>
    post<PortfolioPreview>("portfolioCorporateAction/preview", data),
  create: (data: ActionInput) =>
    post<EntityId>("portfolioCorporateAction/add", data, true),
  replace: (data: ReplaceInput<ActionInput>) =>
    post<EntityId>("portfolioCorporateAction/replace", data, true),
  void: (data: VoidInput) =>
    post<boolean>("portfolioCorporateAction/void", data),
};
export const valuations = {
  ...resource<PortfolioValuation>("portfolioValuation"),
  create: (data: ValuationInput) =>
    post<EntityId>("portfolioValuation/add", data, true),
  replace: (data: ReplaceInput<ValuationInput>) =>
    post<EntityId>("portfolioValuation/replace", data, true),
  void: (data: VoidInput) => post<boolean>("portfolioValuation/void", data),
};
export const audits = resource<PortfolioAudit>("portfolioAuditLog");
async function post<T>(
  path: string,
  data: unknown,
  responseId = false,
): Promise<T> {
  const result = await portfolioRequest<unknown>({
    url: root + path,
    method: "POST",
    data,
    timeoutMessage: "结果未确认，请先查询流水核对，不要重复提交",
  });
  return (responseId ? portfolioIdString(result) : result) as T;
}
export const getPortfolioDictionary = (params: PortfolioQuery) =>
  portfolioRequest<
    PageResponse<import("@/types/portfolio").PortfolioInstrument>
  >({
    url: root + "portfolioPosition/dictionary/page",
    method: "GET",
    params,
  });
export const previewTradeReplacement = (data: ReplaceInput<TradeInput>) =>
  post<PortfolioPreview>("portfolioTrade/replace/preview", data);
export const previewActionReplacement = (data: ReplaceInput<ActionInput>) =>
  post<PortfolioPreview>("portfolioCorporateAction/replace/preview", data);

export const getPortfolioSummary = (asOf?: string) =>
  portfolioRequest<import("@/types/portfolio").PortfolioDashboard>({
    url: root + "portfolioDashboard/summary",
    method: "GET",
    params: { asOf },
  });
export const getPortfolioAnalysis = (id: EntityId, asOf?: string) =>
  portfolioRequest<import("@/types/portfolio").PortfolioPositionAnalysis>({
    url: root + "portfolioPosition/analysis",
    method: "GET",
    params: { id, asOf },
  });

export const getPortfolioContexts = (
  params: PortfolioQuery & { id?: EntityId } = {},
) =>
  portfolioRequest<
    PageResponse<import("@/types/portfolio").PortfolioCommandContext>
  >({
    url: root + "portfolioPosition/command-context",
    method: "GET",
    params,
  });
export async function getPortfolioContext(id: EntityId) {
  const result = await getPortfolioContexts({ id, pageNum: 1, pageSize: 1 });
  if (!result.list[0]) {
    throw new Error("未找到本人持仓，请刷新后重试");
  }
  return result.list[0];
}

/** 复用统一 request，仅在持仓接口边界校验/保留标识精度。 */
async function portfolioRequest<T>(config: ApiRequestConfig): Promise<T> {
  const result = await request<unknown>({
    ...config,
    params: normalizePortfolioIds(config.params),
    data: normalizePortfolioIds(config.data),
  });
  return normalizePortfolioIds(result) as T;
}
