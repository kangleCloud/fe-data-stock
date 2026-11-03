<script setup lang="ts">
import { RouterLink } from "vue-router";
import { riskConfigPermission } from "@/utils/riskServer";
import { useAuthStore } from "@/stores/auth";
import GeoBreakdownPanel from "@/components/risk/GeoBreakdownPanel.vue";
import GeoServerStatus from "@/components/risk/GeoServerStatus.vue";
import GeoObservationPanel from "@/components/risk/GeoObservationPanel.vue";
import { geoObservationSections } from "@/utils/geoObservation";
import { computed } from "vue";
import type { EChartsCoreOption } from "echarts/core";
import BaseChart from "@/components/market/BaseChart.vue";
import RiskRegionMap from "@/components/risk/RiskRegionMap.vue";
import RiskDashboardFrame from "@/components/risk/RiskDashboardFrame.vue";
import { useRiskDashboard } from "@/composables/useRiskDashboard";
import type { RiskArchive, RiskException, RiskInterface } from "@/types/risk";
import { riskCount, riskLatency, riskPreset, riskRate, riskRegion, riskRequestTypes } from "@/utils/risk";
import { riskTime, riskBusinessDate } from "@/utils/riskTime";
import "@/styles/risk.css";

const { drilldown, geoObservation, geoError, geoUpdatedAt, allowed, exceptionAllowed, archiveAllowed, filters, validation, dashboard, acceptedFilters, queryLabel, error, loading, activeTab, pageNum, pageSize, details, detailSnapshot, detailError, detailLoading, refresh, refreshDetails } = useRiskDashboard();
function preset(days: 1 | 2 | 7) { const [startDate, endDate] = riskPreset(days); filters.value = { ...filters.value, startDate, endDate }; }
const completenessLabels = { READY: "数据就绪", EMPTY: "范围内无有效请求", PARTIAL: "数据不完整", UNAVAILABLE: "数据不可用" };
const warningLabels: Record<string, string> = { COLLECTOR_OFFLINE: "采集心跳超时", HEARTBEAT_MISSING: "缺少采集心跳", GEO_UNAVAILABLE: "地域库不可用", QUALITY_ISSUES: "存在数据质量问题" };
const status = computed(() => dashboard.value ? `${completenessLabels[dashboard.value.metadata.completeness]} · 每10秒刷新（隐藏时暂停）` : loading.value ? "正在读取真实数据" : "尚无成功结果");
const cards = computed(() => {
  const data = dashboard.value?.metrics;
  return [
    ["请求总数", data ? riskCount(data.requestCount) : "—"], ["API 请求", data ? riskCount(data.apiCount) : "—"],
    ["HTTP 错误率", data ? riskRate(data.httpErrorRate) : "—"], ["REST P95（近似）", data ? riskLatency(data.restP95Micros, data.restP95Overflow) : "—"],
    ["SSE 已结束连接", data ? riskCount(data.sseEndedCount) : "—"], ["SSE 时长 P95（近似）", data ? riskLatency(data.sseP95Micros, data.sseP95Overflow) : "—"],
  ];
});
// 图形只承载可安全表示的数值；原始精确计数始终在相邻表格展示。
const trendSafe = computed(() => dashboard.value?.trend.every((row) => [row.requestCount, row.apiCount, row.httpErrorCount].every((value) => /^\d+$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))) ?? true);
const trendOption = computed<EChartsCoreOption>(() => ({
  animation: false, aria: { enabled: true }, color: ["#39d9ed", "#8ebcff", "#ffb7ae"],
  tooltip: { trigger: "axis", renderMode: "richText" },
  grid: { left: 65, right: 20, top: 20, bottom: 55 },
  xAxis: { type: "category", data: dashboard.value?.trend.map((row) => riskTime(row.minuteAt, "minute")), axisLabel: { color: "#abc7e0", formatter: (value: string) => filters.value.startDate === filters.value.endDate ? value.slice(11) : value.slice(5) } },
  yAxis: { type: "value", axisLabel: { color: "#abc7e0" } },
  series: [ ["全部请求", "requestCount"], ["API", "apiCount"], ["HTTP 错误", "httpErrorCount"] ].map(([name, key]) => ({ name, type: "line", showSymbol: dashboard.value?.trend.length === 1, data: trendSafe.value ? dashboard.value?.trend.map((row) => Number(row[key as "requestCount"])) ?? [] : [] })),
}));
function distributionOption(rows: { name: string; value: string }[], kind: "pie" | "bar"): EChartsCoreOption | undefined {
  if (!rows.length || rows.some((row) => !/^\d+$/.test(row.value) || BigInt(row.value) > BigInt(Number.MAX_SAFE_INTEGER))) return undefined;
  const colors = ["#39d9ed", "#8ebcff", "#c4adff", "#ffd28c", "#ffb7ae", "#a4dac2"];
  const data = rows.map((row) => ({ name: row.name, value: Number(row.value) }));
  return kind === "pie" ? { animation: false, aria: { enabled: true }, color: colors, tooltip: { renderMode: "richText" }, series: [{ type: "pie", radius: ["50%", "75%"], label: { show: false }, data }] } : {
    animation: false, aria: { enabled: true }, color: colors, tooltip: { trigger: "axis", renderMode: "richText" },
    grid: { left: 60, right: 20, top: 10, bottom: 35 }, xAxis: { type: "value", axisLabel: { color: "#abc7e0" } }, yAxis: { type: "category", data: rows.map((row) => row.name), axisLabel: { color: "#abc7e0" } }, series: [{ type: "bar", data }],
  };
}
const typeOption = computed(() => distributionOption(dashboard.value?.requestTypes.map((row) => ({ name: row.requestType, value: row.requestCount })) ?? [], "pie"));
const statusOption = computed(() => distributionOption(dashboard.value?.statuses.map((row) => ({ name: row.status, value: row.requestCount })) ?? [], "bar"));
const interfaceRows = computed(() => activeTab.value === "interfaces" ? details.value?.list as RiskInterface[] | undefined : undefined);
const exceptionRows = computed(() => activeTab.value === "exceptions" && exceptionAllowed.value ? details.value?.list as RiskException[] | undefined : undefined);
const archiveRows = computed(() => activeTab.value === "archives" && archiveAllowed.value ? details.value?.list as RiskArchive[] | undefined : undefined);
const regions = computed(() => Array.from(new Set([...(dashboard.value?.regions.map((row) => row.regionCode) ?? []), ...(filters.value.regionCode ? [filters.value.regionCode] : []), "UNKNOWN", "INTERNAL"])));
const expectedDetail = computed(() => `${activeTab.value}:${JSON.stringify({ ...filters.value, pageNum: pageNum.value, pageSize: pageSize.value })}`);
const tabAllowed = computed(() => activeTab.value === "interfaces" || (activeTab.value === "exceptions" ? exceptionAllowed.value : archiveAllowed.value));
</script>

