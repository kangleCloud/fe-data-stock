<script setup lang="ts">
import { geoMetricText, type GeoObservationSection } from "@/utils/geoObservation";
/** 仅展示适配后的数据，不创建请求、不假设尚未冻结的API结构。 */
defineProps<{ sections: GeoObservationSection[]; unavailable?: boolean; stale?: boolean; updatedAtText?: string }>();
</script>
<template>
  <section aria-label="统一地域解析观测">
    <h2>统一地域解析观测</h2>
    <p v-if="unavailable" role="alert">观测服务不可用；已成功加载的数据仍保留。</p>
    <p v-if="stale" role="status">以下为上次成功结果，尚未确认最新状态。</p>
    <p>北京时间 · 更新：{{ updatedAtText ?? '—' }}</p>
    <p v-if="!sections.length">尚无成功观测结果。</p>
    <section v-for="section in sections" :key="section.title"><h3>{{ section.title }}</h3><dl><template v-for="metric in section.metrics" :key="metric.label"><dt>{{ metric.label }}</dt><dd>{{ geoMetricText(metric.value) }}<span v-if="metric.value !== null && metric.unit"> {{ metric.unit }}</span></dd></template></dl></section>
    <p>仅使用双离线数据源。城市为国内最高展示精度，境外只展示一级行政区；不新增区县或地图层。</p>
  </section>
</template>
<style scoped>
dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (max-width: 480px) { dl { grid-template-columns: minmax(0, 1fr); } }
</style>
