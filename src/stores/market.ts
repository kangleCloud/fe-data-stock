import { defineStore } from "pinia";

import * as marketApi from "@/api/market";
import type {
  MarketDataStatus,
  MarketModuleResponse,
  RefreshStatus,
} from "@/types/market";

interface ModuleSnapshot {
  status: MarketDataStatus;
  message?: string;
  lastSuccessAt?: string;
}

interface MarketState {
  status: RefreshStatus | null;
  selectedIndexCode: string;
  enabledTotal: number;
  refreshSignal: number;
  refreshing: boolean;
  statusError: string | null;
  modules: Record<string, ModuleSnapshot>;
}

export const useMarketStore = defineStore("market", {
  state: (): MarketState => ({
    status: null,
    selectedIndexCode: "000001",
    enabledTotal: 0,
    refreshSignal: 0,
    refreshing: false,
    statusError: null,
    modules: {},
  }),
  actions: {
    async loadStatus(): Promise<RefreshStatus> {
      try {
        const status = await marketApi.getDashboardStatus();
        this.status = status;
        this.statusError = null;
        return status;
      } catch (error) {
        this.statusError =
          error instanceof Error ? error.message : "行情状态读取失败";
        throw error;
      }
    },
    selectIndex(code: string): void {
      this.selectedIndexCode = code;
    },
    setEnabledTotal(total: number): void {
      this.enabledTotal = total;
    },
    markModule<T>(key: string, response: MarketModuleResponse<T>): void {
      this.modules[key] = {
        status: response.dataStatus,
        message: response.message,
        lastSuccessAt: response.lastSuccessAt,
      };
    },
    markModuleFailure(key: string, message: string, hasSnapshot: boolean): void {
      this.modules[key] = {
        ...this.modules[key],
        status: hasSnapshot ? "STALE" : "ERROR",
        message,
      };
    },
    announceRefresh(): void {
      this.refreshSignal += 1;
    },
  },
});