<template>
  <p v-if="!allowed" role="alert">无系统风控查看权限（system:risk:view）。</p>
  <RiskDashboardFrame v-else :status="status">
    <template #filters>
      <RouterLink v-if="riskConfigPermission(useAuthStore().permissionCodes, 'view')" to="/risk/server-config">服务器目标配置</RouterLink>
      <form class="risk-controls" @submit.prevent="refresh">
        <button type="button" @click="preset(1)">今日</button><button type="button" @click="preset(2)">昨日</button><button type="button" @click="preset(7)">近7日</button>
        <label>开始日期<input v-model="filters.startDate" type="date"></label><label>结束日期<input v-model="filters.endDate" type="date"></label>
        <label>地域<select v-model="filters.regionCode"><option :value="undefined">全部地域</option><option v-for="region in regions" :key="region" :value="region">{{ riskRegion(region) }}</option></select></label>
        <label>请求类型<select v-model="filters.requestType"><option :value="undefined">全部请求</option><option v-for="kind in riskRequestTypes" :key="kind" :value="kind">{{ kind }}</option></select></label>
        <button type="submit" :disabled="!!validation || loading">{{ loading ? '读取中…' : '刷新数据' }}</button>
      </form>
      <p v-if="validation" role="alert">{{ validation }}</p><p v-if="error" class="risk-warning" role="alert">{{ error }}</p>
      <p v-if="dashboard && acceptedFilters !== queryLabel()" class="risk-warning" role="status">显示上次成功筛选的数据，当前筛选尚未加载成功。</p>
      <div v-if="dashboard" class="risk-freshness">
        <span>北京时间 · 数据更新：{{ riskTime(dashboard.metadata.dataUpdatedAt) }}</span><span>生成：{{ riskTime(dashboard.metadata.generatedAt) }}</span><span>心跳：{{ riskTime(dashboard.metadata.collectorHeartbeatAt) }}</span><span>采集延迟：{{ riskCount(dashboard.metadata.lagSeconds) }} 秒</span><span>最后事件：{{ riskTime(dashboard.metadata.lastEventTime) }}</span>
        <span v-for="warning in dashboard.metadata.warnings" :key="warning" class="risk-warning">{{ warningLabels[warning] ?? warning }}</span>
      </div>
      <details class="risk-notes"><summary>统计口径与限制</summary><p>HTTP 错误率为最终400–599状态（不含499）；304正常，499客户端中断单列。上游失败尝试不等同最终HTTP错误。REST P95仅API有效耗时，为直方图分桶近似；SSE连接时长独立统计，结束日志不代表在线人数或消息数。每日来源HLL为估算，跨日不能相加。质量仅按日期过滤，不随地域与类型缩小。</p></details>
    </template>
    <template #metrics><article v-for="card in cards" :key="card[0]" class="risk-metric"><h2>{{ card[0] }}</h2><strong>{{ card[1] }}</strong></article></template>
    <template #interfaces>
      <ol v-if="dashboard?.topInterfaces.length" class="risk-ranking"><li v-for="(row, index) in dashboard.topInterfaces" :key="`${row.method}:${row.pathTemplate}:${row.requestType}`"><span class="risk-rank">{{ index + 1 }}</span><span>{{ row.method }} {{ row.pathTemplate }} <small>{{ row.requestType }}</small></span><strong>{{ riskCount(row.requestCount) }}</strong></li></ol><p v-else class="risk-muted">{{ dashboard ? '无排行数据' : '尚无成功结果' }}</p>
    </template>
    <template #requestTypes><BaseChart v-if="typeOption" :option="typeOption" accessible-label="请求类型占比，精确计数见相邻列表" height="180px" /><ul class="risk-list"><li v-for="row in dashboard?.requestTypes" :key="row.requestType"><button type="button" class="risk-link" @click="filters.requestType = row.requestType">{{ row.requestType }}</button><strong>{{ riskCount(row.requestCount) }}</strong></li></ul><p v-if="!dashboard?.requestTypes.length" class="risk-muted">暂无类型统计</p></template>
    <template #regions>
      <RiskRegionMap @view-change="drilldown.clear" @region-select="drilldown.select" :regions="dashboard?.regions ?? []" :server-target="dashboard?.serverTarget"><template #details><p v-if="drilldown.selected.value">当前细分选择：{{ drilldown.selected.value.code }}</p><GeoBreakdownPanel v-if="drilldown.selected.value" :data="drilldown.data.value" :kind="drilldown.accepted.value?.kind ?? drilldown.selected.value.kind" :selected-code="drilldown.accepted.value?.code ?? drilldown.selected.value.code" :loading="drilldown.loading.value" :failed="drilldown.failed.value" :stale="drilldown.stale.value" /></template></RiskRegionMap>
      <ul class="risk-list"><li v-for="row in dashboard?.regions" :key="row.regionCode"><button type="button" class="risk-link" @click="filters.regionCode = row.regionCode">{{ riskRegion(row.regionCode) }}</button><strong>{{ riskCount(row.requestCount) }}</strong></li></ul>
      <p v-if="!dashboard?.regions.length" class="risk-muted">暂无地域统计</p>

      <div v-if="dashboard?.geoCoverage"><p>全范围细分覆盖：{{ ({ NOT_COLLECTED: '历史未采集细分', PARTIAL: '混合范围，部分未采集', COLLECTED: '范围内已采集' })[dashboard.geoCoverage.coverage.status] ?? '不支持的覆盖状态' }} · 起点（北京时间）{{ riskTime(dashboard.geoCoverage.coverage.startedAt, 'minute') }}</p><p>已采集 {{ riskCount(dashboard.geoCoverage.coverage.collectedRequestCount) }} / 总量 {{ riskCount(dashboard.geoCoverage.coverage.totalRequestCount) }} · 未采集 {{ riskCount(dashboard.geoCoverage.coverage.uncollectedRequestCount) }}</p><p>国内已采集 {{ riskCount(dashboard.geoCoverage.china.collectedRequestCount) }} · 已识别省 {{ riskCount(dashboard.geoCoverage.china.provinceIdentifiedRequestCount) }} · 省覆盖率 {{ dashboard.geoCoverage.china.provinceCoverageRate === null ? '—（无已采集分母）' : riskRate(dashboard.geoCoverage.china.provinceCoverageRate) }}</p><p>境外已采集 {{ riskCount(dashboard.geoCoverage.foreign.collectedRequestCount) }} · 已识别一级 {{ riskCount(dashboard.geoCoverage.foreign.subdivisionIdentifiedRequestCount) }} · 一级覆盖率 {{ dashboard.geoCoverage.foreign.subdivisionCoverageRate === null ? '—（无已采集分母）' : riskRate(dashboard.geoCoverage.foreign.subdivisionCoverageRate) }}</p><p>国内未知省 {{ riskCount(dashboard.geoCoverage.china.unknownProvinceRequestCount) }} · 境外未知一级 {{ riskCount(dashboard.geoCoverage.foreign.unknownSubdivisionRequestCount) }} · 国家未知 {{ riskCount(dashboard.geoCoverage.unknownCountryRequestCount) }}</p></div><p v-else>尚无V1.2细分覆盖投影，不推断为零或UNKNOWN。</p>
      <h3>每日来源估算（HLL）</h3><ul class="risk-list"><li v-for="row in dashboard?.dailySources" :key="row.businessDate"><span>{{ riskBusinessDate(row.businessDate) }}</span><strong>≈ {{ riskCount(row.sourceCount) }}</strong></li></ul><p v-if="!dashboard?.dailySources.length" class="risk-muted">无每日来源样本</p><p class="risk-muted">每日独立去重；不同日期不合计。</p>
    </template>
    <template #trend><BaseChart v-if="dashboard?.trend.length && trendSafe" :option="trendOption" accessible-label="请求趋势：全部请求、API及HTTP错误，精确数据见下方列表" height="230px" /><p v-else class="risk-muted">{{ trendSafe ? '暂无趋势数据' : '计数超出安全绘图精度，请查看精确数据' }}</p><details v-if="dashboard?.trend.length"><summary>趋势精确数据</summary><div class="risk-table-wrap"><table><thead><tr><th>分钟</th><th>请求</th><th>API</th><th>错误</th></tr></thead><tbody><tr v-for="row in dashboard.trend" :key="row.minuteAt"><td>{{ riskTime(row.minuteAt, "minute") }}</td><td>{{ riskCount(row.requestCount) }}</td><td>{{ riskCount(row.apiCount) }}</td><td>{{ riskCount(row.httpErrorCount) }}</td></tr></tbody></table></div></details></template>
    <template #statuses><BaseChart v-if="statusOption" :option="statusOption" accessible-label="HTTP状态请求数，精确计数见相邻列表" height="180px" /><ul class="risk-list"><li v-for="row in dashboard?.statuses" :key="row.status"><span>{{ row.status === 'UNKNOWN' ? '未知HTTP状态' : row.status }}</span><strong>{{ riskCount(row.requestCount) }}</strong></li></ul><p v-if="!dashboard?.statuses.length" class="risk-muted">暂无HTTP状态统计</p><p>499 客户端中断：{{ riskCount(dashboard?.metrics.clientAbortCount) }}</p><p>上游失败尝试：{{ riskCount(dashboard?.metrics.upstreamFailureCount) }}</p><p>HTTP 错误数（不含499）：{{ riskCount(dashboard?.metrics.httpErrorCount) }}</p></template>
    <template #details>
      <div class="risk-controls" role="group" aria-label="选择明细"><button type="button" :aria-pressed="activeTab === 'interfaces'" @click="activeTab = 'interfaces'; pageNum = 1">接口明细</button><button v-if="exceptionAllowed" type="button" :aria-pressed="activeTab === 'exceptions'" @click="activeTab = 'exceptions'; pageNum = 1">异常汇总</button><button v-if="archiveAllowed" type="button" :aria-pressed="activeTab === 'archives'" @click="activeTab = 'archives'; pageNum = 1">归档批次</button><button type="button" :disabled="detailLoading || !!validation || !tabAllowed" @click="refreshDetails">刷新明细</button></div>
      <p v-if="!tabAllowed">无当前详情权限，不读取数据。</p><p v-if="detailError" class="risk-warning" role="alert">{{ detailError }}</p><p v-if="detailLoading" role="status">正在读取明细…</p><p v-if="details && detailSnapshot !== expectedDetail" class="risk-warning">以下为上次成功查询的明细，当前筛选尚未生效。</p>
      <div v-if="tabAllowed && details" class="risk-table-wrap" tabindex="0" aria-label="明细表格，可横向滚动">
        <table v-if="interfaceRows"><thead><tr><th>方法 / 接口</th><th>类型</th><th>请求</th><th>HTTP错误</th><th>499</th><th>REST P95近似</th><th>SSE时长P95近似</th></tr></thead><tbody><tr v-for="row in interfaceRows" :key="`${row.method}:${row.pathTemplate}:${row.requestType}`"><td>{{ row.method }} {{ row.pathTemplate }}</td><td>{{ row.requestType }}</td><td>{{ riskCount(row.requestCount) }}</td><td>{{ riskCount(row.httpErrorCount) }}</td><td>{{ riskCount(row.clientAbortCount) }}</td><td>{{ riskLatency(row.restP95Micros, row.restP95Overflow) }}</td><td>{{ riskLatency(row.sseP95Micros, row.sseP95Overflow) }}</td></tr></tbody></table>
        <table v-if="exceptionRows"><thead><tr><th>分钟 / 地域</th><th>类型 / 路径</th><th>状态 / 原因</th><th>次数</th><th>首次 / 最后</th></tr></thead><tbody><tr v-for="row in exceptionRows" :key="row.id"><td>{{ riskTime(row.minuteAt, "minute") }} / {{ riskRegion(row.regionCode) }}</td><td>{{ row.requestType }} / {{ row.pathTemplate }}</td><td>{{ row.status }} / {{ row.reasonCode }}</td><td>{{ riskCount(row.count) }}</td><td>{{ riskTime(row.firstAt) }} / {{ riskTime(row.lastAt) }}</td></tr></tbody></table>
        <table v-if="archiveRows"><thead><tr><th>日期 / 批次</th><th>状态</th><th>记录</th><th>校验和</th><th>提交 / 清理</th><th>失败分类</th></tr></thead><tbody><tr v-for="row in archiveRows" :key="row.id"><td>{{ riskBusinessDate(row.businessDate) }} / {{ row.batchId }}</td><td>{{ row.state }}</td><td>{{ riskCount(row.recordCount) }}</td><td>{{ row.checksum }}</td><td>{{ riskTime(row.committedAt) }} / {{ riskTime(row.cleanedAt) }}</td><td>{{ row.failureCode ?? '—' }}</td></tr></tbody></table>
      </div>
      <p v-if="details?.list.length === 0">本页无记录。</p><p v-else-if="!details && !detailLoading && !detailError">尚无明细成功结果。</p>
      <div v-if="details && tabAllowed" class="risk-controls"><button type="button" :disabled="pageNum <= 1 || detailLoading" @click="pageNum--">上一页</button><span>第 {{ pageNum }} 页，共 {{ details.total }} 条</span><button type="button" :disabled="pageNum * pageSize >= details.total || detailLoading" @click="pageNum++">下一页</button><label>每页<select v-model.number="pageSize" @change="pageNum = 1"><option :value="10">10</option><option :value="25">25</option><option :value="100">100</option></select></label></div>
    </template>
    <template #quality><p class="risk-muted">仅日期范围，独立于地域与类型筛选。</p><ul class="risk-list"><li v-for="row in dashboard?.quality" :key="row.reasonCode"><span>{{ row.reasonCode }}</span><strong>{{ riskCount(row.count) }}</strong></li></ul><p v-if="!dashboard?.quality.length">{{ dashboard ? '无质量计数记录' : '尚无成功结果' }}</p><p v-if="!exceptionAllowed" class="risk-muted">异常详情需独立权限。</p></template>
    <template #archives><p>IP Geolocation by <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP</a></p><GeoServerStatus :status="dashboard?.serverTarget?.geoStatus" :manual="dashboard?.serverTarget?.locationSource === 'MANUAL'" /><GeoObservationPanel :sections="geoObservation ? geoObservationSections(geoObservation) : []" :unavailable="geoError" :stale="geoError && !!geoObservation" :updated-at-text="riskTime(geoUpdatedAt)" /><p>缓存与质量观测为Python批次去重IP累计，非当前筛选请求量；超过60秒可能不完整。刷新时间为本页接收时刻。</p><p>归档批次只按日期查询；详情不会在后台定时拉取。{{ archiveAllowed ? '可在明细区选择归档批次查看。' : '归档详情需独立权限。' }}</p></template>
  </RiskDashboardFrame>
</template>
