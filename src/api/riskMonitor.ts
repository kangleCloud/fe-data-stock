import { request } from "@/utils/request";
import type { PageResponse } from "@/types/api";
import type { RiskManagedTarget, RiskTargetInput, RiskConfigSync, RiskResourceCurrent, RiskMapServer, RiskMapServerInput } from "@/types/riskMonitor";

export const getRiskTargets = (pageNum: number, pageSize: number) => request<PageResponse<RiskManagedTarget>>({ url: "/risk/targets/page", method: "GET", params: { pageNum, pageSize }, silentError: true });
export const saveRiskTarget = (data: RiskTargetInput) => request<RiskManagedTarget>({ url: "/risk/targets/save", method: "POST", data, silentError: true });
export const enableRiskTarget = (data: { targetId: string; version: string; enabled: boolean }) => request<RiskManagedTarget>({ url: "/risk/targets/enable", method: "POST", data, silentError: true });
export const getRiskConfigSync = () => request<RiskConfigSync>({ url: "/risk/config-sync/status", method: "GET", silentError: true });
export const getRiskResources = () => request<{ generatedTime: string; items: RiskResourceCurrent[] }>({ url: "/risk/resources/current", method: "GET", silentError: true });
export const getRiskMapServers = () => request<RiskMapServer[]>({ url: "/risk/map-servers/list", method: "GET", silentError: true });
export const saveRiskMapServer = (data: RiskMapServerInput) => request<RiskMapServer>({ url: "/risk/map-servers/save", method: "POST", data, silentError: true });
export const enableRiskMapServer = (data: { id: string; version: string; enabled: boolean }) => request<RiskMapServer>({ url: "/risk/map-servers/enable", method: "POST", data, silentError: true });
