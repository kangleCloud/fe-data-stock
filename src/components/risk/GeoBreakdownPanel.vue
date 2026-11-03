<script setup lang="ts">
import type { GeoBreakdown } from "@/types/geoDrilldown";
import { riskCount, riskRate } from "@/utils/risk";
import { riskTime } from "@/utils/riskTime";
defineProps<{ data?: GeoBreakdown; kind: "cities" | "subdivisions"; selectedCode: string; loading?: boolean; failed?: boolean; stale?: boolean }>();
const coverageLabels = { NOT_COLLECTED: "历史未采集细分", PARTIAL: "混合范围：部分请求未采集细分", COLLECTED: "范围内请求已采集细分" };
</script>
<template>
  <section aria-label="地域细分排行">
    <h3>{{ selectedCode }} · {{ kind === 'cities' ? '城市 Top 10' : '一级行政区排行' }}</h3>
    <p v-if="loading" role="status">正在读取细分…</p><p v-if="failed" role="alert">细分读取失败，保留上次成功结果。</p><p v-if="stale">以下为上次成功筛选的结果，当前筛选尚未生效。</p>
    <template v-if="data">
      <p>{{ coverageLabels[data.coverage.status] ?? '不支持的覆盖状态' }} · 采集起点（北京时间）：{{ riskTime(data.coverage.startedAt, 'minute') }}</p>
      <p>已采集 {{ riskCount(data.coverage.collectedRequestCount) }} / 原请求总量 {{ riskCount(data.coverage.totalRequestCount) }} · 未采集 {{ riskCount(data.coverage.uncollectedRequestCount) }}</p>
      <template v-if="data.coverage.status !== 'NOT_COLLECTED'">
        <p>本地域已采集：{{ riskCount(data.collectedRequestCount) }} · 已识别：{{ riskCount(data.identifiedRequestCount) }} · 已采集但细分未知：{{ riskCount(data.unknownRequestCount) }} · 识别覆盖率：{{ data.coverageRate === null ? '—（无已采集分母）' : riskRate(data.coverageRate) }}</p>
        <div class="risk-table-wrap" tabindex="0" aria-label="地域细分排行，可横向滚动"><table><thead><tr><th>名称</th><th>已核实编码</th><th>请求次数</th></tr></thead><tbody><tr v-for="(row, index) in data.items" :key="index"><td>{{ kind === 'cities' ? row.cityName ?? '未提供名称' : row.provinceName ?? '未提供名称' }}</td><td>{{ kind === 'cities' ? row.cityCode ?? '无已验证编码' : row.provinceCode ?? '无已验证编码' }}</td><td>{{ riskCount(row.requestCount) }}</td></tr></tbody></table></div><p v-if="!data.items.length">当前范围没有可展示的细分排行，详见未知与覆盖计数。</p>
      </template>
      <p v-else>此范围未采集细分；不解释为零请求，也不计入未知城市/行政区。</p>
    </template>
    <p v-else-if="!loading && !failed">请选择中国省份或世界国家查看。</p>
    <details><summary>统计口径</summary><p>细分计数来自 GEO_COUNTER，与 COUNTER 总量对照覆盖；两者不相加。国外只展示一级行政区，不展示城市。缺失一级边界时只保留排行，不下载新地图。</p></details>
  </section>
</template>
