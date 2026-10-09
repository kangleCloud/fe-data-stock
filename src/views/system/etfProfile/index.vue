<script setup lang="ts">
import { Refresh, Search } from "@element-plus/icons-vue";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { getEtfMonitorDashboard, getEtfProfileDetail, getEtfProfilePage, refreshEtfAllocation } from "@/api/etf";
import { useAuthStore } from "@/stores/auth";
import { canAccess } from "@/utils/permission";
import { ApiError } from "@/utils/request";
import type { EtfMonitorItem, EtfProfileDetail, EtfProfileQuery, EtfProfileRow } from "@/types/etf";
import { dataStatusLabels, formatAmount, formatPercent, formatPlainNumber } from "@/utils/market";
import { etfProfileSource, etfProfileStatus } from "@/utils/etfProfile";
import { formatShanghaiDateTime } from "@/utils/stockManagement";
import "@/styles/stockData.css";

const route = useRoute();
const auth = useAuthStore();
const canRefreshAllocation = computed(() => auth.isAuthenticated && canAccess(auth.permissionCodes, "system:etf-monitor:refresh"));
const query = reactive<EtfProfileQuery>({ pageNum: 1, pageSize: 10, keyword: "", fundType: "", trackingIndexCode: "" });
const rows = ref<EtfProfileRow[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref("");
const detail = ref<EtfProfileDetail | null>(null);
const publicQuote = ref<EtfMonitorItem | null>(null);
const publicQuoteError = ref(false);
const xqEnabled = ref<boolean | null>(null);
const reportPeriod = ref("");
const allocationSyncing = ref(false);
const allocationFeedback = ref("");
const allocationFailed = ref(false);
const allocationDisabledReason = computed(() => {
  if (xqEnabled.value === false) return "雪球采集总闸已关闭，不能同步；已有报告仍可查看。";
  if (xqEnabled.value === null) return "无法确认采集总闸和启用状态，请重新读取详情。";
  if (!publicQuote.value) return "该 ETF 未启用监控，启用后才能同步资产配置。";
  return "";
});
let detailRequestId = 0;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await getEtfProfilePage({ ...query, keyword: query.keyword?.trim() || undefined,
      fundType: query.fundType?.trim() || undefined,
      trackingIndexCode: query.trackingIndexCode?.trim() || undefined });
    rows.value = result.list ?? [];
    total.value = Number(result.total ?? 0);
    error.value = "";
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "ETF 资料读取失败"; }
  finally { loading.value = false; }
}

async function openDetail(symbol: string): Promise<void> {
  if (allocationSyncing.value) return;
  const requestId = ++detailRequestId;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = "";
  detail.value = null;
  publicQuote.value = null;
  publicQuoteError.value = false;
  xqEnabled.value = null;
  reportPeriod.value = "";
  allocationFeedback.value = "";
  allocationFailed.value = false;
  const [profileResult, dashboardResult] = await Promise.allSettled([
    getEtfProfileDetail(symbol), getEtfMonitorDashboard(),
  ]);
  if (requestId !== detailRequestId) return;
  if (profileResult.status === "fulfilled") detail.value = profileResult.value;
  else detailError.value = profileResult.reason instanceof Error ? profileResult.reason.message : "ETF 详情读取失败";
  if (dashboardResult.status === "fulfilled") {
    xqEnabled.value = dashboardResult.value.xqEnabled;
    publicQuote.value = dashboardResult.value.etfs.find((item) => item.symbol === symbol) ?? null;
  } else publicQuoteError.value = true;
  detailLoading.value = false;
}

