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
    interactiveMap?: boolean;
  }>(),
  { height: "300px" },
);

const emit = defineEmits<{ regionSelect: [name: string] }>();
defineExpose({ resetView: () => chart.value?.setOption({ geo: { zoom: 1, center: null } }), zoom: (factor: number) => chart.value?.dispatchAction({ type: "geoRoam", geoIndex: 0, zoom: factor }) });

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
  if (props.interactiveMap) chart.value.on("click", (event: unknown) => { const name = (event as { name?: unknown }).name; if (typeof name === "string") emit("regionSelect", name); });
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
