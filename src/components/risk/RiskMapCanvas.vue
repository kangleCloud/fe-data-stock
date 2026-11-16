<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import VChart, { type Exposed as VChartExposed } from "vue-echarts";
import "vue-echarts/style.css";
import type { EChartsCoreOption, EChartsType } from "echarts/core";

const props = defineProps<{
  option: EChartsCoreOption;
  accessibleLabel: string;
  kind: "china" | "world";
  height: string;
}>();

const emit = defineEmits<{
  regionSelect: [name: string];
  /** The live ECharts instance from vue-echarts' public `chart` ref, not an event. */
  chartReady: [chart: EChartsType];
  /** The wrapper box was resized, so pixel-based viewport labels may need a refresh. */
  viewportChange: [];
}>();

const root = ref<HTMLElement>();
const chartRef = ref<VChartExposed>();
const chart = computed(() => chartRef.value?.chart);

const initOptions = {
  renderer: "canvas" as const,
  devicePixelRatio: Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2),
};
const updateOptions = { notMerge: false, replaceMerge: ["series", "geo"], lazyUpdate: true };

let resizeObserver: ResizeObserver | undefined;

// vue-echarts 8.3.2 declares no emits. Its public API exposes `chart` as a
// readonly getter, so observe that ref instead of a non-existent `ready` event.
// The getter reads the internal shallowRef, which keeps this computed reactive
// across init, dispose and in-place chart re-initialization.
watch(chart, (instance) => {
  if (instance) emit("chartReady", instance);
}, { immediate: true, flush: "post" });

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !root.value) return;
  resizeObserver = new ResizeObserver(() => emit("viewportChange"));
  resizeObserver.observe(root.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
});

function select(event: unknown) {
  const name = (event as { name?: unknown }).name;
  if (typeof name === "string") emit("regionSelect", name);
}
</script>

<template>
  <div ref="root" class="risk-map-canvas" :style="{ height }" :data-map-kind="props.kind">
    <VChart
      ref="chartRef"
      class="risk-map-chart"
      :option="option"
      :init-options="initOptions"
      :update-options="updateOptions"
      :aria-label="accessibleLabel"
      autoresize
      @click="select"
    />
  </div>
</template>

<style scoped>
.risk-map-canvas {
  position: relative;
  width: 100%;
  min-height: 160px;
}
.risk-map-chart {
  width: 100%;
  height: 100%;
}
</style>
