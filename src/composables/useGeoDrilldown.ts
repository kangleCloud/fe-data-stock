import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { getGeoCities, getGeoSubdivisions } from "@/api/geoDrilldown";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import type { RiskQuery } from "@/types/risk";
import { validateRiskDates } from "@/utils/risk";
import { createRiskPolling } from "@/utils/riskPolling";
export function useGeoDrilldown(filters: Ref<RiskQuery>, allowed: Ref<boolean>) {
  const selected = ref<{ code: string; kind: "cities" | "subdivisions" }>();
  const accepted = ref<{ code: string; kind: "cities" | "subdivisions" }>();
  const data = shallowRef<GeoBreakdown>(); const loading = ref(false); const failed = ref(false); const signature = ref("");
  const current = () => JSON.stringify([filters.value, selected.value]);
  const controller = createRiskPolling({ auto: false, visible: () => document.visibilityState !== "hidden" && allowed.value && !!selected.value && !validateRiskDates(filters.value.startDate, filters.value.endDate),
    load: async () => { loading.value = true; const selection = { ...selected.value! }; const key = current(); try { const result = selection.kind === "cities" ? await getGeoCities({ ...filters.value, provinceCode: selection.code }) : await getGeoSubdivisions({ ...filters.value, countryCode: selection.code }); return { result, key, selection }; } finally { loading.value = false; } },
    accept: ({ result, key, selection }) => { data.value = result; signature.value = key; accepted.value = selection; failed.value = false; }, reject: () => { failed.value = true; },
  });
  watch([filters, selected, allowed], () => { controller.invalidate(); if (!allowed.value) { data.value = undefined; selected.value = undefined; accepted.value = undefined; failed.value = false; } }, { deep: true });
  onBeforeUnmount(controller.stop);
  function select(code: string, view: "china" | "world") { const next = view === "china" && /^CN-\d{2}$/.test(code) ? { code, kind: "cities" as const } : view === "world" && /^[A-Z]{2}$/.test(code) ? { code, kind: "subdivisions" as const } : undefined; if (!next) return; if (selected.value?.kind !== next.kind) { data.value = undefined; accepted.value = undefined; signature.value = ""; } failed.value = false; selected.value = next; }
  return { clear: () => { selected.value = undefined; accepted.value = undefined; data.value = undefined; failed.value = false; signature.value = ""; controller.invalidate(); }, selected, accepted, data, loading, failed, stale: computed(() => !!data.value && signature.value !== current()), select, refresh: () => loading.value ? Promise.resolve() : controller.refresh(), visibilityChanged: controller.visibilityChanged };
}
