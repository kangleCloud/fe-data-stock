import { getStockMonitorDashboard } from "@/api/market";
import { useSnapshotSse } from "@/composables/useSnapshotSse";
import { applyStockMonitorPatch, parseStockMonitorDashboard } from "@/utils/stockMonitor";

export function useStockMonitorStream() {
  return useSnapshotSse({
    path: "/stock-monitor/v1/stream",
    label: "个股监控",
    get: getStockMonitorDashboard,
    parse: parseStockMonitorDashboard,
    id: (value) => value.stateId,
    apply: applyStockMonitorPatch,
    readyKey: "stateId",
  });
}
