import { request } from "@/utils/request";
import type { RiskServerConfig, RiskServerSave } from "@/types/riskServer";
export const getRiskServerConfig = () => request<RiskServerConfig>({ url: "/risk/server-config", method: "GET", silentError: true });
export const saveRiskServerConfig = (data: RiskServerSave) => request<RiskServerConfig>({ url: "/risk/server-config/save", method: "POST", data, silentError: true });
export const resolveRiskServerConfig = (version: string) => request<RiskServerConfig>({ url: "/risk/server-config/resolve", method: "POST", data: { version }, silentError: true });
