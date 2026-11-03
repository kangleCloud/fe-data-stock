import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useGeoDrilldown } from "@/composables/useGeoDrilldown";
import { getGeoObservation } from "@/api/geoObservation";
import type { GeoObservation } from "@/types/geoObservation";
import { getRiskArchives, getRiskDashboard, getRiskExceptions, getRiskInterfaces } from "@/api/risk";
import { useAuthStore } from "@/stores/auth";
import type { PageResponse } from "@/types/api";
import type { RiskArchive, RiskDashboard, RiskException, RiskInterface, RiskQuery } from "@/types/risk";
import { riskPermission, riskPreset, validateRiskDates } from "@/utils/risk";
import { createRiskPolling } from "@/utils/riskPolling";

export function useRiskDashboard() {
  const auth = useAuthStore();
  const allowed = computed(() => riskPermission(auth.permissionCodes));
  const exceptionAllowed = computed(() => riskPermission(auth.permissionCodes, "exception"));
  const archiveAllowed = computed(() => riskPermission(auth.permissionCodes, "archive"));
  const range = riskPreset(1);
  const filters = ref<RiskQuery>({ startDate: range[0], endDate: range[1] });
  const drilldown = useGeoDrilldown(filters, allowed);
  const validation = computed(() => validateRiskDates(filters.value.startDate, filters.value.endDate));
  const geoObservation = shallowRef<GeoObservation>();
  const geoError = ref(false);
  const geoUpdatedAt = ref<string>();
  const dashboard = shallowRef<RiskDashboard>();
  const acceptedFilters = ref("");
  const error = ref("");
  const loading = ref(false);
  const detailError = ref("");
  const detailLoading = ref(false);
  const activeTab = ref<"interfaces" | "exceptions" | "archives">("interfaces");
  const pageNum = ref(1);
  const pageSize = ref(10);
  const details = shallowRef<PageResponse<RiskInterface | RiskException | RiskArchive>>();
  const detailSnapshot = ref("");
  const visible = () => document.visibilityState !== "hidden";
  const queryLabel = () => JSON.stringify(filters.value);
  const detailPermitted = () => allowed.value && (activeTab.value !== "exceptions" || exceptionAllowed.value) && (activeTab.value !== "archives" || archiveAllowed.value);
  const summaryPoll = createRiskPolling({
    visible: () => visible() && allowed.value && !validation.value,
    load: async () => {
      loading.value = true;
      try { const label = queryLabel(); void drilldown.refresh(); const [summary, geo] = await Promise.allSettled([getRiskDashboard({ ...filters.value }), getGeoObservation()]); return { summary, geo, label }; }
      finally { loading.value = false; }
    },
    accept: ({ summary, geo, label }) => {
      if (summary.status === "fulfilled") { dashboard.value = summary.value; acceptedFilters.value = label; error.value = ""; } else error.value = "汇总刷新失败，保留上次成功结果。请检查服务后重试。";
      if (geo.status === "fulfilled") { geoObservation.value = geo.value; geoError.value = false; geoUpdatedAt.value = new Date().toISOString(); } else geoError.value = true;
    },
    reject: () => { error.value = "汇总刷新失败，保留上次成功结果。请检查服务后重试。"; },
  });
  // 详情也使用非重入控制，但只在用户查看/翻页/刷新时读取，不定时后台拉取。
  const detailPoll = createRiskPolling({
    auto: false,
    visible: () => visible() && detailPermitted() && !validation.value,
    load: async () => {
      detailLoading.value = true;
      const query = { ...filters.value, pageNum: pageNum.value, pageSize: pageSize.value };
      const label = `${activeTab.value}:${JSON.stringify(query)}`;
      try {
        const data = activeTab.value === "exceptions" ? await getRiskExceptions(query) : activeTab.value === "archives" ? await getRiskArchives(query) : await getRiskInterfaces(query);
        return { data, label };
      } finally { detailLoading.value = false; }
    },
    accept: ({ data, label }) => { details.value = data; detailSnapshot.value = label; detailError.value = ""; },
    reject: () => { detailError.value = "明细读取失败，保留上次成功结果；当前筛选可能尚未生效。"; },
  });
  function refresh() { void summaryPoll.refresh(); void detailPoll.refresh(); }
  function visibilityChanged() { summaryPoll.visibilityChanged(); detailPoll.visibilityChanged(); drilldown.visibilityChanged(); }
  watch([filters, allowed], () => {
    pageNum.value = 1;
    summaryPoll.invalidate();
    detailPoll.invalidate();
    if (!allowed.value) { dashboard.value = undefined; details.value = undefined; geoObservation.value = undefined; geoError.value = false; geoUpdatedAt.value = undefined; }
  }, { deep: true });
  watch([activeTab, pageNum, pageSize, exceptionAllowed, archiveAllowed], () => {
    details.value = undefined;
    detailSnapshot.value = "";
    detailError.value = "";
    detailPoll.invalidate();
  });
  onMounted(() => { document.addEventListener("visibilitychange", visibilityChanged); refresh(); });
  onBeforeUnmount(() => { document.removeEventListener("visibilitychange", visibilityChanged); summaryPoll.stop(); detailPoll.stop(); });
  return { drilldown, geoObservation, geoError, geoUpdatedAt, allowed, exceptionAllowed, archiveAllowed, filters, validation, dashboard, acceptedFilters, queryLabel, error, loading, activeTab, pageNum, pageSize, details, detailSnapshot, detailError, detailLoading, refresh, refreshDetails: () => void detailPoll.refresh() };
}
