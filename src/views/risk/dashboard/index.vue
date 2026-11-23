<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, onMounted, onBeforeUnmount } from "vue";
import { Collection, Warning, WarningFilled, Connection, Grid, List, TrendCharts, Location, DataAnalysis, Refresh, FullScreen, Close, Calendar, Timer, PieChart } from "@element-plus/icons-vue";
import RiskClock from "@/components/risk/RiskClock.vue";
import RiskBars from "@/components/risk/RiskBars.vue";
import RiskAccessMap from "@/components/risk/RiskAccessMap.vue";
import RiskResourceSummaryPanel from "@/components/risk/RiskResourceSummaryPanel.vue";
import type { RiskMapKind } from "@/utils/riskMap";
import { riskMapRanking } from "@/utils/riskMap";
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
import { riskCountPercent, riskCountRatio } from "@/utils/riskBars";
import { riskMinuteRequests, riskSparkline } from "@/utils/riskDashboardVisual";
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
const { drawer, filters, dashboard, allowed, validation, error, loading, refresh, drilldown, activeTab, pageNum, pageSize, details, detailError, detailLoading, refreshDetails, exceptionAllowed, geoObservation, geoError, geoUpdatedTime } = state;
const configAllowed = computed(() => riskConfigPermission(useAuthStore().permissionCodes, "view"));
const presetDay = ref(new Date());
const datePresets = computed(() => ([
  { days: 1, label: "今日" }, { days: 2, label: "昨日" }, { days: 7, label: "近7日" },
] as const).map(item => {
  const [startDate, endDate] = riskPreset(item.days, presetDay.value);
  return { ...item, selected: filters.value.startDate === startDate && filters.value.endDate === endDate };
}));
function dayChanged(now: Date) { presetDay.value = now; state.syncDay(now); }
function openDetail(tab: "interfaces" | "sources" | "exceptions") { activeTab.value = tab; drawer.value = "details"; }
const mapMessages = ref<string[]>([]);
const mapKind = ref<RiskMapKind>("china");
const mapMode = ref<"2d" | "3d">("3d");
const map3DAvailable = ref(false);
const loadedMapCodes = shallowRef<{ kind: RiskMapKind; codes: Set<string> }>();
function acceptMapCodes(kind: RiskMapKind, codes: Set<string>) { loadedMapCodes.value = { kind, codes }; }
const secondaryPanel = ref<"regions" | "status">();
const secondarySection = ref<HTMLElement>();
let panelTrigger: HTMLButtonElement | undefined;
function closePanel() {
  secondaryPanel.value = undefined;
  panelTrigger?.focus();
  panelTrigger = undefined;
}
async function togglePanel(panel: "regions" | "status", event: MouseEvent) {
  if (secondaryPanel.value === panel) { closePanel(); return; }
  panelTrigger = event.currentTarget as HTMLButtonElement;
  secondaryPanel.value = panel;
  await nextTick();
  secondarySection.value?.focus();
}
function selectRegion(code: string, kind: RiskMapKind) {
  drilldown.select(code, kind);
  if (drilldown.selected.value) {
    panelTrigger = undefined;
    secondaryPanel.value = "regions";
  }
}
const detailLabels = ref<RiskDetailLabels>();
function mapViewChange(kind: RiskMapKind) { if (kind === mapKind.value) return; mapKind.value = kind; detailLabels.value = undefined; drilldown.clear(); if (secondaryPanel.value === "regions") secondaryPanel.value = undefined; }
const drillTitle = computed(() => {
  const selected = drilldown.accepted.value ?? drilldown.selected.value;
  return selected ? riskRegion(selected.code) : "";
});
const drillLabels = computed(() => {
  const code = drilldown.accepted.value?.code ?? drilldown.selected.value?.code;
  return detailLabels.value && detailLabels.value.regionCode === code ? detailLabels.value.labels : undefined;
});
const completenessLabels = { READY: "数据就绪", EMPTY: "范围内无请求", PARTIAL: "数据不完整", UNAVAILABLE: "数据不可用" };
const statusRows = computed(() => {
  const data = dashboard.value;
  if (!data) return [];
  const total = BigInt(data.metrics.requestCount);
  return data.statuses.map(row => ({
    key: String(row.httpStatus),
    label: row.httpStatus === 0 ? "未知" : String(row.httpStatus),
    count: row.requestCount,
    percent: total > 0n ? riskCountPercent(BigInt(row.requestCount), total) : undefined,
    tone: row.httpStatus >= 400 ? "danger" as const : row.httpStatus < 200 ? "muted" as const : undefined,
  }));
});
const requestTypeLabels = { API: "API 接口", PAGE: "页面访问", STATIC: "静态资源", OTHER: "其他" };
const requestTypeColors = { API: "#27e5fa", PAGE: "#80b5ff", STATIC: "#9878ef", OTHER: "#56839e" };
const requestTypes = computed(() => (dashboard.value?.requestTypes ?? []).map(row => ({
  label: requestTypeLabels[row.requestType],
  color: requestTypeColors[row.requestType],
  count: BigInt(row.requestCount),
})));
const classifiedTotal = computed(() => requestTypes.value.reduce((total, row) => total + row.count, 0n));
const requestTypeOption = computed<EChartsCoreOption>(() => ({
  animation: false,
  color: requestTypes.value.map(row => row.color),
  aria: { enabled: true, label: { description: "请求类型分布，精确计数见文字列表" } },
  series: [{
    type: "pie",
    radius: ["63%", "89%"],
    label: { show: false },
    labelLine: { show: false },
    emphasis: { scale: false },
    data: requestTypes.value.map(row => ({ name: row.label, value: riskCountRatio(row.count, classifiedTotal.value) })),
  }],
}));
const minuteRequests = computed(() => riskMinuteRequests(dashboard.value?.qps));
const cards = computed(() => {
  const data = dashboard.value;
  const metrics = data?.metrics;
  const api = data?.requestTypes?.find(row => row.requestType === "API");
  const trend = data?.trend ?? [];
  const history = (value: (row: typeof trend[number]) => number | null) => riskSparkline(trend.map(row => ({ at: row.minuteTime, value: value(row) })));
  const rate = (count: string, total: string) => BigInt(total) > 0n ? riskCountRatio(BigInt(count), BigInt(total)) : null;
  return [
    { label: "请求总量", value: riskCount(metrics?.requestCount), icon: Collection, line: history(row => Number(row.requestCount)) },
    { label: "API 请求", value: riskCount(api?.requestCount ?? (metrics ? "0" : undefined)), icon: DataAnalysis, line: history(row => Number(row.apiRequestCount)) },
    { label: "最近入库分钟请求数", ...minuteRequests.value, icon: TrendCharts },
    { label: "独立来源 IP", value: riskCount(metrics?.sourceCount), icon: Connection, line: history(row => Number(row.sourceCount)) },
    { label: "4xx 请求占比", value: riskRate(metrics?.http4xxRate ?? null), icon: Warning, danger: true, line: history(row => rate(row.http4xxCount, row.requestCount)) },
    { label: "5xx 请求占比", value: riskRate(metrics?.http5xxRate ?? null), icon: WarningFilled, danger: true, line: history(row => rate(row.http5xxCount, row.requestCount)) },
  ];
});
const serviceState = computed(() => {
  if (error.value) return { tone: "is-warning", label: "降级" };
  if (!dashboard.value) return { tone: loading.value ? "is-loading" : "is-danger", label: loading.value ? "连接中" : "不可用" };
  if (dashboard.value.metadata.completeness === "READY") return { tone: "is-ok", label: "正常" };
  if (dashboard.value.metadata.completeness === "EMPTY") return { tone: "is-muted", label: "无数据" };
  return { tone: "is-warning", label: dashboard.value.metadata.completeness === "UNAVAILABLE" ? "不可用" : "部分可用" };
});
const regionRows = computed(() => riskMapRanking(mapKind.value, dashboard.value?.regions ?? [], loadedMapCodes.value?.kind === mapKind.value ? loadedMapCodes.value.codes : undefined).slice(0, 10).map(row => ({
  key: row.name, label: riskRegion(row.name), count: row.count, selectable: true,
})));
function selectRankedRegion(code: string) { selectRegion(code, mapKind.value); }
const targetStatus = computed(() => {
  if (!dashboard.value?.mapServers) return "地图服务器状态不可用";
  if (!dashboard.value.mapServers.length) return "暂无地图服务器";
  const located = dashboard.value.mapServers.filter(server => server.enabled && server.locationStatus === "LOCATED").length;
  return `${located} 个地图服务器已定位`;
});
const warningLabels: Record<string, string> = { COVERAGE_PARTIAL: "统计覆盖不完整", REDIS_UNAVAILABLE: "缓存服务不可用", COLLECTOR_OFFLINE: "采集器离线" };
function coverageText(value?: string) {
  const labels: Record<string, string> = { COMPLETE: "完整", PARTIAL: "部分覆盖", UNAVAILABLE: "不可用", EMPTY: "无数据", UNKNOWN: "未知" };
  return value ? labels[value] ?? "未知" : "—";
}
function delayText(value?: string | null) {
  if (value == null || !/^\d+$/.test(value)) return "—";
  const seconds = BigInt(value);
  if (seconds >= 86400n) return `${seconds / 86400n} 天 ${seconds % 86400n / 3600n} 小时`;
  if (seconds >= 3600n) return `${seconds / 3600n} 小时 ${seconds % 3600n / 60n} 分`;
  if (seconds >= 60n) return `${seconds / 60n} 分 ${seconds % 60n} 秒`;
  return `${seconds} 秒`;
}
const safeTrend = computed(() => dashboard.value?.trend.every(r => BigInt(r.requestCount) <= BigInt(Number.MAX_SAFE_INTEGER)) ?? true);
const trendBucketLabel = computed(() => ({ 15: "15 分钟", 360: "6 小时", 1440: "日" })[dashboard.value?.trendBucketMinutes ?? 15]);
const trendOption = computed<EChartsCoreOption>(() => ({
  animation: false,
  color: ["#28e9f4"],
  aria: { enabled: true, label: { description: `按${trendBucketLabel.value}分桶的请求趋势。` } },
  tooltip: { trigger: "axis", renderMode: "richText", confine: true, backgroundColor: "#041d32", borderColor: "#2bc5e4", textStyle: { color: "#e5f6ff" }, axisPointer: { type: "line", lineStyle: { color: "#2bc5e466", width: 1 } } },
  grid: { left: 44, right: 16, bottom: 30, top: 20 },
  xAxis: { type: "time", boundaryGap: false, axisLine: { lineStyle: { color: "#23617e" } }, axisTick: { show: false }, axisLabel: { color: "#aacde2", fontSize: 11, hideOverlap: true, margin: 10,
    formatter: (value: number) => riskTime(new Date(value).toISOString(), "axis", dashboard.value?.trendBucketMinutes !== 15) } },
  yAxis: { type: "value", splitNumber: 4, axisLabel: { color: "#aacde2", fontSize: 11 }, splitLine: { lineStyle: { color: "#175173", opacity: .5, type: "dashed" } } },
  series: [{
    name: "请求总量",
    type: "line",
    showSymbol: (dashboard.value?.trend.length ?? 0) <= 30,
    symbol: "circle",
    symbolSize: 4,
    lineStyle: { width: 2.2, shadowBlur: 6, shadowColor: "#3de0d055" },
    areaStyle: { opacity: .22 },
    data: safeTrend.value ? dashboard.value?.trend.map(row => [Date.parse(row.minuteTime), Number(row.requestCount)]) : [],
  }],
}));
const detailRows = computed(() => details.value?.list.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "—" : typeof value === "string" && /Count$/.test(key) ? riskCount(value) : String(value)]))) ?? []);
const columns = computed(() => activeTab.value === "interfaces" ? [['method','方法'],['pathTemplate','接口'],['requestCount','请求'],['successCount','成功'],['failureCount','失败'],['otherCount','未知/其他'],['failureRate','失败比例'],['sourceCount','IP数']] : activeTab.value === "sources" ? [['sourceIp','来源IP'],['regionCode','地域'],['provinceName','省/一级'],['cityName','城市'],['requestCount','请求'],['successCount','成功'],['failureCount','失败'],['otherCount','未知/其他'],['failureRate','失败比例']] : [['minuteTime','分钟'],['method','方法'],['pathTemplate','接口'],['sourceIp','IP'],['httpStatus','状态'],['regionCode','地域'],['requestCount','请求']]);
</script>
<template>
  <main ref="screenRef" class="risk-screen access-screen">
    <p v-if="!allowed" role="alert">无系统风控查看权限</p>
    <template v-else>
      <header class="access-header">
        <div class="access-brand">
          <svg class="access-shield" viewBox="0 0 32 36" aria-hidden="true"><path d="M16 2 29 7v10c0 8-6 13-13 17C9 30 3 25 3 17V7Z" /><path d="m10 17 4 4 8-9" /></svg>
          <div class="access-title">
            <h1>系统访问与安全态势中心 <small>V1.0</small></h1>
          </div>
        </div>
        <div class="access-toolbar" aria-label="大屏筛选">
          <div class="risk-controls access-filters">
            <div class="preset-group" role="group" aria-label="日期范围"><button v-for="item in datePresets" :key="item.days" type="button" :aria-pressed="item.selected" @click="state.preset(item.days)">{{ item.label }}</button></div>
            <details class="access-custom-date">
              <summary :title="`${filters.startDate} 至 ${filters.endDate}`"><Calendar aria-hidden="true" />自定义时间</summary>
              <div class="access-date-range">
                <label>开始日期<input v-model="filters.startDate" type="date" @input="state.manualRange()"></label>
                <label>结束日期<input v-model="filters.endDate" type="date" @input="state.manualRange()"></label>
              </div>
            </details>
          </div>
          <div class="preset-group access-map-scope" role="group" aria-label="地图范围">
            <button type="button" :aria-pressed="mapKind === 'china'" @click="mapViewChange('china')">中国</button>
            <button type="button" :aria-pressed="mapKind === 'world'" @click="mapViewChange('world')">世界</button>
          </div>
          <div class="preset-group access-map-mode" role="group" aria-label="地图视角">
            <button type="button" :aria-pressed="mapMode === '2d'" @click="mapMode = '2d'">2D</button>
            <button type="button" :aria-pressed="mapMode === '3d'" :disabled="!map3DAvailable" @click="mapMode = '3d'">3D</button>
          </div>
        </div>
        <div class="access-header-state">
          <span class="access-updated">数据更新时间 {{ riskTime(dashboard?.metadata.dataUpdatedTime) }}</span>
          <button type="button" class="access-service" :class="serviceState.tone" :aria-expanded="secondaryPanel === 'status'" @click="togglePanel('status', $event)"><i aria-hidden="true" />数据质量 {{ serviceState.label }}</button>
          <div class="access-header-actions"><button type="button" class="icon-button" aria-label="刷新" title="刷新" :aria-busy="loading" :disabled="loading || !!validation" @click="refresh"><Refresh aria-hidden="true" /></button><button type="button" class="icon-button" :aria-label="isFullscreen ? '退出整个大屏全屏' : '整个大屏全屏'" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen"><Close v-if="isFullscreen" aria-hidden="true" /><FullScreen v-else aria-hidden="true" /></button></div>
        </div>
      </header>
      <RiskClock v-show="false" @day-change="dayChanged" />
      <section class="access-kpis" aria-label="核心访问指标">
        <article v-for="card in cards" :key="card.label" class="panel kpi" :class="{ danger: card.danger }" :title="card.description">
          <component :is="card.icon" class="kpi-icon" aria-hidden="true" />
          <div><h2>{{ card.label }}</h2><strong :title="card.value" :class="{ long: card.value.length > 15, compact: card.value.length > 9 }">{{ card.value }}</strong><span v-if="card.description" class="kpi-description">{{ card.description }}</span></div>
          <svg v-if="card.line || card.path" class="kpi-sparkline" viewBox="0 0 64 24" aria-hidden="true">
            <path v-if="card.path" :d="card.path" />
            <polyline v-else :points="card.line" />
          </svg>
        </article>
      </section>
      <aside class="access-left">
        <section class="panel ranking">
          <h2><List aria-hidden="true" />API 请求 TOP10</h2>
          <ol v-if="dashboard?.topInterfaces.length" class="interface-ranking" tabindex="0" aria-label="接口请求排行"><li v-for="(row, index) in dashboard.topInterfaces" :key="row.method + row.pathTemplate"><span class="risk-rank">{{ index + 1 }}</span><span class="method-tag" :class="row.method.toLowerCase()">{{ row.method }}</span><span class="interface-path" :title="row.pathTemplate">{{ row.pathTemplate }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ol>
          <p v-else class="access-empty">暂无接口数据</p>
        </section>
        <section class="panel request-type-panel">
          <h2><PieChart aria-hidden="true" />请求类型</h2>
          <div v-if="classifiedTotal > 0n" class="status-visual">
            <BaseChart :option="requestTypeOption" height="100%" accessible-label="请求类型占比，精确计数见相邻列表" />
            <div class="status-center"><strong>{{ riskCount(classifiedTotal.toString()) }}</strong><span>请求总量</span></div>
          </div>
          <p v-if="!requestTypes.length" class="access-empty">暂无请求分类</p>
          <ul v-else class="status-legend" aria-label="请求类型计数">
            <li v-for="row in requestTypes" :key="row.label"><i aria-hidden="true" :style="{ background: row.color }" /><span>{{ row.label }}</span><strong>{{ riskCount(row.count.toString()) }}</strong><small>{{ riskCountPercent(row.count, classifiedTotal) }}</small></li>
          </ul>
        </section>
        <section class="panel"><h2><Location aria-hidden="true" />地域请求排行</h2><RiskBars :rows="regionRows" label="地域请求排行" @select="selectRankedRegion" /><p v-if="!regionRows.length" class="access-empty">暂无地域数据</p></section>
      </aside>
      <div class="access-map"><RiskAccessMap backdrop v-model:mode="mapMode" :requested-kind="mapKind" :regions="dashboard?.regions ?? []" :map-servers="dashboard?.mapServers ?? []" :selected="drilldown.selected.value" :detail="drilldown.data.value" :detail-loading="drilldown.loading.value" :detail-failed="drilldown.failed.value" :detail-stale="drilldown.stale.value" @region-select="selectRegion" @view-change="mapViewChange" @mode-available="map3DAvailable = $event" @geometry-codes="acceptMapCodes" @status-change="mapMessages = $event" @detail-labels="detailLabels = $event" /></div>
      <aside class="access-right">
        <section class="panel trend-panel"><h2><TrendCharts aria-hidden="true" />请求趋势 <small class="panel-heading-meta">按{{ trendBucketLabel }}</small></h2><BaseChart v-if="dashboard?.trend.length && safeTrend" :option="trendOption" height="100%" accessible-label="请求总量趋势" /><p v-else class="access-empty">{{ safeTrend ? '暂无趋势数据' : '请求量超出趋势图的安全绘图精度' }}</p></section>
        <section class="panel status-panel"><h2><DataAnalysis aria-hidden="true" />HTTP 状态分布</h2><RiskBars v-if="statusRows.length" :rows="statusRows" label="逐 HTTP 状态计数" /><p v-else class="access-empty">暂无状态数据</p></section>
        <RiskResourceSummaryPanel :targets="dashboard?.targets"><template #action><a v-if="configAllowed" class="panel-heading-meta" href="/admin/risk/server-config">服务器配置</a></template></RiskResourceSummaryPanel>
      </aside>
      <section v-if="secondaryPanel === 'regions'" id="access-region-details" ref="secondarySection" class="panel access-detail-overlay" tabindex="-1" aria-label="地域细分" @keydown.esc.stop="closePanel"><h2><Grid aria-hidden="true" />{{ mapKind === 'china' ? '境内城市' : '境外一级行政区' }}<button type="button" class="icon-button" aria-label="关闭地域细分" @click="closePanel"><Close /></button></h2><GeoBreakdownPanel compact bars v-if="drilldown.selected.value" :data="drilldown.data.value" :kind="drilldown.accepted.value?.kind ?? drilldown.selected.value.kind" :selected-code="drilldown.accepted.value?.code ?? drilldown.selected.value.code" :title="drillTitle" :labels="drillLabels" :loading="drilldown.loading.value" :failed="drilldown.failed.value" :stale="drilldown.stale.value" /><p v-else class="access-empty">点选地图或地域排行查看细分</p></section>
      <section v-if="secondaryPanel === 'status'" id="access-status-details" ref="secondarySection" class="panel access-data-status access-detail-overlay" tabindex="-1" aria-labelledby="access-data-title" @keydown.esc.stop="closePanel">
        <h2 id="access-data-title"><WarningFilled aria-hidden="true" />数据状态<button type="button" class="icon-button" aria-label="关闭数据状态" @click="closePanel"><Close /></button></h2>
        <dl class="access-status-summary">
          <div><dt>完整性</dt><dd :class="dashboard?.metadata.completeness === 'READY' ? 'is-ready' : 'is-warning'">{{ dashboard ? completenessLabels[dashboard.metadata.completeness] : '—' }}</dd></div>
          <div><dt>采集延迟</dt><dd>{{ delayText(dashboard?.metadata.lagSeconds) }}</dd></div>
          <div><dt>最近入库分钟请求数</dt><dd>{{ minuteRequests.value }}<template v-if="minuteRequests.description"> · {{ minuteRequests.description }}</template></dd></div>
          <div><dt>统计覆盖</dt><dd>{{ coverageText(dashboard?.coverage?.status) }}</dd></div>
          <div><dt>成功请求</dt><dd>{{ riskCount(dashboard?.metrics.successCount) }}</dd></div>
          <div><dt>地域未识别请求</dt><dd>{{ riskCount(dashboard?.metadata.unknownRegionRequestCount) }}</dd></div>
        </dl>
        <details v-if="dashboard || mapMessages.length" class="access-status-details">
          <summary>状态详情</summary>
          <dl>
            <div><dt>采集延迟（秒）</dt><dd>{{ riskCount(dashboard?.metadata.lagSeconds) }}</dd></div>
            <div><dt>地图服务器</dt><dd>{{ targetStatus }}</dd></div>
            <div><dt>内网请求</dt><dd>{{ riskCount(dashboard?.metadata.internalRegionRequestCount) }}</dd></div>
            <div><dt>覆盖起点</dt><dd>{{ riskTime(dashboard?.coverage?.coverageStartTime) }}</dd></div>
            <div><dt>可疑访问</dt><dd>{{ riskCount(dashboard?.suspiciousAccesses?.totalCount) }} · {{ coverageText(dashboard?.suspiciousAccesses?.coverageStatus) }}</dd></div>
          </dl>
          <ul v-if="mapMessages.length || dashboard?.metadata.warnings.length" class="access-health-messages">
            <li v-for="message in mapMessages" :key="message"><Warning aria-hidden="true" />{{ message }}</li>
            <li v-for="warning in dashboard?.metadata.warnings" :key="warning"><Warning aria-hidden="true" />{{ warningLabels[warning] ?? warning }}</li>
          </ul>
        </details>
      </section>
      <footer class="access-footer">
        <nav aria-label="访问诊断"><button type="button" :aria-pressed="drawer === 'details' && activeTab !== 'exceptions'" @click="openDetail('interfaces')"><List aria-hidden="true" />接口明细</button><button v-if="exceptionAllowed" type="button" :aria-pressed="drawer === 'details' && activeTab === 'exceptions'" @click="openDetail('exceptions')"><Warning aria-hidden="true" />异常汇总</button><button type="button" :aria-pressed="drawer === 'geo'" @click="drawer = 'geo'; refresh()"><Location aria-hidden="true" />Geo 诊断</button></nav>
        <div class="access-footer-status">
          <span v-if="validation || error || fullscreenError" class="access-feedback" role="status">{{ fullscreenError || validation || error }}</span>
          <span v-else-if="dashboard && state.acceptedFilters.value !== state.queryLabel()" class="access-feedback" role="status">显示上次成功筛选结果</span>
          <span class="footer-quality"><Warning aria-hidden="true" />地域未识别 <strong>{{ riskCount(dashboard?.metadata.unknownRegionRequestCount) }}</strong></span>
          <span class="footer-quality"><Timer aria-hidden="true" />采集时间 <strong>{{ riskTime(dashboard?.metadata.collectorHeartbeatTime) }}</strong></span>
        </div>
        <span class="access-attribution">IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></span>
      </footer>
      <el-drawer class="access-drawer" :model-value="!!drawer" :title="drawer === 'geo' ? 'Geo 诊断' : activeTab === 'exceptions' ? '异常汇总' : '访问明细'" size="min(100%, 1000px)" @close="drawer = null">
        <GeoObservationPanel v-if="drawer === 'geo'" :sections="geoObservation ? geoObservationSections(geoObservation) : []" :unavailable="geoError" :updated-at-text="riskTime(geoUpdatedTime)" />
        <template v-else><nav v-if="activeTab !== 'exceptions'" class="preset-group access-detail-tabs" aria-label="明细分类"><button type="button" :aria-pressed="activeTab === 'interfaces'" @click="openDetail('interfaces')">接口</button><button type="button" :aria-pressed="activeTab === 'sources'" @click="openDetail('sources')">来源 IP</button></nav><form class="detail-filters" @submit.prevent="refreshDetails"><label v-for="field in (['regionCode','method','pathTemplate','sourceIp'] as const)" :key="field">{{ ({regionCode:'地域编码',method:'方法',pathTemplate:'路径包含',sourceIp:'来源IP'})[field] }}<input v-model="filters[field]"></label><label>HTTP状态<input v-model.number="filters.httpStatus" type="number" min="0" max="599"></label><button :disabled="detailLoading || !!validation">查询</button></form><p v-if="detailError" role="alert">{{ detailError }}</p><p v-if="detailLoading">读取中…</p><p v-if="details && state.detailSnapshot.value !== `${activeTab}:${JSON.stringify({...filters,pageNum,pageSize})}`" role="status">以下为上次成功查询的明细，当前筛选尚未生效。</p><div class="detail-table"><table><thead><tr><th v-for="c in columns" :key="c[0]">{{ c[1] }}</th></tr></thead><tbody><tr v-for="(r,i) in detailRows" :key="i"><td v-for="c in columns" :key="c[0]">{{ r[c[0]!] }}</td></tr></tbody></table></div><p v-if="details && !details.list.length">本页无记录</p><button :disabled="pageNum <= 1 || detailLoading" @click="pageNum--">上一页</button> 第 {{ pageNum }} 页 <button :disabled="!details || pageNum * pageSize >= details.total || detailLoading" @click="pageNum++">下一页</button></template>
      </el-drawer>
    </template>
  </main>
</template>
