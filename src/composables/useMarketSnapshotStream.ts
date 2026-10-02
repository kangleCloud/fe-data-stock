import { getMarketDashboardSnapshot } from "@/api/market";
import { useSnapshotSse } from "@/composables/useSnapshotSse";
import { applyMarketPatch, parseMarketSnapshot } from "@/utils/marketStream";

export function useMarketSnapshotStream() {
  return useSnapshotSse({
    path: "/market/dashboard/stream",
    label: "市场快照",
    get: getMarketDashboardSnapshot,
    parse: parseMarketSnapshot,
    id: (value) => value.snapshotId,
    apply: applyMarketPatch,
    readyKey: "snapshotId",
  });
}
