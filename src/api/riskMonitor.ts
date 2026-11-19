import { request } from "@/utils/request";
import type { PageResponse } from "@/types/api";
import type { RiskManagedTarget, RiskTargetInput, RiskConfigSync, RiskResourceCurrent } from "@/types/riskMonitor";

export const getRiskTargets = (pageNum: number, pageSize: number) => request<PageResponse<RiskManagedTarget>>({ url: "/risk/targets/page", method: "GET", params: { pageNum, pageSize }, silentError: true });
export const saveRiskTarget = (data: RiskTargetInput) => request<RiskManagedTarget>({ url: "/risk/targets/save", method: "POST", data, silentError: true });
export const enableRiskTarget = (data: { targetId: string; version: string; enabled: boolean }) => request<RiskManagedTarget>({ url: "/risk/targets/enable", method: "POST", data, silentError: true });
export const getRiskConfigSync = () => request<RiskConfigSync>({ url: "/risk/config-sync/status", method: "GET", silentError: true });
export const retryRiskConfigSync = () => request<RiskConfigSync>({ url: "/risk/config-sync/retry", method: "POST", silentError: true });
export const getRiskResources = () => request<{ generatedAt: string; items: RiskResourceCurrent[] }>({ url: "/risk/resources/current", method: "GET", silentError: true });
