import { getEtfMonitorDashboard } from "@/api/etf";
import { useSnapshotSse } from "@/composables/useSnapshotSse";
import { applyEtfMonitorPatch, parseEtfMonitorDashboard } from "@/utils/etfMonitor";

export function useEtfMonitorStream() {
  return useSnapshotSse({
    path: "/etf-monitor/v1/stream",
    label: "ETF 监控",
    get: getEtfMonitorDashboard,
    parse: parseEtfMonitorDashboard,
    id: (value) => value.stateId,
    apply: applyEtfMonitorPatch,
    readyKey: "stateId",
  });
}
