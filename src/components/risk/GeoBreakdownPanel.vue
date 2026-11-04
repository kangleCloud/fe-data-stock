<script setup lang="ts">
import { computed } from "vue";
import RiskBars from "@/components/risk/RiskBars.vue";
import type { GeoBreakdown } from "@/types/geoDrilldown";
import { riskCount, riskRate } from "@/utils/risk";
import { riskTime } from "@/utils/riskTime";
const props = defineProps<{ data?: GeoBreakdown; kind: "cities" | "subdivisions"; selectedCode: string; loading?: boolean; failed?: boolean; stale?: boolean; compact?: boolean; bars?: boolean }>();
const barRows = computed(() => props.data?.items.map((row, index) => ({ key: String(index), label: props.kind === "cities" ? row.cityName ?? "未提供名称" : row.provinceName ?? "未提供名称", count: row.requestCount })) ?? []);
const coverageLabels = { NOT_COLLECTED: "历史未采集细分", PARTIAL: "混合范围：部分请求未采集细分", COLLECTED: "范围内请求已采集细分" };
</script>
<template>
  <section aria-label="地域细分排行" :class="{ 'geo-breakdown-compact': compact }">
    <h3 v-if="!compact">{{ selectedCode }} · {{ kind === 'cities' ? '城市 Top 10' : '一级行政区排行' }}</h3>
    <p v-if="loading" role="status">正在读取细分…</p><p v-if="failed" role="alert">细分读取失败，保留上次成功结果。</p><p v-if="stale">以下为上次成功筛选的结果，当前筛选尚未生效。</p>
    <template v-if="data">
      <template v-if="!compact">
        <p>{{ coverageLabels[data.coverage.status] ?? '不支持的覆盖状态' }} · 采集起点（北京时间）：{{ riskTime(data.coverage.startedAt, 'minute') }}</p>
        <p>已采集 {{ riskCount(data.coverage.collectedRequestCount) }} / 原请求总量 {{ riskCount(data.coverage.totalRequestCount) }} · 未采集 {{ riskCount(data.coverage.uncollectedRequestCount) }}</p>
      </template>
      <div v-if="compact" class="coverage-brief"><span>{{ selectedCode }} · 未知 {{ riskCount(data.unknownRequestCount) }} · {{ data.coverage.status === 'NOT_COLLECTED' ? '未采集' : data.coverage.status === 'PARTIAL' ? '部分覆盖' : '已采集' }}</span><el-popover v-if="!bars" trigger="click" popper-class="risk-info-tip" :width="360"><template #reference><button type="button" aria-label="查看地域覆盖详细说明">覆盖 ⓘ</button></template><p>{{ coverageLabels[data.coverage.status] }} · 起点 {{ riskTime(data.coverage.startedAt, 'minute') }}</p><p>全筛选已采集 {{ riskCount(data.coverage.collectedRequestCount) }} / 总量 {{ riskCount(data.coverage.totalRequestCount) }} · 未采集 {{ riskCount(data.coverage.uncollectedRequestCount) }}</p><p>本地域已识别 {{ riskCount(data.identifiedRequestCount) }} / 已采集 {{ riskCount(data.collectedRequestCount) }} · 覆盖率 {{ data.coverageRate === null ? '—（无已采集分母）' : riskRate(data.coverageRate) }}</p><ul><li v-for="(row,i) in data.items" :key="i">{{ row.cityName ?? row.provinceName }} · {{ row.cityCode ?? row.provinceCode ?? '无已验证编码' }}</li></ul><p>同一统计行投影，不重复累加；境外仅一级行政区。</p></el-popover></div>
      <p v-if="bars && data.coverage.status !== 'NOT_COLLECTED'" class="coverage-inline">识别率 {{ data.coverageRate === null ? '—（无已采集分母）' : riskRate(data.coverageRate) }} · 已识别 {{ riskCount(data.identifiedRequestCount) }} / 已采集 {{ riskCount(data.collectedRequestCount) }}</p>
      <template v-if="data.coverage.status !== 'NOT_COLLECTED'">
        <p v-if="!compact">本地域已采集：{{ riskCount(data.collectedRequestCount) }} · 已识别：{{ riskCount(data.identifiedRequestCount) }} · 已采集但细分未知：{{ riskCount(data.unknownRequestCount) }} · 识别覆盖率：{{ data.coverageRate === null ? '—（无已采集分母）' : riskRate(data.coverageRate) }}</p>
        <RiskBars v-if="bars" :rows="barRows" label="地域细分请求排行" />
        <div v-else class="risk-table-wrap" tabindex="0" aria-label="地域细分排行，可横向滚动"><table><thead><tr><th>名称</th><th v-if="!compact">已核实编码</th><th>请求次数</th></tr></thead><tbody><tr v-for="(row, index) in data.items" :key="index"><td>{{ kind === 'cities' ? row.cityName ?? '未提供名称' : row.provinceName ?? '未提供名称' }}</td><td v-if="!compact">{{ kind === 'cities' ? row.cityCode ?? '无已验证编码' : row.provinceCode ?? '无已验证编码' }}</td><td>{{ riskCount(row.requestCount) }}</td></tr></tbody></table></div><p v-if="!data.items.length">当前范围没有可展示的细分排行，详见未知与覆盖计数。</p>
      </template>
      <p v-else>此范围未采集细分；不解释为零请求，也不计入未知城市/行政区。</p>
    </template>
    <p v-else-if="!loading && !failed">请选择中国省份或世界国家查看。</p>
    <details v-if="!compact"><summary>统计口径</summary><p>细分与总量来自同一统计行，仅维度投影不同，不重复累加。国外只展示一级行政区，不展示城市。缺失一级边界时只保留排行，不下载新地图。</p></details>
  </section>
</template>

<style scoped>
.coverage-brief { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 6px; }
.coverage-inline { font-size: 11px; margin: 4px 0 8px; color: var(--risk-muted); }
.geo-breakdown-compact th,.geo-breakdown-compact td { padding: 4px 8px; }
</style>
