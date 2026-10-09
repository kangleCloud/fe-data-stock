<script setup lang="ts">
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import {
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";

import { echarts } from "@/charts/echarts";

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption;
    accessibleLabel: string;
    height?: string;
  }>(),
  { height: "300px" },
);

const emit = defineEmits<{
  chartClick: [params: unknown];
}>();

const container = ref<HTMLElement>();
const chart = shallowRef<EChartsType>();
let observer: ResizeObserver | undefined;

function render(): void {
  if (!chart.value) {
    return;
  }
  chart.value.setOption(
    {
      ...props.option,
      animation: false,
      animationDurationUpdate: 0,
    },
    { notMerge: false, replaceMerge: ["series"], lazyUpdate: true },
  );
}

onMounted(async () => {
  await nextTick();
  if (!container.value) {
    return;
  }
  chart.value = markRaw(echarts.init(container.value, undefined, {
    renderer: "canvas",
  }));
  chart.value.on("click", (params) => emit("chartClick", params));
  observer = new ResizeObserver(() => chart.value?.resize());
  observer.observe(container.value);
  render();
});

watch(() => props.option, render);

onBeforeUnmount(() => {
  observer?.disconnect();
  chart.value?.dispose();
  chart.value = undefined;
});
</script>

<template>
  <div
    ref="container"
    class="base-chart"
    role="img"
    :aria-label="accessibleLabel"
    :style="{ height }"
  />
</template>

<style scoped>
.base-chart {
  width: 100%;
  min-height: 160px;
}
</style>
