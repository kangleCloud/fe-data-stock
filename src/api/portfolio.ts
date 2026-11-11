import type { EntityId, PageResponse } from "@/types/api";
import type {
  PortfolioAudit,
  PortfolioDailyInput,
  PortfolioDashboard,
  PortfolioInstrument,
  PortfolioPosition,
  PortfolioPositionDetail,
  PortfolioQuery,
} from "@/types/portfolio";
import { request, type ApiRequestConfig } from "@/utils/request";
import { normalizePortfolioIds, portfolioIdString } from "@/utils/portfolioId";

const root = "/portfolio/";

export const positions = {
  page: (params: PortfolioQuery) =>
    portfolioRequest<PageResponse<PortfolioPosition>>({
      url: `${root}portfolioPosition/page`,
      method: "GET",
      params,
    }),
  list: (params: PortfolioQuery = {}) =>
    portfolioRequest<PortfolioPosition[]>({
      url: `${root}portfolioPosition/list`,
      method: "GET",
      params,
    }),
};

export const audits = {
  page: (params: PortfolioQuery) =>
    portfolioRequest<PageResponse<PortfolioAudit>>({
      url: `${root}portfolioAuditLog/page`,
      method: "GET",
      params,
    }),
  list: (params: PortfolioQuery = {}) =>
    portfolioRequest<PortfolioAudit[]>({
      url: `${root}portfolioAuditLog/list`,
      method: "GET",
      params,
    }),
  get: (id: EntityId) =>
    portfolioRequest<PortfolioAudit>({
      url: `${root}portfolioAuditLog/getDetail`,
      method: "GET",
      params: { id },
    }),
};

export const getPortfolioPositionDetail = (id: EntityId) =>
  portfolioRequest<PortfolioPositionDetail>({
    url: `${root}portfolioPosition/getDetail`,
    method: "GET",
    params: { id },
  });

export const getPortfolioDictionary = (params: PortfolioQuery) =>
  portfolioRequest<PageResponse<PortfolioInstrument>>({
    url: `${root}portfolioPosition/dictionary/page`,
    method: "GET",
    params,
  });

export const getPortfolioSummary = () =>
  portfolioRequest<PortfolioDashboard>({
    url: `${root}portfolioDashboard/summary`,
    method: "GET",
  });

/** 同日保存为覆盖语义，超时后可以直接重试，不再进入“结果未确认”状态机。 */
export async function savePortfolioDaily(data: PortfolioDailyInput): Promise<string> {
  return portfolioIdString(
    await portfolioRequest<unknown>({
      url: `${root}portfolioPosition/saveDaily`,
      method: "POST",
      data,
      timeoutMessage: "保存结果未确认，可直接重试",
    }),
  );
}

/** 复用统一 request，仅在持仓接口边界校验并保留 Long 标识。 */
async function portfolioRequest<T>(config: ApiRequestConfig): Promise<T> {
  const result = await request<unknown>({
    ...config,
    params: normalizePortfolioIds(config.params),
    data: normalizePortfolioIds(config.data),
  });
  return normalizePortfolioIds(result) as T;
}
