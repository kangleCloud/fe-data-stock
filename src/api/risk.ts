import type { PageResponse } from "@/types/api";
import type { RiskArchive, RiskDashboard, RiskException, RiskInterface, RiskPageQuery, RiskQuery } from "@/types/risk";
import { request } from "@/utils/request";

export const getRiskDashboard = (params: RiskQuery) => request<RiskDashboard>({ url: "/risk/dashboard", method: "GET", silentError: true, params });
export const getRiskInterfaces = (params: RiskPageQuery) => request<PageResponse<RiskInterface>>({ url: "/risk/interfaces/page", method: "GET", silentError: true, params });
export const getRiskExceptions = (params: RiskPageQuery) => request<PageResponse<RiskException>>({ url: "/risk/exceptions/page", method: "GET", silentError: true, params });
/** 归档仅按日期查询，地域与类型不适用于批次。 */
export const getRiskArchives = ({ startDate, endDate, pageNum, pageSize }: RiskPageQuery) => request<PageResponse<RiskArchive>>({ url: "/risk/archives/page", method: "GET", silentError: true, params: { startDate, endDate, pageNum, pageSize } });