async function syncAllocation(): Promise<void> {
  if (allocationSyncing.value || !canRefreshAllocation.value || !detail.value || allocationDisabledReason.value) return;
  allocationFailed.value = false;
  // 日历日期由管理员指定，只请求一期；既不推测可用季度，也不扫描报告。
  const period = reportPeriod.value;
  const isoDate = /^\d{8}$/.test(period) ? `${period.slice(0, 4)}-${period.slice(4, 6)}-${period.slice(6, 8)}` : "";
  const parsedDate = new Date(`${isoDate}T00:00:00Z`);
  if (!isoDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== isoDate) {
    allocationFailed.value = true;
    allocationFeedback.value = "请选择有效的请求报告期（日历日期），再同步资产配置。";
    return;
  }
  const symbol = detail.value.symbol;
  const requestId = detailRequestId;
  allocationSyncing.value = true;
  allocationFeedback.value = "正在同步所选报告期，请等待；不会自动重试。";
  let synchronized = false;
  try {
    const result = await refreshEtfAllocation(symbol, period);
    if (result.status !== "SUCCESS") throw new Error(result.message || `资产配置同步未成功（${result.status}），保留已有报告。`);
    synchronized = true;
    allocationFeedback.value = "资产配置同步成功，正在重新读取详情。";
    const refreshed = await getEtfProfileDetail(symbol);
    if (requestId === detailRequestId) {
      detail.value = refreshed;
      allocationFeedback.value = `同步成功 · 报告实际采集时间 ${formatShanghaiDateTime(refreshed.assetAllocation?.collectedAt ?? null)}`;
    }
  } catch (cause) {
    if (requestId === detailRequestId) {
      allocationFailed.value = true;
      allocationFeedback.value = `${synchronized ? "同步已成功，但详情重新读取失败：" : ""}${cause instanceof Error ? cause.message : "资产配置同步失败"}${cause instanceof ApiError && cause.code ? `（${cause.code}）` : ""}；保留已有详情。`;
    }
  } finally { allocationSyncing.value = false; }
}

function search(): void { query.pageNum = 1; void load(); }
function reset(): void { Object.assign(query, { pageNum: 1, pageSize: 10, keyword: "", fundType: "", trackingIndexCode: "" }); void load(); }

onMounted(() => { void load(); });
watch(() => route.query.symbol, (symbol) => {
  if (typeof symbol === "string" && symbol) void openDetail(symbol);
}, { immediate: true });
</script>

