import type { EntityId, PageResponse } from "@/types/api";
import type { PortfolioAudit, PortfolioDashboard, PortfolioInstrument, PortfolioPosition, PortfolioPositionAnalysis, PortfolioQuery, SnapshotInput } from "@/types/portfolio";
import { request, type ApiRequestConfig } from "@/utils/request";
import { normalizePortfolioIds, portfolioIdString } from "@/utils/portfolioId";
const root = "/portfolio/";
function resource<T>(name: string) {
  const base = root + name;
  return {
    page: (params: PortfolioQuery) => portfolioRequest<PageResponse<T>>({ url: `${base}/page`, method: "GET", params }),
    list: (params: PortfolioQuery = {}) => portfolioRequest<T[]>({ url: `${base}/list`, method: "GET", params }),
    get: (id: EntityId) => portfolioRequest<T>({ url: `${base}/getDetail`, method: "GET", params: { id } }),
  };
}
export const positions = resource<PortfolioPosition>("portfolioPosition");
export const audits = resource<PortfolioAudit>("portfolioAuditLog");
export const getPortfolioDictionary = (params: PortfolioQuery) => portfolioRequest<PageResponse<PortfolioInstrument>>({ url: root + "portfolioPosition/dictionary/page", method: "GET", params });
export const getPortfolioSummary = () => portfolioRequest<PortfolioDashboard>({ url: root + "portfolioDashboard/summary", method: "GET" });
export const getPortfolioAnalysis = (id: EntityId) => portfolioRequest<PortfolioPositionAnalysis>({ url: root + "portfolioPosition/analysis", method: "GET", params: { id } });
export async function savePortfolioSnapshot(data: SnapshotInput): Promise<string> {
  return portfolioIdString(await portfolioRequest<unknown>({ url: root + "portfolioPosition/saveSnapshot", method: "POST", data, timeoutMessage: "结果未确认，请查询快照历史核对，不要重复提交" }));
}
/** 复用统一 request，仅在持仓接口边界校验并保留 Long 标识。 */
async function portfolioRequest<T>(config: ApiRequestConfig): Promise<T> {
  const result = await request<unknown>({ ...config, params: normalizePortfolioIds(config.params), data: normalizePortfolioIds(config.data) });
  return normalizePortfolioIds(result) as T;
}
