import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useGeoDrilldown } from "@/composables/useGeoDrilldown";
import { getGeoObservation } from "@/api/geoObservation";
import type { GeoObservation } from "@/types/geoObservation";
import { getRiskSources, getRiskDashboard, getRiskExceptions, getRiskInterfaces, getRiskQps } from "@/api/risk";
import { useAuthStore } from "@/stores/auth";
import type { PageResponse } from "@/types/api";
import type { RiskSource, RiskDashboard, RiskException, RiskInterface, RiskQps, RiskQuery } from "@/types/risk";
import { riskPermission, riskPreset, shanghaiDate, validateRiskDates } from "@/utils/risk";
import { createRiskPolling } from "@/utils/riskPolling";

export function useRiskDashboard() {
  const auth = useAuthStore();
  const allowed = computed(() => riskPermission(auth.permissionCodes));
  const exceptionAllowed = computed(() => riskPermission(auth.permissionCodes, "exception"));
  const currentDay = ref(shanghaiDate());
  const filters = ref<RiskQuery>({ startDate: currentDay.value, endDate: currentDay.value });
  const activePreset = ref<1 | 2 | 7 | undefined>(1);
  const drilldown = useGeoDrilldown(filters, allowed);
  const validation = computed(() => validateRiskDates(filters.value.startDate, filters.value.endDate, currentDay.value));
  const geoObservation = shallowRef<GeoObservation>();
  const geoError = ref(false);
  const geoUpdatedTime = ref<string>();
  const dashboard = shallowRef<RiskDashboard>();
  const qps = shallowRef<RiskQps>();
  const acceptedFilters = ref("");
  const error = ref("");
  const loading = ref(false);
  const detailError = ref("");
  const detailLoading = ref(false);
  const drawer = ref<"details" | "geo" | null>(null);
  const activeTab = ref<"interfaces" | "exceptions" | "sources">("interfaces");
  const pageNum = ref(1);
  const pageSize = ref(10);
  const details = shallowRef<PageResponse<RiskInterface | RiskException | RiskSource>>();
  const detailSnapshot = ref("");
  const visible = () => document.visibilityState !== "hidden";
  const queryLabel = () => JSON.stringify(filters.value);
  const detailPermitted = () => allowed.value && (activeTab.value !== "exceptions" || exceptionAllowed.value);
  const qpsPoll = createRiskPolling({
    visible: () => visible() && allowed.value,
    load: getRiskQps,
    accept: sample => { qps.value = sample; },
    reject: () => { qps.value = undefined; },
  });
  const summaryPoll = createRiskPolling({
    visible: () => visible() && allowed.value && !validation.value,
    load: async () => {
      loading.value = true;
      try { const label = queryLabel(); void drilldown.refresh(); const [summary, geo] = await Promise.allSettled([getRiskDashboard({ ...filters.value }), drawer.value === "geo" ? getGeoObservation() : Promise.resolve(undefined)]); return { summary, geo, label }; }
      finally { loading.value = false; }
    },
    accept: ({ summary, geo, label }) => {
      if (summary.status === "fulfilled") { dashboard.value = summary.value; acceptedFilters.value = label; error.value = ""; } else error.value = "汇总刷新失败，保留上次成功结果。请检查服务后重试。";
      if (geo.status === "fulfilled" && geo.value) { geoObservation.value = geo.value; geoError.value = false; geoUpdatedTime.value = new Date().toISOString(); } else if (drawer.value === "geo") geoError.value = true;
    },
    reject: () => { error.value = "汇总刷新失败，保留上次成功结果。请检查服务后重试。"; },
  });
  // 详情也使用非重入控制，但只在用户查看/翻页/刷新时读取，不定时后台拉取。
  const detailPoll = createRiskPolling({
    auto: false,
    visible: () => visible() && drawer.value === "details" && detailPermitted() && !validation.value,
    load: async () => {
      detailLoading.value = true;
      const query = { ...filters.value, pageNum: pageNum.value, pageSize: pageSize.value };
      const label = `${activeTab.value}:${JSON.stringify(query)}`;
      try {
        const data = activeTab.value === "exceptions" ? await getRiskExceptions(query) : activeTab.value === "sources" ? await getRiskSources(query) : await getRiskInterfaces(query);
        return { data, label };
      } finally { detailLoading.value = false; }
    },
    accept: ({ data, label }) => { details.value = data; detailSnapshot.value = label; detailError.value = ""; },
    reject: () => { detailError.value = "明细读取失败，保留上次成功结果；当前筛选可能尚未生效。"; },
  });
  function syncDay(now = new Date()) {
    const day = shanghaiDate(now);
    if (day !== currentDay.value) {
      currentDay.value = day;
      if (!activePreset.value) return;
      const [startDate, endDate] = riskPreset(activePreset.value, now);
      dashboard.value = undefined; details.value = undefined; acceptedFilters.value = ""; detailSnapshot.value = "";
      drilldown.clear();
      filters.value = { ...filters.value, startDate, endDate };
      summaryPoll.invalidate(); detailPoll.invalidate();
    }
  }
  function preset(days: 1 | 2 | 7) {
    const [startDate, endDate] = riskPreset(days);
    activePreset.value = days;
    currentDay.value = shanghaiDate();
    filters.value = { ...filters.value, startDate, endDate };
  }
  function refresh() {
    syncDay();
    void summaryPoll.refresh();
    void detailPoll.refresh();
    void qpsPoll.refresh();
  }
  function visibilityChanged() {
    syncDay();
    if (!visible()) qps.value = undefined;
    summaryPoll.visibilityChanged();
    detailPoll.visibilityChanged();
    qpsPoll.visibilityChanged();
    drilldown.visibilityChanged();
  }
  watch(allowed, permitted => {
    if (!permitted) qps.value = undefined;
    qpsPoll.visibilityChanged();
  });
  watch([filters, allowed], () => {
    pageNum.value = 1;
    summaryPoll.invalidate();
    detailPoll.invalidate();
    if (!allowed.value) { dashboard.value = undefined; details.value = undefined; geoObservation.value = undefined; geoError.value = false; geoUpdatedTime.value = undefined; }
  }, { deep: true });
  watch([drawer, activeTab, pageNum, pageSize, exceptionAllowed], () => {
    details.value = undefined;
    detailSnapshot.value = "";
    detailError.value = "";
    detailPoll.invalidate();
  });
  onMounted(() => { document.addEventListener("visibilitychange", visibilityChanged); refresh(); });
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", visibilityChanged);
    summaryPoll.stop();
    detailPoll.stop();
    qpsPoll.stop();
  });
  return { drawer, drilldown, geoObservation, geoError, geoUpdatedTime, allowed, exceptionAllowed, filters, validation, dashboard, qps, acceptedFilters, queryLabel, error, loading, activeTab, pageNum, pageSize, details, detailSnapshot, detailError, detailLoading, refresh, syncDay, preset, manualRange: () => { activePreset.value = undefined; }, refreshDetails: () => { syncDay(); void detailPoll.refresh(); } };
}
