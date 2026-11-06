<script setup lang="ts">
import { geoMetricText, type GeoObservationSection } from "@/utils/geoObservation";
/** 仅展示适配后的数据，不创建请求、不假设尚未冻结的API结构。 */
defineProps<{ sections: GeoObservationSection[]; unavailable?: boolean; updatedAtText?: string }>();
</script>
<template>
  <div>
    <p v-if="unavailable" role="alert">{{ sections.length ? '更新失败，显示上次结果' : '观测服务不可用' }}</p>
    <p v-else-if="!sections.length" role="status">暂无观测结果</p>
    <p v-if="sections.length">更新：{{ updatedAtText ?? '—' }}（北京时间）</p>
    <section v-for="section in sections" :key="section.title"><h3>{{ section.title }}</h3><dl><template v-for="metric in section.metrics" :key="metric.label"><dt>{{ metric.label }}</dt><dd>{{ geoMetricText(metric.value) }}<span v-if="metric.value !== null && metric.unit"> {{ metric.unit }}</span></dd></template></dl></section>
  </div>
</template>
<style scoped>
dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (max-width: 480px) { dl { grid-template-columns: minmax(0, 1fr); } }
</style>
