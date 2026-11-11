<script setup lang="ts">
import VChart from "vue-echarts";
import "vue-echarts/style.css";
import type { EChartsCoreOption } from "echarts/core";

const props = defineProps<{
  option: EChartsCoreOption;
  accessibleLabel: string;
  kind: "china" | "world";
  height: string;
}>();

const emit = defineEmits<{ regionSelect: [name: string] }>();

const initOptions = {
  renderer: "canvas" as const,
  devicePixelRatio: Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2),
};
const updateOptions = { notMerge: false, replaceMerge: ["series", "geo"], lazyUpdate: true };

function select(event: unknown) {
  const name = (event as { name?: unknown }).name;
  if (typeof name === "string") emit("regionSelect", name);
}
</script>

<template>
  <div class="risk-map-canvas" :style="{ height }" :data-map-kind="props.kind">
    <VChart
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
