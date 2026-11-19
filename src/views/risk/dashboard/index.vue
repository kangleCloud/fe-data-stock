<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Collection, CircleCheck, Warning, WarningFilled, Connection, Grid, List, TrendCharts, Location, DataAnalysis, Refresh, FullScreen, Close, Calendar, Monitor, Lock } from "@element-plus/icons-vue";
import RiskInfo from "@/components/risk/RiskInfo.vue";
import RiskClock from "@/components/risk/RiskClock.vue";
import RiskBars from "@/components/risk/RiskBars.vue";
import RiskAccessMap from "@/components/risk/RiskAccessMap.vue";
import RiskResourceSummaryPanel from "@/components/risk/RiskResourceSummaryPanel.vue";
import type { RiskMapKind } from "@/utils/riskMap";
import { canonicalRiskRegion } from "@/utils/riskMap";
import type { RiskDetailLabels } from "@/utils/riskMapDetail";
import type { EChartsCoreOption } from "echarts/core";
import BaseChart from "@/components/market/BaseChart.vue";
import GeoBreakdownPanel from "@/components/risk/GeoBreakdownPanel.vue";
import GeoObservationPanel from "@/components/risk/GeoObservationPanel.vue";
import { useRiskDashboard } from "@/composables/useRiskDashboard";
import { useAuthStore } from "@/stores/auth";
import { riskConfigPermission } from "@/utils/riskServer";
import { geoObservationSections } from "@/utils/geoObservation";
import { riskCount, riskPreset, riskRate, riskRegion } from "@/utils/risk";
import { riskBarWidths } from "@/utils/riskBars";
import { riskTime } from "@/utils/riskTime";
import "@/styles/risk.css";
const screenRef = ref<HTMLElement>();
const isFullscreen = ref(false);
const fullscreenError = ref("");
function syncFullscreen() { isFullscreen.value = document.fullscreenElement === screenRef.value; }
async function toggleFullscreen() {
  fullscreenError.value = "";
  try {
    if (document.fullscreenElement === screenRef.value) await document.exitFullscreen();
    else if (screenRef.value?.requestFullscreen) await screenRef.value.requestFullscreen();
    else fullscreenError.value = "当前浏览器不支持全屏";
    syncFullscreen();
  } catch { fullscreenError.value = "无法进入全屏，请检查浏览器权限"; }
}
function escapeFullscreen(event: KeyboardEvent) { if (event.key === "Escape" && document.fullscreenElement === screenRef.value) void document.exitFullscreen().catch(() => undefined); }
onMounted(() => { document.addEventListener("fullscreenchange", syncFullscreen); document.addEventListener("keydown", escapeFullscreen); });
onBeforeUnmount(() => { document.removeEventListener("fullscreenchange", syncFullscreen); document.removeEventListener("keydown", escapeFullscreen); if (document.fullscreenElement === screenRef.value) void document.exitFullscreen().catch(() => undefined); });
const state = useRiskDashboard();
const { drawer, filters, dashboard, allowed, validation, error, loading, refresh, drilldown, activeTab, pageNum, pageSize, details, detailError, detailLoading, refreshDetails, exceptionAllowed, geoObservation, geoError, geoUpdatedAt } = state;
const configAllowed = computed(() => riskConfigPermission(useAuthStore().permissionCodes, "view"));
const presetDay = ref(new Date());
const datePresets = computed(() => ([
  { days: 1, label: "今日" }, { days: 2, label: "昨日" }, { days: 7, label: "近7日" },
] as const).map(item => {
  const [startDate, endDate] = riskPreset(item.days, presetDay.value);
  return { ...item, selected: filters.value.startDate === startDate && filters.value.endDate === endDate };
}));
function preset(days: 1 | 2 | 7) {
  const [startDate, endDate] = riskPreset(days);
  filters.value = { ...filters.value, startDate, endDate };
}
function openDetail(tab: "interfaces" | "sources" | "exceptions") { activeTab.value = tab; drawer.value = "details"; }
const mapMessages = ref<string[]>([]);
const mapKind = ref<RiskMapKind>("china");
const targetOptions = ref<{ targetId: string; alias: string | null }[]>([]);
watch(dashboard, value => {
  if (!filters.value.targetId && state.acceptedFilters.value === state.queryLabel() && value?.targets) targetOptions.value = value.targets.map(({ targetId, alias }) => ({ targetId, alias }));
});
watch(allowed, value => { if (!value) targetOptions.value = []; });
const detailLabels = ref<RiskDetailLabels>();
function mapViewChange(kind: RiskMapKind) { mapKind.value = kind; detailLabels.value = undefined; drilldown.clear(); }
const drillTitle = computed(() => {
  const selected = drilldown.accepted.value ?? drilldown.selected.value;
  return selected ? riskRegion(selected.code) : "";
});
const drillLabels = computed(() => {
  const code = drilldown.accepted.value?.code ?? drilldown.selected.value?.code;
  return detailLabels.value && detailLabels.value.regionCode === code ? detailLabels.value.labels : undefined;
});
const completenessLabels = { READY: "数据就绪", EMPTY: "范围内无请求", PARTIAL: "数据不完整", UNAVAILABLE: "数据不可用" };
const cards = computed(() => { const m = dashboard.value?.metrics; return [
  { label: "请求总量", value: m ? riskCount(m.requestCount) : "—", icon: Collection },
  { label: "成功请求", value: m ? riskCount(m.successCount) : "—", icon: CircleCheck },
  { label: "失败请求", value: m ? riskCount(m.failureCount) : "—", icon: Warning, danger: true },
  { label: "失败率", value: m ? riskRate(m.failureRate) : "—", icon: WarningFilled, danger: true },
  { label: "来源 IP", value: m ? riskCount(m.sourceCount) : "—", icon: Connection },
  { label: "接口数", value: m ? riskCount(m.interfaceCount) : "—", icon: Grid },
]; });
const statusRows = computed(() => dashboard.value?.statuses.map(row => ({ key: String(row.httpStatus), label: row.httpStatus === 0 ? "未知" : String(row.httpStatus), count: row.requestCount, tone: row.httpStatus >= 400 ? "danger" as const : row.httpStatus < 200 ? "muted" as const : undefined })) ?? []);
const statusGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; count: bigint; color: string }>();
  const add = (key: string, label: string, color: string, count: bigint) => {
    if (count <= 0n) return;
    const current = groups.get(key);
    groups.set(key, { key, label, color, count: (current?.count ?? 0n) + count });
  };
  for (const row of dashboard.value?.statuses ?? []) {
    if (!/^\d+$/.test(row.requestCount)) continue;
    const status = row.httpStatus;
    if (status >= 200 && status < 300) add("2xx", "2xx 成功", "#2dd4bf", BigInt(row.requestCount));
    else if (status >= 300 && status < 400) add("3xx", "3xx 重定向", "#60a5fa", BigInt(row.requestCount));
    else if (status >= 400 && status < 500) add("4xx", "4xx 客户端错误", "#f59e0b", BigInt(row.requestCount));
    else if (status >= 500 && status < 600) add("5xx", "5xx 服务端错误", "#f05252", BigInt(row.requestCount));
    else add("other", "未知 / 其他", "#94a3b8", BigInt(row.requestCount));
  }
  return [...groups.values()].map((group) => ({ ...group, countText: group.count.toString() }));
});
const statusTotal = computed(() => statusGroups.value.reduce((total, group) => total + group.count, 0n));
const statusSafe = computed(() => statusGroups.value.every((group) => group.count <= BigInt(Number.MAX_SAFE_INTEGER)));
const statusOption = computed<EChartsCoreOption>(() => ({
  animation: false,
  color: statusGroups.value.map((group) => group.color),
  aria: { enabled: true, label: { description: "HTTP 状态分组占比；精确状态与计数见邻近文字列表。" } },
  tooltip: { trigger: "item", renderMode: "richText", confine: true, backgroundColor: "#041d32", borderColor: "#2bc5e4", textStyle: { color: "#e5f6ff" } },
  series: [{
    type: "pie",
    radius: ["62%", "82%"],
    center: ["50%", "50%"],
    avoidLabelOverlap: true,
    label: { show: false },
    labelLine: { show: false },
    itemStyle: { borderColor: "#041a2c", borderWidth: 2 },
    emphasis: { scale: false, itemStyle: { shadowBlur: 10, shadowColor: "#00d8ff44" } },
    data: statusSafe.value ? statusGroups.value.map((group) => ({ name: group.label, value: Number(group.count), countText: riskCount(group.countText) })) : [],
  }],
}));
const serviceState = computed(() => {
  if (error.value) return { tone: "is-warning", label: "降级" };
  if (!dashboard.value) return { tone: loading.value ? "is-loading" : "is-danger", label: loading.value ? "连接中" : "不可用" };
  if (dashboard.value.metadata.completeness === "READY") return { tone: "is-ok", label: "正常" };
  if (dashboard.value.metadata.completeness === "EMPTY") return { tone: "is-muted", label: "无数据" };
  return { tone: "is-warning", label: "部分可用" };
});
const interfaceRows = computed(() => {
  const rows = dashboard.value?.topInterfaces ?? [];
  const widths = riskBarWidths(rows.map(row => row.requestCount));
  return rows.map((row, index) => ({ ...row, width: widths[index] ?? null }));
});
const sourceRows = computed(() => dashboard.value?.topSources.map((row, i) => ({ key: String(i), label: row.sourceIp ?? "未知来源", count: row.requestCount })) ?? []);
const regionRows = computed(() => dashboard.value?.regions.slice(0, 10).map(row => { const code = canonicalRiskRegion(row.regionCode); const key = mapKind.value === "world" && /^CN-\d{2}$/.test(code) ? "CN" : code; return { key: row.regionCode, label: riskRegion(row.regionCode), count: row.requestCount, selectable: mapKind.value === "china" ? /^CN-\d{2}$/.test(key) : /^[A-Z]{2}$/.test(key) }; }) ?? []);
function selectRankedRegion(raw: string) { const code = canonicalRiskRegion(raw); drilldown.select(mapKind.value === "world" && /^CN-\d{2}$/.test(code) ? "CN" : code, mapKind.value); }
const targetStatus = computed(() => {
  if (!dashboard.value?.targets) return "目标状态不可用";
  if (!dashboard.value.targets.length) return "暂无目标";
  const located = dashboard.value.targets.filter(target => target.locationStatus === "LOCATED").length;
  return `${located} / ${dashboard.value.targets.length} 个目标已定位`;
});
const safeTrend = computed(() => dashboard.value?.trend.every(r => [r.successCount, r.failureCount].every(v => /^\d+$/.test(v) && BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER))) ?? true);
const trendSpansDays = computed(() => {
  const rows = dashboard.value?.trend ?? [];
  const first = riskTime(rows[0]?.minuteAt).slice(0, 10);
  return rows.some(row => riskTime(row.minuteAt).slice(0, 10) !== first);
});
const trendOption = computed<EChartsCoreOption>(() => ({
  animation: false,
  color: ["#3de0d0", "#ff8793"],
  aria: { enabled: true, label: { description: "成功和失败请求的分钟趋势；精确计数见接口与来源明细。" } },
  tooltip: { trigger: "axis", renderMode: "richText", confine: true, backgroundColor: "#041d32", borderColor: "#2bc5e4", textStyle: { color: "#e5f6ff" }, axisPointer: { type: "line", lineStyle: { color: "#2bc5e466", width: 1 } } },
  grid: { left: 44, right: 16, bottom: 30, top: 20 },
  xAxis: { type: "category", boundaryGap: false, data: dashboard.value?.trend.map(r => riskTime(r.minuteAt, "axis", trendSpansDays.value)), axisLine: { lineStyle: { color: "#23617e" } }, axisTick: { show: false }, axisLabel: { color: "#aacde2", fontSize: 11, hideOverlap: true, margin: 10 } },
  yAxis: { type: "value", splitNumber: 4, axisLabel: { color: "#aacde2", fontSize: 11 }, splitLine: { lineStyle: { color: "#175173", opacity: .5, type: "dashed" } } },
  series: ([['成功', 'successCount'], ['失败', 'failureCount']] as const).map(([name, key], index) => ({
    name,
    type: "line",
    showSymbol: dashboard.value?.trend.length === 1,
    symbol: "circle",
    symbolSize: 5,
    lineStyle: { width: 2.4, shadowBlur: 8, shadowColor: index === 0 ? "#3de0d055" : "#ff879355" },
    areaStyle: { opacity: .12 },
    emphasis: { focus: "series" },
    data: safeTrend.value ? dashboard.value?.trend.map(r => Number(r[key])) : [],
  })),
}));
const detailRows = computed(() => details.value?.list.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "—" : typeof value === "string" && /Count$/.test(key) ? riskCount(value) : String(value)]))) ?? []);
const columns = computed(() => activeTab.value === "interfaces" ? [['method','方法'],['pathTemplate','接口'],['requestCount','请求'],['successCount','成功'],['failureCount','失败'],['otherCount','未知/其他'],['failureRate','失败比例'],['sourceCount','IP数']] : activeTab.value === "sources" ? [['sourceIp','来源IP'],['regionCode','地域'],['provinceName','省/一级'],['cityName','城市'],['requestCount','请求'],['successCount','成功'],['failureCount','失败'],['otherCount','未知/其他'],['failureRate','失败比例']] : [['minuteAt','分钟'],['method','方法'],['pathTemplate','接口'],['sourceIp','IP'],['httpStatus','状态'],['regionCode','地域'],['requestCount','请求']]);
</script>
<template>
  <main ref="screenRef" class="risk-screen access-screen">
    <p v-if="!allowed" role="alert">无系统风控查看权限</p>
    <template v-else>
      <header class="access-header">
        <div class="access-brand">
          <svg class="access-shield" viewBox="0 0 32 36" aria-hidden="true"><path d="M16 2 29 7v10c0 8-6 13-13 17C9 30 3 25 3 17V7Z" /><path d="m10 17 4 4 8-9" /></svg>
          <div class="access-title">
            <h1>系统访问与安全态势中心</h1>
            <span>访问大屏</span>
          </div>
          <RiskInfo label="统计口径">{{ dashboard?.requestTypes ? '统计 HTTP 请求；接口排行仅包含 API。' : '统计范围以服务端返回为准。' }}2xx、3xx 为成功，4xx、5xx 为失败，其他状态单列。失败率分母为成功与失败之和。来源 IP 按筛选范围去重，未知 IP 不计入。</RiskInfo>
        </div>
        <nav class="access-nav" aria-label="大屏导航">
          <span class="is-active" aria-current="page">态势大屏</span>
          <button type="button" @click="openDetail('interfaces')">访问明细</button>
          <button type="button" @click="drawer = 'geo'; refresh()">Geo 诊断</button>
          <a v-if="configAllowed" href="/admin/risk/server-config">监控配置</a>
        </nav>
        <div class="access-header-state">
          <span class="access-service" :class="serviceState.tone" role="status"><i aria-hidden="true" />数据服务：{{ serviceState.label }}</span>
          <div class="access-header-actions"><button type="button" class="icon-button" aria-label="刷新" title="刷新" :aria-busy="loading" :disabled="loading || !!validation" @click="refresh"><Refresh aria-hidden="true" /></button><button type="button" class="icon-button" :aria-label="isFullscreen ? '退出整个大屏全屏' : '整个大屏全屏'" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen"><Close v-if="isFullscreen" aria-hidden="true" /><FullScreen v-else aria-hidden="true" /></button></div>
        </div>
      </header>
      <section class="access-toolbar" aria-label="筛选与更新时间">
        <div class="risk-controls access-filters"><div class="preset-group" role="group" aria-label="日期范围"><button v-for="item in datePresets" :key="item.days" type="button" :aria-pressed="item.selected" @click="preset(item.days)">{{ item.label }}</button></div><div class="access-date-range"><Calendar aria-hidden="true" /><label><span class="risk-sr-only">开始日期</span><input aria-label="开始日期" v-model="filters.startDate" type="date"></label><span aria-hidden="true">—</span><label><span class="risk-sr-only">结束日期</span><input aria-label="结束日期" v-model="filters.endDate" type="date"></label></div></div>
        <label>监控目标 <select v-model="filters.targetId" aria-label="监控目标"><option :value="undefined">全部目标</option><option v-for="target in targetOptions" :key="target.targetId" :value="target.targetId">{{ target.alias || target.targetId }}</option></select></label>
        <span class="access-scope-hint"><Lock aria-hidden="true" />中国 / 世界固定视角</span>
        <RiskClock @day-change="presetDay = $event" />
        <span class="access-updated-inline"><Refresh aria-hidden="true" />数据更新 {{ riskTime(dashboard?.metadata.dataUpdatedAt) }}</span>
      </section>
      <section class="access-kpis" aria-label="核心访问指标"><article v-for="(card, index) in cards" :key="card.label" class="panel kpi" :class="{ danger: card.danger }" :data-index="String(index + 1).padStart(2, '0')"><component :is="card.icon" class="kpi-icon" aria-hidden="true" /><div><h2>{{ card.label }}</h2><strong :class="{ long: card.value.length > 15, compact: card.value.length > 7 }">{{ card.value }}</strong></div></article></section>
      <aside class="access-left">
        <section class="panel ranking"><h2><List aria-hidden="true" />接口请求 TOP 10</h2><ol class="interface-ranking"><li v-for="(r,i) in interfaceRows" :key="r.method + r.pathTemplate"><span class="risk-rank" :data-top="i < 3 ? String(i + 1) : undefined">{{ i+1 }}</span><span class="method-tag" :class="r.method.toLowerCase()">{{ r.method }}</span><span class="interface-path" :title="r.pathTemplate">{{ r.pathTemplate }}</span><span v-if="r.width !== null" class="risk-bar-track interface-bar" aria-hidden="true"><i :style="{ width: r.width + '%' }" /></span><strong>{{ riskCount(r.requestCount) }}</strong></li></ol><p v-if="!dashboard?.topInterfaces.length" class="access-empty">暂无接口数据</p><p v-else-if="interfaceRows[0]?.width === null" class="risk-precision-note">计数超出安全绘图精度，仅显示精确数字。</p></section>
        <section class="panel ranking"><h2><Connection aria-hidden="true" />来源 IP TOP 10</h2><RiskBars :rows="sourceRows" label="来源 IP 请求排行" ranked /><p v-if="!sourceRows.length" class="access-empty">暂无来源数据</p></section>
      </aside>
      <div class="access-map"><RiskAccessMap backdrop :regions="dashboard?.regions ?? []" :targets="dashboard?.targets ?? []" :selected="drilldown.selected.value" :detail="drilldown.data.value" :detail-loading="drilldown.loading.value" :detail-failed="drilldown.failed.value" :detail-stale="drilldown.stale.value" @region-select="drilldown.select" @view-change="mapViewChange" @status-change="mapMessages = $event" @detail-labels="detailLabels = $event" /></div>
      <aside class="access-right">
        <section class="panel status-panel">
          <h2><DataAnalysis aria-hidden="true" />HTTP 状态分布</h2>
          <div class="status-visual">
            <BaseChart v-if="statusGroups.length && statusSafe" :option="statusOption" height="100%" accessible-label="HTTP 状态分组占比，精确计数见下方列表" />
            <p v-else class="access-empty">{{ statusGroups.length ? '计数超过绘图精度，请查看状态明细' : '暂无状态数据' }}</p>
            <div v-if="statusGroups.length && statusSafe" class="status-center"><strong>{{ riskCount(statusTotal.toString()) }}</strong><span>状态总量</span></div>
          </div>
          <ul class="status-legend" aria-label="HTTP 状态分组">
            <li v-for="group in statusGroups" :key="group.key"><i aria-hidden="true" :style="{ background: group.color }" /><span>{{ group.label }}</span><strong>{{ riskCount(group.countText) }}</strong></li>
          </ul>
          <p v-if="!statusGroups.length" class="access-empty">暂无状态数据</p>
          <details v-if="statusRows.length" class="status-exact"><summary>精确状态明细</summary><ul><li v-for="row in statusRows" :key="row.key"><span>{{ row.label }}</span><strong>{{ riskCount(row.count) }}</strong></li></ul></details>
          <small v-if="dashboard?.metrics.otherCount && dashboard.metrics.otherCount !== '0' && !statusGroups.some(group => group.key === 'other')" class="status-other">未知 / 其他 {{ riskCount(dashboard.metrics.otherCount) }}</small>
        </section>
        <section class="panel trend-panel"><h2><TrendCharts aria-hidden="true" />成功 / 失败趋势</h2><div class="trend-legend"><span>成功</span><span>失败</span></div><BaseChart v-if="dashboard?.trend.length && safeTrend" :option="trendOption" height="100%" accessible-label="成功和失败请求趋势" /><p v-else class="access-empty">{{ safeTrend ? '暂无趋势数据' : '计数超过绘图精度，请查看明细' }}</p></section>
        <RiskResourceSummaryPanel :targets="dashboard?.targets" />
      </aside>
      <section class="access-bottom">
        <section class="panel"><h2><Location aria-hidden="true" />地域请求排行</h2><RiskBars :rows="regionRows" label="地域请求排行" @select="selectRankedRegion" /><p v-if="!regionRows.length" class="access-empty">暂无地域数据</p></section>
        <section class="panel"><h2><Grid aria-hidden="true" />城市 / 境外一级行政区</h2><GeoBreakdownPanel compact bars v-if="drilldown.selected.value" :data="drilldown.data.value" :kind="drilldown.accepted.value?.kind ?? drilldown.selected.value.kind" :selected-code="drilldown.accepted.value?.code ?? drilldown.selected.value.code" :title="drillTitle" :labels="drillLabels" :loading="drilldown.loading.value" :failed="drilldown.failed.value" :stale="drilldown.stale.value" /><p v-else class="access-empty">点选地图或地域排行查看细分</p></section>
        <section class="panel access-data-status"><h2><WarningFilled aria-hidden="true" />数据状态</h2><div class="access-alert" role="status"><p v-if="fullscreenError">{{ fullscreenError }}</p><p v-if="validation || error">{{ validation || error }}</p><p v-else-if="loading && !dashboard">正在加载…</p><p v-else-if="dashboard && state.acceptedFilters.value !== state.queryLabel()">显示上次成功筛选结果</p></div><dl><div><dt>数据完整性</dt><dd :class="dashboard?.metadata.completeness === 'READY' ? 'is-ready' : 'is-warning'">{{ dashboard ? completenessLabels[dashboard.metadata.completeness] : '尚无成功数据' }}</dd></div><div><dt>采集延迟</dt><dd>{{ riskCount(dashboard?.metadata.lagSeconds) }} 秒</dd></div><div><dt>服务器目标</dt><dd>{{ targetStatus }}</dd></div><div><dt>最近完整分钟 QPS</dt><dd>{{ dashboard?.qps?.value ?? '—' }} · {{ dashboard?.qps?.coverageStatus ?? '不可用' }} · {{ riskTime(dashboard?.qps?.minuteAt) }}</dd></div><div><dt>统计覆盖</dt><dd>{{ dashboard?.coverage?.status ?? '不可用' }} · 起点 {{ riskTime(dashboard?.coverage?.coverageStartAt) }}</dd></div><div><dt>可疑访问规则提示</dt><dd>{{ dashboard?.suspiciousAccesses ? riskCount(dashboard.suspiciousAccesses.totalCount) : '—' }} · {{ dashboard?.suspiciousAccesses?.coverageStatus ?? '不可用' }}</dd></div><div v-for="type in dashboard?.requestTypes ?? []" :key="type.requestType"><dt>{{ type.requestType }}</dt><dd>{{ riskCount(type.requestCount) }}</dd></div></dl><ul class="access-health-messages"><li v-for="message in mapMessages" :key="message"><Warning aria-hidden="true" />{{ message }}</li><li v-for="warning in dashboard?.metadata.warnings" :key="warning"><Warning aria-hidden="true" />{{ warning }}</li></ul></section>
      </section>
      <footer class="access-footer"><nav aria-label="访问诊断"><button type="button" :aria-pressed="drawer === 'details' && activeTab === 'interfaces'" @click="openDetail('interfaces')"><List aria-hidden="true" />接口明细</button><button type="button" :aria-pressed="drawer === 'details' && activeTab === 'sources'" @click="openDetail('sources')"><Connection aria-hidden="true" />来源 IP</button><button v-if="exceptionAllowed" type="button" :aria-pressed="drawer === 'details' && activeTab === 'exceptions'" @click="openDetail('exceptions')"><Warning aria-hidden="true" />失败请求</button><button type="button" :aria-pressed="drawer === 'geo'" @click="drawer = 'geo'; refresh()"><Location aria-hidden="true" />Geo 诊断</button><a v-if="configAllowed" href="/admin/risk/server-config"><Monitor aria-hidden="true" />服务器配置</a></nav><span class="access-updated"><Refresh aria-hidden="true" />更新 {{ riskTime(dashboard?.metadata.dataUpdatedAt) }}</span><span class="access-attribution">IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></span></footer>
      <el-drawer class="access-drawer" :model-value="!!drawer" :title="drawer === 'geo' ? 'Geo 诊断' : '访问明细'" size="min(100%, 1000px)" @close="drawer = null">
        <GeoObservationPanel v-if="drawer === 'geo'" :sections="geoObservation ? geoObservationSections(geoObservation) : []" :unavailable="geoError" :updated-at-text="riskTime(geoUpdatedAt)" />
        <template v-else><form class="detail-filters" @submit.prevent="refreshDetails"><label v-for="field in (['regionCode','method','pathTemplate','sourceIp'] as const)" :key="field">{{ ({regionCode:'地域编码',method:'方法',pathTemplate:'路径包含',sourceIp:'来源IP'})[field] }}<input v-model="filters[field]"></label><label>HTTP状态<input v-model.number="filters.httpStatus" type="number" min="0" max="599"></label><button :disabled="detailLoading || !!validation">查询</button></form><p v-if="detailError" role="alert">{{ detailError }}</p><p v-if="detailLoading">读取中…</p><p v-if="details && state.detailSnapshot.value !== `${activeTab}:${JSON.stringify({...filters,pageNum,pageSize})}`" role="status">以下为上次成功查询的明细，当前筛选尚未生效。</p><div class="detail-table"><table><thead><tr><th v-for="c in columns" :key="c[0]">{{ c[1] }}</th></tr></thead><tbody><tr v-for="(r,i) in detailRows" :key="i"><td v-for="c in columns" :key="c[0]">{{ r[c[0]!] }}</td></tr></tbody></table></div><p v-if="details && !details.list.length">本页无记录</p><button :disabled="pageNum <= 1 || detailLoading" @click="pageNum--">上一页</button> 第 {{ pageNum }} 页 <button :disabled="!details || pageNum * pageSize >= details.total || detailLoading" @click="pageNum++">下一页</button></template>
      </el-drawer>
    </template>
  </main>
</template>
