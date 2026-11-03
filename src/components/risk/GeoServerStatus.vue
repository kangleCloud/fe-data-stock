<script setup lang="ts">
import type { GeoStatusProjection } from "@/types/geoObservation";
import { geoStateText, geoResultLabels } from "@/utils/geoObservation";
import { riskTime } from "@/utils/riskTime";
defineProps<{ status?: GeoStatusProjection | null; manual?: boolean }>();
function level(value: string) { return ({ COUNTRY: "国家", PROVINCE: "省级", CITY: "城市", UNKNOWN: "未知" } as Record<string, string>)[value] ?? "不支持的精度"; }
function source(value: string | null) { return value === "DBIP" ? "DB-IP离线" : value === "MAXMIND" ? "MaxMind离线" : "来源未知"; }
</script>
<template>
  <section aria-label="服务器离线地域状态">
    <p v-if="manual">人工位置优先，仅用于本服务器；不写共享地域缓存。</p>
    <template v-if="status && !manual && Object.hasOwn(geoResultLabels, status.resultStatus)"><p role="status">{{ geoStateText(status.resultStatus) }} · {{ level(status.locationLevel) }} · {{ source(status.source) }}</p><p>国家 {{ status.countryCode ?? '—' }} · 一级行政区 {{ status.provinceName ?? status.provinceCode ?? '—' }}<span v-if="status.countryCode === 'CN'"> · 已核实城市 {{ status.cityCode ? status.cityName ?? status.cityCode : '—' }}</span></p><p>固定原因：{{ status.errorCode ?? '—' }} · 北京时间 {{ riskTime(status.resolvedAt) }}</p><details><summary>来源与版本</summary><p>缓存 {{ status.cacheVersion ?? '—' }} · 数据库 {{ status.databaseVersion ?? '—' }}</p><p>国家来源 {{ status.fieldSources?.country ?? '—' }} · 一级来源 {{ status.fieldSources?.province ?? '—' }} · 城市来源 {{ status.fieldSources?.city ?? '—' }}</p><p>DB-IP版本 {{ status.databaseVersions?.DBIP ?? '—' }} · MaxMind版本 {{ status.databaseVersions?.MAXMIND ?? '—' }}</p><p>冲突字段 {{ status.conflictFields?.join('、') || '—' }}</p></details></template>
    <p v-else-if="status && !manual">不支持的地域状态，无法确认离线结果。</p><p v-else-if="!manual">尚无 V1.2 离线地域投影，不推断位置可用。</p>
  </section>
</template>