<template>
  <section class="management-page stock-admin-page" aria-labelledby="etf-profile-title">
    <header class="stock-page-heading"><div><h1 id="etf-profile-title" class="page-title">ETF 资料</h1><p class="page-description">同花顺基金基本资料及最近实际取得的资产配置报告。</p></div></header>
    <p class="stock-info">资产配置仅为资产类别占比，不是成分股持仓；请求报告期不是已核实披露日。资料同步时间与行情时间分别标注。</p>
    <div class="page-panel stock-filter-panel">
      <el-form class="stock-filter-form" :model="query" inline label-position="top" @submit.prevent="search">
        <el-form-item label="ETF 代码或名称"><el-input v-model.trim="query.keyword" clearable placeholder="输入代码或名称" @keyup.enter="search" /></el-form-item>
        <el-form-item label="基金类型"><el-input v-model.trim="query.fundType" clearable placeholder="输入类型" @keyup.enter="search" /></el-form-item>
        <el-form-item label="跟踪指数代码"><el-input v-model.trim="query.trackingIndexCode" clearable placeholder="已核实代码" @keyup.enter="search" /></el-form-item>
        <el-form-item class="stock-filter-actions"><el-button type="primary" :icon="Search" @click="search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <div class="page-panel stock-table-panel">
      <div class="stock-table-toolbar"><div><strong>已同步 ETF 资料</strong><span>共 {{ total }} 条</span></div></div>
      <p v-if="error" class="stock-error" role="alert">{{ error }}</p>
      <el-table v-loading="loading" :data="rows" row-key="symbol" stripe empty-text="暂无符合条件的 ETF 资料">
        <el-table-column label="ETF" min-width="180" fixed="left"><template #default="{ row }"><div class="stock-symbol-cell"><strong>{{ row.name }}</strong><small>{{ row.symbol }}</small></div></template></el-table-column>
        <el-table-column prop="market" label="市场" width="85" />
        <el-table-column label="基金类型" min-width="120"><template #default="{ row }">{{ row.fundType || "—" }}</template></el-table-column>
        <el-table-column label="跟踪指数" min-width="170"><template #default="{ row }">{{ row.trackingIndexName || row.trackingIndexCode || "暂无可靠数据" }}</template></el-table-column>
        <el-table-column label="管理人" min-width="140"><template #default="{ row }">{{ row.manager || "—" }}</template></el-table-column>
        <el-table-column label="成立日期" width="125"><template #default="{ row }">{{ row.establishedDate || "—" }}</template></el-table-column>
        <el-table-column label="基金经理" min-width="140"><template #default="{ row }">{{ row.fundManager || "—" }}</template></el-table-column><el-table-column label="资料来源" min-width="140"><template #default="{ row }">{{ etfProfileSource(row.source) }}</template></el-table-column>
        <el-table-column label="资料采集日期" min-width="125"><template #default="{ row }">{{ row.updatedAt?.slice(0, 10) || "—" }}</template></el-table-column>
        <el-table-column label="资料状态" min-width="155"><template #default="{ row }">{{ etfProfileStatus(row as EtfProfileRow) }}</template></el-table-column>
        <el-table-column label="最近同步" min-width="165"><template #default="{ row }">{{ formatShanghaiDateTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="95" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.symbol)">查看详情</el-button></template></el-table-column>
      </el-table>
      <div class="pagination-bar"><el-pagination v-model:current-page="query.pageNum" v-model:page-size="query.pageSize" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" @change="load" /></div>
    </div>
    <el-drawer v-model="detailOpen" title="ETF 资料详情" size="min(680px, 94vw)">
      <p v-if="detailError" class="stock-error" role="alert">{{ detailError }}</p>
      <div v-loading="detailLoading" class="etf-detail">
        <template v-if="detail">
          <h2>{{ detail.name }} <small>{{ detail.symbol }}</small></h2>
          <RouterLink :to="{ path: '/market/etf-monitor', query: { symbol: detail.symbol } }">查看公开行情与价格采样（若已监控）</RouterLink>
          <h3>基础资料</h3>
          <p>{{ etfProfileStatus(detail) }} · 采集 {{ formatShanghaiDateTime(detail.updatedAt) }}</p>
          <dl>
            <div><dt>基金全称</dt><dd>{{ detail.fullName || "—" }}</dd></div>
            <div><dt>市场 / 交易所</dt><dd>{{ detail.market }} / {{ detail.exchange || "—" }}</dd></div>
            <div><dt>基金类型</dt><dd>{{ detail.fundType || "—" }}</dd></div>
            <div><dt>投资类型</dt><dd>{{ detail.investmentType || "—" }}</dd></div>
            <div><dt>基金经理</dt><dd>{{ detail.fundManager || "—" }}</dd></div>
            <div><dt>成立日期</dt><dd>{{ detail.establishedDate || "—" }}</dd></div>
            <div><dt>管理人</dt><dd>{{ detail.manager || "—" }}</dd></div>
            <div><dt>托管人</dt><dd>{{ detail.custodian || "—" }}</dd></div>
            <div><dt>业绩比较基准</dt><dd>{{ detail.performanceBenchmark || "—" }}</dd></div>
            <div><dt>资料来源</dt><dd>{{ etfProfileSource(detail.source) }}</dd></div>
            <div><dt>已核实跟踪指数</dt><dd>{{ detail.trackingIndexName || "暂无可靠数据" }} · {{ detail.trackingIndexCode || "—" }}</dd></div>
          </dl>
          <h3>最近公开行情</h3>
          <p v-if="publicQuoteError" role="status">公开行情缓存暂不可用。</p>
          <p v-else-if="!publicQuote">该 ETF 未启用监控，暂无公开缓存行情。</p>
          <p v-else-if="!publicQuote.quote">已监控，暂无有效缓存行情。</p>
          <template v-else>
            <p>来源 新浪 ETF · 实际采集 {{ formatShanghaiDateTime(publicQuote.quote.collectedAt) }} · 有效交易日 {{ publicQuote.effectiveTradeDate || "—" }} · {{ dataStatusLabels[publicQuote.quote.status] }}{{ publicQuote.closeConfirmed ? "" : " · 收盘未确认" }}</p>
            <dl><div><dt>最新价 / 涨跌额</dt><dd>{{ formatPlainNumber(publicQuote.quote.price) }} / {{ formatPlainNumber(publicQuote.quote.change) }}</dd></div><div><dt>涨跌幅</dt><dd>{{ formatPercent(publicQuote.quote.changePercent) }}</dd></div><div><dt>成交额 / 成交量</dt><dd>{{ formatAmount(publicQuote.quote.amount) }} / {{ formatPlainNumber(publicQuote.quote.volume) }}</dd></div></dl>
          </template>
          <h3>资产配置</h3>
          <el-form v-if="canRefreshAllocation" class="allocation-sync-form" label-position="top" @submit.prevent="syncAllocation">
            <el-form-item label="请求报告期（日历日期，必填）">
              <el-date-picker v-model="reportPeriod" type="date" value-format="YYYYMMDD" format="YYYY-MM-DD" placeholder="请选择请求报告期" :disabled="allocationSyncing || !!allocationDisabledReason" />
            </el-form-item>
            <el-button type="primary" native-type="submit" :loading="allocationSyncing" :disabled="allocationSyncing || !!allocationDisabledReason">同步资产配置</el-button>
            <p v-if="allocationDisabledReason" role="status">{{ allocationDisabledReason }}</p>
            <p>仅请求所选一期，不保证源站存在该期报告；同步等待最多 120 秒，超时结果未确认。</p>
            <p v-if="allocationFeedback" :class="{ 'stock-error': allocationFailed }" :role="allocationFailed ? 'alert' : 'status'">{{ allocationFeedback }}</p>
          </el-form>
          <template v-if="detail.assetAllocation"><p>来源 雪球基金 · 请求报告期 {{ detail.assetAllocation.requestedReportPeriod }} · 采集 {{ formatShanghaiDateTime(detail.assetAllocation.collectedAt) }}</p><el-table :data="detail.assetAllocation.categories" stripe><el-table-column prop="category" label="资产类别" /><el-table-column label="占比"><template #default="{ row }">{{ row.percent }}%</template></el-table-column></el-table></template>
          <p v-else>暂无已获取的资产配置报告。</p>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.etf-detail { display: grid; gap: 12px; font-size: 13px; }
.etf-detail h2 { margin: 0; font-size: 20px; }
.etf-detail h2 small { color: var(--color-text-secondary); font-size: 13px; font-weight: 400; }
.etf-detail a { width: fit-content; color: var(--color-primary); text-decoration: underline; text-underline-offset: 3px; }
.etf-detail h3 { margin: 5px 0 0; font-size: 15px; }
.etf-detail dl { display: grid; gap: 8px; margin: 0; }
.etf-detail dl div { display: grid; grid-template-columns: minmax(120px, 35%) 1fr; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }
.etf-detail dt { color: var(--color-text-secondary); }
.etf-detail dd { margin: 0; overflow-wrap: anywhere; }
.etf-detail p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.allocation-sync-form { display: grid; gap: 12px; }
.allocation-sync-form :deep(.el-form-item) { margin-bottom: 0; }
.allocation-sync-form :deep(.el-button) { width: fit-content; margin-left: 0; }
.allocation-sync-form .stock-error { color: var(--color-danger); }
</style>
